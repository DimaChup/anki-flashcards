import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DatabaseSection from "@/components/database-section";
import PageViewSection from "@/components/page-view-section";
import ListViewSection from "@/components/list-view-section";
import { type LinguisticDatabase, type WordEntry } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Languages } from "lucide-react";

export default function Home() {
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<string>("");
  const queryClient = useQueryClient();

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

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="flex justify-center p-5">
        <div 
          className="w-full max-w-7xl flex flex-col gap-6 p-8 rounded-2xl shadow-2xl"
          style={{ backgroundColor: 'var(--bg-secondary)' }}
        >
          {/* Main Header */}
          <header className="text-center">
            <h1 className="flex items-center justify-center gap-3 text-3xl font-bold mb-2">
              <Languages className="w-8 h-8" />
              POS Languages Analysis - Combined View
            </h1>
          </header>

          {/* Database Selection Section */}
          <DatabaseSection
            databases={databases || []}
            isDatabasesLoading={isDatabasesLoading}
            selectedDatabaseId={selectedDatabaseId}
            onDatabaseSelect={setSelectedDatabaseId}
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
