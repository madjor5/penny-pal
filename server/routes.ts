import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { parseFinancialQuery, generateFinancialResponse, categorizeTransaction } from "./openai";
import { insertTransactionSchema, insertBudgetSchema, insertSavingsGoalSchema, insertChatMessageSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Chat endpoint
  app.post("/api/chat", async (req, res) => {
    try {
      const { message, debug = false } = req.body;
      
      if (!message) {
        return res.status(400).json({ error: "Message is required" });
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
          if (query.parameters.category) {
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
            // Use store-based search for queries about specific stores/merchants
            dbQueries.push(`searchReceiptItemsByStore('${query.parameters.searchTerm}')`);
            responseData = await storage.searchReceiptItemsByStore(query.parameters.searchTerm);
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
            const total = responseData.reduce((sum: number, item: any) => sum + Math.abs(parseFloat(item.itemAmount)), 0);
            const searchTerm = query.parameters.searchTerm;
            responseMessage = `Found ${responseData.length} item${responseData.length > 1 ? 's' : ''} matching "${searchTerm}". Total spent: $${total.toFixed(2)}.`;
            
            // Show top 3 items as examples
            if (responseData.length > 0) {
              const topItems = responseData.slice(0, 3).map((item: any) => 
                `• ${item.itemDescription}: $${Math.abs(parseFloat(item.itemAmount)).toFixed(2)}`
              );
              responseMessage += "\n\nTop matches:\n" + topItems.join("\n");
              
              if (responseData.length > 3) {
                responseMessage += `\n... and ${responseData.length - 3} more item${responseData.length - 3 > 1 ? 's' : ''}`;
              }
            }
            
            suggestions = ["Search for similar items", "View transaction details", "Set budget for this category"];
          } else {
            const searchTerm = query.parameters.searchTerm;
            responseMessage = `No items found matching "${searchTerm}". Try different search terms or check your recent transactions.`;
            suggestions = ["Try a different search term", "View all recent transactions", "Check your transaction history"];
          }
          break;

        default:
          // For general queries, show account overview
          const totalBalance = responseData.reduce((sum: number, acc: any) => {
            const balance = parseFloat(acc.balance);
            return acc.type === 'expenses' ? sum - Math.abs(balance) : sum + balance;
          }, 0);
          responseMessage = `Account Overview: Net worth $${totalBalance.toFixed(2)}. `;
          responseMessage += responseData.map((acc: any) => 
            `${acc.name}: $${Math.abs(parseFloat(acc.balance)).toFixed(2)}`
          ).join(", ");
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

  const httpServer = createServer(app);
  return httpServer;
}
