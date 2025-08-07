import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Folder, File, Download, Eye, Trash2, RefreshCw } from 'lucide-react';

interface FileItem {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
  path: string;
}

export default function FileBrowser() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [currentPath, setCurrentPath] = useState('/tmp');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const fetchFiles = async (path: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
      if (response.ok) {
        const data = await response.json();
        setFiles(data.files || []);
      } else {
        console.error('Failed to fetch files');
        setFiles([]);
      }
    } catch (error) {
      console.error('Error fetching files:', error);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  const viewFile = async (filePath: string) => {
    try {
      const response = await fetch(`/api/files/content?path=${encodeURIComponent(filePath)}`);
      if (response.ok) {
        const content = await response.text();
        setFileContent(content);
        setSelectedFile(filePath);
      } else {
        alert('Failed to read file');
      }
    } catch (error) {
      console.error('Error reading file:', error);
      alert('Error reading file');
    }
  };

  const deleteFile = async (filePath: string) => {
    if (!confirm(`Are you sure you want to delete ${filePath}?`)) return;
    
    try {
      const response = await fetch(`/api/files/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath })
      });
      
      if (response.ok) {
        fetchFiles(currentPath);
        if (selectedFile === filePath) {
          setSelectedFile(null);
          setFileContent('');
        }
      } else {
        alert('Failed to delete file');
      }
    } catch (error) {
      console.error('Error deleting file:', error);
      alert('Error deleting file');
    }
  };

  const downloadFile = async (filePath: string) => {
    try {
      const response = await fetch(`/api/files/download?path=${encodeURIComponent(filePath)}`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filePath.split('/').pop() || 'download';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        alert('Failed to download file');
      }
    } catch (error) {
      console.error('Error downloading file:', error);
      alert('Error downloading file');
    }
  };

  const navigateToPath = (path: string) => {
    setCurrentPath(path);
    setSelectedFile(null);
    setFileContent('');
    fetchFiles(path);
  };

  useEffect(() => {
    fetchFiles(currentPath);
  }, [currentPath]);

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-white">File Browser</h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* File List Panel */}
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader className="border-b border-gray-700">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl text-white">Files</CardTitle>
                <div className="flex gap-2">
                  <Button
                    onClick={() => fetchFiles(currentPath)}
                    variant="outline"
                    size="sm"
                    disabled={loading}
                    data-testid="button-refresh"
                  >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </div>
              <div className="text-sm text-gray-400">
                Current Path: <code className="bg-gray-700 px-2 py-1 rounded">{currentPath}</code>
              </div>
              <div className="flex gap-2 mt-2">
                <Button
                  onClick={() => navigateToPath('/tmp')}
                  variant="outline"
                  size="sm"
                  data-testid="button-tmp"
                >
                  /tmp
                </Button>
                <Button
                  onClick={() => navigateToPath('./server')}
                  variant="outline"
                  size="sm"
                  data-testid="button-server"
                >
                  ./server
                </Button>
                <Button
                  onClick={() => navigateToPath('.')}
                  variant="outline"
                  size="sm"
                  data-testid="button-root"
                >
                  Root
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0 max-h-96 overflow-y-auto">
              {loading ? (
                <div className="p-4 text-center text-gray-400">Loading...</div>
              ) : files.length === 0 ? (
                <div className="p-4 text-center text-gray-400">No files found</div>
              ) : (
                <div className="divide-y divide-gray-700">
                  {currentPath !== '/' && (
                    <div
                      className="p-3 hover:bg-gray-700 cursor-pointer flex items-center gap-2"
                      onClick={() => navigateToPath(currentPath.split('/').slice(0, -1).join('/') || '/')}
                    >
                      <Folder className="h-4 w-4 text-blue-400" />
                      <span>..</span>
                    </div>
                  )}
                  {files.map((file, index) => (
                    <div
                      key={index}
                      className="p-3 hover:bg-gray-700 cursor-pointer"
                      onClick={() => file.type === 'directory' ? navigateToPath(file.path) : null}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-1">
                          {file.type === 'directory' ? (
                            <Folder className="h-4 w-4 text-blue-400 flex-shrink-0" />
                          ) : (
                            <File className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          )}
                          <span className="truncate" title={file.name}>{file.name}</span>
                          {file.size && (
                            <span className="text-xs text-gray-500 ml-auto">
                              {formatFileSize(file.size)}
                            </span>
                          )}
                        </div>
                        {file.type === 'file' && (
                          <div className="flex gap-1 ml-2">
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                viewFile(file.path);
                              }}
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              data-testid={`button-view-${file.name}`}
                            >
                              <Eye className="h-3 w-3" />
                            </Button>
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadFile(file.path);
                              }}
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              data-testid={`button-download-${file.name}`}
                            >
                              <Download className="h-3 w-3" />
                            </Button>
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteFile(file.path);
                              }}
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-red-400 hover:text-red-300"
                              data-testid={`button-delete-${file.name}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* File Content Panel */}
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader className="border-b border-gray-700">
              <CardTitle className="text-xl text-white">
                {selectedFile ? `Viewing: ${selectedFile.split('/').pop()}` : 'Select a file to view'}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {selectedFile ? (
                <div className="h-96 overflow-auto">
                  <pre className="p-4 text-sm text-gray-300 whitespace-pre-wrap">
                    {fileContent}
                  </pre>
                </div>
              ) : (
                <div className="h-96 flex items-center justify-center text-gray-400">
                  Click on a file to view its contents
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 p-4 bg-gray-800 rounded-lg border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-2">JSON Files Location</h3>
          <p className="text-gray-300 mb-2">
            Database JSON files are stored in <code className="bg-gray-700 px-2 py-1 rounded">/tmp/</code> directory with names like:
          </p>
          <ul className="text-gray-400 text-sm space-y-1">
            <li>• <code>database_[database-id].json</code> - Current processing files</li>
            <li>• Look for files starting with "database_" in the /tmp directory</li>
            <li>• These files contain the word data structure for AI processing</li>
          </ul>
        </div>
      </div>
    </div>
  );
}