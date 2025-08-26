import { 
  accounts, 
  transactions, 
  budgets, 
  savingsGoals, 
  chatMessages,
  receiptItems,
  type Account, 
  type InsertAccount,
  type Transaction,
  type InsertTransaction,
  type Budget,
  type InsertBudget,
  type SavingsGoal,
  type InsertSavingsGoal,
  type ChatMessage,
  type InsertChatMessage,
  type ReceiptItem,
  type InsertReceiptItem
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, gte, lte, and, sum, sql, inArray } from "drizzle-orm";
import { generateEmbedding, cosineSimilarity } from "./openai";

export interface IStorage {
  // Accounts
  getAccounts(): Promise<Account[]>;
  getAccount(id: string): Promise<Account | undefined>;
  createAccount(account: InsertAccount): Promise<Account>;
  updateAccountBalance(id: string, balance: string): Promise<Account>;

  // Transactions
  getTransactions(accountId?: string, limit?: number): Promise<Transaction[]>;
  getTransactionsByDateRange(startDate: Date, endDate: Date, accountId?: string): Promise<Transaction[]>;
  getTransactionsByCategory(category: string, accountId?: string): Promise<Transaction[]>;
  getTransactionsByCategoryAndDateRange(category: string, startDate: Date, endDate: Date, accountId?: string): Promise<Transaction[]>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;

  // Budgets
  getBudgets(accountId?: string): Promise<Budget[]>;
  getBudget(id: string): Promise<Budget | undefined>;
  createBudget(budget: InsertBudget): Promise<Budget>;
  updateBudget(id: string, updates: Partial<InsertBudget>): Promise<Budget>;

  // Savings Goals
  getSavingsGoals(accountId?: string): Promise<SavingsGoal[]>;
  getSavingsGoal(id: string): Promise<SavingsGoal | undefined>;
  createSavingsGoal(goal: InsertSavingsGoal): Promise<SavingsGoal>;
  updateSavingsGoal(id: string, updates: Partial<InsertSavingsGoal>): Promise<SavingsGoal>;

  // Chat Messages
  getChatMessages(limit?: number): Promise<ChatMessage[]>;
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;

  // Receipt Items
  getReceiptItems(transactionId?: string): Promise<ReceiptItem[]>;
  createReceiptItem(item: InsertReceiptItem): Promise<ReceiptItem>;
  searchReceiptItemsBySemantic(searchTerm: string, threshold?: number): Promise<ReceiptItem[]>;
  searchReceiptItemsByStore(searchTerm: string, threshold?: number): Promise<ReceiptItem[]>;
  getLatestReceiptFromStore(searchTerm: string, threshold?: number): Promise<ReceiptItem[]>;

  // Analytics
  getSpendingByCategory(accountId?: string, startDate?: Date, endDate?: Date): Promise<{ category: string; total: string }[]>;
  getMonthlySpending(accountId?: string): Promise<{ month: string; total: string }[]>;
}

export class DatabaseStorage implements IStorage {
  // Accounts
  async getAccounts(): Promise<Account[]> {
    return await db.select().from(accounts).orderBy(accounts.name);
  }

  async getAccount(id: string): Promise<Account | undefined> {
    const [account] = await db.select().from(accounts).where(eq(accounts.id, id));
    return account;
  }

  async createAccount(insertAccount: InsertAccount): Promise<Account> {
    const [account] = await db
      .insert(accounts)
      .values(insertAccount)
      .returning();
    return account;
  }

  async updateAccountBalance(id: string, balance: string): Promise<Account> {
    const [account] = await db
      .update(accounts)
      .set({ balance })
      .where(eq(accounts.id, id))
      .returning();
    return account;
  }

  // Transactions
  async getTransactions(accountId?: string, limit = 50): Promise<Transaction[]> {
    let query = db.select().from(transactions);
    
    if (accountId) {
      query = query.where(eq(transactions.accountId, accountId)) as any;
    }
    
    return await query.orderBy(desc(transactions.date)).limit(limit);
  }

  async getTransaction(id: string): Promise<Transaction | undefined> {
    const [transaction] = await db.select().from(transactions).where(eq(transactions.id, id));
    return transaction;
  }

  async getTransactionsByDateRange(startDate: Date, endDate: Date, accountId?: string): Promise<Transaction[]> {
    let whereCondition = and(
      gte(transactions.date, startDate),
      lte(transactions.date, endDate)
    );

    if (accountId) {
      whereCondition = and(whereCondition, eq(transactions.accountId, accountId));
    }

    return await db
      .select()
      .from(transactions)
      .where(whereCondition)
      .orderBy(desc(transactions.date));
  }

  async getTransactionsByCategory(category: string, accountId?: string): Promise<Transaction[]> {
    let whereCondition = eq(transactions.category, category);

    if (accountId) {
      whereCondition = and(whereCondition, eq(transactions.accountId, accountId)) as any;
    }

    return await db
      .select()
      .from(transactions)
      .where(whereCondition)
      .orderBy(desc(transactions.date));
  }

  async getTransactionsByCategoryAndDateRange(category: string, startDate: Date, endDate: Date, accountId?: string): Promise<Transaction[]> {
    let whereCondition = and(
      eq(transactions.category, category),
      gte(transactions.date, startDate),
      lte(transactions.date, endDate)
    );

    if (accountId) {
      whereCondition = and(whereCondition, eq(transactions.accountId, accountId));
    }

    return await db
      .select()
      .from(transactions)
      .where(whereCondition)
      .orderBy(desc(transactions.date));
  }

  async createTransaction(insertTransaction: InsertTransaction): Promise<Transaction> {
    // Generate embedding for the transaction description
    const embedding = await generateEmbedding(`${insertTransaction.description} ${insertTransaction.category || ''} ${insertTransaction.merchant || ''}`);
    
    const [transaction] = await db
      .insert(transactions)
      .values({
        ...insertTransaction,
        embedding: embedding
      })
      .returning();
    return transaction;
  }

  // Budgets
  async getBudgets(accountId?: string): Promise<Budget[]> {
    let query = db.select().from(budgets);
    
    if (accountId) {
      query = query.where(eq(budgets.accountId, accountId)) as any;
    }
    
    return await query.orderBy(budgets.name);
  }

  async getBudget(id: string): Promise<Budget | undefined> {
    const [budget] = await db.select().from(budgets).where(eq(budgets.id, id));
    return budget;
  }

  async createBudget(insertBudget: InsertBudget): Promise<Budget> {
    const [budget] = await db
      .insert(budgets)
      .values(insertBudget)
      .returning();
    return budget;
  }

  async updateBudget(id: string, updates: Partial<InsertBudget>): Promise<Budget> {
    const [budget] = await db
      .update(budgets)
      .set(updates)
      .where(eq(budgets.id, id))
      .returning();
    return budget;
  }

  // Savings Goals
  async getSavingsGoals(accountId?: string): Promise<SavingsGoal[]> {
    let query = db.select().from(savingsGoals);
    
    if (accountId) {
      query = query.where(eq(savingsGoals.accountId, accountId)) as any;
    }
    
    return await query.orderBy(savingsGoals.name);
  }

  async getSavingsGoal(id: string): Promise<SavingsGoal | undefined> {
    const [goal] = await db.select().from(savingsGoals).where(eq(savingsGoals.id, id));
    return goal;
  }

  async createSavingsGoal(insertGoal: InsertSavingsGoal): Promise<SavingsGoal> {
    const [goal] = await db
      .insert(savingsGoals)
      .values(insertGoal)
      .returning();
    return goal;
  }

  async updateSavingsGoal(id: string, updates: Partial<InsertSavingsGoal>): Promise<SavingsGoal> {
    const [goal] = await db
      .update(savingsGoals)
      .set(updates)
      .where(eq(savingsGoals.id, id))
      .returning();
    return goal;
  }

  // Chat Messages
  async getChatMessages(limit = 50): Promise<ChatMessage[]> {
    return await db
      .select()
      .from(chatMessages)
      .orderBy(chatMessages.createdAt)
      .limit(limit);
  }

  async createChatMessage(insertMessage: InsertChatMessage): Promise<ChatMessage> {
    const [message] = await db
      .insert(chatMessages)
      .values(insertMessage)
      .returning();
    return message;
  }

  // Analytics
  async getSpendingByCategory(accountId?: string, startDate?: Date, endDate?: Date): Promise<{ category: string; total: string }[]> {
    let whereConditions = [sql`${transactions.category} IS NOT NULL`];

    if (accountId) {
      whereConditions.push(eq(transactions.accountId, accountId));
    }

    if (startDate && endDate) {
      whereConditions.push(
        and(
          gte(transactions.date, startDate),
          lte(transactions.date, endDate)
        ) as any
      );
    }

    const query = db
      .select({
        category: transactions.category,
        total: sum(transactions.amount).as('total')
      })
      .from(transactions)
      .where(and(...whereConditions) as any)
      .groupBy(transactions.category);

    const results = await query;
    return results.map(r => ({ category: r.category!, total: r.total || '0' }));
  }

  async getMonthlySpending(accountId?: string): Promise<{ month: string; total: string }[]> {
    let baseQuery = db
      .select({
        month: sql`TO_CHAR(${transactions.date}, 'YYYY-MM')`.as('month'),
        total: sum(transactions.amount).as('total')
      })
      .from(transactions)
      .groupBy(sql`TO_CHAR(${transactions.date}, 'YYYY-MM')`);

    if (accountId) {
      baseQuery = baseQuery.where(eq(transactions.accountId, accountId)) as any;
    }

    const results = await baseQuery;
    return results.map(r => ({ month: r.month as string, total: r.total || '0' }));
  }

  // Receipt Items
  async getReceiptItems(transactionId?: string): Promise<ReceiptItem[]> {
    let query = db.select().from(receiptItems);
    
    if (transactionId) {
      query = query.where(eq(receiptItems.transactionId, transactionId)) as any;
    }

    return await query.orderBy(receiptItems.createdAt);
  }

  async createReceiptItem(insertItem: InsertReceiptItem): Promise<ReceiptItem> {
    // Generate embedding for the item description
    const embedding = await generateEmbedding(insertItem.itemDescription);
    
    const [item] = await db
      .insert(receiptItems)
      .values({
        ...insertItem,
        embedding: embedding
      })
      .returning();
    return item;
  }

  async searchReceiptItemsBySemantic(searchTerm: string, threshold: number = 0.3): Promise<ReceiptItem[]> {
    // Generate embedding for search term
    const searchEmbedding = await generateEmbedding(searchTerm);
    
    if (searchEmbedding.length === 0) {
      return [];
    }

    // Get all receipt items and calculate similarity
    const allItems = await db.select().from(receiptItems);
    
    const similarItems = allItems
      .map(item => ({
        ...item,
        similarity: item.embedding ? cosineSimilarity(searchEmbedding, item.embedding) : 0
      }))
      .filter(item => item.similarity >= threshold)
      .sort((a, b) => {
        // First sort by similarity (high to low)
        const similarityDiff = b.similarity - a.similarity;
        if (Math.abs(similarityDiff) > 0.05) { // If similarity difference is significant
          return similarityDiff;
        }
        // If similarity is close, sort by date (most recent first)
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });

    return similarItems;
  }

  // Search transactions by semantic similarity
  async searchTransactionsBySemantic(searchTerm: string, threshold: number = 0.3): Promise<Transaction[]> {
    // Generate embedding for search term
    const searchEmbedding = await generateEmbedding(searchTerm);
    
    if (searchEmbedding.length === 0) {
      return [];
    }

    // Get all transactions and calculate similarity
    const allTransactions = await db.select().from(transactions);
    
    const similarTransactions = allTransactions
      .map(transaction => ({
        ...transaction,
        similarity: transaction.embedding ? cosineSimilarity(searchEmbedding, transaction.embedding) : 0
      }))
      .filter(transaction => transaction.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity);

    return similarTransactions;
  }

  // Search receipt items by first finding transactions at specific stores/merchants
  async searchReceiptItemsByStore(searchTerm: string, threshold: number = 0.3): Promise<ReceiptItem[]> {
    // First find transactions that match the store/merchant
    const matchingTransactions = await this.searchTransactionsBySemantic(searchTerm, threshold);
    
    if (matchingTransactions.length === 0) {
      return [];
    }

    // Get all receipt items from those transactions
    const transactionIds = matchingTransactions.map(t => t.id);
    const receiptItemsFromStoreTransactions = await db
      .select()
      .from(receiptItems)
      .where(inArray(receiptItems.transactionId, transactionIds))
      .orderBy(receiptItems.createdAt);

    return receiptItemsFromStoreTransactions;
  }

  // Get receipt items from the latest transaction at a specific store
  async getLatestReceiptFromStore(searchTerm: string, threshold: number = 0.3): Promise<ReceiptItem[]> {
    // First find transactions that match the store/merchant
    const matchingTransactions = await this.searchTransactionsBySemantic(searchTerm, threshold);
    
    if (matchingTransactions.length === 0) {
      return [];
    }

    // Get the most recent transaction by date
    const latestTransaction = matchingTransactions.sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    )[0];

    // Get receipt items from just that transaction
    const receiptItemsFromLatestTransaction = await db
      .select()
      .from(receiptItems)
      .where(eq(receiptItems.transactionId, latestTransaction.id))
      .orderBy(receiptItems.createdAt);

    return receiptItemsFromLatestTransaction;
  }
}

export const storage = new DatabaseStorage();
