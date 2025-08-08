import { useState, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Upload, Play, FileText, Download, ArrowLeft } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'wouter'

interface PromptTemplate {
  filename: string;
  name: string;
  description: string;
  size: number;
  modified: string;
}

export default function SimpleProcessor() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [outputFilename, setOutputFilename] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isResuming, setIsResuming] = useState(false)
  const [output, setOutput] = useState('')
  const [resumeOutput, setResumeOutput] = useState('')
  const [generatedFile, setGeneratedFile] = useState<string | null>(null)
  const [jsonContent, setJsonContent] = useState('')
  const [initializationComplete, setInitializationComplete] = useState(false)
  const [selectedPrompt, setSelectedPrompt] = useState('prompt_es.txt')
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Text input mode
  const [inputMode, setInputMode] = useState<'file' | 'text'>('file')
  const [textContent, setTextContent] = useState('')
  const [textFilename, setTextFilename] = useState('')
  
  const { toast } = useToast()

  // Get available prompt templates
  const { data: prompts } = useQuery<PromptTemplate[]>({
    queryKey: ["/api/llm-processor/prompts"],
    refetchInterval: false,
  })

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file && file.type === 'text/plain') {
      setSelectedFile(file)
      // Auto-generate output filename
      const baseName = file.name.replace('.txt', '')
      setOutputFilename(`${baseName}.json`)
      toast({
        title: "File selected",
        description: `${file.name} ready for processing`
      })
    } else {
      toast({
        title: "Invalid file",
        description: "Please select a .txt file",
        variant: "destructive"
      })
    }
  }

  const createTextFile = async () => {
    if (!textContent.trim() || !textFilename.trim()) {
      toast({
        title: "Missing requirements",
        description: "Please provide both text content and filename",
        variant: "destructive"
      })
      return null
    }

    try {
      // Create a blob and file from the text content
      const blob = new Blob([textContent], { type: 'text/plain' })
      const filename = textFilename.endsWith('.txt') ? textFilename : `${textFilename}.txt`
      const file = new File([blob], filename, { type: 'text/plain' })
      
      setSelectedFile(file)
      // Auto-generate output filename
      const baseName = filename.replace('.txt', '')
      setOutputFilename(`${baseName}.json`)
      
      toast({
        title: "Text file created",
        description: `${filename} ready for processing`
      })
      
      return file
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create text file",
        variant: "destructive"
      })
      return null
    }
  }

  const runProcessor = async () => {
    let fileToProcess = selectedFile

    // If in text mode, create file from text content first
    if (inputMode === 'text') {
      fileToProcess = await createTextFile()
      if (!fileToProcess) return
    }

    if (!fileToProcess || !outputFilename) {
      toast({
        title: "Missing requirements",
        description: "Please select a text file or provide text content and specify output filename",
        variant: "destructive"
      })
      return
    }

    setIsProcessing(true)
    setOutput('')
    setGeneratedFile(null)
    setJsonContent('')
    setInitializationComplete(false)

    try {
      // Upload the file first
      const formData = new FormData()
      formData.append('textFile', fileToProcess)

      const uploadResponse = await fetch('/api/python-terminal/upload', {
        method: 'POST',
        body: formData
      })

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file')
      }

      const uploadResult = await uploadResponse.json()
      const inputPath = `/tmp/${uploadResult.filename}`
      const outputPath = `/tmp/${outputFilename}`

      // Run the initialization command
      const command = `python server/process_llm.py --initialize-only --input ${inputPath} --output ${outputPath}`
      setOutput(`Running: ${command}\n\n`)
      
      const response = await fetch('/api/python-terminal/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ command })
      })

      if (!response.ok) {
        throw new Error('Failed to run command')
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let fullOutput = ''

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          
          const chunk = decoder.decode(value)
          fullOutput += chunk
          setOutput(prev => prev + chunk)
        }
      }

      // Check if the command completed successfully
      if (fullOutput.includes('exit code: 0')) {
        setGeneratedFile(outputPath)
        setInitializationComplete(true)
        toast({
          title: "Initialization complete",
          description: `Generated ${outputFilename} successfully. Ready for AI processing.`
        })
        
        // Load the generated JSON file
        loadJsonFile(outputPath)
      } else {
        toast({
          title: "Initialization failed",
          description: "Check the output for error details",
          variant: "destructive"
        })
      }

    } catch (error) {
      console.error('Processing error:', error)
      toast({
        title: "Error",
        description: "Failed to process file",
        variant: "destructive"
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const runResumeProcessor = async () => {
    if (!generatedFile || !outputFilename) {
      toast({
        title: "Missing requirements",
        description: "Please run initialization first",
        variant: "destructive"
      })
      return
    }

    setIsResuming(true)
    setResumeOutput('')

    try {
      const inputJsonPath = generatedFile
      const outputPath = generatedFile // Same location to overwrite

      // Run the resume command
      const command = `python server/process_llm.py --resume-from ${inputJsonPath} --output ${outputPath} --model gemini-2.5-flash --prompt server/prompts/${selectedPrompt}`
      setResumeOutput(`Running: ${command}\n\n`)
      
      const response = await fetch('/api/python-terminal/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ command })
      })

      if (!response.ok) {
        throw new Error('Failed to run resume command')
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let fullOutput = ''

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          
          const chunk = decoder.decode(value)
          fullOutput += chunk
          setResumeOutput(prev => prev + chunk)
        }
      }

      // Check if the command completed successfully
      if (fullOutput.includes('exit code: 0')) {
        toast({
          title: "AI Processing complete",
          description: `Updated ${outputFilename} with AI analysis`
        })
        
        // Reload the updated JSON file
        loadJsonFile(generatedFile)
      } else {
        toast({
          title: "AI Processing failed",
          description: "Check the output for error details",
          variant: "destructive"
        })
      }

    } catch (error) {
      console.error('Resume processing error:', error)
      toast({
        title: "Error",
        description: "Failed to run AI processing",
        variant: "destructive"
      })
    } finally {
      setIsResuming(false)
    }
  }

  const loadJsonFile = async (filePath: string) => {
    try {
      // Extract filename from path for API call
      const filename = filePath.split('/').pop()
      const response = await fetch(`/api/files/${filename}`)
      
      if (response.ok) {
        const content = await response.text()
        setJsonContent(content)
      }
    } catch (error) {
      console.error('Error loading JSON file:', error)
    }
  }

  const downloadJson = () => {
    if (!jsonContent) return
    
    const blob = new Blob([jsonContent], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = outputFilename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-4">
          <Link href="/">
            <Button variant="outline" size="sm" data-testid="button-back-home">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Button>
          </Link>
        </div>
        <h1 className="text-3xl font-bold">Text Processor</h1>
        <p className="text-muted-foreground mt-2">
          Upload a text file or paste content to run the Python script and generate analysis data
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Input & Settings
            </CardTitle>
            <CardDescription>
              Upload a text file or paste content and configure the processing
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Input Mode Selection */}
            <div>
              <Label className="text-sm font-medium">Input Method</Label>
              <div className="flex gap-2 mt-2">
                <Button
                  variant={inputMode === 'file' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setInputMode('file')
                    setSelectedFile(null)
                    setTextContent('')
                    setTextFilename('')
                    setOutputFilename('')
                  }}
                  data-testid="button-file-mode"
                >
                  <Upload className="h-4 w-4 mr-1" />
                  Upload File
                </Button>
                <Button
                  variant={inputMode === 'text' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setInputMode('text')
                    setSelectedFile(null)
                    if (fileInputRef.current) {
                      fileInputRef.current.value = ''
                    }
                    setOutputFilename('')
                  }}
                  data-testid="button-text-mode"
                >
                  <FileText className="h-4 w-4 mr-1" />
                  Paste Text
                </Button>
              </div>
            </div>

            {/* File Upload Mode */}
            {inputMode === 'file' && (
              <div>
                <Label htmlFor="file">Text File (.txt)</Label>
                <Input
                  id="file"
                  type="file"
                  accept=".txt"
                  onChange={handleFileSelect}
                  ref={fileInputRef}
                  className="mt-1"
                  data-testid="input-file"
                />
                {selectedFile && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>
            )}

            {/* Text Input Mode */}
            {inputMode === 'text' && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="textFilename">Filename (without .txt extension)</Label>
                  <Input
                    id="textFilename"
                    value={textFilename}
                    onChange={(e) => setTextFilename(e.target.value)}
                    placeholder="my-document"
                    className="mt-1"
                    data-testid="input-text-filename"
                  />
                </div>
                <div>
                  <Label htmlFor="textContent">Text Content</Label>
                  <Textarea
                    id="textContent"
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value)}
                    placeholder="Paste your text content here..."
                    className="min-h-[150px] mt-1"
                    data-testid="textarea-text-content"
                  />
                  {textContent && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Character count: {textContent.length}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Output Filename */}
            <div>
              <Label htmlFor="output">Output JSON Filename</Label>
              <Input
                id="output"
                value={outputFilename}
                onChange={(e) => setOutputFilename(e.target.value)}
                placeholder="output.json"
                className="mt-1"
                data-testid="input-output-filename"
              />
            </div>

            {/* Command Preview */}
            {((inputMode === 'file' && selectedFile) || (inputMode === 'text' && textContent && textFilename)) && outputFilename && (
              <div className="p-3 bg-muted rounded-md">
                <Label className="text-sm font-mono">Command to execute:</Label>
                <p className="text-sm font-mono text-muted-foreground mt-1">
                  {inputMode === 'file' && selectedFile ? (
                    `python server/process_llm.py --initialize-only --input /tmp/${selectedFile.name} --output /tmp/${outputFilename}`
                  ) : (
                    `python server/process_llm.py --initialize-only --input /tmp/${textFilename}.txt --output /tmp/${outputFilename}`
                  )}
                </p>
              </div>
            )}

            {/* Run Button */}
            <Button
              onClick={runProcessor}
              disabled={
                (inputMode === 'file' && (!selectedFile || !outputFilename)) ||
                (inputMode === 'text' && (!textContent.trim() || !textFilename.trim() || !outputFilename)) ||
                isProcessing
              }
              className="w-full"
              data-testid="button-run-processor"
            >
              <Play className="h-4 w-4 mr-2" />
              {isProcessing ? 'Initializing...' : 'Step 1: Initialize'}
            </Button>

            {/* Resume Processing Section */}
            {initializationComplete && (
              <div className="pt-4 border-t space-y-4">
                {/* Prompt Selection */}
                <div className="space-y-2">
                  <Label>Prompt Template for Step 2</Label>
                  <Select value={selectedPrompt} onValueChange={setSelectedPrompt}>
                    <SelectTrigger data-testid="select-prompt-template">
                      <SelectValue placeholder="Select prompt..." />
                    </SelectTrigger>
                    <SelectContent>
                      {prompts && prompts.length > 0 ? (
                        prompts.map((prompt) => (
                          <SelectItem key={prompt.filename} value={prompt.filename}>
                            {prompt.name} ({prompt.filename})
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="prompt_es.txt">ES (prompt_es.txt)</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {selectedPrompt && prompts && (
                    <div className="text-xs text-muted-foreground">
                      {prompts.find(p => p.filename === selectedPrompt)?.description || 'Selected prompt template'}
                    </div>
                  )}
                </div>

                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md">
                  <Label className="text-sm font-mono">Resume command:</Label>
                  <p className="text-sm font-mono text-muted-foreground mt-1">
                    python server/process_llm.py --resume-from /tmp/{outputFilename} --output /tmp/{outputFilename} --model gemini-2.5-flash --prompt server/prompts/{selectedPrompt}
                  </p>
                </div>
                
                <Button
                  onClick={runResumeProcessor}
                  disabled={isResuming}
                  className="w-full bg-orange-600 hover:bg-orange-700"
                  data-testid="button-run-resume"
                >
                  <Play className="h-4 w-4 mr-2" />
                  {isResuming ? 'AI Processing...' : 'Step 2: AI Process'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Output Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Process Output
            </CardTitle>
            <CardDescription>
              Real-time output from the Python scripts
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Initialization Output */}
            <div>
              <Label className="text-sm font-medium">Step 1: Initialization Output</Label>
              <Textarea
                value={output}
                readOnly
                className="min-h-[200px] font-mono text-sm bg-black text-green-400 resize-none mt-2"
                placeholder="Initialization output will appear here..."
                data-testid="textarea-init-output"
              />
            </div>

            {/* Resume Output */}
            {initializationComplete && (
              <div>
                <Label className="text-sm font-medium">Step 2: AI Processing Output</Label>
                <Textarea
                  value={resumeOutput}
                  readOnly
                  className="min-h-[200px] font-mono text-sm bg-black text-orange-400 resize-none mt-2"
                  placeholder="AI processing output will appear here..."
                  data-testid="textarea-resume-output"
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Generated JSON Viewer */}
      {generatedFile && jsonContent && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Generated JSON: {outputFilename}
              </span>
              <Button
                onClick={downloadJson}
                variant="outline"
                size="sm"
                data-testid="button-download-json"
              >
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            </CardTitle>
            <CardDescription>
              Preview of the generated JSON file
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={jsonContent}
              readOnly
              className="min-h-[400px] font-mono text-sm"
              data-testid="textarea-json-content"
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}