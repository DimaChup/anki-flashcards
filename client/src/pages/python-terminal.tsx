import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Upload, Terminal, Play, FolderOpen, FileText } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export default function PythonTerminal() {
  const [command, setCommand] = useState('python server/process_llm.py --initialize-only --input /tmp/nature.txt')
  const [output, setOutput] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  // Load uploaded files list on component mount
  useEffect(() => {
    fetchUploadedFiles()
  }, [])

  const fetchUploadedFiles = async () => {
    try {
      const response = await fetch('/api/python-terminal/files')
      if (response.ok) {
        const files = await response.json()
        setUploadedFiles(files)
      }
    } catch (error) {
      console.error('Error fetching files:', error)
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.txt')) {
      toast({
        title: "Invalid file type",
        description: "Please upload a .txt file",
        variant: "destructive"
      })
      return
    }

    const formData = new FormData()
    formData.append('textFile', file)

    try {
      const response = await fetch('/api/python-terminal/upload', {
        method: 'POST',
        body: formData
      })

      if (response.ok) {
        const result = await response.json()
        toast({
          title: "File uploaded successfully",
          description: `${file.name} is now available for use`
        })
        fetchUploadedFiles()
        
        // Update command to use the uploaded file
        setCommand(`python server/process_llm.py --initialize-only --input /tmp/${result.filename}`)
      } else {
        throw new Error('Upload failed')
      }
    } catch (error) {
      toast({
        title: "Upload failed",
        description: "Failed to upload file",
        variant: "destructive"
      })
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const runCommand = async () => {
    if (!command.trim()) {
      toast({
        title: "No command",
        description: "Please enter a command to run",
        variant: "destructive"
      })
      return
    }

    setIsRunning(true)
    setOutput('Running command...\n')

    try {
      const response = await fetch('/api/python-terminal/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ command })
      })

      if (response.ok) {
        const reader = response.body?.getReader()
        const decoder = new TextDecoder()

        if (reader) {
          let result = ''
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            
            const chunk = decoder.decode(value)
            result += chunk
            setOutput(result)
          }
        }
      } else {
        const error = await response.text()
        setOutput(`Error: ${error}`)
      }
    } catch (error) {
      setOutput(`Error: ${error}`)
    } finally {
      setIsRunning(false)
    }
  }

  const selectFile = (filename: string) => {
    setCommand(`python server/process_llm.py --initialize-only --input /tmp/${filename}`)
  }

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-6xl">
      <div className="flex items-center gap-2 mb-6">
        <Terminal className="w-8 h-8 text-blue-600" />
        <h1 className="text-3xl font-bold">Python Terminal</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* File Upload Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Upload Text Files
            </CardTitle>
            <CardDescription>
              Upload .txt files to use with your Python scripts
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="file-upload" className="text-sm font-medium">
                Select .txt file to upload
              </Label>
              <Input
                id="file-upload"
                type="file"
                accept=".txt"
                onChange={handleFileUpload}
                ref={fileInputRef}
                className="mt-1"
                data-testid="input-file-upload"
              />
            </div>

            {uploadedFiles.length > 0 && (
              <div>
                <Label className="text-sm font-medium mb-2 block">
                  Available files:
                </Label>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {uploadedFiles.map((filename, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                      onClick={() => selectFile(filename)}
                      data-testid={`file-item-${index}`}
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        <span className="text-sm">{filename}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          selectFile(filename)
                        }}
                        data-testid={`button-select-${index}`}
                      >
                        Use
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Command Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Play className="w-5 h-5" />
              Run Python Command
            </CardTitle>
            <CardDescription>
              Execute Python commands directly
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="command" className="text-sm font-medium">
                Command
              </Label>
              <Input
                id="command"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="python server/process_llm.py --initialize-only --input /tmp/nature.txt"
                className="font-mono text-sm mt-1"
                data-testid="input-command"
              />
            </div>

            <Button
              onClick={runCommand}
              disabled={isRunning || !command.trim()}
              className="w-full"
              data-testid="button-run-command"
            >
              {isRunning ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Run Command
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Terminal Output */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="w-5 h-5" />
            Terminal Output
          </CardTitle>
          <CardDescription>
            Command output and results
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={output}
            readOnly
            className="min-h-[300px] font-mono text-sm bg-black text-green-400 border-gray-600"
            placeholder="Command output will appear here..."
            data-testid="textarea-output"
          />
        </CardContent>
      </Card>

      {/* Quick Commands */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Commands</CardTitle>
          <CardDescription>
            Common commands for your workflow
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={() => setCommand('python server/process_llm.py --initialize-only --input /tmp/nature.txt')}
              className="justify-start font-mono text-sm"
              data-testid="button-quick-initialize"
            >
              Initialize: nature.txt
            </Button>
            <Button
              variant="outline"
              onClick={() => setCommand('python server/process_llm.py --resume-from /tmp/database.json --model gemini-2.5-flash --prompt server/prompt_es.txt')}
              className="justify-start font-mono text-sm"
              data-testid="button-quick-resume"
            >
              Resume Processing
            </Button>
            <Button
              variant="outline"
              onClick={() => setCommand('ls /tmp/*.json')}
              className="justify-start font-mono text-sm"
              data-testid="button-quick-list"
            >
              List /tmp files
            </Button>
            <Button
              variant="outline"
              onClick={() => setCommand('python --version')}
              className="justify-start font-mono text-sm"
              data-testid="button-quick-version"
            >
              Python version
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}