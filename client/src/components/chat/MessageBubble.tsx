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
{(() => {
            // Check if message contains a receipt code block
            const receiptMatch = message.match(/^(.*?)(```[\s\S]*?RECEIPT[\s\S]*?```)(.*)$/);
            
            if (receiptMatch) {
              const [, beforeReceipt, receiptBlock, afterReceipt] = receiptMatch;
              return (
                <div className="space-y-3">
                  {beforeReceipt.trim() && (
                    <p className="text-sm text-gray-800" data-testid="text-ai-message">{beforeReceipt.trim()}</p>
                  )}
                  <pre className="text-xs font-mono text-gray-800 whitespace-pre-wrap bg-gray-50 p-3 rounded border" data-testid="text-receipt-message">
                    {receiptBlock.replace(/```/g, '')}
                  </pre>
                  {afterReceipt.trim() && (
                    <p className="text-sm text-gray-800" data-testid="text-ai-message">{afterReceipt.trim()}</p>
                  )}
                </div>
              );
            } else if (message.startsWith('```') && message.includes('RECEIPT')) {
              // Legacy handling for receipt-only messages
              return (
                <pre className="text-xs font-mono text-gray-800 whitespace-pre-wrap bg-gray-50 p-3 rounded border" data-testid="text-receipt-message">
                  {message.replace(/```/g, '')}
                </pre>
              );
            } else {
              return <p className="text-sm text-gray-800" data-testid="text-ai-message">{message}</p>;
            }
          })()}
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
            <details open>
              <summary className="cursor-pointer font-semibold text-gray-700 mb-2">🐛 Debug Info</summary>
              <div className="mt-2 space-y-3">
                {debug.databaseQueries && debug.databaseQueries.length > 0 && (
                  <div>
                    <div className="font-semibold text-blue-700">📊 Database Queries:</div>
                    <ul className="list-disc list-inside text-gray-600 ml-2">
                      {debug.databaseQueries.map((query: string, index: number) => (
                        <li key={index} className="break-all">{query}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {debug.openaiQuery && (
                  <div>
                    <div className="font-semibold text-green-700">🤖 OpenAI Request:</div>
                    <div className="text-gray-600 ml-2">
                      <div><strong>Request:</strong> {debug.openaiQuery.request}</div>
                      <div><strong>Response:</strong></div>
                      <pre className="text-xs bg-white p-2 rounded mt-1 overflow-x-auto">
                        {JSON.stringify(debug.openaiQuery.response, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
                
                {debug.queryResults && (
                  <div>
                    <div className="font-semibold text-purple-700">📈 Query Results:</div>
                    <div className="text-gray-600 ml-2">Count: {debug.queryResults.count} records</div>
                  </div>
                )}
                
                {debug.timestamp && (
                  <div>
                    <div className="font-semibold text-gray-700">⏰ Timestamp:</div>
                    <div className="text-gray-600 ml-2">{new Date(debug.timestamp).toLocaleString()}</div>
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
