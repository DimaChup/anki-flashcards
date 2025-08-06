import { useEffect, useState } from 'react';
import { Users, Database, Eye } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface UserData {
  user: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
  };
  databases: Array<{
    id: string;
    name: string;
    language: string;
    wordCount: number;
    knownWords: string[];
  }>;
  message: string;
}

export default function DemoUsers() {
  const [userData, setUserData] = useState<{ [key: string]: UserData }>({});
  const [loading, setLoading] = useState(true);

  const users = [
    { id: 'user123', name: 'Alice Smith', email: 'alice@example.com' },
    { id: 'user456', name: 'Bob Johnson', email: 'bob@example.com' },
    { id: 'user789', name: 'Carol Williams', email: 'carol@example.com' }
  ];

  useEffect(() => {
    const fetchAllUsers = async () => {
      try {
        const results: { [key: string]: UserData } = {};
        
        for (const user of users) {
          const response = await fetch(`/api/demo/user/${user.id}`);
          if (response.ok) {
            results[user.id] = await response.json();
          }
        }
        
        setUserData(results);
      } catch (error) {
        console.error('Failed to fetch user data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAllUsers();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="p-3 bg-primary/10 rounded-xl">
              <Users className="h-12 w-12 text-primary" />
            </div>
          </div>
          
          <h1 className="text-4xl font-bold text-foreground mb-4">
            Multi-Tenant System Demo
          </h1>
          
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            Each user has their own private account with isolated databases and personal learning progress.
            Notice how each user sees only their own data.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8 mb-8">
          {users.map((user) => {
            const data = userData[user.id];
            
            return (
              <Card key={user.id} className="shadow-lg">
                <CardHeader className="bg-primary/5">
                  <CardTitle className="flex items-center gap-2">
                    <Eye className="h-5 w-5" />
                    {user.name}
                  </CardTitle>
                  <CardDescription>{user.email}</CardDescription>
                </CardHeader>
                
                <CardContent className="pt-6">
                  {data ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Personal Databases:</span>
                        <span className="bg-primary/10 text-primary px-2 py-1 rounded text-sm">
                          {data.databases.length} databases
                        </span>
                      </div>
                      
                      <div className="space-y-2">
                        {data.databases.map((db) => (
                          <div key={db.id} className="p-3 bg-muted/50 rounded-lg">
                            <div className="flex items-center gap-2 mb-1">
                              <Database className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium text-sm">{db.name}</span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {db.language} • {db.wordCount} words
                            </div>
                            {db.knownWords && db.knownWords.length > 0 && (
                              <div className="text-xs text-green-600 mt-1">
                                Known words: {db.knownWords.join(', ')}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {data.databases.length === 0 && (
                        <div className="text-center py-4 text-muted-foreground">
                          No databases yet
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-muted-foreground">
                      Loading user data...
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="text-center bg-card rounded-xl p-8 border">
          <h2 className="text-2xl font-bold mb-4">Perfect Data Isolation</h2>
          <p className="text-muted-foreground mb-6">
            As you can see above, each user has their own completely separate databases and learning progress.
            Alice has 2 databases (Spanish and French), Bob has 1 database (Italian), and Carol has 1 database (German).
            Each user's known words lists are personal and private.
          </p>
          <Button onClick={() => window.location.href = '/'} className="mx-auto">
            Try the System
          </Button>
        </div>
      </div>
    </div>
  );
}