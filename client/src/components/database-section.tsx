import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { type LinguisticDatabase } from "@shared/schema";
import { Upload, Plus, Database, CheckCircle, AlertCircle, Circle } from "lucide-react";

interface DatabaseSectionProps {
  databases: LinguisticDatabase[];
  isDatabasesLoading: boolean;
  selectedDatabaseId: string;
  onDatabaseSelect: (databaseId: string) => void;
}

export default function DatabaseSection({
  databases,
  isDatabasesLoading,
  selectedDatabaseId,
  onDatabaseSelect,
}: DatabaseSectionProps) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('jsonFile', file);
      const response = await apiRequest('POST', '/api/databases/upload', formData);
      return response.json();
    },
    onSuccess: (newDatabase: LinguisticDatabase) => {
      queryClient.invalidateQueries({ queryKey: ['/api/databases'] });
      onDatabaseSelect(newDatabase.id);
      toast({
        title: "Success",
        description: `Database "${newDatabase.name}" uploaded successfully.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      toast({
        title: "Invalid File",
        description: "Please select a JSON file.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      await uploadMutation.mutateAsync(file);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const selectedDatabase = databases.find(db => db.id === selectedDatabaseId);

  const getStatusIcon = () => {
    if (selectedDatabase) {
      return <CheckCircle className="w-3 h-3 text-green-500" />;
    }
    if (isDatabasesLoading) {
      return <Circle className="w-3 h-3 text-muted-foreground animate-pulse" />;
    }
    return <AlertCircle className="w-3 h-3 text-muted-foreground" />;
  };

  const getStatusText = () => {
    if (selectedDatabase) {
      return `Database loaded: ${selectedDatabase.name} (${selectedDatabase.wordCount} words analyzed)`;
    }
    if (isDatabasesLoading) {
      return "Loading databases...";
    }
    return "No database selected";
  };

  return (
    <section 
      className="p-5 rounded-xl flex flex-col gap-4"
      style={{ backgroundColor: 'var(--bg-tertiary)' }}
    >
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Label htmlFor="database-select" className="flex items-center gap-2 text-sm font-semibold shrink-0">
            <Database className="w-4 h-4" />
            Select Database:
          </Label>
          <Select
            value={selectedDatabaseId}
            onValueChange={onDatabaseSelect}
            disabled={isDatabasesLoading}
          >
            <SelectTrigger 
              id="database-select"
              className="min-w-[200px] bg-input border-border"
              data-testid="database-select"
            >
              <SelectValue placeholder="Choose a database..." />
            </SelectTrigger>
            <SelectContent>
              {databases.map((database) => (
                <SelectItem key={database.id} value={database.id}>
                  {database.name} ({database.language})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileUpload}
            className="hidden"
            id="json-upload"
            data-testid="json-upload-input"
          />
          <Button
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-2"
            data-testid="upload-json-button"
          >
            <Upload className="w-4 h-4" />
            {isUploading ? "Uploading..." : "Upload JSON"}
          </Button>
          
          <Button
            variant="default"
            className="flex items-center gap-2"
            data-testid="create-new-button"
          >
            <Plus className="w-4 h-4" />
            Create New
          </Button>
        </div>
      </div>

      <div className="status-indicator" data-testid="database-status">
        {getStatusIcon()}
        <span className="font-medium">{getStatusText()}</span>
      </div>
    </section>
  );
}
