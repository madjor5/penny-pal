import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { TrendingUp, TrendingDown, DollarSign, BarChart as BarChartIcon } from "lucide-react";

interface YearlyGrowthData {
  year: string;
  balance: number;
  change: number;
  changePercentage: number;
}

interface YearlyGrowthChartProps {
  data: YearlyGrowthData[];
  accountName?: string;
}

export default function YearlyGrowthChart({ data, accountName }: YearlyGrowthChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-2 mb-4">
          <BarChartIcon className="text-finance-green" size={20} />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Yearly Growth</h3>
        </div>
        <p className="text-gray-500 dark:text-gray-400 text-center py-8">
          No growth data available for {accountName || "this account"}.
        </p>
      </div>
    );
  }

  const chartConfig = {
    balance: {
      label: "Balance",
    },
    change: {
      label: "Change",
    },
  };

  const formatCurrency = (amount: number, compact = false) => {
    if (compact && Math.abs(amount) >= 1000) {
      if (Math.abs(amount) >= 1000000) {
        return `$${(amount / 1000000).toFixed(1)}M`;
      } else {
        return `$${(amount / 1000).toFixed(0)}K`;
      }
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  // Get the latest year's data for summary
  const latestYear = data[data.length - 1];
  const currentBalance = latestYear?.balance || 0;
  const lastChange = latestYear?.change || 0;
  const lastChangePercentage = latestYear?.changePercentage || 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700" data-testid="yearly-growth-chart">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-2">
          <BarChartIcon className="text-finance-green" size={20} />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Yearly Growth{accountName ? ` - ${accountName}` : ""}
          </h3>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100" data-testid="text-current-balance">
            {formatCurrency(currentBalance)}
          </div>
          <div className={`flex items-center text-sm ${lastChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {lastChange >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            <span className="ml-1" data-testid="text-yearly-change">
              {lastChange >= 0 ? '+' : ''}{formatCurrency(lastChange)} ({lastChangePercentage >= 0 ? '+' : ''}{lastChangePercentage.toFixed(1)}%)
            </span>
          </div>
        </div>
      </div>

      {/* Balance Line Chart */}
      <div className="mb-8">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Account Balance Over Time</h4>
        <ChartContainer config={chartConfig} className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis 
                dataKey="year" 
                className="text-gray-600 dark:text-gray-400"
                tick={{ fontSize: 12 }}
              />
              <YAxis 
                className="text-gray-600 dark:text-gray-400"
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => formatCurrency(value, true)}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => [
                      formatCurrency(value as number),
                      name === "balance" ? "Balance" : "Change"
                    ]}
                  />
                }
              />
              <Line 
                type="monotone" 
                dataKey="balance" 
                stroke="hsl(var(--finance-green))" 
                strokeWidth={3}
                dot={{ fill: "hsl(var(--finance-green))", strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, stroke: "hsl(var(--finance-green))", strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      {/* Change Bar Chart */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Year-over-Year Change</h4>
        <ChartContainer config={chartConfig} className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.slice(1)} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis 
                dataKey="year" 
                className="text-gray-600 dark:text-gray-400"
                tick={{ fontSize: 12 }}
              />
              <YAxis 
                className="text-gray-600 dark:text-gray-400"
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => formatCurrency(value, true)}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => [
                      formatCurrency(value as number),
                      "Change"
                    ]}
                  />
                }
              />
              <Bar 
                dataKey="change"
                fill="#10b981"
                radius={[2, 2, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      {/* Growth Summary */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <DollarSign size={16} className="text-blue-600" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Total Years</span>
          </div>
          <div className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-1" data-testid="text-total-years">
            {data.length}
          </div>
        </div>
        
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <TrendingUp size={16} className="text-green-600" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Avg Growth</span>
          </div>
          <div className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-1" data-testid="text-avg-growth">
            {data.length > 1 
              ? `${((data[data.length - 1].balance - data[0].balance) / (data.length - 1) / Math.abs(data[0].balance) * 100).toFixed(1)}%`
              : "N/A"
            }
          </div>
        </div>
        
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <BarChartIcon size={16} className="text-purple-600" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Best Year</span>
          </div>
          <div className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-1" data-testid="text-best-year">
            {data.length > 1 
              ? data.slice(1).reduce((best, current) => 
                  current.changePercentage > best.changePercentage ? current : best
                ).year
              : "N/A"
            }
          </div>
        </div>
      </div>
    </div>
  );
}