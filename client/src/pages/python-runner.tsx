import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Code, Play, FileText, Loader2, CheckCircle, AlertCircle, Download, Settings } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

interface ScriptExecution {
  id: string;
  script_name: string;
  args: string[];
  status: 'running' | 'completed' | 'failed';
  stdout: string;
  stderr: string;
  exit_code?: number;
  execution_time?: number;
  started_at: string;
  completed_at?: string;
}

export default function PythonRunner() {
  const [selectedScript, setSelectedScript] = useState<string>('');
  const [scriptArgs, setScriptArgs] = useState<string>('');
  const [customScript, setCustomScript] = useState<string>('');
  const [scriptName, setScriptName] = useState<string>('');
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch available Python scripts
  const { data: scripts = [] } = useQuery({
    queryKey: ['/api/python-scripts'],
  });

  // Fetch script executions
  const { data: executions = [] } = useQuery<ScriptExecution[]>({
    queryKey: ['/api/python-executions'],
    refetchInterval: 2000, // Poll for real-time updates
  });

  // Run script mutation
  const runScript = useMutation({
    mutationFn: async (params: any) => {
      const response = await fetch('/api/python-runner/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!response.ok) throw new Error('Failed to run script');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Script Started",
        description: "Python script execution has been started.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/python-executions'] });
    },
    onError: (error) => {
      toast({
        title: "Execution Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Save custom script mutation
  const saveScript = useMutation({
    mutationFn: async (params: { name: string; content: string }) => {
      const response = await fetch('/api/python-scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!response.ok) throw new Error('Failed to save script');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Script Saved",
        description: "Custom script has been saved successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/python-scripts'] });
      setCustomScript('');
      setScriptName('');
    },
    onError: (error) => {
      toast({
        title: "Save Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleRunScript = () => {
    if (!selectedScript) {
      toast({
        title: "Script Required",
        description: "Please select a script to run.",
        variant: "destructive",
      });
      return;
    }

    const args = scriptArgs.trim() ? scriptArgs.split(' ').filter(arg => arg.length > 0) : [];
    
    runScript.mutate({
      script_name: selectedScript,
      args,
    });
  };

  const handleSaveScript = () => {
    if (!scriptName.trim() || !customScript.trim()) {
      toast({
        title: "Script Details Required",
        description: "Please provide both script name and content.",
        variant: "destructive",
      });
      return;
    }

    saveScript.mutate({
      name: scriptName.trim(),
      content: customScript,
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Loader2 className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const downloadOutput = (execution: ScriptExecution) => {
    const content = `Script: ${execution.script_name}
Args: ${execution.args.join(' ')}
Started: ${execution.started_at}
Completed: ${execution.completed_at || 'N/A'}
Status: ${execution.status}
Exit Code: ${execution.exit_code || 'N/A'}
Execution Time: ${execution.execution_time || 'N/A'}ms

=== STDOUT ===
${execution.stdout}

=== STDERR ===
${execution.stderr}
`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${execution.script_name}_${execution.id}.txt`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <Code className="w-8 h-8 text-purple-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Python Script Runner</h1>
            <p className="text-gray-600 dark:text-gray-300">Execute Python scripts with custom arguments and monitoring</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="run" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="run" data-testid="tab-run">Run Scripts</TabsTrigger>
          <TabsTrigger value="create" data-testid="tab-create">Create Script</TabsTrigger>
          <TabsTrigger value="executions" data-testid="tab-executions">Executions</TabsTrigger>
          <TabsTrigger value="scripts" data-testid="tab-scripts">Manage Scripts</TabsTrigger>
        </TabsList>

        <TabsContent value="run">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Play className="w-5 h-5" />
                Execute Python Script
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="script-select">Select Script</Label>
                <Select value={selectedScript} onValueChange={setSelectedScript}>
                  <SelectTrigger data-testid="select-script">
                    <SelectValue placeholder="Choose a script to run..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(scripts as string[]).map((script: string) => (
                      <SelectItem key={script} value={script}>{script}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="script-args">Script Arguments (space-separated)</Label>
                <Input
                  id="script-args"
                  data-testid="input-script-args"
                  placeholder="arg1 arg2 --flag value"
                  value={scriptArgs}
                  onChange={(e) => setScriptArgs(e.target.value)}
                />
                <p className="text-sm text-gray-500">
                  Enter command-line arguments separated by spaces. Example: --input file.txt --output result.json
                </p>
              </div>

              <Button
                onClick={handleRunScript}
                disabled={runScript.isPending || !selectedScript}
                className="w-full"
                data-testid="button-run-script"
              >
                {runScript.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Starting Execution...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Run Script
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="create">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Create Custom Script
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="script-name">Script Name</Label>
                <Input
                  id="script-name"
                  data-testid="input-script-name"
                  placeholder="my_script.py"
                  value={scriptName}
                  onChange={(e) => setScriptName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="script-content">Python Code</Label>
                <Textarea
                  id="script-content"
                  data-testid="textarea-script-content"
                  placeholder="import sys&#10;&#10;print('Hello from custom script!')&#10;print(f'Arguments: {sys.argv[1:]}')&#10;"
                  value={customScript}
                  onChange={(e) => setCustomScript(e.target.value)}
                  rows={12}
                  className="font-mono text-sm"
                />
              </div>

              <Button
                onClick={handleSaveScript}
                disabled={saveScript.isPending}
                className="w-full"
                data-testid="button-save-script"
              >
                {saveScript.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving Script...
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4 mr-2" />
                    Save Script
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="executions">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Script Executions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {executions.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No script executions found. Run a script to see executions here.
                </div>
              ) : (
                <div className="space-y-4">
                  {executions.map((execution) => (
                    <div
                      key={execution.id}
                      className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800"
                      data-testid={`execution-${execution.id}`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          {getStatusIcon(execution.status)}
                          <div>
                            <h4 className="font-medium">{execution.script_name}</h4>
                            <p className="text-sm text-gray-500">
                              Started {new Date(execution.started_at).toLocaleString()}
                            </p>
                            {execution.args.length > 0 && (
                              <p className="text-sm text-gray-500">
                                Args: {execution.args.join(' ')}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={getStatusColor(execution.status)}>
                            {execution.status}
                          </Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => downloadOutput(execution)}
                            data-testid={`button-download-${execution.id}`}
                          >
                            <Download className="w-4 h-4 mr-1" />
                            Download
                          </Button>
                        </div>
                      </div>

                      {execution.execution_time !== undefined && (
                        <p className="text-sm text-gray-500 mb-2">
                          Execution time: {execution.execution_time}ms
                        </p>
                      )}

                      {execution.stdout && (
                        <div className="mb-3">
                          <Label className="text-sm font-medium text-green-700 dark:text-green-300">
                            Output:
                          </Label>
                          <div className="mt-1 p-3 bg-gray-900 text-green-400 rounded text-sm font-mono max-h-32 overflow-y-auto">
                            {execution.stdout}
                          </div>
                        </div>
                      )}

                      {execution.stderr && (
                        <div>
                          <Label className="text-sm font-medium text-red-700 dark:text-red-300">
                            Errors:
                          </Label>
                          <div className="mt-1 p-3 bg-gray-900 text-red-400 rounded text-sm font-mono max-h-32 overflow-y-auto">
                            {execution.stderr}
                          </div>
                        </div>
                      )}

                      {execution.exit_code !== undefined && execution.exit_code !== 0 && (
                        <Alert className="mt-3">
                          <AlertCircle className="w-4 h-4" />
                          <AlertDescription>
                            Script exited with code {execution.exit_code}
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scripts">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Available Scripts
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(scripts as string[]).length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No Python scripts available. Create a custom script to get started.
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {(scripts as string[]).map((script: string) => (
                    <div
                      key={script}
                      className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800"
                      data-testid={`script-${script}`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">{script}</h4>
                          <p className="text-sm text-gray-500">Python Script</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedScript(script)}
                          data-testid={`button-select-${script}`}
                        >
                          Select
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}