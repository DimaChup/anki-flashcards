import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, Upload, Download, Settings, FileText, Cpu, AlertCircle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface ProcessingJob {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  currentBatch: number;
  totalBatches: number;
  startTime?: string;
  endTime?: string;
  error?: string;
  results?: any;
}

interface ProcessingConfig {
  inputText?: string;
  inputFile?: File;
  resumeFile?: File;
  targetWordsPerBatch: number;
  maxConcurrentCalls: number;
  modelName: string;
  promptTemplate: string;
  outputPath: string;
  mode: 'initialize' | 'resume' | 'full';
}

interface EnvironmentStatus {
  python_available: boolean;
  gemini_available: boolean;
  regex_available: boolean;
  packages_installed: boolean;
  error?: string;
}

interface PromptTemplate {
  filename: string;
  name: string;
  description: string;
  size: number;
  modified: string;
}

export default function LLMProcessorPage() {
  const [config, setConfig] = useState<ProcessingConfig>({
    targetWordsPerBatch: 30,
    maxConcurrentCalls: 5,
    modelName: "gemini-2.5-flash",
    promptTemplate: "prompt_es.txt",
    outputPath: "output.json",
    mode: 'initialize'
  });

  const [currentJob, setCurrentJob] = useState<ProcessingJob | null>(null);
  const [selectedInputFile, setSelectedInputFile] = useState<File | null>(null);
  const [selectedResumeFile, setSelectedResumeFile] = useState<File | null>(null);

  const queryClient = useQueryClient();

  // Check environment status
  const { data: envStatus, isLoading: checkingEnv } = useQuery<EnvironmentStatus>({
    queryKey: ["/api/llm-processor/status"],
    refetchInterval: false,
  });

  // Get available prompt templates
  const { data: prompts, isLoading: loadingPrompts } = useQuery<PromptTemplate[]>({
    queryKey: ["/api/llm-processor/prompts"],
    refetchInterval: false,
  });

  // Start processing job
  const startProcessingMutation = useMutation({
    mutationFn: async (jobConfig: ProcessingConfig) => {
      const formData = new FormData();
      formData.append('config', JSON.stringify(jobConfig));
      
      if (jobConfig.inputFile) {
        formData.append('inputFile', jobConfig.inputFile);
      }
      if (jobConfig.resumeFile) {
        formData.append('resumeFile', jobConfig.resumeFile);
      }
      if (jobConfig.inputText) {
        formData.append('inputText', jobConfig.inputText);
      }

      const response = await fetch("/api/llm-processor/start", {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return response.json();
    },
    onSuccess: (job: ProcessingJob) => {
      setCurrentJob(job);
      // Start polling for updates
      pollJobStatus(job.id);
    },
  });

  // Poll job status
  const pollJobStatus = async (jobId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/llm-processor/job/${jobId}`);
        if (response.ok) {
          const job = await response.json();
          setCurrentJob(job);
          
          if (job.status === 'completed' || job.status === 'failed') {
            clearInterval(pollInterval);
          }
        }
      } catch (error) {
        console.error('Error polling job status:', error);
        clearInterval(pollInterval);
      }
    }, 2000);
  };

  const handleStartProcessing = () => {
    const jobConfig = {
      ...config,
      inputFile: selectedInputFile || undefined,
      resumeFile: selectedResumeFile || undefined,
    };
    startProcessingMutation.mutate(jobConfig);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedInputFile(file);
      setConfig(prev => ({ ...prev, mode: 'initialize' }));
    }
  };

  const handleResumeFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedResumeFile(file);
      setConfig(prev => ({ ...prev, mode: 'resume' }));
    }
  };

  const downloadResults = () => {
    if (currentJob?.results) {
      const blob = new Blob([JSON.stringify(currentJob.results, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `processed_results_${currentJob.id}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2" data-testid="title-llm-processor">
          Advanced LLM Text Processor
        </h1>
        <p className="text-muted-foreground">
          Comprehensive text analysis with Gemini AI - tokenization, POS tagging, translation, and idiom detection
        </p>
      </div>

      {/* Environment Status */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Environment Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {checkingEnv ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-t-transparent border-primary rounded-full animate-spin" />
              <span>Checking environment...</span>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${envStatus?.python_available ? 'bg-green-500' : 'bg-red-500'}`} />
                <span>Python: {envStatus?.python_available ? 'Available' : 'Not Available'}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${envStatus?.gemini_available ? 'bg-green-500' : 'bg-yellow-500'}`} />
                <span>Gemini API: {envStatus?.gemini_available ? 'Available' : 'Not Configured'}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${envStatus?.regex_available ? 'bg-green-500' : 'bg-yellow-500'}`} />
                <span>Regex Library: {envStatus?.regex_available ? 'Available' : 'Missing'}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configuration Panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Processing Configuration
              </CardTitle>
              <CardDescription>
                Configure the text processing parameters
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Processing Mode */}
              <div className="space-y-2">
                <Label>Processing Mode</Label>
                <div className="flex gap-2">
                  <Button
                    variant={config.mode === 'initialize' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setConfig(prev => ({ ...prev, mode: 'initialize' }))}
                    data-testid="button-mode-initialize"
                  >
                    Initialize New
                  </Button>
                  <Button
                    variant={config.mode === 'resume' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setConfig(prev => ({ ...prev, mode: 'resume' }))}
                    data-testid="button-mode-resume"
                  >
                    Resume Existing
                  </Button>
                  <Button
                    variant={config.mode === 'full' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setConfig(prev => ({ ...prev, mode: 'full' }))}
                    data-testid="button-mode-full"
                  >
                    Full Process
                  </Button>
                </div>
              </div>

              {/* Input Method */}
              {config.mode === 'initialize' && (
                <div className="space-y-2">
                  <Label>Input Text</Label>
                  <Textarea
                    value={config.inputText || ''}
                    onChange={(e) => setConfig(prev => ({ ...prev, inputText: e.target.value }))}
                    placeholder="Enter text to process, or upload a file below..."
                    className="min-h-[100px]"
                    data-testid="textarea-input-text"
                  />
                  <div className="flex items-center gap-2">
                    <Label htmlFor="input-file" className="cursor-pointer">
                      <div className="flex items-center gap-2 px-3 py-2 border rounded-md hover:bg-accent">
                        <Upload className="w-4 h-4" />
                        Upload Text File
                      </div>
                    </Label>
                    <Input
                      id="input-file"
                      type="file"
                      accept=".txt,.json"
                      onChange={handleFileInputChange}
                      className="hidden"
                      data-testid="input-file-upload"
                    />
                    {selectedInputFile && (
                      <Badge variant="secondary">{selectedInputFile.name}</Badge>
                    )}
                  </div>
                </div>
              )}

              {/* Resume File */}
              {config.mode === 'resume' && (
                <div className="space-y-2">
                  <Label>Resume from JSON</Label>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="resume-file" className="cursor-pointer">
                      <div className="flex items-center gap-2 px-3 py-2 border rounded-md hover:bg-accent">
                        <Upload className="w-4 h-4" />
                        Upload Progress File
                      </div>
                    </Label>
                    <Input
                      id="resume-file"
                      type="file"
                      accept=".json"
                      onChange={handleResumeFileChange}
                      className="hidden"
                      data-testid="input-resume-upload"
                    />
                    {selectedResumeFile && (
                      <Badge variant="secondary">{selectedResumeFile.name}</Badge>
                    )}
                  </div>
                </div>
              )}

              {/* Processing Parameters */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Words per Batch</Label>
                  <Input
                    type="number"
                    value={config.targetWordsPerBatch}
                    onChange={(e) => setConfig(prev => ({ ...prev, targetWordsPerBatch: parseInt(e.target.value) || 30 }))}
                    min="1"
                    max="100"
                    data-testid="input-words-per-batch"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Concurrent Calls</Label>
                  <Input
                    type="number"
                    value={config.maxConcurrentCalls}
                    onChange={(e) => setConfig(prev => ({ ...prev, maxConcurrentCalls: parseInt(e.target.value) || 5 }))}
                    min="1"
                    max="20"
                    data-testid="input-concurrent-calls"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Gemini Model</Label>
                  <Input
                    value={config.modelName}
                    onChange={(e) => setConfig(prev => ({ ...prev, modelName: e.target.value }))}
                    placeholder="gemini-2.5-flash"
                    data-testid="input-model-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Prompt Template</Label>
                  <Select
                    value={config.promptTemplate}
                    onValueChange={(value) => setConfig(prev => ({ ...prev, promptTemplate: value }))}
                  >
                    <SelectTrigger data-testid="select-prompt-template">
                      <SelectValue placeholder="Select prompt..." />
                    </SelectTrigger>
                    <SelectContent>
                      {loadingPrompts ? (
                        <SelectItem value="loading" disabled>Loading prompts...</SelectItem>
                      ) : prompts && prompts.length > 0 ? (
                        prompts.map((prompt) => (
                          <SelectItem key={prompt.filename} value={prompt.filename}>
                            {prompt.name} ({prompt.filename})
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="none" disabled>No prompts available</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {config.promptTemplate && prompts && (
                    <div className="text-xs text-muted-foreground">
                      {prompts.find(p => p.filename === config.promptTemplate)?.description}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Output Filename</Label>
                <Input
                  value={config.outputPath}
                  onChange={(e) => setConfig(prev => ({ ...prev, outputPath: e.target.value }))}
                  placeholder="output.json"
                  data-testid="input-output-path"
                />
              </div>

              <Button
                onClick={handleStartProcessing}
                disabled={startProcessingMutation.isPending || !envStatus?.gemini_available}
                className="w-full"
                data-testid="button-start-processing"
              >
                {startProcessingMutation.isPending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin mr-2" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Start Processing
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Status and Results Panel */}
        <div className="space-y-4">
          {/* Job Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cpu className="w-5 h-5" />
                Processing Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              {currentJob ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span>Status:</span>
                    <Badge 
                      variant={
                        currentJob.status === 'completed' ? 'default' :
                        currentJob.status === 'failed' ? 'destructive' :
                        currentJob.status === 'running' ? 'secondary' : 'outline'
                      }
                    >
                      {currentJob.status.toUpperCase()}
                    </Badge>
                  </div>

                  {currentJob.status === 'running' && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Progress</span>
                        <span>{currentJob.currentBatch}/{currentJob.totalBatches} batches</span>
                      </div>
                      <Progress value={currentJob.progress} className="w-full" />
                    </div>
                  )}

                  {currentJob.error && (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{currentJob.error}</AlertDescription>
                    </Alert>
                  )}

                  {currentJob.status === 'completed' && currentJob.results && (
                    <div className="space-y-2">
                      <div className="text-sm text-muted-foreground">
                        Processing completed successfully!
                      </div>
                      <Button onClick={downloadResults} className="w-full">
                        <Download className="w-4 h-4 mr-2" />
                        Download Results
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center p-8 text-muted-foreground">
                  <Cpu className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No active processing job</p>
                  <p className="text-sm">Configure and start processing to see status</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Usage Instructions */}
          <Card>
            <CardHeader>
              <CardTitle>Usage Guide</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><strong>Initialize Mode:</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>Process new text from scratch</li>
                <li>Provide text directly or upload a file</li>
                <li>Creates tokenization and word database</li>
              </ul>
              
              <Separator className="my-3" />
              
              <p><strong>Resume Mode:</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>Continue from a previous processing session</li>
                <li>Upload the JSON progress file</li>
                <li>Resumes from last completed batch</li>
              </ul>
              
              <Separator className="my-3" />
              
              <p><strong>Features:</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>Parallel batch processing with concurrency control</li>
                <li>POS tagging, lemmatization, and translation</li>
                <li>Idiom detection and frequency analysis</li>
                <li>Progress tracking and error recovery</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}