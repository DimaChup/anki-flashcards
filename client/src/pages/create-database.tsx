import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export default function CreateDatabase() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [isCreating, setIsCreating] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusType, setStatusType] = useState<'success' | 'error' | ''>('');

  
  const [initializeText, setInitializeText] = useState('');
  const [initializeFilename, setInitializeFilename] = useState('');
  
  const [selectedDatabase, setSelectedDatabase] = useState<string>('');
  const [selectedPromptTemplate, setSelectedPromptTemplate] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('gemini-2.0-flash');
  const [batchSize, setBatchSize] = useState<number>(30);
  const [concurrency, setConcurrency] = useState<number>(5);
  const [userApiKey, setUserApiKey] = useState<string>('');
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
      promptTemplateId: selectedPromptTemplate || undefined,
      userApiKey: userApiKey || undefined
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

  // Initialize File functionality - matches original script behavior exactly
  const initializeFileMutation = useMutation({
    mutationFn: async (data: { filename: string; inputText: string }) => {
      const response = await fetch('/api/databases/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'initialize',
          inputText: data.inputText,
          filename: data.filename
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
      inputText: initializeText
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
              Start Here: Select Existing File OR Initialize New Database
            </h2>
            
            <div className="control-group">
              <label htmlFor="file-selector">Select Existing File:</label>
              <select 
                id="file-selector"
                value={selectedDatabase}
                onChange={(e) => setSelectedDatabase(e.target.value)}
                data-testid="select-existing-file"
              >
                <option value="">Choose an existing database...</option>
                {databases?.map((db: any) => (
                  <option key={db.id} value={db.id}>
                    {db.name} ({db.language} • {db.wordCount?.toLocaleString() || 0} words)
                  </option>
                ))}
              </select>
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
            
            <div className="control-group">
              <label htmlFor="api-key">Gemini API Key (Optional):</label>
              <input 
                type="password" 
                id="api-key" 
                placeholder="AIza... (leave empty to use server default)"
                value={userApiKey}
                onChange={(e) => setUserApiKey(e.target.value)}
                style={{ fontFamily: 'monospace', fontSize: '0.9em' }}
                data-testid="input-api-key"
              />
              <small style={{ color: 'var(--text-secondary)', display: 'block', marginTop: '5px' }}>
                If provided, this will override the server's default API key
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
              {isCreating && 'Creating database...'}
              {startProcessingMutation.isPending && 'Starting AI processing...'}
              {!isCreating && !startProcessingMutation.isPending && (
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
                  
                  Select an existing database or initialize with text above, then use AI processing controls.
                </>
              )}
            </pre>
          </div>
        </div>
      </div>
    </>
  );
}