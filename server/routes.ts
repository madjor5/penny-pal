import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { parseFinancialQuery, generateFinancialResponse, categorizeTransaction } from "./openai";
import { insertTransactionSchema, insertBudgetSchema, insertSavingsGoalSchema, insertChatMessageSchema, insertAccountSchema, insertReceiptItemSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Chat endpoint
  app.post("/api/chat", async (req, res) => {
    try {
      const { message, debug = false } = req.body;
      
      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      // Check if the user wants to clear the chat
      const clearChatPhrases = [
        'clear the chat',
        'clear chat',
        'clear conversation',
        'delete chat history',
        'reset chat',
        'start fresh',
        'new conversation'
      ];
      
      const messageText = message.toLowerCase().trim();
      const shouldClearChat = clearChatPhrases.some(phrase => messageText.includes(phrase));
      
      if (shouldClearChat) {
        // Store the user's clear request message
        await storage.createChatMessage({
          message,
          response: null,
          isUser: true,
          queryData: null,
        });
        
        // Clear all chat history
        await storage.clearChatMessages();
        
        // Return a confirmation response
        return res.json({
          message: "Chat history has been cleared! We're starting fresh with a clean conversation.",
          data: null,
          debug: debug ? { userMessage: message, action: "chat_cleared" } : null
        });
      }

      // Always capture debug info regardless of debug flag
      let debugInfo: any = {
        userMessage: message,
        timestamp: new Date().toISOString()
      };

      // Parse the user's financial query
      const query = await parseFinancialQuery(message);
      
      debugInfo.openaiQuery = {
        request: `Parse financial query: "${message}"`,
        response: query
      };
      
      let responseData: any = null;
      let contextData: any = null;

      // Execute the appropriate query based on the parsed intent
      let dbQueries: string[] = [];
      
      // Helper function to find account ID by name
      let targetAccountId: string | undefined = undefined;
      let accountSearchResult: { found: boolean; matches: any[]; exact?: any } = { found: false, matches: [] };
      
      // If an account name is specified, always treat it as a transaction request
      if (query.parameters.accountName) {
        query.queryType = 'transactions';
      }
      
      if (query.parameters.accountName) {
        try {
          const accounts = await storage.getAccounts();
          const searchTerm = query.parameters.accountName.toLowerCase();
          
          // First, try simple text matching
          const exactMatches = accounts.filter(account => 
            account.name.toLowerCase() === searchTerm
          );
          
          const containsMatches = accounts.filter(account => 
            account.name.toLowerCase().includes(searchTerm)
          );
          
          let allMatches: typeof accounts = [];
          
          if (exactMatches.length > 0) {
            allMatches = exactMatches;
            debugInfo.accountMatch = { searchTerm, matchType: 'exact', foundAccount: exactMatches[0].name };
          } else if (containsMatches.length === 1) {
            allMatches = containsMatches;
            debugInfo.accountMatch = { searchTerm, matchType: 'contains_single', foundAccount: containsMatches[0].name };
          } else {
            // Text matching failed or was ambiguous, try semantic search
            try {
              const semanticMatches = await storage.searchAccountsBySemantic(searchTerm, 0.65);
              
              
              if (semanticMatches.length === 1) {
                // Single semantic match found - use it
                allMatches = [semanticMatches[0]];
                debugInfo.semanticMatch = {
                  searchTerm,
                  foundAccount: semanticMatches[0].name,
                  similarity: (semanticMatches[0] as any).similarity,
                  matchType: 'semantic_single'
                };
              } else if (semanticMatches.length > 1) {
                // Check if there's a clear semantic winner
                const topSimilarity = (semanticMatches[0] as any).similarity;
                const secondSimilarity = (semanticMatches[1] as any).similarity;
                
                if (topSimilarity - secondSimilarity >= 0.15) { // 15% difference threshold
                  allMatches = [semanticMatches[0]];
                  debugInfo.semanticMatch = {
                    searchTerm,
                    foundAccount: semanticMatches[0].name,
                    similarity: topSimilarity,
                    secondSimilarity,
                    similarityDifference: topSimilarity - secondSimilarity,
                    matchType: 'semantic_clear_winner'
                  };
                } else {
                  // Multiple close semantic matches - fall back to contains matches if available
                  allMatches = containsMatches.length > 0 ? containsMatches : semanticMatches.slice(0, 3);
                  debugInfo.semanticMatch = {
                    searchTerm,
                    multipleMatches: allMatches.map(a => ({ 
                      name: a.name, 
                      id: a.id,
                      similarity: (a as any).similarity 
                    })),
                    matchType: 'semantic_ambiguous'
                  };
                }
              } else {
                // No semantic matches, fall back to contains matches
                allMatches = containsMatches;
                debugInfo.accountMatch = { 
                  searchTerm, 
                  matchType: containsMatches.length > 1 ? 'contains_multiple' : 'no_match' 
                };
              }
            } catch (error) {
              console.error('Error in semantic account search:', error);
              allMatches = containsMatches; // Fallback to text matches
            }
          }
          
          accountSearchResult = {
            found: allMatches.length > 0,
            matches: allMatches,
            exact: exactMatches.length > 0 ? exactMatches[0] : undefined
          };
          
          if (allMatches.length === 1) {
            // Single match found - use it
            targetAccountId = allMatches[0].id;
            debugInfo.accountMatch = {
              searchTerm: query.parameters.accountName,
              foundAccount: allMatches[0].name,
              accountId: targetAccountId,
              matchType: exactMatches.length > 0 ? 'exact' : 'partial'
            };
          } else if (allMatches.length > 1) {
            // Multiple matches - will need clarification
            debugInfo.accountMatch = {
              searchTerm: query.parameters.accountName,
              multipleMatches: allMatches.map(a => ({ name: a.name, id: a.id })),
              matchType: 'ambiguous'
            };
          } else {
            // No matches found
            debugInfo.accountMatch = {
              searchTerm: query.parameters.accountName,
              matchType: 'not_found',
              allAccounts: accounts.map(a => ({ name: a.name, id: a.id }))
            };
          }
        } catch (error) {
          console.error('Error finding account by name:', error);
        }
      }
      
      // Handle account search results - if account name was specified but not found or ambiguous
      if (query.parameters.accountName && (!accountSearchResult.found || accountSearchResult.matches.length > 1)) {
        // Save the user message first before any early returns
        await storage.createChatMessage({
          message,
          response: null,
          isUser: true,
          queryData: null
        });

        if (accountSearchResult.matches.length === 0) {
          // No accounts found
          const allAccounts = debugInfo.accountMatch?.allAccounts || [];
          const accountList = allAccounts.map((acc: any) => `• ${acc.name}`).join('\n');
          
          const responseMessage = `I couldn't find an account matching "${query.parameters.accountName}". Here are your available accounts:\n\n${accountList}\n\nPlease specify which account you'd like to see transactions for.`;
          
          // Save the AI response
          await storage.createChatMessage({
            message: responseMessage,
            response: null,
            isUser: false,
            queryData: { query, debug: debugInfo }
          });
          
          return res.json({
            message: responseMessage,
            data: null,
            debug: debug ? debugInfo : null
          });
        } else if (accountSearchResult.matches.length > 1) {
          // Multiple accounts found - ask for clarification
          const matchList = accountSearchResult.matches.map((acc: any) => `• ${acc.name}`).join('\n');
          
          const responseMessage = `I found multiple accounts matching "${query.parameters.accountName}":\n\n${matchList}\n\nWhich account did you mean? Please be more specific.`;
          
          // Save the AI response
          await storage.createChatMessage({
            message: responseMessage,
            response: null,
            isUser: false,
            queryData: { query, debug: debugInfo }
          });
          
          return res.json({
            message: responseMessage,
            data: null,
            debug: debug ? debugInfo : null
          });
        }
      }
      
      switch (query.queryType) {
        case 'transactions':
          if (query.parameters.category && query.parameters.dateRange) {
            try {
              console.log('DEBUG: dateRange object:', query.parameters.dateRange);
              console.log('DEBUG: start value:', query.parameters.dateRange.start);
              console.log('DEBUG: end value:', query.parameters.dateRange.end);
              
              const startDateValue = query.parameters.dateRange.start;
              const endDateValue = query.parameters.dateRange.end;
              console.log('DEBUG: Using startDateValue:', startDateValue);
              console.log('DEBUG: Using endDateValue:', endDateValue);
              
              const startDate = new Date(startDateValue);
              const endDate = new Date(endDateValue);
              console.log('DEBUG: Parsed startDate:', startDate);
              console.log('DEBUG: Parsed endDate:', endDate);
              
              if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                console.error('Invalid date range, falling back to category only:', query.parameters.dateRange);
                dbQueries.push(`getTransactionsByCategory('${query.parameters.category}', ${targetAccountId || 'undefined'}) - fallback due to invalid dates`);
                responseData = await storage.getTransactionsByCategory(query.parameters.category, targetAccountId);
              } else {
                dbQueries.push(`getTransactionsByCategoryAndDateRange('${query.parameters.category}', '${startDate.toISOString()}', '${endDate.toISOString()}', ${targetAccountId || 'undefined'})`);
                responseData = await storage.getTransactionsByCategoryAndDateRange(query.parameters.category, startDate, endDate, targetAccountId);
              }
            } catch (error) {
              console.error('Date parsing error, falling back to category only:', error);
              dbQueries.push(`getTransactionsByCategory('${query.parameters.category}', ${targetAccountId || 'undefined'}) - fallback due to date parsing error`);
              responseData = await storage.getTransactionsByCategory(query.parameters.category, targetAccountId);
            }
          } else if (query.parameters.category) {
            dbQueries.push(`getTransactionsByCategory('${query.parameters.category}', ${targetAccountId || 'undefined'})`);
            responseData = await storage.getTransactionsByCategory(query.parameters.category, targetAccountId);
          } else if (query.parameters.dateRange) {
            try {
              const startDate = new Date(query.parameters.dateRange.start);
              const endDate = new Date(query.parameters.dateRange.end);
              
              // Validate dates
              if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                console.error('Invalid date range:', query.parameters.dateRange);
                const limit = query.parameters.limit || 20;
                dbQueries.push(`getTransactions(${targetAccountId || 'undefined'}, ${limit}) - fallback due to invalid dates`);
                responseData = await storage.getTransactions(targetAccountId, limit);
              } else {
                dbQueries.push(`getTransactionsByDateRange('${startDate.toISOString()}', '${endDate.toISOString()}', ${targetAccountId || 'undefined'})`);                
                responseData = await storage.getTransactionsByDateRange(startDate, endDate, targetAccountId);
              }
            } catch (error) {
              console.error('Date parsing error:', error);
              const limit = query.parameters.limit || 20;
              dbQueries.push(`getTransactions(${targetAccountId || 'undefined'}, ${limit}) - fallback due to date parsing error`);
              responseData = await storage.getTransactions(targetAccountId, limit);
            }
          } else {
            // Use the parsed limit or default to 20
            const limit = query.parameters.limit || 20;
            
            // If we have a specific account, query that account; otherwise get recent transactions  
            dbQueries.push(`getTransactions(${targetAccountId || 'undefined'}, ${limit})`);
            responseData = await storage.getTransactions(targetAccountId, limit);
            
            // Check if there are more transactions available for "view more" functionality
            if (query.parameters.limit && query.parameters.limit < 50) {
              const checkLimit = Math.min(query.parameters.limit + 10, 50); // Check if there are more
              const checkData = await storage.getTransactions(targetAccountId, checkLimit);
              if (checkData.length > query.parameters.limit) {
                // Store info about more transactions being available
                contextData = { 
                  hasMore: true, 
                  totalAvailable: checkData.length,
                  currentLimit: query.parameters.limit,
                  accountId: targetAccountId
                };
              }
            }
          }
          
          // Filter by transaction direction if specified
          if (query.parameters.transactionDirection) {
            if (query.parameters.transactionDirection === 'incoming') {
              responseData = responseData.filter((t: any) => parseFloat(t.amount) > 0);
            } else if (query.parameters.transactionDirection === 'outgoing') {
              responseData = responseData.filter((t: any) => parseFloat(t.amount) < 0);
            }
            // 'all' or undefined means no filtering
          }
          break;

        case 'budget':
          dbQueries.push(`getBudgets()`);
          responseData = await storage.getBudgets();
          // Get spending data for budget comparison
          dbQueries.push(`getSpendingByCategory()`);
          contextData = await storage.getSpendingByCategory();
          break;

        case 'goals':
          dbQueries.push(`getSavingsGoals()`);
          responseData = await storage.getSavingsGoals();
          break;

        case 'analysis':
          if (query.parameters.category) {
            dbQueries.push(`getSpendingByCategory()`);
            responseData = await storage.getSpendingByCategory();
          } else {
            dbQueries.push(`getMonthlySpending()`);
            responseData = await storage.getMonthlySpending();
          }
          break;

        case 'semantic_search':
          if (query.parameters.searchTerm) {
            if (query.parameters.searchType === 'store') {
              // Search transactions by merchant/store
              dbQueries.push(`searchTransactionsBySemantic('${query.parameters.searchTerm}')`);
              responseData = await storage.searchTransactionsBySemantic(query.parameters.searchTerm);
              
              // If this is a "latest" query, limit to just the most recent transaction
              if (query.parameters.isLatest && responseData.length > 0) {
                responseData = [responseData[0]]; // Already sorted by similarity then date
              }
            } else {
              // Default to product search (search receipt items)
              dbQueries.push(`searchReceiptItemsBySemantic('${query.parameters.searchTerm}')`);
              responseData = await storage.searchReceiptItemsBySemantic(query.parameters.searchTerm);
              
              // If this is a "latest" query, limit to just the most recent item
              if (query.parameters.isLatest && responseData.length > 0) {
                responseData = [responseData[0]]; // Already sorted by similarity then date
              }
            }
          } else {
            responseData = [];
          }
          break;

        case 'latest_receipt':
          if (query.parameters.searchTerm) {
            // Get receipt from latest visit to specific store
            dbQueries.push(`getLatestReceiptFromStore('${query.parameters.searchTerm}')`);
            responseData = await storage.getLatestReceiptFromStore(query.parameters.searchTerm);
          } else {
            responseData = [];
          }
          break;

        default:
          // For general queries, check if an account was specified
          if (targetAccountId) {
            // If an account was specified, get transactions for that account
            dbQueries.push(`getTransactions(${targetAccountId}, 20)`);
            responseData = await storage.getTransactions(targetAccountId, 20);
          } else {
            // Otherwise get account overview
            dbQueries.push(`getAccounts()`);
            responseData = await storage.getAccounts();
          }
      }
      
      // Always capture database queries and results
      debugInfo.databaseQueries = dbQueries;
      debugInfo.queryResults = {
        count: Array.isArray(responseData) ? responseData.length : (responseData ? 1 : 0),
        data: responseData
      };

      // Generate response server-side based on query type
      let responseMessage = "";
      let suggestions: string[] = [];
      
      // Always capture response generation info
      debugInfo.responseGeneration = {
        queryType: query.queryType,
        parameters: query.parameters
      };

      switch (query.queryType) {
        case 'transactions':
          if (query.parameters.category) {
            const incoming = responseData.filter((t: any) => parseFloat(t.amount) > 0);
            const outgoing = responseData.filter((t: any) => parseFloat(t.amount) < 0);
            const totalIncoming = incoming.reduce((sum: number, t: any) => sum + parseFloat(t.amount), 0);
            const totalOutgoing = Math.abs(outgoing.reduce((sum: number, t: any) => sum + parseFloat(t.amount), 0));
            const count = responseData.length;
            
            if (count > 0) {
              let parts = [];
              if (totalIncoming > 0) parts.push(`received $${totalIncoming.toFixed(2)}`);
              if (totalOutgoing > 0) parts.push(`spent $${totalOutgoing.toFixed(2)}`);
              responseMessage = `For ${query.parameters.category}: ${parts.join(' and ')} across ${count} transaction${count > 1 ? 's' : ''}.`;
            } else {
              responseMessage = `No transactions found for ${query.parameters.category} in the selected time period.`;
            }
            
            if (count > 0) {
              suggestions = [
                `View detailed breakdown of ${query.parameters.category} spending`,
                "Compare this to your budget",
                "See spending trends over time"
              ];
            }
          } else if (query.parameters.dateRange) {
            const incoming = responseData.filter((t: any) => parseFloat(t.amount) > 0);
            const outgoing = responseData.filter((t: any) => parseFloat(t.amount) < 0);
            const totalIncoming = incoming.reduce((sum: number, t: any) => sum + parseFloat(t.amount), 0);
            const totalOutgoing = Math.abs(outgoing.reduce((sum: number, t: any) => sum + parseFloat(t.amount), 0));
            
            let parts = [];
            if (totalIncoming > 0) parts.push(`received $${totalIncoming.toFixed(2)}`);
            if (totalOutgoing > 0) parts.push(`spent $${totalOutgoing.toFixed(2)}`);
            responseMessage = `During this period you ${parts.join(' and ')} across ${responseData.length} transactions.`;
          } else {
            const incoming = responseData.filter((t: any) => parseFloat(t.amount) > 0);
            const outgoing = responseData.filter((t: any) => parseFloat(t.amount) < 0);
            const totalIncoming = incoming.reduce((sum: number, t: any) => sum + parseFloat(t.amount), 0);
            const totalOutgoing = Math.abs(outgoing.reduce((sum: number, t: any) => sum + parseFloat(t.amount), 0));
            
            let parts = [];
            if (totalIncoming > 0) parts.push(`received $${totalIncoming.toFixed(2)}`);
            if (totalOutgoing > 0) parts.push(`spent $${totalOutgoing.toFixed(2)}`);
            responseMessage = `Here are your recent transactions. You ${parts.join(' and ')} across ${responseData.length} transactions.`;
            
            // Add "view more" suggestion if there are more transactions available
            if (contextData?.hasMore) {
              const accountName = accountSearchResult?.matches?.[0]?.name || 'your account';
              const nextLimit = Math.min(contextData.currentLimit + 10, 50);
              suggestions = [
                `Show ${nextLimit} transactions from ${accountName}`,
                "View all recent transactions", 
                "Analyze spending patterns"
              ];
            }
          }
          break;

        case 'goals':
          if (responseData.length > 0) {
            const completed = responseData.filter((g: any) => parseFloat(g.currentAmount) >= parseFloat(g.targetAmount)).length;
            const totalTarget = responseData.reduce((sum: number, g: any) => sum + parseFloat(g.targetAmount), 0);
            const totalCurrent = responseData.reduce((sum: number, g: any) => sum + parseFloat(g.currentAmount), 0);
            const overallProgress = ((totalCurrent / totalTarget) * 100).toFixed(1);
            
            responseMessage = `You have ${responseData.length} savings goal${responseData.length > 1 ? 's' : ''}. ${completed} completed. Overall progress: ${overallProgress}% of your $${totalTarget.toFixed(2)} target.`;
            suggestions = ["Add a new savings goal", "Update goal amounts", "See detailed progress"];
          } else {
            responseMessage = "You don't have any savings goals set up yet.";
            suggestions = ["Create your first savings goal", "Set up emergency fund target"];
          }
          break;

        case 'budget':
          responseMessage = `You have ${responseData.length} budget${responseData.length > 1 ? 's' : ''} set up.`;
          if (contextData && contextData.length > 0) {
            const budgetVsSpending = responseData.map((budget: any) => {
              const spending = contextData.find((c: any) => c.category === budget.category);
              const spentAmount = spending ? parseFloat(spending.total) : 0;
              const budgetAmount = parseFloat(budget.amount);
              const percentage = ((spentAmount / budgetAmount) * 100).toFixed(1);
              return `${budget.category}: ${percentage}% used ($${spentAmount.toFixed(2)} of $${budgetAmount.toFixed(2)})`;
            });
            responseMessage += "\n\n" + budgetVsSpending.join("\n");
          }
          suggestions = ["Add new budget category", "Adjust budget amounts", "View spending trends"];
          break;

        case 'semantic_search':
          if (responseData.length > 0) {
            const searchTerm = query.parameters.searchTerm;
            
            if (query.parameters.searchType === 'store') {
              // Check if user specifically asked for receipts
              const userAskedForReceipts = message.toLowerCase().includes('receipt');
              
              if (userAskedForReceipts && !query.parameters.isLatest) {
                // Show detailed receipts for all transactions from this store
                const total = responseData.reduce((sum: number, transaction: any) => sum + Math.abs(parseFloat(transaction.amount)), 0);
                responseMessage = `Found ${responseData.length} transaction${responseData.length > 1 ? 's' : ''} at "${searchTerm}". Total spent: $${total.toFixed(2)}.\n\n`;
                
                // Show each receipt from this store
                let receiptCount = 0;
                for (const transaction of responseData) {
                  receiptCount++;
                  
                  // Get the full receipt for this transaction
                  const fullReceipt = await storage.getReceiptItems(transaction.id);
                  
                  if (fullReceipt.length === 0) continue;
                  
                  const receiptTotal = fullReceipt.reduce((sum: number, receiptItem: any) => sum + Math.abs(parseFloat(receiptItem.itemAmount)), 0);
                  const transactionDate = new Date(transaction.date);
                  const storeName = transaction.merchant || "STORE";
                  const receiptDate = transactionDate.toLocaleDateString();
                  const receiptTime = transactionDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  
                  responseMessage += `**Receipt #${receiptCount} - ${receiptDate} at ${storeName}**\n\n`;
                  
                  // Format as classical paper receipt
                  const receiptWidth = 32;
                  const centerText = (text: string) => {
                    const padding = Math.max(0, receiptWidth - text.length);
                    const leftPad = Math.floor(padding / 2);
                    return ' '.repeat(leftPad) + text;
                  };
                  
                  const rightAlign = (left: string, right: string) => {
                    const maxLeft = receiptWidth - right.length - 1;
                    const truncatedLeft = left.length > maxLeft ? left.substring(0, maxLeft - 3) + '...' : left;
                    const spaces = receiptWidth - truncatedLeft.length - right.length;
                    return truncatedLeft + ' '.repeat(Math.max(1, spaces)) + right;
                  };
                  
                  responseMessage += "```\n";
                  responseMessage += centerText(storeName.toUpperCase()) + "\n";
                  responseMessage += centerText("RECEIPT") + "\n";
                  responseMessage += "=".repeat(receiptWidth) + "\n";
                  responseMessage += centerText(receiptDate) + "\n";
                  responseMessage += centerText(receiptTime) + "\n";
                  responseMessage += "-".repeat(receiptWidth) + "\n\n";
                  
                  // Items
                  fullReceipt.forEach((receiptItem: any) => {
                    const price = `$${Math.abs(parseFloat(receiptItem.itemAmount)).toFixed(2)}`;
                    const itemLine = rightAlign(receiptItem.itemDescription, price);
                    responseMessage += itemLine + "\n";
                  });
                  
                  responseMessage += "\n" + "-".repeat(receiptWidth) + "\n";
                  responseMessage += rightAlign("TOTAL", `$${receiptTotal.toFixed(2)}`) + "\n";
                  responseMessage += "=".repeat(receiptWidth) + "\n";
                  responseMessage += centerText(`${fullReceipt.length} ITEM${fullReceipt.length > 1 ? 'S' : ''}`) + "\n";
                  responseMessage += "```\n\n";
                }
                
                if (receiptCount > 1) {
                  responseMessage += `**Summary**: Found receipts from ${receiptCount} different visits to ${searchTerm}.`;
                }
                
                suggestions = ["View spending trends at this store", "Compare with other stores", "Set budget alerts"];
                
              } else {
                // Handle store/transaction search results (original logic)
                const total = responseData.reduce((sum: number, transaction: any) => sum + Math.abs(parseFloat(transaction.amount)), 0);
                
                if (query.parameters.isLatest) {
                  // For latest store visit, show transaction details
                  const transaction = responseData[0];
                  const transactionDate = new Date(transaction.date).toLocaleDateString();
                  responseMessage = `Your last visit to ${searchTerm} was on ${transactionDate}. You spent $${Math.abs(parseFloat(transaction.amount)).toFixed(2)} on "${transaction.description}".`;
                  suggestions = ["View receipt from this transaction", "See all visits to this store", "Compare spending at different stores"];
                } else {
                  responseMessage = `Found ${responseData.length} transaction${responseData.length > 1 ? 's' : ''} at "${searchTerm}". Total spent: $${total.toFixed(2)}.`;
                  
                  // Show top 3 transactions as examples
                  if (responseData.length > 0) {
                    const topTransactions = responseData.slice(0, 3).map((transaction: any) => 
                      `• ${new Date(transaction.date).toLocaleDateString()}: $${Math.abs(parseFloat(transaction.amount)).toFixed(2)} - ${transaction.description}`
                    );
                    responseMessage += "\n\nRecent visits:\n" + topTransactions.join("\n");
                    
                    if (responseData.length > 3) {
                      responseMessage += `\n... and ${responseData.length - 3} more visit${responseData.length - 3 > 1 ? 's' : ''}`;
                    }
                  }
                  
                  suggestions = ["View receipts from these visits", "See spending trends at this store", "Compare with other stores"];
                }
              }
            } else {
              // Handle product/receipt item search results
              const total = responseData.reduce((sum: number, item: any) => sum + Math.abs(parseFloat(item.itemAmount)), 0);
              
              if (query.parameters.isLatest) {
              // For "last time" queries, show the most recent item with full receipt context
              const item = responseData[0];
              const itemDate = new Date(item.createdAt).toLocaleDateString();
              
              // Get the full receipt from this transaction and transaction details
              const fullReceipt = await storage.getReceiptItems(item.transactionId);
              const transaction = await storage.getTransaction(item.transactionId);
              
              if (!transaction) {
                responseMessage = `Could not find transaction details for the last purchase of "${searchTerm}".`;
                break;
              }
              const receiptTotal = fullReceipt.reduce((sum: number, receiptItem: any) => sum + Math.abs(parseFloat(receiptItem.itemAmount)), 0);
              
              const transactionDate = new Date(transaction.date);
              const storeName = transaction.merchant || "STORE";
              const receiptDate = transactionDate.toLocaleDateString();
              const receiptTime = transactionDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              
              responseMessage = `Last time you bought "${searchTerm}" was on ${receiptDate} at ${storeName}. You purchased ${item.itemDescription} for $${Math.abs(parseFloat(item.itemAmount)).toFixed(2)}.\n\nHere's your full receipt from that transaction:\n\n`;
              
              // Format as classical paper receipt
              const receiptWidth = 32;
              const centerText = (text: string) => {
                const padding = Math.max(0, receiptWidth - text.length);
                const leftPad = Math.floor(padding / 2);
                return ' '.repeat(leftPad) + text;
              };
              
              const rightAlign = (left: string, right: string) => {
                const maxLeft = receiptWidth - right.length - 1;
                const truncatedLeft = left.length > maxLeft ? left.substring(0, maxLeft - 3) + '...' : left;
                const spaces = receiptWidth - truncatedLeft.length - right.length;
                return truncatedLeft + ' '.repeat(Math.max(1, spaces)) + right;
              };
              
              responseMessage += "```\n";
              responseMessage += centerText(storeName.toUpperCase()) + "\n";
              responseMessage += centerText("RECEIPT") + "\n";
              responseMessage += "=".repeat(receiptWidth) + "\n";
              responseMessage += centerText(receiptDate) + "\n";
              responseMessage += centerText(receiptTime) + "\n";
              responseMessage += "-".repeat(receiptWidth) + "\n\n";
              
              // Items (highlight the searched item)
              fullReceipt.forEach((receiptItem: any) => {
                const price = `$${Math.abs(parseFloat(receiptItem.itemAmount)).toFixed(2)}`;
                const itemLine = rightAlign(receiptItem.itemDescription, price);
                if (receiptItem.id === item.id) {
                  responseMessage += "**" + itemLine + "**\n"; // Mark for bold formatting
                } else {
                  responseMessage += itemLine + "\n";
                }
              });
              
              responseMessage += "\n" + "-".repeat(receiptWidth) + "\n";
              responseMessage += rightAlign("TOTAL", `$${receiptTotal.toFixed(2)}`) + "\n";
              responseMessage += "=".repeat(receiptWidth) + "\n";
              responseMessage += centerText(`${fullReceipt.length} ITEM${fullReceipt.length > 1 ? 'S' : ''}`) + "\n";
              responseMessage += "```";
              
              suggestions = ["Search for all purchases of this item", "View spending trends for this category", "Set budget alert for this category"];
              } else {
              responseMessage = `Found ${responseData.length} item${responseData.length > 1 ? 's' : ''} matching "${searchTerm}". Total spent: $${total.toFixed(2)}.\n\n`;
              
              // Group items by transaction to show full receipts
              const transactionGroups = new Map();
              for (const item of responseData) {
                if (!transactionGroups.has(item.transactionId)) {
                  transactionGroups.set(item.transactionId, []);
                }
                transactionGroups.get(item.transactionId).push(item);
              }

              // Show each receipt that contains school equipment
              let receiptCount = 0;
              for (const transactionId of Array.from(transactionGroups.keys())) {
                const items = transactionGroups.get(transactionId);
                receiptCount++;
                
                // Get the full receipt and transaction details
                const fullReceipt = await storage.getReceiptItems(transactionId);
                const transaction = await storage.getTransaction(transactionId);
                
                if (!transaction) continue;
                
                const receiptTotal = fullReceipt.reduce((sum: number, receiptItem: any) => sum + Math.abs(parseFloat(receiptItem.itemAmount)), 0);
                const transactionDate = new Date(transaction.date);
                const storeName = transaction.merchant || "STORE";
                const receiptDate = transactionDate.toLocaleDateString();
                const receiptTime = transactionDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                
                responseMessage += `**Receipt #${receiptCount} - ${receiptDate} at ${storeName}**\n\n`;
                
                // Format as classical paper receipt
                const receiptWidth = 32;
                const centerText = (text: string) => {
                  const padding = Math.max(0, receiptWidth - text.length);
                  const leftPad = Math.floor(padding / 2);
                  return ' '.repeat(leftPad) + text;
                };
                
                const rightAlign = (left: string, right: string) => {
                  const maxLeft = receiptWidth - right.length - 1;
                  const truncatedLeft = left.length > maxLeft ? left.substring(0, maxLeft - 3) + '...' : left;
                  const spaces = receiptWidth - truncatedLeft.length - right.length;
                  return truncatedLeft + ' '.repeat(Math.max(1, spaces)) + right;
                };
                
                responseMessage += "```\n";
                responseMessage += centerText(storeName.toUpperCase()) + "\n";
                responseMessage += centerText("RECEIPT") + "\n";
                responseMessage += "=".repeat(receiptWidth) + "\n";
                responseMessage += centerText(receiptDate) + "\n";
                responseMessage += centerText(receiptTime) + "\n";
                responseMessage += "-".repeat(receiptWidth) + "\n\n";
                
                // Items (highlight the school equipment items)
                const matchingItemIds = new Set(items.map((item: any) => item.id));
                fullReceipt.forEach((receiptItem: any) => {
                  const price = `$${Math.abs(parseFloat(receiptItem.itemAmount)).toFixed(2)}`;
                  const itemLine = rightAlign(receiptItem.itemDescription, price);
                  if (matchingItemIds.has(receiptItem.id)) {
                    responseMessage += "**" + itemLine + "**\n"; // Mark school equipment items in bold
                  } else {
                    responseMessage += itemLine + "\n";
                  }
                });
                
                responseMessage += "\n" + "-".repeat(receiptWidth) + "\n";
                responseMessage += rightAlign("TOTAL", `$${receiptTotal.toFixed(2)}`) + "\n";
                responseMessage += "=".repeat(receiptWidth) + "\n";
                responseMessage += centerText(`${fullReceipt.length} ITEM${fullReceipt.length > 1 ? 'S' : ''}`) + "\n";
                responseMessage += "```\n\n";
              }
              
              if (receiptCount > 1) {
                responseMessage += `**Summary**: Found school equipment items across ${receiptCount} different receipts.`;
              }
              
              suggestions = ["Search for similar items", "View spending trends for this category", "Set budget for this category"];
              }
            }
          } else {
            const searchTerm = query.parameters.searchTerm;
            responseMessage = `No items found matching "${searchTerm}". Try different search terms or check your recent transactions.`;
            suggestions = ["Try a different search term", "View all recent transactions", "Check your transaction history"];
          }
          break;

        case 'latest_receipt':
          if (responseData.length > 0) {
            const total = responseData.reduce((sum: number, item: any) => sum + Math.abs(parseFloat(item.itemAmount)), 0);
            const searchTerm = query.parameters.searchTerm;
            
            // Format as classical paper receipt
            const receiptWidth = 32;
            const centerText = (text: string) => {
              const padding = Math.max(0, receiptWidth - text.length);
              const leftPad = Math.floor(padding / 2);
              return ' '.repeat(leftPad) + text;
            };
            
            const rightAlign = (left: string, right: string) => {
              const maxLeft = receiptWidth - right.length - 1;
              const truncatedLeft = left.length > maxLeft ? left.substring(0, maxLeft - 3) + '...' : left;
              const spaces = receiptWidth - truncatedLeft.length - right.length;
              return truncatedLeft + ' '.repeat(Math.max(1, spaces)) + right;
            };
            
            responseMessage = "```\n";
            responseMessage += centerText((searchTerm || "STORE").toUpperCase()) + "\n";
            responseMessage += centerText("RECEIPT") + "\n";
            responseMessage += "=".repeat(receiptWidth) + "\n";
            responseMessage += centerText(new Date().toLocaleDateString()) + "\n";
            responseMessage += centerText(new Date().toLocaleTimeString()) + "\n";
            responseMessage += "-".repeat(receiptWidth) + "\n\n";
            
            // Items
            responseData.forEach((item: any) => {
              const price = `$${Math.abs(parseFloat(item.itemAmount)).toFixed(2)}`;
              responseMessage += rightAlign(item.itemDescription, price) + "\n";
            });
            
            responseMessage += "\n" + "-".repeat(receiptWidth) + "\n";
            responseMessage += rightAlign("TOTAL", `$${total.toFixed(2)}`) + "\n";
            responseMessage += "=".repeat(receiptWidth) + "\n";
            responseMessage += centerText("THANK YOU FOR SHOPPING!") + "\n";
            responseMessage += centerText(`${responseData.length} ITEM${responseData.length > 1 ? 'S' : ''}`) + "\n";
            responseMessage += "```";
            
            suggestions = ["View all receipts from this store", "Compare with previous visits", "Set budget alerts"];
          } else {
            const searchTerm = query.parameters.searchTerm;
            responseMessage = `No recent receipts found for "${searchTerm}". Try different search terms or check your transaction history.`;
            suggestions = ["Try a different store name", "View all recent transactions", "Check your purchase history"];
          }
          break;

        default:
          // For general queries, check if we have transactions or accounts data
          if (targetAccountId && responseData && responseData.length > 0 && responseData[0].accountId) {
            // We have transactions data for a specific account
            const account = debugInfo.accountMatch?.foundAccount || "this account";
            const incoming = responseData.filter((t: any) => parseFloat(t.amount) > 0);
            const outgoing = responseData.filter((t: any) => parseFloat(t.amount) < 0);
            const totalIncoming = incoming.reduce((sum: number, t: any) => sum + parseFloat(t.amount), 0);
            const totalOutgoing = Math.abs(outgoing.reduce((sum: number, t: any) => sum + parseFloat(t.amount), 0));
            
            let parts = [];
            if (totalIncoming > 0) parts.push(`received $${totalIncoming.toFixed(2)}`);
            if (totalOutgoing > 0) parts.push(`spent $${totalOutgoing.toFixed(2)}`);
            
            responseMessage = `Here are the recent transactions from ${account}. You ${parts.join(' and ')} across ${responseData.length} transaction${responseData.length > 1 ? 's' : ''}.\n\n`;
            
            // Show the transactions
            responseData.forEach((transaction: any, index: number) => {
              const date = new Date(transaction.date).toLocaleDateString();
              const amount = parseFloat(transaction.amount);
              const formattedAmount = amount >= 0 ? `+$${amount.toFixed(2)}` : `-$${Math.abs(amount).toFixed(2)}`;
              const description = transaction.description || 'Transaction';
              const merchant = transaction.merchant ? ` at ${transaction.merchant}` : '';
              
              responseMessage += `${index + 1}. ${date}: ${formattedAmount} - ${description}${merchant}\n`;
            });
            
            suggestions = ["View more transactions", "Filter by category", "See spending trends"];
          } else {
            // Show account overview
            const totalBalance = responseData.reduce((sum: number, acc: any) => {
              const balance = parseFloat(acc.balance) || 0;
              // For expense accounts, the balance is already negative, so add it as is
              // For other accounts, add the positive balance
              return sum + balance;
            }, 0);
            responseMessage = `Account Overview: Net worth $${totalBalance.toFixed(2)}. `;
            responseMessage += responseData.map((acc: any) => {
              const balance = parseFloat(acc.balance) || 0;
              return `${acc.name} (${acc.type}): $${balance >= 0 ? balance.toFixed(2) : '-$' + Math.abs(balance).toFixed(2)}`;
            }).join(", ");
            suggestions = ["View recent transactions", "Check budget status", "Review savings goals"];
          }
      }

      // Save the user message
      await storage.createChatMessage({
        message,
        response: null,
        isUser: true,
        queryData: null
      });

      // Always save debug info so it can be shown/hidden based on toggle
      const chatMessageData: any = { 
        query, 
        data: responseData,
        debug: debugInfo // Always include debug info
      };
      
      await storage.createChatMessage({
        message: responseMessage,
        response: null,
        isUser: false,
        queryData: chatMessageData
      });

      const response: any = {
        message: responseMessage,
        data: responseData,
        suggestions
      };
      
      if (debug) {
        response.debug = debugInfo;
      }
      
      res.json(response);

    } catch (error) {
      console.error('Chat error:', error);
      res.status(500).json({ error: "Failed to process message" });
    }
  });

  // Account endpoints
  app.get("/api/accounts", async (req, res) => {
    try {
      const accounts = await storage.getAccounts();
      res.json(accounts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch accounts" });
    }
  });

  app.post("/api/accounts/:id/recalculate-balance", async (req, res) => {
    try {
      const { id } = req.params;
      const updatedAccount = await storage.recalculateAccountBalance(id);
      res.json({ 
        success: true, 
        account: updatedAccount,
        message: `Account balance recalculated successfully. New balance: $${updatedAccount.balance}`
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to recalculate account balance" });
    }
  });

  app.post("/api/accounts/recalculate-all-balances", async (req, res) => {
    try {
      const updatedAccounts = await storage.recalculateAllAccountBalances();
      res.json({ 
        success: true, 
        accounts: updatedAccounts,
        message: `Successfully recalculated balances for ${updatedAccounts.length} accounts`
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to recalculate account balances" });
    }
  });

  app.get("/api/accounts/:id", async (req, res) => {
    try {
      const account = await storage.getAccount(req.params.id);
      if (!account) {
        return res.status(404).json({ error: "Account not found" });
      }
      res.json(account);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch account" });
    }
  });

  // Generate embeddings for existing accounts
  app.post("/api/generate-account-embeddings", async (req, res) => {
    try {
      await storage.generateAccountEmbeddings();
      res.json({ message: "Account embeddings generated successfully" });
    } catch (error) {
      console.error('Error generating account embeddings:', error);
      res.status(500).json({ error: "Failed to generate account embeddings" });
    }
  });

  // Receipt endpoints
  app.get("/api/receipts/:transactionId", async (req, res) => {
    try {
      const { transactionId } = req.params;
      const receiptItems = await storage.getReceiptItems(transactionId);
      res.json(receiptItems);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch receipt items" });
    }
  });

  // Transaction endpoints
  app.get("/api/transactions", async (req, res) => {
    try {
      const { accountId, limit, category } = req.query;
      
      let transactions;
      if (category) {
        transactions = await storage.getTransactionsByCategory(category as string, accountId as string);
      } else {
        transactions = await storage.getTransactions(accountId as string, limit ? parseInt(limit as string) : undefined);
      }
      
      res.json(transactions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  app.post("/api/transactions", async (req, res) => {
    try {
      const validatedData = insertTransactionSchema.parse(req.body);
      
      // Auto-categorize if category not provided
      if (!validatedData.category && validatedData.description) {
        validatedData.category = await categorizeTransaction(validatedData.description, validatedData.merchant || undefined);
      }
      
      const transaction = await storage.createTransaction(validatedData);
      res.status(201).json(transaction);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid transaction data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create transaction" });
    }
  });

  // Budget endpoints
  app.get("/api/budgets", async (req, res) => {
    try {
      const { accountId } = req.query;
      const budgets = await storage.getBudgets(accountId as string);
      res.json(budgets);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch budgets" });
    }
  });

  app.post("/api/budgets", async (req, res) => {
    try {
      const validatedData = insertBudgetSchema.parse(req.body);
      const budget = await storage.createBudget(validatedData);
      res.status(201).json(budget);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid budget data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create budget" });
    }
  });

  // Savings goal endpoints
  app.get("/api/savings-goals", async (req, res) => {
    try {
      const { accountId } = req.query;
      const goals = await storage.getSavingsGoals(accountId as string);
      res.json(goals);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch savings goals" });
    }
  });

  app.post("/api/savings-goals", async (req, res) => {
    try {
      const validatedData = insertSavingsGoalSchema.parse(req.body);
      const goal = await storage.createSavingsGoal(validatedData);
      res.status(201).json(goal);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid savings goal data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create savings goal" });
    }
  });

  // Analytics endpoints
  app.get("/api/analytics/spending-by-category", async (req, res) => {
    try {
      const { accountId, startDate, endDate } = req.query;
      const spending = await storage.getSpendingByCategory(
        accountId as string,
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );
      res.json(spending);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch spending data" });
    }
  });

  app.get("/api/analytics/monthly-spending", async (req, res) => {
    try {
      const { accountId } = req.query;
      const spending = await storage.getMonthlySpending(accountId as string);
      res.json(spending);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch monthly spending" });
    }
  });

  // Chat history
  app.get("/api/chat/history", async (req, res) => {
    try {
      const messages = await storage.getChatMessages();
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch chat history" });
    }
  });

  // Clear chat history
  app.delete("/api/chat/history", async (req, res) => {
    try {
      await storage.clearChatMessages();
      res.json({ success: true, message: "Chat history cleared successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to clear chat history" });
    }
  });

  // Bulk data upload endpoint
  app.post("/api/data/bulk-upload", async (req, res) => {
    try {
      const { accounts = [], transactions = [], budgets = [], savingsGoals = [], receiptItems = [] } = req.body;
      
      const results = {
        success: true,
        created: {
          accounts: 0,
          transactions: 0, 
          budgets: 0,
          savingsGoals: 0,
          receiptItems: 0
        },
        errors: [] as string[],
        message: undefined as string | undefined
      };

      // Create accounts first (needed for foreign keys)
      const accountMap = new Map<string, string>(); // name -> id mapping
      for (const accountData of accounts) {
        try {
          const validatedAccount = insertAccountSchema.parse(accountData);
          const createdAccount = await storage.createAccount(validatedAccount);
          accountMap.set(accountData.name, createdAccount.id);
          results.created.accounts++;
        } catch (error) {
          results.errors.push(`Account "${accountData.name}": ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Create transactions (may reference accounts by name)
      const transactionMap = new Map<string, string>(); // description -> id mapping
      for (const transactionData of transactions) {
        try {
          // Handle account reference by name
          if (transactionData.accountName && !transactionData.accountId) {
            const accountId = accountMap.get(transactionData.accountName);
            if (!accountId) {
              results.errors.push(`Transaction "${transactionData.description}": Referenced account "${transactionData.accountName}" not found`);
              continue;
            }
            transactionData.accountId = accountId;
            delete transactionData.accountName;
          }
          
          const validatedTransaction = insertTransactionSchema.parse(transactionData);
          const createdTransaction = await storage.createTransaction(validatedTransaction);
          transactionMap.set(transactionData.description, createdTransaction.id);
          results.created.transactions++;
        } catch (error) {
          results.errors.push(`Transaction "${transactionData.description}": ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Create budgets (may reference accounts by name)
      for (const budgetData of budgets) {
        try {
          // Handle account reference by name
          if (budgetData.accountName && !budgetData.accountId) {
            const accountId = accountMap.get(budgetData.accountName);
            if (accountId) {
              budgetData.accountId = accountId;
            }
            delete budgetData.accountName;
          }
          
          const validatedBudget = insertBudgetSchema.parse(budgetData);
          await storage.createBudget(validatedBudget);
          results.created.budgets++;
        } catch (error) {
          results.errors.push(`Budget "${budgetData.name}": ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Create savings goals (may reference accounts by name)
      for (const goalData of savingsGoals) {
        try {
          // Handle account reference by name
          if (goalData.accountName && !goalData.accountId) {
            const accountId = accountMap.get(goalData.accountName);
            if (accountId) {
              goalData.accountId = accountId;
            }
            delete goalData.accountName;
          }
          
          const validatedGoal = insertSavingsGoalSchema.parse(goalData);
          await storage.createSavingsGoal(validatedGoal);
          results.created.savingsGoals++;
        } catch (error) {
          results.errors.push(`Savings Goal "${goalData.name}": ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Create receipt items (may reference transactions by description)
      for (const receiptData of receiptItems) {
        try {
          // Handle transaction reference by description
          if (receiptData.transactionRef && !receiptData.transactionId) {
            const transactionId = transactionMap.get(receiptData.transactionRef);
            if (!transactionId) {
              results.errors.push(`Receipt Item "${receiptData.itemDescription}": Referenced transaction "${receiptData.transactionRef}" not found`);
              continue;
            }
            receiptData.transactionId = transactionId;
            delete receiptData.transactionRef;
          }
          
          const validatedReceiptItem = insertReceiptItemSchema.parse(receiptData);
          await storage.createReceiptItem(validatedReceiptItem);
          results.created.receiptItems++;
        } catch (error) {
          results.errors.push(`Receipt Item "${receiptData.itemDescription}": ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Set success to false if there were any errors
      if (results.errors.length > 0) {
        results.success = false;
      }

      // Recalculate all account balances after bulk upload
      if (results.created.transactions > 0 || results.created.accounts > 0) {
        try {
          await storage.recalculateAllAccountBalances();
          results.message = `Bulk upload completed successfully. ${results.created.transactions} transactions created and all account balances updated.`;
        } catch (error) {
          results.errors.push(`Warning: Failed to recalculate account balances: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      res.json(results);

    } catch (error) {
      console.error('Bulk upload error:', error);
      res.status(500).json({ 
        success: false,
        error: "Failed to process bulk upload",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Account-specific transaction upload endpoint
  app.post("/api/data/account-upload", async (req, res) => {
    try {
      const { accountId, transactions = [] } = req.body;
      
      if (!accountId) {
        return res.status(400).json({
          success: false,
          error: "Account ID is required for account-specific uploads"
        });
      }

      const results = {
        success: true,
        created: {
          accounts: 0,
          transactions: 0,
          budgets: 0,
          savingsGoals: 0,
          receiptItems: 0
        },
        errors: [] as string[],
        message: undefined as string | undefined
      };

      // Process each transaction with its receipt items
      for (const transactionData of transactions) {
        try {
          // Prepare transaction data with the selected account
          const transactionToCreate = {
            accountId,
            description: `${transactionData.merchant} - ${transactionData.category}`,
            amount: transactionData.amount,
            category: transactionData.category,
            merchant: transactionData.merchant,
            date: new Date(transactionData.date)
          };
          
          const validatedTransaction = insertTransactionSchema.parse(transactionToCreate);
          const createdTransaction = await storage.createTransaction(validatedTransaction);
          results.created.transactions++;

          // Process receipt items for this transaction
          if (transactionData.receiptItems && Array.isArray(transactionData.receiptItems)) {
            for (const receiptItem of transactionData.receiptItems) {
              try {
                const receiptToCreate = {
                  transactionId: createdTransaction.id,
                  itemDescription: receiptItem.description,
                  itemAmount: receiptItem.price,
                  itemCategory: transactionData.category, // Use transaction category as default
                  quantity: receiptItem.amount || "1"
                };
                
                const validatedReceiptItem = insertReceiptItemSchema.parse(receiptToCreate);
                await storage.createReceiptItem(validatedReceiptItem);
                results.created.receiptItems++;
              } catch (error) {
                results.errors.push(`Receipt Item "${receiptItem.description}" in transaction "${transactionData.merchant}": ${error instanceof Error ? error.message : 'Unknown error'}`);
              }
            }
          }
        } catch (error) {
          results.errors.push(`Transaction "${transactionData.merchant}": ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Set success to false if there were any errors
      if (results.errors.length > 0) {
        results.success = false;
      }

      // Recalculate account balance after account-specific upload
      if (results.created.transactions > 0) {
        try {
          await storage.recalculateAccountBalance(accountId);
          results.message = `Account upload completed successfully. ${results.created.transactions} transactions created and account balance updated.`;
        } catch (error) {
          results.errors.push(`Warning: Failed to recalculate account balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      res.json(results);

    } catch (error) {
      console.error('Account upload error:', error);
      res.status(500).json({ 
        success: false,
        error: "Failed to process account-specific upload",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
