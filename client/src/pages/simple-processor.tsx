import { useState, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Upload, Play, FileText, Download } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export default function SimpleProcessor() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [outputFilename, setOutputFilename] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [output, setOutput] = useState('')
  const [generatedFile, setGeneratedFile] = useState<string | null>(null)
  const [jsonContent, setJsonContent] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

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

  const runProcessor = async () => {
    if (!selectedFile || !outputFilename) {
      toast({
        title: "Missing requirements",
        description: "Please select a text file and specify output filename",
        variant: "destructive"
      })
      return
    }

    setIsProcessing(true)
    setOutput('')
    setGeneratedFile(null)
    setJsonContent('')

    try {
      // Upload the file first
      const formData = new FormData()
      formData.append('textFile', selectedFile)

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

      // Run the Python command
      const command = `python server/process_llm.py --initialize-only --input ${inputPath} --output ${outputPath}`
      
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
        toast({
          title: "Processing complete",
          description: `Generated ${outputFilename} successfully`
        })
        
        // Load the generated JSON file
        loadJsonFile(outputPath)
      } else {
        toast({
          title: "Processing failed",
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
        <h1 className="text-3xl font-bold">Text Processor</h1>
        <p className="text-muted-foreground mt-2">
          Upload a text file and run the Python script to generate analysis data
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
              Upload your text file and configure the processing
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* File Upload */}
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
            {selectedFile && outputFilename && (
              <div className="p-3 bg-muted rounded-md">
                <Label className="text-sm font-mono">Command to execute:</Label>
                <p className="text-sm font-mono text-muted-foreground mt-1">
                  python server/process_llm.py --initialize-only --input /tmp/{selectedFile.name} --output /tmp/{outputFilename}
                </p>
              </div>
            )}

            {/* Run Button */}
            <Button
              onClick={runProcessor}
              disabled={!selectedFile || !outputFilename || isProcessing}
              className="w-full"
              data-testid="button-run-processor"
            >
              <Play className="h-4 w-4 mr-2" />
              {isProcessing ? 'Processing...' : 'Run Processor'}
            </Button>
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
              Real-time output from the Python script
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={output}
              readOnly
              className="min-h-[300px] font-mono text-sm bg-black text-green-400 resize-none"
              placeholder="Process output will appear here..."
              data-testid="textarea-output"
            />
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