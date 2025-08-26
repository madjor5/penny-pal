import { Bot, User } from "lucide-react";
import SpendingBreakdown from "@/components/financial/SpendingBreakdown";
import SavingsGoals from "@/components/financial/SavingsGoals";

interface MessageBubbleProps {
  message: string;
  isUser: boolean;
  isWelcome?: boolean;
  data?: any;
  debug?: any;
}

export default function MessageBubble({ message, isUser, isWelcome = false, data, debug }: MessageBubbleProps) {
  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="bg-user-bubble rounded-2xl rounded-tr-md px-4 py-3 max-w-xs">
          <p className="text-sm text-white" data-testid="text-user-message">{message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start space-x-3">
      <div className="w-8 h-8 bg-finance-green rounded-full flex items-center justify-center flex-shrink-0">
        <Bot className="text-white" size={14} />
      </div>
      <div className="space-y-3 max-w-xs">
        <div className="bg-ai-bubble rounded-2xl rounded-tl-md px-4 py-3 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-800" data-testid="text-ai-message">{message}</p>
        </div>
        
        {/* Render data cards based on content */}
        {data && data.length > 0 && (
          <>
            {/* Check if data contains transactions for spending breakdown */}
            {data[0]?.amount && data[0]?.category && (
              <SpendingBreakdown transactions={data} data-testid="spending-breakdown" />
            )}
            
            {/* Check if data contains savings goals */}
            {data[0]?.targetAmount && data[0]?.currentAmount && (
              <SavingsGoals goals={data} data-testid="savings-goals" />
            )}
          </>
        )}
        
        {/* Debug Information */}
        {debug && (
          <div className="bg-gray-100 rounded-lg p-3 mt-2 text-xs font-mono">
            <details>
              <summary className="cursor-pointer font-semibold text-gray-700">Debug Info</summary>
              <div className="mt-2 space-y-2">
                {debug.databaseQueries && (
                  <div>
                    <div className="font-semibold text-blue-700">Database Queries:</div>
                    <ul className="list-disc list-inside text-gray-600">
                      {debug.databaseQueries.map((query: string, index: number) => (
                        <li key={index}>{query}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {debug.openaiQuery && (
                  <div>
                    <div className="font-semibold text-green-700">OpenAI Request:</div>
                    <div className="text-gray-600">Request: {debug.openaiQuery.request}</div>
                    <div className="text-gray-600">Response: {JSON.stringify(debug.openaiQuery.response, null, 2)}</div>
                  </div>
                )}
                
                {debug.queryResults && (
                  <div>
                    <div className="font-semibold text-purple-700">Query Results:</div>
                    <div className="text-gray-600">Count: {debug.queryResults.count}</div>
                  </div>
                )}
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
