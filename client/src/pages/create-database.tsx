import { useState } from 'react';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';

export default function CreateDatabase() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    filename: '',
    inputText: '',
    description: '',
    language: 'Spanish'
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      toast({
        title: 'Invalid File',
        description: 'Please select a JSON file.',
        variant: 'destructive',
      });
      return;
    }

    setSelectedFile(file);
  };

  const handleFileUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('jsonFile', selectedFile);

      const response = await fetch('/api/databases/upload', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        toast({
          title: 'Success',
          description: `Database "${result.name}" uploaded successfully.`,
        });
        setLocation('/');
      } else {
        const error = await response.json();
        toast({
          title: 'Upload Failed',
          description: error.message || 'Failed to upload database',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Upload Error',
        description: 'An error occurred while uploading the file',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleInitializeFile = async () => {
    if (!formData.inputText.trim()) {
      toast({
        title: 'Input Text Required',
        description: 'Please enter text to initialize the database.',
        variant: 'destructive',
      });
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
        toast({
          title: 'Success',
          description: `Database "${result.name}" created successfully.`,
        });
        setLocation('/');
      } else {
        const error = await response.json();
        toast({
          title: 'Creation Failed',
          description: error.message || 'Failed to create database',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Creation Error',
        description: 'An error occurred while creating the database',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)', padding: '20px' }}>
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
        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={() => setLocation('/')}
            style={{
              padding: '9px 15px',
              backgroundColor: 'var(--accent-secondary)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.9em',
              fontWeight: 'bold',
              marginBottom: '20px',
              transition: 'background-color 0.25s ease-in-out'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--accent-secondary-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--accent-secondary)';
            }}
            data-testid="button-back"
          >
            ← Back to Main
          </button>
          <h1 style={{
            fontSize: '1.8em',
            fontWeight: '700',
            marginBottom: '10px',
            color: 'var(--text-heading)'
          }}>
            Database Creation Control Panel
          </h1>
        </div>

        {/* Upload Existing File Section */}
        <div className="control-section" style={{
          backgroundColor: 'var(--bg-tertiary)',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          marginBottom: '20px'
        }}>
          <h2 style={{
            fontSize: '1.3em',
            color: 'var(--text-heading)',
            marginBottom: '15px',
            borderBottom: '1px solid var(--border-color)',
            paddingBottom: '5px'
          }}>
            Upload Existing JSON File
          </h2>
          
          <div className="control-group" style={{
            marginBottom: '15px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px 15px',
            alignItems: 'flex-start'
          }}>
            <label style={{
              fontWeight: 'bold',
              color: 'var(--text-secondary)',
              marginRight: '5px',
              flexBasis: '150px',
              flexShrink: '0',
              fontSize: '0.9em',
              paddingTop: '8px'
            }}>
              Select JSON File:
            </label>
            <input
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              style={{
                padding: '8px 10px',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                fontSize: '0.95em',
                flexGrow: '1',
                minWidth: '150px',
                transition: 'border-color 0.25s ease-in-out, box-shadow 0.25s ease-in-out'
              }}
              data-testid="input-file"
            />
            <button
              onClick={handleFileUpload}
              disabled={!selectedFile || isUploading}
              style={{
                padding: '9px 15px',
                backgroundColor: selectedFile && !isUploading ? 'var(--accent-primary)' : 'var(--accent-secondary)',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: selectedFile && !isUploading ? 'pointer' : 'not-allowed',
                fontSize: '0.9em',
                fontWeight: 'bold',
                transition: 'background-color 0.25s ease-in-out',
                opacity: selectedFile && !isUploading ? '1' : '0.6'
              }}
              data-testid="button-upload"
            >
              {isUploading ? 'Uploading...' : 'Upload File'}
            </button>
          </div>
          
          {selectedFile && (
            <small style={{ color: 'var(--text-secondary)', display: 'block', marginTop: '5px' }}>
              Selected: {selectedFile.name}
            </small>
          )}
        </div>

        <hr style={{ borderColor: 'var(--border-color)', opacity: '0.3', margin: '20px 0' }} />

        {/* Initialize New File Section */}
        <div className="control-section" style={{
          backgroundColor: 'var(--bg-tertiary)',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          marginBottom: '20px'
        }}>
          <h2 style={{
            fontSize: '1.3em',
            color: 'var(--text-heading)',
            marginBottom: '15px',
            borderBottom: '1px solid var(--border-color)',
            paddingBottom: '5px'
          }}>
            Initialize New Database
          </h2>
          
          <div className="control-group" style={{
            marginBottom: '15px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px 15px',
            alignItems: 'flex-start'
          }}>
            <label style={{
              fontWeight: 'bold',
              color: 'var(--text-secondary)',
              marginRight: '5px',
              flexBasis: '150px',
              flexShrink: '0',
              fontSize: '0.9em',
              paddingTop: '8px'
            }}>
              Database Name:
            </label>
            <input
              type="text"
              value={formData.filename}
              onChange={(e) => setFormData(prev => ({ ...prev, filename: e.target.value }))}
              placeholder="e.g., spanish_novel.json (optional)"
              style={{
                padding: '8px 10px',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                fontSize: '0.95em',
                flexGrow: '1',
                minWidth: '150px',
                transition: 'border-color 0.25s ease-in-out, box-shadow 0.25s ease-in-out'
              }}
              data-testid="input-filename"
            />
          </div>

          <div className="control-group" style={{
            marginBottom: '15px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px 15px',
            alignItems: 'flex-start'
          }}>
            <label style={{
              fontWeight: 'bold',
              color: 'var(--text-secondary)',
              marginRight: '5px',
              flexBasis: '150px',
              flexShrink: '0',
              fontSize: '0.9em',
              paddingTop: '8px'
            }}>
              Language:
            </label>
            <input
              type="text"
              value={formData.language}
              onChange={(e) => setFormData(prev => ({ ...prev, language: e.target.value }))}
              placeholder="e.g., Spanish, English, French"
              style={{
                padding: '8px 10px',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                fontSize: '0.95em',
                flexGrow: '1',
                minWidth: '150px',
                transition: 'border-color 0.25s ease-in-out, box-shadow 0.25s ease-in-out'
              }}
              data-testid="input-language"
            />
          </div>

          <div className="control-group" style={{
            marginBottom: '15px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px 15px',
            alignItems: 'flex-start'
          }}>
            <label style={{
              fontWeight: 'bold',
              color: 'var(--text-secondary)',
              marginRight: '5px',
              flexBasis: '150px',
              flexShrink: '0',
              fontSize: '0.9em',
              paddingTop: '8px'
            }}>
              Input Text:
            </label>
            <textarea
              value={formData.inputText}
              onChange={(e) => setFormData(prev => ({ ...prev, inputText: e.target.value }))}
              placeholder="Paste the full text here to initialize..."
              style={{
                padding: '8px 10px',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                fontSize: '0.95em',
                flexGrow: '1',
                minWidth: '150px',
                minHeight: '100px',
                resize: 'vertical',
                fontFamily: "'Courier New', Courier, monospace",
                transition: 'border-color 0.25s ease-in-out, box-shadow 0.25s ease-in-out'
              }}
              data-testid="textarea-input-text"
            />
            <button
              onClick={handleInitializeFile}
              disabled={!formData.inputText.trim() || isCreating}
              style={{
                padding: '9px 15px',
                backgroundColor: formData.inputText.trim() && !isCreating ? 'var(--accent-primary)' : 'var(--accent-secondary)',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: formData.inputText.trim() && !isCreating ? 'pointer' : 'not-allowed',
                fontSize: '0.9em',
                fontWeight: 'bold',
                alignSelf: 'flex-end',
                marginLeft: '10px',
                transition: 'background-color 0.25s ease-in-out',
                opacity: formData.inputText.trim() && !isCreating ? '1' : '0.6'
              }}
              data-testid="button-initialize"
            >
              {isCreating ? 'Creating...' : 'Initialize File'}
            </button>
          </div>

          <div className="control-group" style={{
            marginBottom: '15px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px 15px',
            alignItems: 'flex-start'
          }}>
            <label style={{
              fontWeight: 'bold',
              color: 'var(--text-secondary)',
              marginRight: '5px',
              flexBasis: '150px',
              flexShrink: '0',
              fontSize: '0.9em',
              paddingTop: '8px'
            }}>
              Description:
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Optional description of your linguistic database"
              style={{
                padding: '8px 10px',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                fontSize: '0.95em',
                flexGrow: '1',
                minWidth: '150px',
                minHeight: '60px',
                resize: 'vertical',
                fontFamily: "'Courier New', Courier, monospace",
                transition: 'border-color 0.25s ease-in-out, box-shadow 0.25s ease-in-out'
              }}
              data-testid="textarea-description"
            />
          </div>

          <small style={{ color: 'var(--text-secondary)', display: 'block', marginTop: '5px' }}>
            Enter text above and click 'Initialize' to create a new database with linguistic analysis.
          </small>
        </div>
      </div>
    </div>
  );
}