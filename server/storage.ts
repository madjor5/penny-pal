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
  calculateAccountBalance(accountId: string): Promise<string>;
  recalculateAccountBalance(accountId: string): Promise<Account>;
  recalculateAllAccountBalances(): Promise<Account[]>;
  searchAccountsBySemantic(searchTerm: string, threshold?: number): Promise<Account[]>;
  generateAccountEmbeddings(): Promise<void>;

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
  clearChatMessages(): Promise<void>;

  // Receipt Items
  getReceiptItems(transactionId?: string): Promise<ReceiptItem[]>;
  createReceiptItem(item: InsertReceiptItem): Promise<ReceiptItem>;
  searchReceiptItemsBySemantic(searchTerm: string, threshold?: number): Promise<ReceiptItem[]>;
  searchReceiptItemsByStore(searchTerm: string, threshold?: number): Promise<ReceiptItem[]>;
  getLatestReceiptFromStore(searchTerm: string, threshold?: number): Promise<ReceiptItem[]>;

  // Analytics
  getSpendingByCategory(accountId?: string, startDate?: Date, endDate?: Date): Promise<{ category: string; total: string }[]>;
  getMonthlySpending(accountId?: string): Promise<{ month: string; total: string }[]>;
  getYearlyGrowthData(accountId: string): Promise<{ year: string; balance: number; change: number; changePercentage: number }[]>;
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
    // Generate embedding for the account name
    const embedding = await generateEmbedding(`${insertAccount.name} ${insertAccount.type} account`);
    
    const [account] = await db
      .insert(accounts)
      .values({
        ...insertAccount,
        embedding: embedding
      })
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
    
    // Automatically update the account balance after creating the transaction
    await this.recalculateAccountBalance(insertTransaction.accountId);
    
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

  async clearChatMessages(): Promise<void> {
    await db.delete(chatMessages);
  }

  // Balance calculation
  async calculateAccountBalance(accountId: string): Promise<string> {
    const accountTransactions = await db
      .select()
      .from(transactions)
      .where(eq(transactions.accountId, accountId));
    
    const totalBalance = accountTransactions.reduce((sum, transaction) => {
      return sum + parseFloat(transaction.amount);
    }, 0);
    
    return totalBalance.toFixed(2);
  }

  async recalculateAccountBalance(accountId: string): Promise<Account> {
    const newBalance = await this.calculateAccountBalance(accountId);
    return await this.updateAccountBalance(accountId, newBalance);
  }

  async recalculateAllAccountBalances(): Promise<Account[]> {
    const allAccounts = await this.getAccounts();
    const updatedAccounts = [];
    
    for (const account of allAccounts) {
      const updatedAccount = await this.recalculateAccountBalance(account.id);
      updatedAccounts.push(updatedAccount);
    }
    
    return updatedAccounts;
  }

  async searchAccountsBySemantic(searchTerm: string, threshold: number = 0.6): Promise<Account[]> {
    // Generate embedding for search term
    const searchEmbedding = await generateEmbedding(searchTerm);
    
    if (searchEmbedding.length === 0) {
      return [];
    }

    // Get all accounts and calculate similarity
    const allAccounts = await db.select().from(accounts);
    
    const similarAccounts = allAccounts
      .map(account => ({
        ...account,
        similarity: account.embedding ? cosineSimilarity(searchEmbedding, account.embedding) : 0
      }))
      .filter(account => account.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity); // Sort by similarity (highest first)

    return similarAccounts;
  }

  async generateAccountEmbeddings(): Promise<void> {
    // Get all accounts without embeddings
    const allAccounts = await db.select().from(accounts);
    const accountsWithoutEmbeddings = allAccounts.filter((account: Account) => !account.embedding || account.embedding.length === 0);
    
    console.log(`Generating embeddings for ${accountsWithoutEmbeddings.length} accounts...`);
    
    for (const account of accountsWithoutEmbeddings) {
      try {
        const embedding = await generateEmbedding(`${account.name} ${account.type} account`);
        
        await db
          .update(accounts)
          .set({ embedding: embedding })
          .where(eq(accounts.id, account.id));
          
        console.log(`Generated embedding for account: ${account.name}`);
      } catch (error) {
        console.error(`Failed to generate embedding for account ${account.name}:`, error);
      }
    }
    
    console.log('Finished generating account embeddings');
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

  async getYearlyGrowthData(accountId: string): Promise<{ year: string; balance: number; change: number; changePercentage: number; isForecast?: boolean }[]> {
    // Get all transactions for this account ordered by date
    const accountTransactions = await db
      .select()
      .from(transactions)
      .where(eq(transactions.accountId, accountId))
      .orderBy(transactions.date);

    if (accountTransactions.length === 0) {
      return [];
    }

    // Calculate yearly balances by running totals
    const yearlyData = new Map<string, number>();
    let runningBalance = 0;

    // Process transactions to build yearly balances
    for (const transaction of accountTransactions) {
      runningBalance += parseFloat(transaction.amount);
      const year = new Date(transaction.date).getFullYear().toString();
      yearlyData.set(year, runningBalance);
    }

    // Convert to array and calculate growth
    const results: { year: string; balance: number; change: number; changePercentage: number }[] = [];
    const years = Array.from(yearlyData.keys()).sort();
    
    for (let i = 0; i < years.length; i++) {
      const year = years[i];
      const balance = yearlyData.get(year) || 0;
      
      let change = 0;
      let changePercentage = 0;
      
      if (i > 0) {
        const previousBalance = yearlyData.get(years[i - 1]) || 0;
        change = balance - previousBalance;
        
        if (previousBalance !== 0) {
          changePercentage = (change / Math.abs(previousBalance)) * 100;
        }
      }
      
      results.push({
        year,
        balance: Math.round(balance * 100) / 100, // Round to 2 decimal places
        change: Math.round(change * 100) / 100,
        changePercentage: Math.round(changePercentage * 100) / 100,
        isForecast: false
      });
    }

    // Add 2-year forecasting based on trends
    if (results.length >= 2) {
      const lastTwoYears = results.slice(-2);
      const avgYearlyChange = lastTwoYears.reduce((sum, item) => sum + item.change, 0) / lastTwoYears.length;
      const lastBalance = results[results.length - 1].balance;
      const lastYear = parseInt(results[results.length - 1].year);

      // Add 2 forecast years
      for (let i = 1; i <= 2; i++) {
        const forecastYear = (lastYear + i).toString();
        const forecastBalance = lastBalance + (avgYearlyChange * i);
        
        results.push({
          year: forecastYear,
          balance: Math.round(forecastBalance * 100) / 100,
          change: Math.round(avgYearlyChange * 100) / 100,
          changePercentage: lastBalance !== 0 ? Math.round((avgYearlyChange / Math.abs(lastBalance)) * 100 * 100) / 100 : 0,
          isForecast: true
        });
      }
    }

    return results;
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

  async searchReceiptItemsBySemantic(searchTerm: string, threshold: number = 0.5): Promise<ReceiptItem[]> {
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

  async searchReceiptItemsByStore(searchTerm: string, threshold: number = 0.3): Promise<ReceiptItem[]> {
    // Search for receipt items from a specific store by first finding transactions from that store
    const storeTransactions = await this.searchTransactionsBySemantic(searchTerm);
    
    if (storeTransactions.length === 0) {
      return [];
    }

    // Get all receipt items from these transactions
    const transactionIds = storeTransactions.map(t => t.id);
    const items = await db.select().from(receiptItems)
      .where(sql`${receiptItems.transactionId} = ANY(${transactionIds})`);

    // Sort by transaction date (most recent first)
    return items.sort((a: ReceiptItem, b: ReceiptItem) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });
  }

  async getLatestReceiptFromStore(searchTerm: string, threshold: number = 0.3): Promise<ReceiptItem[]> {
    // Get the most recent transaction from the store
    const storeTransactions = await this.searchTransactionsBySemantic(searchTerm);
    
    if (storeTransactions.length === 0) {
      return [];
    }

    // Get receipt items from the most recent transaction
    const latestTransaction = storeTransactions[0]; // Already sorted by date descending
    return await db.select().from(receiptItems)
      .where(eq(receiptItems.transactionId, latestTransaction.id))
      .orderBy(receiptItems.createdAt);
  }

  async searchTransactionsBySemantic(searchTerm: string): Promise<Transaction[]> {
    // For transaction search, use simple text matching on merchant field
    // This is more appropriate for store names than semantic embedding
    const results = await db
      .select()
      .from(transactions)
      .where(sql`LOWER(merchant) LIKE LOWER('%' || ${searchTerm} || '%')`)
      .orderBy(desc(transactions.date))
      .limit(20);
    
    return results;
  }
}

export const storage = new DatabaseStorage();
