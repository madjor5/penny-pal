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
                dbQueries.push(`getTransactionsByCategory('${query.parameters.category}') - fallback due to invalid dates`);
                responseData = await storage.getTransactionsByCategory(query.parameters.category);
              } else {
                dbQueries.push(`getTransactionsByCategoryAndDateRange('${query.parameters.category}', '${startDate.toISOString()}', '${endDate.toISOString()}')`);
                responseData = await storage.getTransactionsByCategoryAndDateRange(query.parameters.category, startDate, endDate);
              }
            } catch (error) {
              console.error('Date parsing error, falling back to category only:', error);
              dbQueries.push(`getTransactionsByCategory('${query.parameters.category}') - fallback due to date parsing error`);
              responseData = await storage.getTransactionsByCategory(query.parameters.category);
            }
          } else if (query.parameters.category) {
            dbQueries.push(`getTransactionsByCategory('${query.parameters.category}')`);
            responseData = await storage.getTransactionsByCategory(query.parameters.category);
          } else if (query.parameters.dateRange) {
            try {
              const startDate = new Date(query.parameters.dateRange.start);
              const endDate = new Date(query.parameters.dateRange.end);
              
              // Validate dates
              if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                console.error('Invalid date range:', query.parameters.dateRange);
                dbQueries.push(`getTransactions(undefined, 20) - fallback due to invalid dates`);
                responseData = await storage.getTransactions(undefined, 20);
              } else {
                dbQueries.push(`getTransactionsByDateRange('${startDate.toISOString()}', '${endDate.toISOString()}')`);                
                responseData = await storage.getTransactionsByDateRange(startDate, endDate);
              }
            } catch (error) {
              console.error('Date parsing error:', error);
              dbQueries.push(`getTransactions(undefined, 20) - fallback due to date parsing error`);
              responseData = await storage.getTransactions(undefined, 20);
            }
          } else {
            dbQueries.push(`getTransactions(undefined, 20)`);
            responseData = await storage.getTransactions(undefined, 20);
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
          // For general queries, get account overview
          dbQueries.push(`getAccounts()`);
          responseData = await storage.getAccounts();
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
            const total = responseData.reduce((sum: number, t: any) => sum + Math.abs(parseFloat(t.amount)), 0);
            const count = responseData.length;
            responseMessage = count > 0 
              ? `You spent $${total.toFixed(2)} on ${query.parameters.category} across ${count} transaction${count > 1 ? 's' : ''}.`
              : `You haven't spent anything on ${query.parameters.category} in the selected time period.`;
            
            if (count > 0) {
              suggestions = [
                `View detailed breakdown of ${query.parameters.category} spending`,
                "Compare this to your budget",
                "See spending trends over time"
              ];
            }
          } else if (query.parameters.dateRange) {
            const total = responseData.reduce((sum: number, t: any) => sum + Math.abs(parseFloat(t.amount)), 0);
            responseMessage = `You spent $${total.toFixed(2)} during this period across ${responseData.length} transactions.`;
          } else {
            const total = responseData.reduce((sum: number, t: any) => sum + Math.abs(parseFloat(t.amount)), 0);
            responseMessage = `Here are your recent transactions. Total: $${total.toFixed(2)} across ${responseData.length} transactions.`;
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
          // For general queries, show account overview
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
        errors: [] as string[]
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

  const httpServer = createServer(app);
  return httpServer;
}
