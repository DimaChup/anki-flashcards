import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import DatabaseSection from "@/components/database-section";
import PageViewSection from "@/components/page-view-section";
import ListViewSection from "@/components/list-view-section";
import { type LinguisticDatabase, type WordEntry } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Languages } from "lucide-react";

export default function Home() {
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<string>("");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: databases, isLoading: isDatabasesLoading } = useQuery<LinguisticDatabase[]>({
    queryKey: ["/api/databases"],
  });

  const { data: selectedDatabase } = useQuery<LinguisticDatabase>({
    queryKey: ["/api/databases", selectedDatabaseId],
    enabled: !!selectedDatabaseId,
  });

  const { data: analysisData } = useQuery<WordEntry[]>({
    queryKey: ["/api/databases", selectedDatabaseId, "analysis-data"],
    enabled: !!selectedDatabaseId,
  });

  // Known words mutation
  const updateKnownWordsMutation = useMutation({
    mutationFn: async (knownWords: string[]) => {
      const response = await apiRequest(
        'PUT',
        `/api/databases/${selectedDatabaseId}/known-words`,
        { knownWords }
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/databases", selectedDatabaseId] });
    },
  });

  const handleKnownWordsChange = (knownWords: string[]) => {
    if (selectedDatabaseId) {
      updateKnownWordsMutation.mutate(knownWords);
    }
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
      if (selectedDatabaseId === databaseId) {
        setSelectedDatabaseId(''); // Clear selection if deleted database was selected
      }
      toast({
        title: "Success",
        description: "Database deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Delete Failed",
        description: error.message,
        variant: "destructive",
      });
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
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="flex justify-center p-5">
        <div 
          className="w-full max-w-7xl flex flex-col gap-6 p-8 rounded-2xl shadow-2xl"
          style={{ backgroundColor: 'var(--bg-secondary)' }}
        >
          {/* Main Header */}
          <header className="flex items-center justify-between mb-4">
            <h1 className="flex items-center gap-3 text-3xl font-bold">
              <Languages className="w-8 h-8" />
              My Personal Linguistic Databases
            </h1>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setLocation('/pricing')}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                data-testid="pricing-button"
              >
                View Pricing
              </button>
              <button
                onClick={() => window.location.href = '/api/logout'}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                data-testid="logout-button"
              >
                Logout
              </button>
            </div>
          </header>

          {/* Database Selection Section */}
          <DatabaseSection
            databases={databases || []}
            isDatabasesLoading={isDatabasesLoading}
            selectedDatabaseId={selectedDatabaseId}
            onDatabaseSelect={setSelectedDatabaseId}
            onCreateNew={() => setLocation('/create')}
            onDeleteDatabase={handleDeleteDatabase}
            data-testid="database-section"
          />

          {/* Page View Section */}
          <PageViewSection
            selectedDatabase={selectedDatabase || null}
            analysisData={analysisData || []}
            knownWords={selectedDatabase?.knownWords as string[] || []}
            onKnownWordsChange={handleKnownWordsChange}
            data-testid="page-view-section"
          />

          {/* List View Section */}
          <ListViewSection
            database={selectedDatabase}
            data-testid="list-view-section"
          />
        </div>
      </div>
    </div>
  );
}
