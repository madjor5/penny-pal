import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { TrendingUp, TrendingDown, Eye } from "lucide-react";

interface YearlyGrowthData {
  year: string;
  balance: number;
  change: number;
  changePercentage: number;
  isForecast?: boolean;
}

interface YearlyGrowthChartProps {
  data: YearlyGrowthData[];
  accountName?: string;
}

export default function YearlyGrowthChart({ data, accountName }: YearlyGrowthChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700 w-full">
        <div className="flex items-center space-x-2 mb-4">
          <TrendingUp className="text-finance-green" size={20} />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Account Growth</h3>
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
    forecast: {
      label: "Forecast",
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

  // Separate historical and forecast data
  const historicalData = data.filter(item => !item.isForecast);
  const forecastData = data.filter(item => item.isForecast);
  
  // Get the latest historical year's data for summary
  const latestYear = historicalData[historicalData.length - 1];
  const currentBalance = latestYear?.balance || 0;
  const lastChange = latestYear?.change || 0;
  const lastChangePercentage = latestYear?.changePercentage || 0;
  
  // Prepare chart data with both historical and forecast values
  const chartData = data.map(item => ({
    year: item.year,
    historical: !item.isForecast ? item.balance : null,
    forecast: item.isForecast ? item.balance : null,
    isForecast: item.isForecast || false
  }));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700 w-full" data-testid="yearly-growth-chart">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-2">
          <TrendingUp className="text-finance-green" size={20} />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Account Balance Over Time{accountName ? ` - ${accountName}` : ""}
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

      {/* Legend */}
      {forecastData.length > 0 && (
        <div className="flex items-center space-x-4 mb-4 text-sm">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-0.5 bg-finance-green"></div>
            <span className="text-gray-600 dark:text-gray-400">Historical</span>
          </div>
          <div className="flex items-center space-x-2">
            <svg width="16" height="2" className="overflow-visible">
              <line x1="0" y1="1" x2="16" y2="1" stroke="hsl(var(--finance-green))" strokeWidth="2" strokeDasharray="4 4" />
            </svg>
            <span className="text-gray-600 dark:text-gray-400">2-Year Forecast</span>
          </div>
          <div className="flex items-center space-x-1 text-gray-500">
            <Eye size={12} />
            <span className="text-xs">Based on recent trends</span>
          </div>
        </div>
      )}

      {/* Balance Line Chart with Forecast */}
      <div>
        <ChartContainer config={chartConfig} className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
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
                      name === "historical" ? "Balance" : "Forecast Balance"
                    ]}
                  />
                }
              />
              
              {/* Historical data line */}
              <Line 
                type="monotone" 
                dataKey="historical" 
                stroke="hsl(var(--finance-green))" 
                strokeWidth={3}
                dot={{ fill: "hsl(var(--finance-green))", strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, stroke: "hsl(var(--finance-green))", strokeWidth: 2 }}
                connectNulls={false}
              />
              
              {/* Forecast data line */}
              <Line 
                type="monotone" 
                dataKey="forecast" 
                stroke="hsl(var(--finance-green))" 
                strokeWidth={2}
                strokeDasharray="8 8"
                dot={{ fill: "hsl(var(--finance-green))", strokeWidth: 1, r: 3, opacity: 0.7 }}
                activeDot={{ r: 5, stroke: "hsl(var(--finance-green))", strokeWidth: 2, opacity: 0.8 }}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>
    </div>
  );
}