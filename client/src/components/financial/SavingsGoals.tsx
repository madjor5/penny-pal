import { PiggyBank } from "lucide-react";
import { SavingsGoal } from "@shared/schema";

interface SavingsGoalsProps {
  goals: SavingsGoal[];
}

export default function SavingsGoals({ goals }: SavingsGoalsProps) {
  const formatCurrency = (amount: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(parseFloat(amount));
  };

  const formatDate = (date: string | Date | null) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { 
      month: 'short', 
      year: 'numeric' 
    });
  };

  const calculateProgress = (current: string, target: string) => {
    const currentAmount = parseFloat(current);
    const targetAmount = parseFloat(target);
    return targetAmount > 0 ? (currentAmount / targetAmount) * 100 : 0;
  };

  const calculateRemaining = (current: string, target: string) => {
    const currentAmount = parseFloat(current);
    const targetAmount = parseFloat(target);
    return Math.max(0, targetAmount - currentAmount);
  };

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <h4 className="text-sm font-semibold text-gray-700 mb-4 flex items-center">
        <PiggyBank className="text-finance-blue mr-2" size={16} />
        Savings Goals
      </h4>
      
      <div className="space-y-4">
        {goals.map((goal, index) => {
          const progress = calculateProgress(goal.currentAmount, goal.targetAmount);
          const remaining = calculateRemaining(goal.currentAmount, goal.targetAmount);
          
          return (
            <div 
              key={goal.id}
              className="p-3 bg-gray-50 rounded-lg"
              data-testid={`goal-${index}`}
            >
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700" data-testid={`text-goal-name-${index}`}>
                  {goal.name}
                </span>
                {goal.targetDate && (
                  <span className="text-xs text-gray-500" data-testid={`text-goal-date-${index}`}>
                    {formatDate(goal.targetDate)}
                  </span>
                )}
              </div>
              
              <div className="flex justify-between items-center mb-2">
                <span className="text-lg font-bold text-gray-900" data-testid={`text-current-amount-${index}`}>
                  {formatCurrency(goal.currentAmount)}
                </span>
                <span className="text-sm text-gray-600" data-testid={`text-target-amount-${index}`}>
                  / {formatCurrency(goal.targetAmount)}
                </span>
              </div>
              
              <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                <div 
                  className={`h-2 rounded-full ${
                    progress >= 80 ? 'bg-finance-green' : 
                    progress >= 50 ? 'bg-finance-blue' : 'bg-finance-amber'
                  }`}
                  style={{ width: `${Math.min(progress, 100)}%` }}
                  data-testid={`progress-goal-${index}`}
                ></div>
              </div>
              
              <p className="text-xs text-gray-600" data-testid={`text-goal-progress-${index}`}>
                {Math.round(progress)}% complete • {formatCurrency(remaining.toString())} to go
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
