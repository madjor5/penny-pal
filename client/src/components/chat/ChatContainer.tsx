import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Bot } from "lucide-react";
import MessageBubble from "./MessageBubble";
import AccountSummary from "@/components/financial/AccountSummary";
import { Account } from "@shared/schema";

interface ChatContainerProps {
  isProcessing?: boolean;
  debugMode?: boolean;
}

export default function ChatContainer({ isProcessing = false, debugMode = false }: ChatContainerProps) {
  const { data: accounts, isLoading: accountsLoading } = useQuery({
    queryKey: ['/api/accounts'],
  });

  const { data: chatHistory, isLoading: chatLoading } = useQuery({
    queryKey: ['/api/chat/history'],
  });


  useEffect(() => {
    const chatContainer = document.getElementById('chatContainer');
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }, [chatHistory]);

  return (
    <main className="flex-1 overflow-hidden">
      <div className="h-screen pb-32 pt-4 overflow-y-auto" id="chatContainer">
        <div className="px-4 space-y-4">
          
          {/* Welcome Message */}
          <MessageBubble
            message="Hello! I'm your AI financial assistant. I can help you track spending, review budgets, and analyze your financial data. What would you like to know?"
            isUser={false}
            isWelcome={true}
          />

          {/* Account Summary Card */}
          {!accountsLoading && accounts && Array.isArray(accounts) && 
            <AccountSummary accounts={accounts as Account[]} />
          }

          {/* Chat History */}
          {!chatLoading && chatHistory && Array.isArray(chatHistory) && 
            chatHistory.map((msg: any, index: number) => (
              <MessageBubble
                key={msg.id || index}
                message={msg.message}
                isUser={msg.isUser}
                data={msg.queryData?.data}
                debug={debugMode ? msg.queryData?.debug : undefined}
              />
            ))
          }
          
          {/* Typing Indicator */}
          {isProcessing && (
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 bg-finance-green rounded-full flex items-center justify-center flex-shrink-0">
                <Bot className="text-white" size={14} />
              </div>
              <div className="bg-ai-bubble rounded-2xl rounded-tl-md px-4 py-3 shadow-sm border border-gray-100">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                </div>
              </div>
            </div>
          )}

          {/* Loading States */}
          {(accountsLoading || chatLoading) && (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-finance-blue"></div>
            </div>
          )}

        </div>
      </div>
    </main>
  );
}
