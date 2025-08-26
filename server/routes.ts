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
      const { message } = req.body;
      
      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      // Parse the user's financial query
      const query = await parseFinancialQuery(message);
      
      let responseData = null;
      let contextData = null;

      // Execute the appropriate query based on the parsed intent
      switch (query.queryType) {
        case 'transactions':
          if (query.parameters.category) {
            responseData = await storage.getTransactionsByCategory(query.parameters.category);
          } else if (query.parameters.dateRange) {
            const startDate = new Date(query.parameters.dateRange.start);
            const endDate = new Date(query.parameters.dateRange.end);
            responseData = await storage.getTransactionsByDateRange(startDate, endDate);
          } else {
            responseData = await storage.getTransactions(undefined, 20);
          }
          break;

        case 'budget':
          responseData = await storage.getBudgets();
          // Get spending data for budget comparison
          contextData = await storage.getSpendingByCategory();
          break;

        case 'goals':
          responseData = await storage.getSavingsGoals();
          break;

        case 'analysis':
          if (query.parameters.category) {
            responseData = await storage.getSpendingByCategory();
          } else {
            responseData = await storage.getMonthlySpending();
          }
          break;

        default:
          // For general queries, get account overview
          responseData = await storage.getAccounts();
      }

      // Generate AI response
      const aiResponse = await generateFinancialResponse(query, responseData, JSON.stringify(contextData));

      // Save the user message
      await storage.createChatMessage({
        message,
        response: null,
        isUser: true,
        queryData: null
      });

      // Save the AI response
      await storage.createChatMessage({
        message: aiResponse.answer,
        response: null,
        isUser: false,
        queryData: { query, data: responseData }
      });

      res.json({
        message: aiResponse.answer,
        data: aiResponse.data || responseData,
        suggestions: aiResponse.suggestions
      });

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
