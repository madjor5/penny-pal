import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Upload, FileText } from "lucide-react";

interface UploadResult {
  success: boolean;
  created: {
    accounts: number;
    transactions: number;
    budgets: number;
    savingsGoals: number;
    receiptItems: number;
  };
  errors: string[];
}

export default function DataUpload() {
  const [jsonData, setJsonData] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === "application/json") {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        try {
          // Validate JSON and pretty format it
          const parsed = JSON.parse(content);
          setJsonData(JSON.stringify(parsed, null, 2));
        } catch (error) {
          alert("Invalid JSON file. Please check your file format.");
        }
      };
      reader.readAsText(file);
    } else {
      alert("Please select a valid JSON file.");
    }
  };

  const handleUpload = async () => {
    if (!jsonData.trim()) {
      alert("Please enter or upload JSON data.");
      return;
    }

    try {
      setIsUploading(true);
      setUploadResult(null);
      
      const parsedData = JSON.parse(jsonData);
      
      const response = await fetch("/api/data/bulk-upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(parsedData),
      });

      const result = await response.json();
      setUploadResult(result);

    } catch (error) {
      console.error("Upload error:", error);
      setUploadResult({
        success: false,
        created: { accounts: 0, transactions: 0, budgets: 0, savingsGoals: 0, receiptItems: 0 },
        errors: [error instanceof Error ? error.message : "Unknown error occurred"]
      });
    } finally {
      setIsUploading(false);
    }
  };

  const downloadTemplate = () => {
    // Create template data
    const template = {
      accounts: [
        {
          name: "Main Checking",
          type: "expenses",
          balance: "2500.00"
        }
      ],
      transactions: [
        {
          accountName: "Main Checking", // Reference by name instead of ID
          description: "Grocery shopping at Whole Foods",
          amount: "-125.50",
          category: "groceries",
          merchant: "Whole Foods Market",
          date: "2024-01-15T10:30:00.000Z"
        }
      ],
      budgets: [
        {
          name: "Monthly Groceries",
          category: "groceries",
          amount: "500.00",
          period: "monthly",
          accountName: "Main Checking"
        }
      ],
      savingsGoals: [
        {
          name: "Emergency Fund",
          targetAmount: "10000.00",
          currentAmount: "2500.00",
          targetDate: "2024-12-31T00:00:00.000Z",
          accountName: "Main Checking"
        }
      ],
      receiptItems: [
        {
          transactionRef: "Grocery shopping at Whole Foods", // Reference by description
          itemDescription: "Organic Bananas",
          itemAmount: "4.99",
          itemCategory: "produce"
        }
      ]
    };

    const dataStr = JSON.stringify(template, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "data-template.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Bulk Data Upload
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Upload financial data to your database using JSON format
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Upload Section */}
          <Card data-testid="card-upload">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Upload Data
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* File Upload */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Upload JSON File</label>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileUpload}
                  className="block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900 dark:file:text-blue-300"
                  data-testid="input-json-file"
                />
              </div>

              {/* Manual Entry */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Or Paste JSON Data</label>
                <Textarea
                  placeholder="Paste your JSON data here..."
                  value={jsonData}
                  onChange={(e) => setJsonData(e.target.value)}
                  className="min-h-[200px] font-mono text-sm"
                  data-testid="textarea-json-data"
                />
              </div>

              <div className="flex gap-2">
                <Button 
                  onClick={handleUpload} 
                  disabled={isUploading}
                  className="flex-1"
                  data-testid="button-upload"
                >
                  {isUploading ? "Uploading..." : "Upload Data"}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={downloadTemplate}
                  data-testid="button-download-template"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Download Template
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Results Section */}
          <Card data-testid="card-results">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {uploadResult?.success ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : uploadResult?.success === false ? (
                  <XCircle className="h-5 w-5 text-red-500" />
                ) : null}
                Upload Results
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!uploadResult ? (
                <p className="text-gray-500 dark:text-gray-400">
                  Results will appear here after upload.
                </p>
              ) : (
                <div className="space-y-4">
                  {/* Success Summary */}
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(uploadResult.created).map(([key, count]) => (
                      <div key={key} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-800 rounded">
                        <span className="text-sm capitalize">{key}:</span>
                        <Badge variant={count > 0 ? "default" : "secondary"} data-testid={`badge-${key}`}>
                          {count}
                        </Badge>
                      </div>
                    ))}
                  </div>

                  {/* Errors */}
                  {uploadResult.errors.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-medium text-red-600 dark:text-red-400">Errors:</h4>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {uploadResult.errors.map((error, index) => (
                          <Alert key={index} variant="destructive">
                            <AlertDescription className="text-sm" data-testid={`error-${index}`}>
                              {error}
                            </AlertDescription>
                          </Alert>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Success Message */}
                  {uploadResult.success && (
                    <Alert>
                      <CheckCircle className="h-4 w-4" />
                      <AlertDescription data-testid="text-success-message">
                        Data uploaded successfully! All records have been created in the database.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Instructions */}
        <Card data-testid="card-instructions">
          <CardHeader>
            <CardTitle>Instructions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm space-y-2">
              <p><strong>JSON Structure:</strong></p>
              <ul className="list-disc ml-6 space-y-1">
                <li>Use <code>accountName</code> instead of <code>accountId</code> to reference accounts by name</li>
                <li>Use <code>transactionRef</code> instead of <code>transactionId</code> to reference transactions by description</li>
                <li>Amounts should be strings with decimal notation (e.g., "125.50")</li>
                <li>Use negative amounts for expenses, positive for income</li>
                <li>Dates should be in ISO 8601 format (e.g., "2024-01-15T10:30:00.000Z")</li>
                <li>Account types: "budget", "expenses", "savings"</li>
                <li>Budget periods: "monthly", "weekly", "yearly"</li>
              </ul>
              <p><strong>Processing Order:</strong> Accounts → Transactions → Budgets → Savings Goals → Receipt Items</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}