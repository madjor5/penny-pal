import { TrendingUp, Utensils, List, PieChart } from "lucide-react";

interface QuickActionsProps {
  isOpen: boolean;
  onQuickAction: (question: string) => void;
}

export default function QuickActions({ isOpen, onQuickAction }: QuickActionsProps) {
  const quickActions = [
    {
      icon: <TrendingUp className="text-finance-blue" size={16} />,
      label: "Monthly spending",
      question: "Show me my spending this month"
    },
    {
      icon: <Utensils className="text-finance-amber" size={16} />,
      label: "Dining expenses", 
      question: "How much did I spend on dining out?"
    },
    {
      icon: <List className="text-finance-green" size={16} />,
      label: "Recent transactions",
      question: "Show me my recent transactions"
    },
    {
      icon: <PieChart className="text-finance-blue" size={16} />,
      label: "Budget overview",
      question: "How are my budgets looking?"
    }
  ];

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed bottom-20 left-4 right-4 z-40">
      <div className="bg-white rounded-xl p-3 shadow-lg border border-gray-200">
        <div className="grid grid-cols-2 gap-2">
          {quickActions.map((action, index) => (
            <button
              key={index}
              className="flex items-center space-x-2 p-2 rounded-lg bg-gray-50 text-left hover:bg-gray-100 transition-colors"
              onClick={() => onQuickAction(action.question)}
              data-testid={`button-quick-action-${index}`}
            >
              {action.icon}
              <span className="text-sm text-gray-700" data-testid={`text-quick-action-${index}`}>
                {action.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
