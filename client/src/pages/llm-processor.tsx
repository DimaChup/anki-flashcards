import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Brain, FileText, Loader2, CheckCircle, AlertCircle, Download, RefreshCw } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

interface ProcessingJob {
  id: string;
  filename: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number;
  result?: any;
  error?: string;
  created_at: string;
  updated_at: string;
}

interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  category: string;
}

export default function LLMProcessor() {
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [promptTemplate, setPromptTemplate] = useState<string>('');
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [processingMode, setProcessingMode] = useState<'process_batches' | 'resume_batches'>('process_batches');
  const [concurrency, setConcurrency] = useState<number>(3);
  const [targetWords, setTargetWords] = useState<number>(30);
  const [outputPath, setOutputPath] = useState<string>('');
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch available files
  const { data: filesResponse } = useQuery({
    queryKey: ['/api/files'],
  });
  
  const files = Array.isArray(filesResponse) ? filesResponse : ((filesResponse as any)?.files || []);

  // Fetch prompt templates
  const { data: templates = [] } = useQuery<PromptTemplate[]>({
    queryKey: ['/api/prompt-templates'],
  });

  // Fetch processing jobs
  const { data: jobs = [], refetch: refetchJobs } = useQuery<ProcessingJob[]>({
    queryKey: ['/api/processing-jobs'],
    refetchInterval: 2000, // Poll every 2 seconds for real-time updates
  });

  // Start processing mutation
  const startProcessing = useMutation({
    mutationFn: async (params: any) => {
      const response = await fetch('/api/llm-processor/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!response.ok) throw new Error('Failed to start processing');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Processing Started",
        description: "LLM processing job has been queued successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/processing-jobs'] });
    },
    onError: (error) => {
      toast({
        title: "Processing Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Download result mutation
  const downloadResult = useMutation({
    mutationFn: async (jobId: string) => {
      const response = await fetch(`/api/processing-jobs/${jobId}/download`);
      if (!response.ok) throw new Error('Failed to download result');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `processed_result_${jobId}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onSuccess: () => {
      toast({
        title: "Download Complete",
        description: "Processing result downloaded successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Download Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleStartProcessing = () => {
    if (!selectedFile) {
      toast({
        title: "File Required",
        description: "Please select a file to process.",
        variant: "destructive",
      });
      return;
    }

    const prompt = promptTemplate ? templates.find(t => t.id === promptTemplate)?.content : customPrompt;
    if (!prompt) {
      toast({
        title: "Prompt Required",
        description: "Please select a prompt template or enter a custom prompt.",
        variant: "destructive",
      });
      return;
    }

    startProcessing.mutate({
      filename: selectedFile,
      prompt,
      mode: processingMode,
      concurrency,
      target_words: targetWords,
      output_path: outputPath || undefined,
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Loader2 className="w-4 h-4 text-yellow-500" />;
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
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
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

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <Brain className="w-8 h-8 text-blue-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">LLM Processor</h1>
            <p className="text-gray-600 dark:text-gray-300">Process linguistic data with AI-powered analysis</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="process" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="process" data-testid="tab-process">Process Files</TabsTrigger>
          <TabsTrigger value="jobs" data-testid="tab-jobs">Processing Jobs</TabsTrigger>
          <TabsTrigger value="templates" data-testid="tab-templates">Prompt Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="process">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Start New Processing Job
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* File Selection */}
              <div className="space-y-2">
                <Label htmlFor="file-select">Select File to Process</Label>
                <Select value={selectedFile} onValueChange={setSelectedFile}>
                  <SelectTrigger data-testid="select-file">
                    <SelectValue placeholder="Choose a file..." />
                  </SelectTrigger>
                  <SelectContent>
                    {files.map((file: any) => (
                      <SelectItem key={file.name || file} value={file.name || file}>
                        {file.name || file}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Prompt Configuration */}
              <div className="space-y-4">
                <Label>Prompt Configuration</Label>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="template-select">Prompt Template (Optional)</Label>
                    <Select value={promptTemplate} onValueChange={setPromptTemplate}>
                      <SelectTrigger data-testid="select-template">
                        <SelectValue placeholder="Choose a template..." />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name} - {template.description}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {!promptTemplate && (
                    <div>
                      <Label htmlFor="custom-prompt">Custom Prompt</Label>
                      <Textarea
                        id="custom-prompt"
                        data-testid="input-custom-prompt"
                        placeholder="Enter your custom prompt for LLM processing..."
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        rows={4}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Processing Settings */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="processing-mode">Processing Mode</Label>
                  <Select value={processingMode} onValueChange={(value: any) => setProcessingMode(value)}>
                    <SelectTrigger data-testid="select-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="process_batches">Process Batches</SelectItem>
                      <SelectItem value="resume_batches">Resume Processing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="concurrency">Concurrency Level</Label>
                  <Input
                    id="concurrency"
                    data-testid="input-concurrency"
                    type="number"
                    min="1"
                    max="10"
                    value={concurrency}
                    onChange={(e) => setConcurrency(Number(e.target.value))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="target-words">Target Words per Batch</Label>
                  <Input
                    id="target-words"
                    data-testid="input-target-words"
                    type="number"
                    min="10"
                    max="100"
                    value={targetWords}
                    onChange={(e) => setTargetWords(Number(e.target.value))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="output-path">Output Path (Optional)</Label>
                  <Input
                    id="output-path"
                    data-testid="input-output-path"
                    placeholder="/tmp/output.json"
                    value={outputPath}
                    onChange={(e) => setOutputPath(e.target.value)}
                  />
                </div>
              </div>

              <Button
                onClick={handleStartProcessing}
                disabled={startProcessing.isPending}
                className="w-full"
                data-testid="button-start-processing"
              >
                {startProcessing.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Starting Processing...
                  </>
                ) : (
                  <>
                    <Brain className="w-4 h-4 mr-2" />
                    Start Processing
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jobs">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Loader2 className="w-5 h-5" />
                Processing Jobs
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchJobs()}
                data-testid="button-refresh-jobs"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </CardHeader>
            <CardContent>
              {jobs.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No processing jobs found. Start a new job to see it here.
                </div>
              ) : (
                <div className="space-y-4">
                  {jobs.map((job) => (
                    <div
                      key={job.id}
                      className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800"
                      data-testid={`job-${job.id}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          {getStatusIcon(job.status)}
                          <div>
                            <h4 className="font-medium">{job.filename}</h4>
                            <p className="text-sm text-gray-500">
                              Started {new Date(job.created_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={getStatusColor(job.status)}>
                            {job.status}
                          </Badge>
                          {job.status === 'completed' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => downloadResult.mutate(job.id)}
                              disabled={downloadResult.isPending}
                              data-testid={`button-download-${job.id}`}
                            >
                              <Download className="w-4 h-4 mr-1" />
                              Download
                            </Button>
                          )}
                        </div>
                      </div>
                      
                      {job.progress !== undefined && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span>Progress</span>
                            <span>{job.progress}%</span>
                          </div>
                          <Progress value={job.progress} className="w-full" />
                        </div>
                      )}
                      
                      {job.error && (
                        <Alert className="mt-3">
                          <AlertCircle className="w-4 h-4" />
                          <AlertDescription>{job.error}</AlertDescription>
                        </Alert>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Available Prompt Templates
              </CardTitle>
            </CardHeader>
            <CardContent>
              {templates.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No prompt templates available.
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {templates.map((template) => (
                    <div
                      key={template.id}
                      className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800"
                      data-testid={`template-${template.id}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="font-medium">{template.name}</h4>
                          <p className="text-sm text-gray-500 mb-2">{template.description}</p>
                          <Badge variant="secondary">{template.category}</Badge>
                        </div>
                      </div>
                      <div className="mt-3">
                        <Label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          Template Content:
                        </Label>
                        <div className="mt-1 p-2 bg-gray-100 dark:bg-gray-700 rounded text-xs font-mono max-h-20 overflow-y-auto">
                          {template.content ? template.content.substring(0, 200) : 'No content available'}
                          {template.content && template.content.length > 200 && '...'}
                        </div>
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