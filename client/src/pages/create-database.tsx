import { useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Upload, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function CreateDatabase() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    language: 'Spanish'
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
        toast({
          title: 'Database uploaded successfully',
          description: `${result.name} has been created and is ready to use.`,
        });
        setLocation('/');
      } else {
        const error = await response.json();
        toast({
          title: 'Upload failed',
          description: error.message || 'Failed to upload database',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Upload error',
        description: 'An error occurred while uploading the file',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleManualCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({
        title: 'Name required',
        description: 'Please enter a name for your database',
        variant: 'destructive',
      });
      return;
    }

    try {
      const response = await fetch('/api/databases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          language: formData.language,
          originalText: '',
          wordCount: 0,
          analysisData: [],
          knownWords: [],
          segments: []
        }),
      });

      if (response.ok) {
        toast({
          title: 'Database created',
          description: `${formData.name} has been created successfully.`,
        });
        setLocation('/');
      } else {
        const error = await response.json();
        toast({
          title: 'Creation failed',
          description: error.message || 'Failed to create database',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Creation error',
        description: 'An error occurred while creating the database',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => setLocation('/')}
            className="mb-4"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Databases
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Create New Database</h1>
          <p className="text-muted-foreground mt-2">
            Create a new linguistic analysis database by uploading a JSON file or creating one manually.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Upload from File */}
          <Card data-testid="card-upload">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="w-5 h-5" />
                Upload from File
              </CardTitle>
              <CardDescription>
                Upload a JSON file containing linguistic data with inputText, wordDatabase, and segments.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                  <Upload className="w-8 h-8 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mb-4">
                    Choose a JSON file to upload
                  </p>
                  <Label htmlFor="file-upload" className="cursor-pointer">
                    <Button variant="outline" disabled={isUploading} data-testid="button-choose-file">
                      {isUploading ? 'Uploading...' : 'Choose File'}
                    </Button>
                  </Label>
                  <Input
                    id="file-upload"
                    type="file"
                    accept=".json"
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={isUploading}
                    data-testid="input-file"
                  />
                </div>
                <div className="text-xs text-muted-foreground">
                  <p><strong>Expected format:</strong></p>
                  <p>• inputText: The original text content</p>
                  <p>• wordDatabase: Object with word entries and analysis</p>
                  <p>• segments: Array of text segments with translations</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Create Manually */}
          <Card data-testid="card-manual">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Create Manually
              </CardTitle>
              <CardDescription>
                Create an empty database that you can populate with text and analysis data later.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleManualCreate} className="space-y-4">
                <div>
                  <Label htmlFor="name">Database Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Enter database name"
                    required
                    data-testid="input-name"
                  />
                </div>
                
                <div>
                  <Label htmlFor="language">Language</Label>
                  <Input
                    id="language"
                    value={formData.language}
                    onChange={(e) => setFormData(prev => ({ ...prev, language: e.target.value }))}
                    placeholder="e.g., Spanish, English, French"
                    data-testid="input-language"
                  />
                </div>
                
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Optional description of your linguistic database"
                    rows={3}
                    data-testid="textarea-description"
                  />
                </div>
                
                <Button type="submit" className="w-full" data-testid="button-create">
                  Create Database
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}