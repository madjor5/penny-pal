import { MessageCircle, Settings, Upload } from "lucide-react";
import { Link } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function ChatHeader() {
  return (
    <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-finance-blue rounded-full flex items-center justify-center">
            <MessageCircle className="text-white" size={16} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900" data-testid="app-title">
              FinanceChat
            </h1>
            <p className="text-xs text-gray-500" data-testid="app-subtitle">
              AI Financial Assistant
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button 
                className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200 transition-colors"
                data-testid="button-settings"
              >
                <Settings className="text-gray-600" size={14} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href="/data-upload" className="flex items-center gap-2" data-testid="link-data-upload">
                  <Upload className="h-4 w-4" />
                  Data Upload
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
