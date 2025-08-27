import { ShoppingCart, Store, Receipt } from "lucide-react";
import { Transaction } from "@shared/schema";
import { useState } from "react";
import ReceiptModal from "@/components/ui/ReceiptModal";

interface SpendingBreakdownProps {
  transactions: Transaction[];
  budgetAmount?: number;
  category?: string;
}

export default function SpendingBreakdown({ 
  transactions, 
  budgetAmount = 0, 
  category = "Spending" 
}: SpendingBreakdownProps) {
  const [selectedTransaction, setSelectedTransaction] = useState<{
    id: string;
    merchant?: string;
    date: string;
  } | null>(null);
  
  const totalSpent = transactions.reduce((sum, t) => sum + parseFloat(t.amount), 0);
  const budgetUsed = budgetAmount > 0 ? (totalSpent / budgetAmount) * 100 : 0;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(Math.abs(amount));
  };

  const formatDate = (date: string | Date) => {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const getCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case 'groceries':
      case 'grocery':
        return <ShoppingCart className="text-gray-500" size={12} />;
      default:
        return <Store className="text-gray-500" size={12} />;
    }
  };

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-700 flex items-center">
          <ShoppingCart className="text-finance-green mr-2" size={16} />
          {category} Spending
        </h4>
        <span className="text-lg font-bold text-gray-900" data-testid="text-total-spent">
          {formatCurrency(totalSpent)}
        </span>
      </div>
      
      {budgetAmount > 0 && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span data-testid="text-budget-info">Budget: {formatCurrency(budgetAmount)}</span>
            <span data-testid="text-budget-percentage">{Math.round(budgetUsed)}% used</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-finance-green h-2 rounded-full" 
              style={{ width: `${Math.min(budgetUsed, 100)}%` }}
              data-testid="progress-budget"
            ></div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {transactions.slice(0, 10).map((transaction, index) => (
          <div 
            key={transaction.id || index}
            className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0"
            data-testid={`transaction-${index}`}
          >
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                {getCategoryIcon(transaction.category || 'other')}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900" data-testid={`text-merchant-${index}`}>
                  {transaction.merchant || transaction.description}
                </p>
                <p className="text-xs text-gray-500" data-testid={`text-date-${index}`}>
                  {formatDate(transaction.date)}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-gray-900" data-testid={`text-amount-${index}`}>
                {formatCurrency(parseFloat(transaction.amount))}
              </p>
              <button 
                className="text-xs text-finance-blue hover:text-finance-blue-dark transition-colors" 
                onClick={() => setSelectedTransaction({
                  id: transaction.id,
                  merchant: transaction.merchant || undefined,
                  date: transaction.date.toString()
                })}
                data-testid={`button-receipt-${index}`}
              >
                <Receipt className="inline mr-1" size={10} />
                Receipt
              </button>
            </div>
          </div>
        ))}
      </div>
      
      {/* Receipt Modal */}
      {selectedTransaction && (
        <ReceiptModal
          isOpen={!!selectedTransaction}
          onClose={() => setSelectedTransaction(null)}
          transactionId={selectedTransaction.id}
          merchantName={selectedTransaction.merchant || "STORE"}
          transactionDate={selectedTransaction.date}
        />
      )}
    </div>
  );
}
