import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { type LinguisticDatabase } from "@shared/schema";
import { Upload, Plus, Database, CheckCircle, AlertCircle, Circle, Trash2 } from "lucide-react";

interface DatabaseSectionProps {
  databases: LinguisticDatabase[];
  isDatabasesLoading: boolean;
  selectedDatabaseId: string;
  onDatabaseSelect: (databaseId: string) => void;
  onCreateNew?: () => void;
  onDeleteDatabase: (databaseId: string, databaseName: string) => void;
}

export default function DatabaseSection({
  databases,
  isDatabasesLoading,
  selectedDatabaseId,
  onDatabaseSelect,
  onCreateNew,
  onDeleteDatabase,
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
      {/* Database Selection Section */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="database-list" className="flex items-center gap-2 text-sm font-semibold">
            <Database className="w-4 h-4" />
            Select Database:
          </Label>
          <div 
            id="database-list" 
            className="max-h-40 overflow-y-auto border border-border rounded-md bg-background p-2"
            data-testid="database-list"
          >
            {isDatabasesLoading ? (
              <div className="text-center py-4 text-muted-foreground">Loading databases...</div>
            ) : databases.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                No databases found. Create or upload one to get started.
              </div>
            ) : (
              databases.map((database) => (
                <div 
                  key={database.id}
                  className={`flex items-center justify-between p-2 mb-1 rounded border cursor-pointer transition-all ${
                    selectedDatabaseId === database.id 
                      ? 'bg-primary text-primary-foreground border-primary' 
                      : 'bg-muted hover:bg-muted/80 border-border'
                  }`}
                  onClick={() => onDatabaseSelect(database.id)}
                  data-testid={`database-item-${database.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {database.name}
                    </div>
                    <div className={`text-xs ${
                      selectedDatabaseId === database.id 
                        ? 'text-primary-foreground/80' 
                        : 'text-muted-foreground'
                    }`}>
                      {database.language} • {database.wordCount?.toLocaleString() || 0} words
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onDeleteDatabase(database.id, database.name);
                    }}
                    className={`ml-2 p-1 h-auto transition-colors ${
                      selectedDatabaseId === database.id
                        ? 'text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary/80'
                        : 'text-muted-foreground hover:text-destructive hover:bg-destructive/10'
                    }`}
                    data-testid={`delete-database-${database.id}`}
                    title={`Delete ${database.name}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Action Buttons - Mobile: Below database selection, Desktop: Same row */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 sm:items-center">
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
            className="flex items-center gap-2 justify-center sm:justify-start"
            data-testid="upload-json-button"
          >
            <Upload className="w-4 h-4" />
            {isUploading ? "Uploading..." : "Upload JSON"}
          </Button>
          
          <Button
            variant="default"
            onClick={onCreateNew}
            className="flex items-center gap-2 justify-center sm:justify-start"
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
