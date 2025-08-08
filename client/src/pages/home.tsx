import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import DatabaseSection from "@/components/database-section";
import PageViewSection from "@/components/page-view-section";
import ListViewSection from "@/components/list-view-section";
import KnownWordsSection from "@/components/known-words-section";
import { type LinguisticDatabase, type WordEntry } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Languages } from "lucide-react";

export default function Home() {
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<string>("");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { logout, isLoggingOut } = useAuth();

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
      <div className="flex justify-center p-1 sm:p-2 md:p-5">
        <div 
          className="w-full max-w-7xl flex flex-col gap-3 sm:gap-4 md:gap-6 p-3 sm:p-4 md:p-8 rounded-xl sm:rounded-2xl shadow-2xl text-content"
          style={{ backgroundColor: 'var(--bg-secondary)' }}
        >
          {/* Main Header - iPhone XR Optimized */}
          <header className="flex flex-col gap-3 sm:gap-4 md:flex-row md:items-center md:justify-between mb-3 sm:mb-4">
            <h1 className="flex items-center gap-2 md:gap-3 text-lg sm:text-xl md:text-3xl font-bold">
              <Languages className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8" />
              <span className="hidden sm:inline">My Personal Linguistic Databases</span>
              <span className="sm:hidden text-base">My Databases</span>
            </h1>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2 md:gap-3">
              <button
                onClick={() => setLocation('/anki-study')}
                className="bg-purple-600 hover:bg-purple-700 text-white px-2 py-2.5 sm:px-3 sm:py-2 md:px-4 md:py-2 rounded-lg font-medium transition-colors text-xs sm:text-sm md:text-base min-h-[48px] sm:min-h-[44px] flex items-center justify-center"
                data-testid="anki-study-button"
              >
                <span className="hidden sm:inline">🧠 Anki Study</span>
                <span className="sm:hidden">🧠 Study</span>
              </button>
              <button
                onClick={() => setLocation('/llm-processor')}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-2.5 sm:px-3 sm:py-2 md:px-4 md:py-2 rounded-lg font-medium transition-colors text-xs sm:text-sm md:text-base min-h-[48px] sm:min-h-[44px] flex items-center justify-center"
                data-testid="llm-processor-button"
              >
                <span className="hidden sm:inline">🧠 LLM Processor</span>
                <span className="sm:hidden">🧠 LLM</span>
              </button>
              <button
                onClick={() => setLocation('/python-terminal')}
                className="bg-green-600 hover:bg-green-700 text-white px-2 py-2.5 sm:px-3 sm:py-2 md:px-4 md:py-2 rounded-lg font-medium transition-colors text-xs sm:text-sm md:text-base min-h-[48px] sm:min-h-[44px] flex items-center justify-center"
                data-testid="python-terminal-button"
              >
                <span className="hidden sm:inline">🐍 Python Terminal</span>
                <span className="sm:hidden">🐍 Terminal</span>
              </button>
              <button
                onClick={() => setLocation('/pricing')}
                className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-2.5 sm:px-3 sm:py-2 md:px-4 md:py-2 rounded-lg font-medium transition-colors text-xs sm:text-sm md:text-base min-h-[48px] sm:min-h-[44px] flex items-center justify-center"
                data-testid="pricing-button"
              >
                <span className="hidden sm:inline">View Pricing</span>
                <span className="sm:hidden">Pricing</span>
              </button>
              <button
                onClick={logout}
                disabled={isLoggingOut}
                className="bg-gray-600 hover:bg-gray-700 text-white px-2 py-2.5 sm:px-3 sm:py-2 md:px-4 md:py-2 rounded-lg font-medium transition-colors disabled:opacity-50 text-xs sm:text-sm md:text-base min-h-[48px] sm:min-h-[44px] flex items-center justify-center"
                data-testid="logout-button"
              >
                <span className="hidden sm:inline">{isLoggingOut ? 'Logging out...' : 'Logout'}</span>
                <span className="sm:hidden">{isLoggingOut ? 'Out...' : 'Logout'}</span>
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
            data-testid="page-view-section"
          />

          {/* List View Section */}
          <ListViewSection
            database={selectedDatabase}
            data-testid="list-view-section"
          />

          {/* Known Words Section - Moved to bottom */}
          <KnownWordsSection
            selectedDatabase={selectedDatabase || null}
            knownWords={selectedDatabase?.knownWords as string[] || []}
            onKnownWordsChange={handleKnownWordsChange}
            data-testid="known-words-section"
          />
        </div>
      </div>
    </div>
  );
}
