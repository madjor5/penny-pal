import ChatHeader from "@/components/chat/ChatHeader";
import ChatContainer from "@/components/chat/ChatContainer";
import ChatInput from "@/components/chat/ChatInput";
import QuickActions from "@/components/financial/QuickActions";
import { useState, useEffect } from "react";

export default function Home() {
  const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [debugMode, setDebugMode] = useState(false);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    const chatContainer = document.getElementById('chatContainer');
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }, [isProcessing]); // Run when processing state changes

  const handleQuickAction = (question: string) => {
    setMessage(question);
    setIsQuickActionsOpen(false);
  };

  return (
    <div className="bg-gray-50 font-inter text-gray-900 min-h-screen flex flex-col">
      <ChatHeader data-testid="chat-header" />
      <ChatContainer isProcessing={isProcessing} debugMode={debugMode} data-testid="chat-container" />
      
      <QuickActions 
        isOpen={isQuickActionsOpen}
        onQuickAction={handleQuickAction}
        data-testid="quick-actions"
      />
      
      <ChatInput 
        message={message}
        setMessage={setMessage}
        onToggleQuickActions={() => setIsQuickActionsOpen(!isQuickActionsOpen)}
        onProcessingChange={setIsProcessing}
        debugMode={debugMode}
        setDebugMode={setDebugMode}
        data-testid="chat-input"
      />
    </div>
  );
}
