import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Play, Terminal, FileText, Settings } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface PythonExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  execution_time?: number;
}

interface PythonStatusResult {
  python_available: boolean;
  gemini_available: boolean;
  packages_installed: boolean;
  error?: string;
}

export default function PythonRunnerPage() {
  const [script, setScript] = useState(`import os
import google.generativeai as genai
from dotenv import load_dotenv

# --- 📝 SETUP INSTRUCTIONS ---
# 1. Install required libraries by running this in your terminal:
#    pip install google-generativeai python-dotenv
#
# 2. Create a file named .env in the same folder as this script.
#
# 3. Add your Google AI API key to the .env file like this:
#    LLM_API_KEY="your_actual_api_key_here"
# ---

# Load the API key from the .env file
load_dotenv()
api_key = os.getenv("LLM_API_KEY")

# Check if the API key was found and configure the AI
if not api_key:
    print("🔴 Error: API key not found. Please follow the setup instructions above.")
else:
    try:
        genai.configure(api_key=api_key)

        # Initialize the AI model
        model = genai.GenerativeModel('gemini-1.5-flash')

        # Get question from the user
        user_question = input("✨ Ask the AI anything: ")

        # Generate a response from the model
        print("\\n🤔 Thinking...")
        response = model.generate_content(user_question)

        # Print the AI's answer
        print("\\n🤖 AI says:")
        print(response.text)

    except Exception as e:
        print(f"🔴 An error occurred: {e}")
        print("This may be due to an invalid API key or a network problem.")
`);

  const [userInput, setUserInput] = useState("");

  const queryClient = useQueryClient();

  // Check if Python environment is ready
  const { data: pythonStatus, isLoading: checkingStatus } = useQuery<PythonStatusResult>({
    queryKey: ["/api/python/status"],
    refetchInterval: false,
  });

  // Execute Python script
  const executeMutation = useMutation({
    mutationFn: async (data: { script: string; input?: string }) => {
      const response = await fetch("/api/python/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return response.json() as Promise<PythonExecutionResult>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/python/status"] });
    },
  });

  const handleExecute = () => {
    executeMutation.mutate({
      script,
      input: userInput,
    });
  };

  const handleLoadTemplate = (template: string) => {
    switch (template) {
      case "gemini":
        setScript(`import os
import google.generativeai as genai

# Configure Gemini AI
api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    print("Error: GEMINI_API_KEY not found in environment variables")
    exit(1)

genai.configure(api_key=api_key)
model = genai.GenerativeModel('gemini-2.5-flash')

# Your question
question = "Explain quantum computing in simple terms"

try:
    response = model.generate_content(question)
    print("AI Response:")
    print(response.text)
except Exception as e:
    print(f"Error: {e}")
`);
        break;
      case "basic":
        setScript(`# Basic Python script example
import datetime
import json

# Get current time
now = datetime.datetime.now()
print(f"Current time: {now}")

# Example data processing
data = {
    "timestamp": now.isoformat(),
    "message": "Hello from Python!",
    "numbers": [1, 2, 3, 4, 5]
}

print("\\nData structure:")
print(json.dumps(data, indent=2))

# Simple calculation
result = sum(data["numbers"])
print(f"\\nSum of numbers: {result}")
`);
        break;
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2" data-testid="title-python-runner">
          Python Script Runner
        </h1>
        <p className="text-muted-foreground">
          Execute Python scripts with Gemini AI integration and view real-time output
        </p>
      </div>

      {/* Status Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Environment Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {checkingStatus ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-t-transparent border-primary rounded-full animate-spin" />
              <span>Checking Python environment...</span>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${pythonStatus?.python_available ? 'bg-green-500' : 'bg-red-500'}`} />
                <span>Python: {pythonStatus?.python_available ? 'Available' : 'Not Available'}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${pythonStatus?.gemini_available ? 'bg-green-500' : 'bg-yellow-500'}`} />
                <span>Gemini API: {pythonStatus?.gemini_available ? 'Available' : 'Not Configured'}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Script Editor */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Python Script
              </CardTitle>
              <CardDescription>
                Write or modify your Python script here
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Template Buttons */}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleLoadTemplate("gemini")}
                  data-testid="button-load-gemini-template"
                >
                  Load Gemini Template
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleLoadTemplate("basic")}
                  data-testid="button-load-basic-template"
                >
                  Load Basic Template
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setScript("")}
                  data-testid="button-clear-script"
                >
                  Clear
                </Button>
              </div>

              <Textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder="Enter your Python script here..."
                className="font-mono text-sm min-h-[400px]"
                data-testid="textarea-python-script"
              />

              {/* User Input for Scripts */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  User Input (for input() functions)
                </label>
                <Textarea
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  placeholder="Enter input for the script (one line per input call)"
                  className="min-h-[80px]"
                  data-testid="textarea-user-input"
                />
              </div>

              <Button
                onClick={handleExecute}
                disabled={executeMutation.isPending || !script.trim()}
                className="w-full"
                data-testid="button-execute-script"
              >
                {executeMutation.isPending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin mr-2" />
                    Executing...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Execute Script
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Output Panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Terminal className="w-5 h-5" />
                Output
              </CardTitle>
              <CardDescription>
                Script execution results and console output
              </CardDescription>
            </CardHeader>
            <CardContent>
              {executeMutation.data ? (
                <div className="space-y-4">
                  {/* Execution Status */}
                  <Alert className={executeMutation.data.success ? "" : "border-destructive"}>
                    <AlertDescription>
                      Status: {executeMutation.data.success ? "✅ Success" : "❌ Error"}
                      {executeMutation.data.execution_time && (
                        <span className="ml-2">
                          (Executed in {executeMutation.data.execution_time.toFixed(2)}s)
                        </span>
                      )}
                    </AlertDescription>
                  </Alert>

                  {/* Output */}
                  {executeMutation.data.output && (
                    <div>
                      <h4 className="font-medium mb-2">Output:</h4>
                      <pre className="bg-muted p-4 rounded-md text-sm overflow-auto max-h-96 whitespace-pre-wrap">
                        {executeMutation.data.output}
                      </pre>
                    </div>
                  )}

                  {/* Error */}
                  {executeMutation.data.error && (
                    <div>
                      <h4 className="font-medium mb-2 text-destructive">Error:</h4>
                      <pre className="bg-destructive/10 border border-destructive/20 p-4 rounded-md text-sm overflow-auto max-h-96 whitespace-pre-wrap text-destructive">
                        {executeMutation.data.error}
                      </pre>
                    </div>
                  )}
                </div>
              ) : executeMutation.isPending ? (
                <div className="flex items-center justify-center p-8">
                  <div className="w-6 h-6 border-2 border-t-transparent border-primary rounded-full animate-spin mr-2" />
                  <span>Executing script...</span>
                </div>
              ) : (
                <div className="text-center p-8 text-muted-foreground">
                  <Terminal className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Click "Execute Script" to run your Python code</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Instructions */}
          <Card>
            <CardHeader>
              <CardTitle>Usage Instructions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><strong>Environment Variables:</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li><code>GEMINI_API_KEY</code> - Your Google Gemini API key</li>
                <li><code>LLM_API_KEY</code> - Alternative API key name</li>
              </ul>
              
              <Separator className="my-3" />
              
              <p><strong>Available Libraries:</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li><code>google-generativeai</code> - Gemini AI integration</li>
                <li><code>requests</code> - HTTP requests</li>
                <li><code>json</code>, <code>datetime</code>, <code>os</code> - Standard libraries</li>
              </ul>
              
              <Separator className="my-3" />
              
              <p><strong>Tips:</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>Use templates for quick setup</li>
                <li>Provide user input for <code>input()</code> functions</li>
                <li>Check environment status before running scripts</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}