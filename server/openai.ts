import OpenAI from "openai";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR
});

export interface FinancialQuery {
  intent: string;
  parameters: {
    category?: string;
    dateRange?: {
      start: string;
      end: string;
    };
    accountType?: string;
    amount?: number;
    timeframe?: string;
    searchTerm?: string; // For semantic search
    isLatest?: boolean; // For latest/last visit queries
    searchType?: 'product' | 'store'; // Whether searching for products or stores
  };
  queryType: 'transactions' | 'budget' | 'goals' | 'analysis' | 'general' | 'semantic_search' | 'latest_receipt';
}

export interface FinancialResponse {
  answer: string;
  data?: any;
  suggestions?: string[];
}

export async function parseFinancialQuery(userMessage: string): Promise<FinancialQuery> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: `You are a financial assistant that parses natural language queries about personal finances.
          
          Parse the user's message and extract:
          - intent: what they want to know
          - parameters: relevant filters like category, date range, account type, amounts, timeframe, searchTerm, isLatest, searchType
          - queryType: one of 'transactions', 'budget', 'goals', 'analysis', 'general', 'semantic_search', 'latest_receipt'
          
          For searchType parameter, determine if the search is for:
          - 'product': searching for specific items/products (e.g., "burger buns", "coffee", "milk")
          - 'store': searching for transactions at specific stores/merchants (e.g., "Costco", "Target", "Starbucks")
          
          For date ranges, use ISO date strings. For relative dates like "this month" or "last week", calculate the actual dates.
          Account types can be: 'budget', 'expenses', 'savings'
          
          Examples:
          - "Show my grocery spending this month" -> queryType: 'transactions', category: 'groceries', dateRange: current month
          - "How am I doing with my savings goals?" -> queryType: 'goals'
          - "What did I spend on dining out last week?" -> queryType: 'transactions', category: 'dining', dateRange: last week
          - "How much did I spend on coffee?" -> queryType: 'semantic_search', searchTerm: 'coffee', searchType: 'product'
          - "Show me all my Starbucks purchases" -> queryType: 'semantic_search', searchTerm: 'Starbucks', searchType: 'store'
          - "Show me my Costco transactions" -> queryType: 'semantic_search', searchTerm: 'Costco', searchType: 'store'
          - "When did I buy burger buns last time?" -> queryType: 'semantic_search', searchTerm: 'burger buns', isLatest: true, searchType: 'product'
          - "What was my last purchase of coffee?" -> queryType: 'semantic_search', searchTerm: 'coffee', isLatest: true, searchType: 'product'
          - "Show me the receipt from my last visit at Costco" -> queryType: 'latest_receipt', searchTerm: 'Costco', isLatest: true
          - "What did I buy on my latest trip to Target?" -> queryType: 'latest_receipt', searchTerm: 'Target', isLatest: true
          
          Respond with valid JSON only.`
        },
        {
          role: "user",
          content: userMessage
        }
      ],
      response_format: { type: "json_object" },
    });

    return JSON.parse(response.choices[0].message.content || '{}');
  } catch (error) {
    console.error('Error parsing financial query:', error);
    return {
      intent: userMessage,
      parameters: {},
      queryType: 'general'
    };
  }
}

export async function generateFinancialResponse(
  query: FinancialQuery, 
  data: any, 
  context?: string
): Promise<FinancialResponse> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: `You are a helpful AI financial assistant. You help users understand their financial data through conversational responses.
          
          Given a user's financial query and the relevant data, provide:
          - A clear, conversational answer
          - Actionable insights when appropriate
          - Helpful suggestions for financial improvement
          
          Be encouraging, specific, and use the actual numbers from the data provided.
          Format monetary amounts clearly (e.g., $1,234.56).
          
          Respond with JSON in this format:
          {
            "answer": "conversational response with insights",
            "data": structured_data_if_relevant,
            "suggestions": ["actionable suggestion 1", "suggestion 2"]
          }`
        },
        {
          role: "user",
          content: `Query: ${query.intent}
          Data: ${JSON.stringify(data)}
          ${context ? `Context: ${context}` : ''}`
        }
      ],
      response_format: { type: "json_object" },
    });

    return JSON.parse(response.choices[0].message.content || '{}');
  } catch (error) {
    console.error('Error generating financial response:', error);
    return {
      answer: "I'm sorry, I'm having trouble processing your request right now. Please try again.",
      suggestions: ["Try rephrasing your question", "Check back in a moment"]
    };
  }
}

export async function categorizeTransaction(description: string, merchant?: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: `Categorize this financial transaction into one of these categories:
          - groceries
          - dining
          - transportation
          - entertainment
          - shopping
          - utilities
          - healthcare
          - education
          - travel
          - other
          
          Respond with just the category name in lowercase.`
        },
        {
          role: "user",
          content: `Transaction: ${description}${merchant ? ` at ${merchant}` : ''}`
        }
      ],
    });

    return response.choices[0].message.content?.toLowerCase() || 'other';
  } catch (error) {
    console.error('Error categorizing transaction:', error);
    return 'other';
  }
}

// Generate embeddings for receipt items
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small", // Cost-effective embedding model
      input: text,
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    return [];
  }
}

// Find similar receipt items using cosine similarity
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
