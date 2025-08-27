import { X, Receipt } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactionId: string;
  merchantName?: string;
  transactionDate?: string;
}

interface ReceiptItem {
  id: string;
  itemDescription: string;
  itemAmount: string;
  category?: string;
}

export default function ReceiptModal({ 
  isOpen, 
  onClose, 
  transactionId, 
  merchantName = "STORE", 
  transactionDate 
}: ReceiptModalProps) {
  // Fetch receipt items for this transaction
  const { data: receiptItems = [], isLoading, error } = useQuery<ReceiptItem[]>({
    queryKey: ['/api/receipts', transactionId],
    enabled: isOpen && !!transactionId
  });

  // Close modal on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(Math.abs(num));
  };

  const receiptTotal = receiptItems.reduce((sum: number, item: ReceiptItem) => 
    sum + Math.abs(parseFloat(item.itemAmount)), 0
  );

  const formatDate = (date?: string) => {
    if (!date) return new Date().toLocaleDateString();
    return new Date(date).toLocaleDateString();
  };

  const formatTime = (date?: string) => {
    if (!date) return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" data-testid="receipt-modal">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50" 
        onClick={onClose}
        data-testid="modal-backdrop"
      />
      
      {/* Modal content */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <Receipt className="text-finance-blue" size={20} />
            <h3 className="text-lg font-semibold text-gray-900" data-testid="modal-title">
              Receipt Details
            </h3>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1"
            data-testid="button-close-modal"
          >
            <X size={20} />
          </button>
        </div>
        
        {/* Receipt content */}
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-120px)]">
          {isLoading ? (
            <div className="text-center py-8" data-testid="loading-receipt">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-finance-blue mx-auto"></div>
              <p className="text-gray-500 mt-2">Loading receipt...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8" data-testid="error-receipt">
              <p className="text-red-500">Failed to load receipt details</p>
            </div>
          ) : receiptItems.length === 0 ? (
            <div className="text-center py-8" data-testid="no-receipt">
              <Receipt className="text-gray-300 mx-auto mb-2" size={48} />
              <p className="text-gray-500">No receipt details available</p>
            </div>
          ) : (
            <div className="font-mono text-sm" data-testid="receipt-content">
              {/* Receipt header */}
              <div className="text-center mb-4 pb-4 border-b border-gray-200">
                <h4 className="font-bold text-gray-900">{merchantName.toUpperCase()}</h4>
                <p className="text-gray-600">RECEIPT</p>
                <p className="text-gray-500 text-xs mt-2">
                  {formatDate(transactionDate)} • {formatTime(transactionDate)}
                </p>
              </div>
              
              {/* Receipt items */}
              <div className="space-y-1 mb-4">
                {receiptItems.map((item: ReceiptItem, index: number) => (
                  <div 
                    key={item.id || index} 
                    className="flex justify-between"
                    data-testid={`receipt-item-${index}`}
                  >
                    <span className="flex-1 truncate pr-2">{item.itemDescription}</span>
                    <span className="text-right font-medium">
                      {formatCurrency(item.itemAmount)}
                    </span>
                  </div>
                ))}
              </div>
              
              {/* Receipt footer */}
              <div className="border-t border-gray-200 pt-2">
                <div className="flex justify-between font-bold text-lg">
                  <span>TOTAL</span>
                  <span data-testid="receipt-total">{formatCurrency(receiptTotal)}</span>
                </div>
                <p className="text-center text-gray-500 text-xs mt-2">
                  {receiptItems.length} ITEM{receiptItems.length > 1 ? 'S' : ''}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}