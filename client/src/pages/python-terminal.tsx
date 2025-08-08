import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Terminal, Play, Square, Trash2, Copy, FileText } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

interface ExecutionResult {
  id: string;
  code: string;
  stdout: string;
  stderr: string;
  exit_code: number;
  execution_time: number;
  timestamp: string;
}

export default function PythonTerminal() {
  const [code, setCode] = useState<string>('# Python Terminal\nprint("Hello, World!")');
  const [history, setHistory] = useState<ExecutionResult[]>([]);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Auto-scroll terminal to bottom when new output is added
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [history]);

  // Execute Python code mutation
  const executeCode = useMutation({
    mutationFn: async (pythonCode: string) => {
      const response = await fetch('/api/python-terminal/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: pythonCode }),
      });
      if (!response.ok) {
        throw new Error('Failed to execute Python code');
      }
      return response.json();
    },
    onMutate: () => {
      setIsExecuting(true);
    },
    onSuccess: (result: ExecutionResult) => {
      setHistory(prev => [...prev, result]);
      setIsExecuting(false);
      toast({
        title: "Execution Complete",
        description: `Code executed in ${result.execution_time}ms`,
      });
    },
    onError: (error) => {
      setIsExecuting(false);
      toast({
        title: "Execution Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleExecute = () => {
    if (!code.trim()) {
      toast({
        title: "Empty Code",
        description: "Please enter some Python code to execute.",
        variant: "destructive",
      });
      return;
    }
    executeCode.mutate(code);
  };

  const handleStop = () => {
    // Note: This would require additional backend support for process management
    toast({
      title: "Stop Requested",
      description: "This feature requires backend process management implementation.",
    });
  };

  const clearHistory = () => {
    setHistory([]);
    toast({
      title: "History Cleared",
      description: "Terminal history has been cleared.",
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({
        title: "Copied",
        description: "Content copied to clipboard.",
      });
    });
  };

  const getStatusBadge = (exitCode: number) => {
    if (exitCode === 0) {
      return <Badge className="bg-green-100 text-green-800">Success</Badge>;
    } else {
      return <Badge className="bg-red-100 text-red-800">Error</Badge>;
    }
  };

  const loadSampleCode = (sample: string) => {
    const samples = {
      hello: '# Hello World\nprint("Hello, World!")\nprint("Welcome to Python Terminal!")',
      math: '# Math Operations\nimport math\n\n# Basic calculations\nresult = 2 ** 3\nprint(f"2^3 = {result}")\n\n# Using math library\nprint(f"Square root of 16: {math.sqrt(16)}")\nprint(f"Pi: {math.pi:.4f}")',
      loops: '# Loops and Lists\n# Create a list\nnumbers = [1, 2, 3, 4, 5]\n\n# Loop through the list\nfor num in numbers:\n    square = num ** 2\n    print(f"{num}^2 = {square}")\n\n# List comprehension\nsquares = [x**2 for x in numbers]\nprint(f"Squares: {squares}")',
      file: '# File Operations\nimport tempfile\nimport os\n\n# Create a temporary file\nwith tempfile.NamedTemporaryFile(mode="w", delete=False) as f:\n    f.write("Hello from Python!")\n    temp_path = f.name\n\n# Read the file\nwith open(temp_path, "r") as f:\n    content = f.read()\n    print(f"File content: {content}")\n\n# Clean up\nos.unlink(temp_path)\nprint("File created, read, and deleted successfully!")',
    };
    setCode(samples[sample as keyof typeof samples] || samples.hello);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <Terminal className="w-8 h-8 text-green-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Python Terminal</h1>
            <p className="text-gray-600 dark:text-gray-300">Execute Python code and see results in real-time</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Code Input Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Python Code Editor
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadSampleCode('hello')}
                  data-testid="button-sample-hello"
                >
                  Hello World
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadSampleCode('math')}
                  data-testid="button-sample-math"
                >
                  Math
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadSampleCode('loops')}
                  data-testid="button-sample-loops"
                >
                  Loops
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter your Python code here..."
              className="font-mono text-sm min-h-64 resize-none"
              data-testid="textarea-code"
            />
            
            <div className="flex gap-2">
              <Button
                onClick={handleExecute}
                disabled={isExecuting}
                className="flex-1"
                data-testid="button-execute"
              >
                {isExecuting ? (
                  <>
                    <Square className="w-4 h-4 mr-2" />
                    Executing...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Execute Code
                  </>
                )}
              </Button>
              
              <Button
                variant="outline"
                onClick={handleStop}
                disabled={!isExecuting}
                data-testid="button-stop"
              >
                <Square className="w-4 h-4" />
              </Button>
              
              <Button
                variant="outline"
                onClick={() => copyToClipboard(code)}
                data-testid="button-copy-code"
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Terminal Output Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5" />
                Terminal Output
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={clearHistory}
                disabled={history.length === 0}
                data-testid="button-clear-history"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              ref={terminalRef}
              className="bg-black text-green-400 font-mono text-sm p-4 rounded-lg h-96 overflow-y-auto space-y-4"
              data-testid="terminal-output"
            >
              {history.length === 0 ? (
                <div className="text-gray-500">
                  $ Ready to execute Python code...
                </div>
              ) : (
                history.map((result, index) => (
                  <div key={result.id} className="border-b border-gray-700 pb-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-blue-400 text-xs">
                        Execution #{index + 1} - {new Date(result.timestamp).toLocaleTimeString()}
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(result.exit_code)}
                        <span className="text-xs text-gray-400">
                          {result.execution_time}ms
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => copyToClipboard(result.stdout + result.stderr)}
                          data-testid={`button-copy-output-${index}`}
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    
                    {/* Input Code Preview */}
                    <div className="text-cyan-400 text-xs mb-2 opacity-75">
                      $ {result.code.split('\n')[0]}
                      {result.code.split('\n').length > 1 && ' ...'}
                    </div>
                    
                    {/* STDOUT */}
                    {result.stdout && (
                      <div className="text-green-400 whitespace-pre-wrap">
                        {result.stdout}
                      </div>
                    )}
                    
                    {/* STDERR */}
                    {result.stderr && (
                      <div className="text-red-400 whitespace-pre-wrap">
                        {result.stderr}
                      </div>
                    )}
                  </div>
                ))
              )}
              
              {isExecuting && (
                <div className="text-yellow-400 animate-pulse">
                  $ Executing code...
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Info */}
      <Card className="mt-6">
        <CardContent className="pt-6">
          <Alert>
            <Terminal className="w-4 h-4" />
            <AlertDescription>
              <strong>Python Terminal Features:</strong> Execute Python code safely in a sandboxed environment. 
              Standard libraries are available, and execution is limited to prevent infinite loops or resource abuse.
              Use the sample buttons to load common code patterns and examples.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}