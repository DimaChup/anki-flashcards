import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { File, Eye, Download, Trash2, RefreshCw } from 'lucide-react';

interface FileItem {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
  path: string;
}

export default function JsonFilesViewer() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/files?path=/tmp');
      if (response.ok) {
        const data = await response.json();
        // Filter only JSON files
        const jsonFiles = (data.files || []).filter((file: FileItem) => 
          file.type === 'file' && file.name.endsWith('.json')
        );
        setFiles(jsonFiles);
      } else {
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
    if (!confirm(`Are you sure you want to delete ${filePath.split('/').pop()}?`)) return;
    
    try {
      const response = await fetch('/api/files/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath })
      });
      
      if (response.ok) {
        fetchFiles();
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
        a.download = filePath.split('/').pop() || 'download.json';
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

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatJson = (jsonString: string) => {
    try {
      const parsed = JSON.parse(jsonString);
      return JSON.stringify(parsed, null, 2);
    } catch (error) {
      return jsonString; // Return as-is if not valid JSON
    }
  };

  useEffect(() => {
    fetchFiles();
    // Auto-refresh every 10 seconds
    const interval = setInterval(fetchFiles, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* File List Panel */}
      <div style={{ 
        backgroundColor: 'var(--bg-secondary)', 
        border: '1px solid var(--border-color)', 
        borderRadius: '8px',
        padding: '1rem'
      }}>
        <div className="flex items-center justify-between mb-4">
          <h4 style={{ color: 'var(--text-heading)', fontSize: '1.1rem', fontWeight: '600' }}>
            JSON Files (/tmp)
          </h4>
          <Button
            onClick={fetchFiles}
            variant="outline"
            size="sm"
            disabled={loading}
            data-testid="button-refresh-json"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              borderColor: 'var(--border-color)',
              color: 'var(--text-primary)'
            }}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        
        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ 
              padding: '1rem', 
              textAlign: 'center' as const, 
              color: 'var(--text-secondary)' 
            }}>
              Loading...
            </div>
          ) : files.length === 0 ? (
            <div style={{ 
              padding: '1rem', 
              textAlign: 'center' as const, 
              color: 'var(--text-secondary)' 
            }}>
              No JSON files found
            </div>
          ) : (
            <div>
              {files.map((file, index) => (
                <div
                  key={index}
                  style={{
                    padding: '0.75rem',
                    borderBottom: '1px solid var(--border-color)',
                    cursor: 'pointer',
                    transition: 'background-color var(--transition-speed-normal) var(--transition-timing)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1">
                      <File className="h-4 w-4 text-blue-400 flex-shrink-0" />
                      <span 
                        style={{ 
                          color: 'var(--text-primary)', 
                          fontSize: '0.9rem',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                        title={file.name}
                      >
                        {file.name}
                      </span>
                      {file.size && (
                        <span style={{ 
                          fontSize: '0.75rem', 
                          color: 'var(--text-secondary)',
                          marginLeft: 'auto'
                        }}>
                          {formatFileSize(file.size)}
                        </span>
                      )}
                    </div>
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
                        style={{ color: 'var(--text-secondary)' }}
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
                        style={{ color: 'var(--text-secondary)' }}
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
                        className="h-6 w-6 p-0"
                        data-testid={`button-delete-${file.name}`}
                        style={{ color: '#ef4444' }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* File Content Panel */}
      <div style={{ 
        backgroundColor: 'var(--bg-secondary)', 
        border: '1px solid var(--border-color)', 
        borderRadius: '8px',
        padding: '1rem'
      }}>
        <h4 style={{ 
          color: 'var(--text-heading)', 
          fontSize: '1.1rem', 
          fontWeight: '600',
          marginBottom: '1rem'
        }}>
          {selectedFile ? `Viewing: ${selectedFile.split('/').pop()}` : 'Select a JSON file to view'}
        </h4>
        
        {selectedFile ? (
          <div style={{ 
            height: '300px', 
            overflow: 'auto',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            padding: '0.75rem'
          }}>
            <pre style={{ 
              fontSize: '0.75rem', 
              color: 'var(--text-primary)', 
              whiteSpace: 'pre-wrap',
              margin: 0,
              lineHeight: '1.4'
            }}>
              {formatJson(fileContent)}
            </pre>
          </div>
        ) : (
          <div style={{ 
            height: '300px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            color: 'var(--text-secondary)'
          }}>
            Click on a JSON file to view its contents
          </div>
        )}
      </div>
    </div>
  );
}