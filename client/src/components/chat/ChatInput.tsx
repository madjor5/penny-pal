import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Send, Mic, Zap, Bug } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ChatInputProps {
  message: string;
  setMessage: (message: string) => void;
  onToggleQuickActions: () => void;
  onProcessingChange?: (isProcessing: boolean) => void;
}

export default function ChatInput({ message, setMessage, onToggleQuickActions, onProcessingChange }: ChatInputProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [debugMode, setDebugMode] = useState(false);

  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      // Immediately add user message to cache (optimistic update)
      const tempUserMessage = {
        id: `temp-${Date.now()}`,
        message,
        isUser: true,
        queryData: null,
        createdAt: new Date().toISOString()
      };
      
      queryClient.setQueryData(['/api/chat/history'], (old: any) => 
        [...(old || []), tempUserMessage]
      );

      const response = await apiRequest('POST', '/api/chat', { message, debug: debugMode });
      const responseData = await response.json();
      return responseData;
    },
    onSuccess: (data) => {
      // Add the AI response with debug info to cache
      const aiMessage = {
        id: `ai-${Date.now()}`,
        message: data.message,
        isUser: false,
        queryData: { 
          data: data.data,
          debug: data.debug 
        },
        createdAt: new Date().toISOString()
      };
      
      queryClient.setQueryData(['/api/chat/history'], (old: any) => 
        [...(old || []), aiMessage]
      );
      
      // Only invalidate if we don't have debug info, otherwise keep local cache
      if (!data.debug) {
        queryClient.invalidateQueries({ queryKey: ['/api/chat/history'] });
      }
      
      setMessage('');
      onProcessingChange?.(false);
    },
    onError: (error: any) => {
      onProcessingChange?.(false);
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
      console.error('Chat error:', error);
    },
  });

  const handleSendMessage = () => {
    if (message.trim() && !sendMessageMutation.isPending) {
      onProcessingChange?.(true);
      sendMessageMutation.mutate(message.trim());
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleVoiceInput = () => {
    // TODO: Implement speech-to-text functionality
    toast({
      title: "Voice Input",
      description: "Voice input feature coming soon!",
    });
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-50">
      <div className="flex items-center space-x-3">
        <button 
          className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center"
          onClick={onToggleQuickActions}
          data-testid="button-quick-actions"
        >
          <Zap className="text-gray-600" size={16} />
        </button>

        <button 
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
            debugMode ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'
          }`}
          onClick={() => setDebugMode(!debugMode)}
          data-testid="button-debug-toggle"
          title={debugMode ? "Debug mode ON" : "Debug mode OFF"}
        >
          <Bug size={16} />
        </button>
        
        <div className="flex-1 relative">
          <input 
            type="text" 
            placeholder="Ask about your finances..." 
            className="w-full px-4 py-3 pr-12 bg-gray-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-finance-blue focus:bg-white"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={sendMessageMutation.isPending}
            data-testid="input-message"
          />
          <button 
            className="absolute right-3 top-1/2 transform -translate-y-1/2 w-6 h-6 bg-finance-blue rounded-full flex items-center justify-center disabled:opacity-50"
            onClick={handleSendMessage}
            disabled={!message.trim() || sendMessageMutation.isPending}
            data-testid="button-send"
          >
            {sendMessageMutation.isPending ? (
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
            ) : (
              <Send className="text-white" size={12} />
            )}
          </button>
        </div>
        
        <button 
          className="w-10 h-10 bg-finance-blue rounded-full flex items-center justify-center"
          onClick={handleVoiceInput}
          data-testid="button-voice"
        >
          <Mic className="text-white" size={16} />
        </button>
      </div>
    </div>
  );
}
