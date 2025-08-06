import { useState } from 'react';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';

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

  const handleInitializeFile = async () => {
    if (!formData.inputText.trim()) {
      showStatus('Please enter text to initialize the database.', 'error');
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
        showStatus(`Database "${result.name}" initialized successfully.`, 'success');
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
                value={formData.filename}
                onChange={(e) => setFormData(prev => ({ ...prev, filename: e.target.value }))}
                data-testid="input-filename"
              />
            </div>
            
            <div className="control-group">
              <label htmlFor="init-input-text">Input Text for New File:</label>
              <textarea
                id="init-input-text"
                placeholder="Paste the full text here to initialize..."
                value={formData.inputText}
                onChange={(e) => setFormData(prev => ({ ...prev, inputText: e.target.value }))}
                data-testid="textarea-input-text"
              />
              <button
                id="btn-initialize"
                onClick={handleInitializeFile}
                disabled={!formData.inputText.trim() || isCreating}
                data-testid="button-initialize"
              >
                {isCreating ? 'Initializing...' : 'Initialize File'}
              </button>
            </div>
            
            <small style={{ color: 'var(--text-secondary)', display: 'block', marginTop: '5px' }}>
              Upload an existing JSON file for processing OR enter text/new name above and click 'Initialize'.
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
              <select id="prompt-selector">
                <option value="">Loading prompts...</option>
              </select>
            </div>
            
            <div className="control-group">
              <label htmlFor="model-selector">LLM Model:</label>
              <select id="model-selector">
                <option value="gemini-2.0-flash" selected>gemini-2.0-flash (Default)</option>
                <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                <option value="gemini-1.0-pro">gemini-1.0-pro</option>
                <option value="gemini-1.5-pro-latest">gemini-1.5-pro-latest</option>
              </select>
            </div>
            
            <div className="control-group">
              <label htmlFor="param-batch-size">Batch Size (Words):</label>
              <input type="number" id="param-batch-size" min="1" placeholder="e.g., 30" />
            </div>
            
            <div className="control-group">
              <label htmlFor="param-concurrency">Concurrency:</label>
              <input type="number" id="param-concurrency" min="1" placeholder="e.g., 5" />
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
              <button id="btn-check-status">Check Batch Status</button>
              <small style={{ color: 'var(--text-secondary)', marginLeft: '10px' }}>(Uses selected file above)</small>
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
              <button id="btn-process">Process Unprocessed Batches</button>
              <small style={{ color: 'var(--text-secondary)', marginLeft: '10px' }}>(Uses selected file above)</small>
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
              {!isUploading && !isCreating && 'Ready for database creation. Upload a JSON file or initialize with text above.'}
            </pre>
          </div>
        </div>
      </div>
    </>
  );
}