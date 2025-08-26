import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import MessageBubble from "./MessageBubble";
import AccountSummary from "@/components/financial/AccountSummary";
import { Account } from "@shared/schema";

export default function ChatContainer() {
  const { data: accounts, isLoading: accountsLoading } = useQuery({
    queryKey: ['/api/accounts'],
  });

  const { data: chatHistory, isLoading: chatLoading } = useQuery({
    queryKey: ['/api/chat/history'],
  });

  // Debug logging
  console.log('ChatContainer - chatHistory:', chatHistory);
  console.log('ChatContainer - isLoading:', chatLoading);
  console.log('ChatContainer - chatHistory type:', typeof chatHistory);
  console.log('ChatContainer - chatHistory isArray:', Array.isArray(chatHistory));

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
          {!accountsLoading && accounts && (
            <AccountSummary accounts={accounts as Account[]} />
          )}

          {/* Chat History */}
          {!chatLoading && chatHistory && Array.isArray(chatHistory) && chatHistory.map((msg: any, index: number) => (
            <MessageBubble
              key={msg.id || index}
              message={msg.message}
              isUser={msg.isUser}
              data={msg.queryData?.data}
            />
          ))}

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
