import { Wallet } from "lucide-react";
import { Account } from "@shared/schema";

interface AccountSummaryProps {
  accounts: Account[];
}

export default function AccountSummary({ accounts }: AccountSummaryProps) {
  const getAccountColor = (type: string) => {
    switch (type) {
      case 'budget':
        return 'bg-finance-green';
      case 'expenses':
        return 'bg-finance-amber';
      case 'savings':
        return 'bg-finance-blue';
      default:
        return 'bg-gray-400';
    }
  };

  const getAccountDisplayName = (type: string) => {
    switch (type) {
      case 'budget':
        return 'Budget Account';
      case 'expenses':
        return 'Credit Card';
      case 'savings':
        return 'Savings Account';
      default:
        return type;
    }
  };

  const formatBalance = (balance: string, type: string) => {
    const amount = parseFloat(balance);
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(Math.abs(amount));
    
    // Only show negative for actual credit card accounts, not general expense/spending accounts
    return amount < 0 ? `-${formatted}` : formatted;
  };

  const getBalanceColor = (balance: string, type: string) => {
    const amount = parseFloat(balance);
    // Show red for negative balances (actual debt/overspending)
    if (amount < 0) {
      return 'text-red-600';
    }
    return 'text-gray-900';
  };

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 w-full max-w-lg">
      <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
        <Wallet className="text-finance-blue mr-2" size={16} />
        Account Overview
      </h3>
      <div className="space-y-3">
        {accounts.map((account) => (
          <div 
            key={account.id} 
            className="flex items-center justify-between"
            data-testid={`account-${account.type}`}
          >
            <div className="flex items-center space-x-2 flex-1 min-w-0">
              <div className={`w-2 h-2 ${getAccountColor(account.type)} rounded-full flex-shrink-0`}></div>
              <span className="text-sm text-gray-600 truncate" data-testid={`text-account-name-${account.type}`}>
                {account.name} ({account.type})
              </span>
            </div>
            <span 
              className={`text-sm font-semibold ml-2 flex-shrink-0 ${getBalanceColor(account.balance, account.type)}`}
              data-testid={`text-balance-${account.type}`}
            >
              {formatBalance(account.balance, account.type)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
