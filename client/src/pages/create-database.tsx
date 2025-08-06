import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export default function CreateDatabase() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusType, setStatusType] = useState<'success' | 'error' | ''>('');
  const [formData, setFormData] = useState({
    filename: '',
    inputText: '',
    description: '',
    language: 'Spanish'
  });
  
  const [initializeText, setInitializeText] = useState('');
  const [initializeFilename, setInitializeFilename] = useState('');
  
  const [selectedDatabase, setSelectedDatabase] = useState<string>('');
  const [selectedPromptTemplate, setSelectedPromptTemplate] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('gemini-2.0-flash');
  const [batchSize, setBatchSize] = useState<number>(30);
  const [concurrency, setConcurrency] = useState<number>(5);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const queryClient = useQueryClient();

  // Fetch databases for processing
  const { data: databases } = useQuery({
    queryKey: ['/api/databases'],
    enabled: true
  });

  // Auto-select sample database if available and no database is selected
  useEffect(() => {
    if (databases && databases.length > 0 && !selectedDatabase) {
      const sampleDb = databases.find((db: any) => 
        db.name.toLowerCase().includes('sample') || 
        db.name.toLowerCase().includes('ishmael')
      );
      if (sampleDb) {
        setSelectedDatabase(sampleDb.id);
      }
    }
  }, [databases, selectedDatabase]);

  // Fetch prompt templates
  const { data: promptTemplates } = useQuery({
    queryKey: ['/api/prompt-templates'],
    enabled: true
  });

  // Fetch processing jobs
  const { data: processingJobs } = useQuery({
    queryKey: ['/api/processing-jobs'],
    enabled: true,
    refetchInterval: 2000 // Refresh every 2 seconds for real-time updates
  });

  const showStatus = (message: string, type: 'success' | 'error') => {
    setStatusMessage(message);
    setStatusType(type);
    setTimeout(() => {
      setStatusMessage('');
      setStatusType('');
    }, 5000);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      showStatus('Please select a JSON file.', 'error');
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('jsonFile', file);

      const response = await fetch('/api/databases/upload', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        showStatus(`Database "${result.name}" uploaded successfully.`, 'success');
        setTimeout(() => setLocation('/'), 2000);
      } else {
        const error = await response.json();
        showStatus(error.message || 'Failed to upload database', 'error');
      }
    } catch (error) {
      showStatus('An error occurred while uploading the file', 'error');
    } finally {
      setIsUploading(false);
      // Reset file input
      if (e.target) e.target.value = '';
    }
  };

  const handleCreateDatabaseFromForm = async () => {
    if (!formData.inputText.trim()) {
      showStatus('Please enter text to create the database.', 'error');
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch('/api/databases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.filename || 'New Database',
          description: formData.description,
          language: formData.language,
          originalText: formData.inputText,
          wordCount: formData.inputText.split(/\s+/).length,
          analysisData: [],
          knownWords: [],
          segments: []
        }),
      });

      if (response.ok) {
        const result = await response.json();
        showStatus(`Database "${result.name}" created successfully.`, 'success');
        setTimeout(() => setLocation('/'), 2000);
      } else {
        const error = await response.json();
        showStatus(error.message || 'Failed to create database', 'error');
      }
    } catch (error) {
      showStatus('An error occurred while creating the database', 'error');
    } finally {
      setIsCreating(false);
    }
  };

  // Start AI processing
  const startProcessingMutation = useMutation({
    mutationFn: async (data: { databaseId: string; configId?: string; promptTemplateId?: string }) => {
      const response = await fetch('/api/start-processing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to start processing');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/processing-jobs'] });
      showStatus('AI processing started successfully!', 'success');
    },
    onError: (error: Error) => {
      showStatus(error.message, 'error');
    }
  });

  const handleStartProcessing = () => {
    if (!selectedDatabase) {
      showStatus('Please select a database to process', 'error');
      return;
    }

    setIsProcessing(true);
    startProcessingMutation.mutate({
      databaseId: selectedDatabase,
      promptTemplateId: selectedPromptTemplate || undefined
    });
    setIsProcessing(false);
  };

  const handleCheckStatus = () => {
    if (!selectedDatabase) {
      showStatus('Please select a database to check status', 'error');
      return;
    }

    const jobsForDatabase = processingJobs?.filter((job: any) => job.databaseId === selectedDatabase) || [];
    if (jobsForDatabase.length === 0) {
      showStatus('No processing jobs found for selected database', 'error');
      return;
    }

    const latestJob = jobsForDatabase[0]; // Assuming jobs are sorted by creation date
    showStatus(`Latest job status: ${latestJob.status} (${latestJob.progress}% complete)`, 'success');
  };

  // Initialize File functionality - creates a new database from raw text
  const initializeFileMutation = useMutation({
    mutationFn: async (data: { filename: string; inputText: string; language: string; description?: string }) => {
      const response = await fetch('/api/databases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.filename,
          originalText: data.inputText,
          language: data.language,
          description: data.description || `Database initialized from text input`,
          analysisData: [],
          knownWords: [],
          segments: [],
          wordCount: data.inputText.split(/\s+/).filter(word => word.trim()).length
        })
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to initialize database');
      }
      return response.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['/api/databases'] });
      setSelectedDatabase(result.id); // Auto-select the newly created database
      showStatus(`Database "${result.name}" initialized successfully!`, 'success');
      // Clear the initialize form
      setInitializeText('');
      setInitializeFilename('');
    },
    onError: (error: Error) => {
      showStatus(error.message, 'error');
    }
  });

  const handleInitializeFile = () => {
    if (!initializeText.trim()) {
      showStatus('Please enter text to initialize a new database', 'error');
      return;
    }

    const filename = initializeFilename.trim() || `database_${Date.now()}`;
    const finalFilename = filename.endsWith('.json') ? filename.slice(0, -5) : filename;

    initializeFileMutation.mutate({
      filename: finalFilename,
      inputText: initializeText,
      language: formData.language,
      description: `Initialized from text input on ${new Date().toLocaleDateString()}`
    });
  };

  // Delete database functionality
  const deleteDatabaseMutation = useMutation({
    mutationFn: async (databaseId: string) => {
      const response = await fetch(`/api/databases/${databaseId}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Database not found - it may have already been deleted');
        }
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete database');
      }
      return databaseId; // Return the ID instead of trying to parse empty response
    },
    onSuccess: (databaseId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/databases'] });
      if (selectedDatabase === databaseId) {
        setSelectedDatabase(''); // Clear selection if deleted database was selected
      }
      showStatus('Database deleted successfully', 'success');
    },
    onError: (error: Error) => {
      showStatus(error.message, 'error');
    }
  });

  const handleDeleteDatabase = (databaseId: string, databaseName: string) => {
    // Prevent multiple deletions by checking if mutation is already pending
    if (deleteDatabaseMutation.isPending) {
      return;
    }
    
    if (window.confirm(`Are you sure you want to delete the database "${databaseName}"?\n\nThis action cannot be undone.`)) {
      deleteDatabaseMutation.mutate(databaseId);
    }
  };

  return (
    <>
      <style>{`
        /* --- Root Variables (Dark Theme) --- */
        :root {
            --bg-primary: #1a1d21;
            --bg-secondary: #252a30;
            --bg-tertiary: #31363f;
            --text-primary: #e8eaed;
            --text-secondary: #bdc1c6;
            --text-heading: #ffffff;
            --border-color: #4a5058;
            --accent-primary: #4a90e2;
            --accent-primary-hover: #3a7bc8;
            --accent-secondary: #4b5563;
            --accent-secondary-hover: #6b7280;
            --error-bg: #5f1d24;
            --error-border: #9e3842;
            --error-text: #fecdd3;
            --success-bg: #164e3b;
            --success-border: #34d399;
            --success-text: #d1fae5;
            --focus-ring: rgba(74, 144, 226, 0.4);
            --transition-speed-normal: 0.25s;
            --transition-timing: ease-in-out;
        }
        
        .control-section {
            background-color: var(--bg-tertiary);
            padding: 20px;
            border-radius: 12px;
            border: 1px solid var(--border-color);
            margin-bottom: 20px;
        }
        
        .control-group {
            margin-bottom: 15px;
            display: flex;
            flex-wrap: wrap;
            gap: 10px 15px;
            align-items: flex-start;
        }
        
        .control-group label {
            font-weight: bold;
            color: var(--text-secondary);
            margin-right: 5px;
            flex-basis: 150px;
            flex-shrink: 0;
            font-size: 0.9em;
            padding-top: 8px;
        }
        
        .control-group input[type="text"],
        .control-group input[type="number"],
        .control-group input[type="file"],
        .control-group select,
        .control-group textarea {
            padding: 8px 10px;
            background-color: var(--bg-primary);
            color: var(--text-primary);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            font-size: 0.95em;
            flex-grow: 1;
            min-width: 150px;
            transition: border-color var(--transition-speed-normal) var(--transition-timing), box-shadow var(--transition-speed-normal) var(--transition-timing);
            font-family: 'Courier New', Courier, monospace;
        }
        
        .control-group textarea {
             min-height: 100px;
             resize: vertical;
        }
        
        .control-group input:focus,
        .control-group select:focus,
        .control-group textarea:focus {
             outline: none;
             border-color: var(--accent-primary);
             box-shadow: 0 0 0 3px var(--focus-ring);
        }
        
        .control-group button {
             align-self: flex-end;
             margin-left: 10px;
        }

        button {
            padding: 9px 15px;
            background-color: var(--accent-primary);
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.9em;
            font-weight: bold;
            transition: background-color var(--transition-speed-normal) var(--transition-timing), transform 0.1s var(--transition-timing);
            margin-right: 10px;
            margin-top: 5px;
        }
        
        button:hover:not(:disabled) { 
            background-color: var(--accent-primary-hover); 
            transform: translateY(-1px); 
        }
        
        button:disabled { 
            background-color: var(--accent-secondary); 
            cursor: not-allowed; 
            opacity: 0.6; 
        }
        
        .status-message {
            padding: 10px;
            border-radius: 6px;
            margin-bottom: 15px;
            font-weight: bold;
        }
        
        .status-message.error { 
            background-color: var(--error-bg); 
            border: 1px solid var(--error-border); 
            color: var(--error-text); 
        }
        
        .status-message.success { 
            background-color: var(--success-bg); 
            border: 1px solid var(--success-border); 
            color: var(--success-text); 
        }
        
        hr { 
            border-color: var(--border-color); 
            opacity: 0.3; 
            margin: 20px 0; 
        }
        
        #output-area {
            margin-top: 20px;
            background-color: var(--bg-primary);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 15px;
            min-height: 150px;
            max-height: 400px;
            overflow-y: auto;
            white-space: pre-wrap;
            word-wrap: break-word;
            font-family: 'Courier New', Courier, monospace;
            font-size: 0.9em;
            color: var(--text-secondary);
        }
      `}</style>
      
      <div style={{
        fontFamily: 'Inter, sans-serif',
        lineHeight: '1.6',
        margin: '0',
        padding: '20px',
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        fontSize: '16px',
        minHeight: '100vh'
      }}>
        <div id="app-container" style={{
          backgroundColor: 'var(--bg-secondary)',
          padding: '30px 35px',
          borderRadius: '16px',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.25)',
          maxWidth: '900px',
          margin: '20px auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '25px'
        }}>
          <h1 style={{
            fontSize: '1.8em',
            fontWeight: '700',
            marginBottom: '10px',
            textAlign: 'center',
            color: 'var(--text-heading)'
          }}>
            Database Creation Control Panel
          </h1>

          <div id="status-area">
            {statusMessage && (
              <div className={`status-message ${statusType}`}>
                {statusMessage}
              </div>
            )}
          </div>

          <div className="control-section">
            <h2 style={{
              fontSize: '1.3em',
              color: 'var(--text-heading)',
              marginBottom: '15px',
              borderBottom: '1px solid var(--border-color)',
              paddingBottom: '5px'
            }}>
              Start Here: Upload JSON File OR Initialize New Database
            </h2>
            
            <div className="control-group">
              <label htmlFor="file-upload">Upload JSON File:</label>
              <input
                type="file"
                id="file-upload"
                accept=".json"
                onChange={handleFileUpload}
                disabled={isUploading}
                data-testid="input-file"
              />
            </div>
            
            <hr style={{ margin: '10px 0' }} />
            
            <div className="control-group">
              <label htmlFor="new-filename">Initialize New File As:</label>
              <input
                type="text"
                id="new-filename"
                placeholder="e.g., project_b.json (optional)"
                value={initializeFilename}
                onChange={(e) => setInitializeFilename(e.target.value)}
                data-testid="input-new-filename"
              />
            </div>
            
            <div className="control-group">
              <label htmlFor="init-input-text">Input Text for New File:</label>
              <textarea
                id="init-input-text"
                placeholder="Paste the full text here to initialize..."
                rows={6}
                value={initializeText}
                onChange={(e) => setInitializeText(e.target.value)}
                data-testid="textarea-init-input-text"
              />
              <button
                id="btn-initialize"
                onClick={handleInitializeFile}
                disabled={initializeFileMutation.isPending || !initializeText.trim()}
                data-testid="button-initialize"
              >
                {initializeFileMutation.isPending ? 'Initializing...' : 'Initialize File'}
              </button>
            </div>
            
            <small style={{ color: 'var(--text-secondary)', display: 'block', marginTop: '5px' }}>
              Select an existing database for other actions OR enter text/new name above and click 'Initialize'.
            </small>
            
            <hr style={{ margin: '20px 0' }} />
            
            <h3 style={{ fontSize: '1.1em', color: 'var(--text-heading)', marginBottom: '15px' }}>
              Or Create Database from JSON File:
            </h3>

            <div className="control-group">
              <label htmlFor="init-file-name">Database Name:</label>
              <input
                type="text"
                id="init-file-name"
                placeholder="e.g., My Spanish Text"
                value={formData.filename}
                onChange={(e) => setFormData(prev => ({ ...prev, filename: e.target.value }))}
                data-testid="input-database-name"
              />
            </div>

            <div className="control-group">
              <label htmlFor="init-file-desc">Description (optional):</label>
              <input
                type="text"
                id="init-file-desc"
                placeholder="Brief description of this text"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                data-testid="input-description"
              />
            </div>

            <div className="control-group">
              <label htmlFor="json-input-text">Input Text:</label>
              <textarea
                id="json-input-text"
                placeholder="Paste the full text here to create database..."
                rows={6}
                value={formData.inputText}
                onChange={(e) => setFormData(prev => ({ ...prev, inputText: e.target.value }))}
                data-testid="textarea-json-input-text"
              />
              <button
                id="btn-create-database"
                onClick={handleCreateDatabaseFromForm}
                disabled={isCreating || !formData.inputText.trim()}
                data-testid="button-create-database"
              >
                {isCreating ? 'Creating...' : 'Create Database'}
              </button>
            </div>
            

          </div>

          <div className="control-section">
            <h2 style={{
              fontSize: '1.3em',
              color: 'var(--text-heading)',
              marginBottom: '15px',
              borderBottom: '1px solid var(--border-color)',
              paddingBottom: '5px'
            }}>
              Optional Parameters (Overrides Defaults)
            </h2>
            
            <div className="control-group" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <label htmlFor="database-list">Select Database for Processing:</label>
              <div id="database-list" style={{
                maxHeight: '200px',
                overflowY: 'auto',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                backgroundColor: 'var(--bg-primary)',
                padding: '8px',
                marginTop: '5px'
              }}>
                {databases && databases.length > 0 ? (
                  databases.map((db: any) => (
                    <div 
                      key={db.id} 
                      className={`database-item ${selectedDatabase === db.id ? 'selected' : ''}`}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px 12px',
                        marginBottom: '4px',
                        borderRadius: '4px',
                        border: selectedDatabase === db.id ? '2px solid var(--accent-primary)' : '1px solid var(--border-color)',
                        backgroundColor: selectedDatabase === db.id ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                        color: selectedDatabase === db.id ? 'white' : 'var(--text-primary)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                      onClick={() => setSelectedDatabase(db.id)}
                      data-testid={`database-item-${db.id}`}
                    >
                      <div style={{ flexGrow: 1 }}>
                        <div style={{ fontWeight: '500', fontSize: '0.95em' }}>
                          {db.name}
                        </div>
                        <div style={{ 
                          fontSize: '0.8em', 
                          opacity: '0.8',
                          color: selectedDatabase === db.id ? 'rgba(255,255,255,0.8)' : 'var(--text-secondary)'
                        }}>
                          {db.language} • {db.wordCount.toLocaleString()} words
                          {db.description && ` • ${db.description}`}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          handleDeleteDatabase(db.id, db.name);
                        }}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: 'var(--error-bg)',
                          color: 'var(--error-text)',
                          border: '1px solid var(--error-border)',
                          borderRadius: '4px',
                          fontSize: '0.8em',
                          cursor: 'pointer',
                          marginLeft: '10px',
                          transition: 'opacity 0.2s ease'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                        data-testid={`delete-database-${db.id}`}
                        title={`Delete database: ${db.name}`}
                        disabled={deleteDatabaseMutation.isPending}
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  ))
                ) : (
                  <div style={{
                    textAlign: 'center',
                    padding: '20px',
                    color: 'var(--text-secondary)',
                    fontStyle: 'italic'
                  }}>
                    No databases found. Initialize or upload a database above.
                  </div>
                )}
              </div>
            </div>

            <div className="control-group">
              <label htmlFor="prompt-selector">Prompt Template:</label>
              <select 
                id="prompt-selector"
                value={selectedPromptTemplate}
                onChange={(e) => setSelectedPromptTemplate(e.target.value)}
                data-testid="select-prompt-template"
              >
                <option value="">Use default template</option>
                {promptTemplates?.map((template: any) => (
                  <option key={template.id} value={template.id}>
                    {template.name} - {template.description}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="control-group">
              <label htmlFor="model-selector">LLM Model:</label>
              <select 
                id="model-selector"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                data-testid="select-model"
              >
                <option value="gemini-2.0-flash">gemini-2.0-flash (Default)</option>
                <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                <option value="gemini-1.0-pro">gemini-1.0-pro</option>
                <option value="gemini-1.5-pro-latest">gemini-1.5-pro-latest</option>
              </select>
            </div>
            
            <div className="control-group">
              <label htmlFor="param-batch-size">Batch Size (Words):</label>
              <input 
                type="number" 
                id="param-batch-size" 
                min="1" 
                placeholder="e.g., 30"
                value={batchSize}
                onChange={(e) => setBatchSize(parseInt(e.target.value) || 30)}
                data-testid="input-batch-size"
              />
            </div>
            
            <div className="control-group">
              <label htmlFor="param-concurrency">Concurrency:</label>
              <input 
                type="number" 
                id="param-concurrency" 
                min="1" 
                placeholder="e.g., 5"
                value={concurrency}
                onChange={(e) => setConcurrency(parseInt(e.target.value) || 5)}
                data-testid="input-concurrency"
              />
            </div>
          </div>

          <div className="control-section">
            <h2 style={{
              fontSize: '1.3em',
              color: 'var(--text-heading)',
              marginBottom: '15px',
              borderBottom: '1px solid var(--border-color)',
              paddingBottom: '5px'
            }}>
              Actions on Selected File
            </h2>

            <div className="control-group">
              <button 
                id="btn-check-status"
                onClick={handleCheckStatus}
                disabled={!selectedDatabase}
                data-testid="button-check-status"
              >
                Check Batch Status
              </button>
              <small style={{ color: 'var(--text-secondary)', marginLeft: '10px' }}>(Uses selected database above)</small>
            </div>
            <hr />

            <div className="control-group">
              <label htmlFor="process-upto-batch">Process Up To Batch:</label>
              <input type="number" id="process-upto-batch" min="1" placeholder="(optional)" />
            </div>
            <div className="control-group">
              <label htmlFor="process-batches">Process Specific Batches:</label>
              <input type="text" id="process-batches" placeholder="e.g., 1,2,5 (optional)" />
            </div>
            <div className="control-group">
              <button 
                id="btn-process"
                onClick={handleStartProcessing}
                disabled={!selectedDatabase || isProcessing || startProcessingMutation.isPending}
                data-testid="button-start-processing"
              >
                {isProcessing || startProcessingMutation.isPending ? 'Starting Processing...' : 'Process Unprocessed Batches'}
              </button>
              <small style={{ color: 'var(--text-secondary)', marginLeft: '10px' }}>(Uses selected database above)</small>
            </div>
            <hr />

            <div className="control-group">
              <label htmlFor="reprocess-range">Reprocess Word Range:</label>
              <input type="text" id="reprocess-range" placeholder="e.g., 50-75" />
              <button id="btn-reprocess">Reprocess Range</button>
            </div>
            <hr />

            <div className="control-group">
              <label htmlFor="clear-batch">Clear Batch #:</label>
              <input type="number" id="clear-batch" min="1" />
              <button id="btn-clear-batch">Clear Batch</button>
            </div>
            <div className="control-group">
              <label htmlFor="clear-range">Clear Word Range:</label>
              <input type="text" id="clear-range" placeholder="e.g., 50-75" />
              <button id="btn-clear-range">Clear Range</button>
            </div>
            
            <hr />
            
            <div className="control-group">
              <button
                onClick={() => setLocation('/')}
                data-testid="button-back"
              >
                ← Back to Main
              </button>
              <small style={{ color: 'var(--text-secondary)', marginLeft: '10px' }}>
                Return to the main database view
              </small>
            </div>
          </div>

          <div className="control-section">
            <h2 style={{
              fontSize: '1.3em',
              color: 'var(--text-heading)',
              marginBottom: '15px',
              borderBottom: '1px solid var(--border-color)',
              paddingBottom: '5px'
            }}>
              Output / Log
            </h2>
            <pre id="output-area">
              {isUploading && 'Uploading file...'}
              {isCreating && 'Creating database...'}
              {startProcessingMutation.isPending && 'Starting AI processing...'}
              {!isUploading && !isCreating && !startProcessingMutation.isPending && (
                <>
                  Ready for database creation and AI processing.
                  {'\n\n'}
                  
                  {databases && databases.length > 0 && (
                    <>
                      Available Databases: {databases.length}
                      {'\n'}
                      {databases.map((db: any) => `- ${db.name} (${db.wordCount} words)`).join('\n')}
                      {'\n\n'}
                    </>
                  )}
                  
                  {promptTemplates && promptTemplates.length > 0 && (
                    <>
                      Available Prompt Templates: {promptTemplates.length}
                      {'\n'}
                      {promptTemplates.map((template: any) => `- ${template.name}: ${template.description}`).join('\n')}
                      {'\n\n'}
                    </>
                  )}
                  
                  {processingJobs && processingJobs.length > 0 && (
                    <>
                      Recent Processing Jobs:
                      {'\n'}
                      {processingJobs.slice(0, 5).map((job: any) => {
                        const dbName = databases?.find((db: any) => db.id === job.databaseId)?.name || 'Unknown DB';
                        return `- ${dbName}: ${job.status.toUpperCase()} (${job.progress}%)`;
                      }).join('\n')}
                      {'\n\n'}
                    </>
                  )}
                  
                  Upload a JSON file or initialize with text above, then select a database for AI processing.
                </>
              )}
            </pre>
          </div>
        </div>
      </div>
    </>
  );
}