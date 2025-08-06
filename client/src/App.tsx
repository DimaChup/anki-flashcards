import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/home";
import CreateDatabase from "@/pages/create-database";
import Pricing from "@/pages/pricing";
import Landing from "@/pages/landing";
import DemoUsers from "@/pages/demo-users";
import Flashcards from "@/pages/flashcards";
import AnkiStudy from "@/pages/anki-study";
// Note: AnkiStudyPage is the same component as AnkiStudy, used for parameterized route
const AnkiStudyPage = AnkiStudy;
import SimpleFlashcards from "@/pages/simple-flashcards";
import AuthPage from "@/pages/auth";
import { useAuth } from "@/hooks/useAuth";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <Switch>
      {!isAuthenticated ? (
        <>
          <Route path="/" component={Landing} />
          <Route path="/auth" component={AuthPage} />
          <Route path="/pricing" component={Pricing} />
          <Route path="/demo" component={DemoUsers} />
          <Route>
            <Landing />
          </Route>
        </>
      ) : (
        <>
          <Route path="/" component={Home} />
          <Route path="/create" component={CreateDatabase} />
          <Route path="/flashcards" component={SimpleFlashcards} />
          <Route path="/anki-study" component={AnkiStudy} />
          <Route path="/anki-study/:databaseId" component={AnkiStudyPage} />
          <Route path="/pricing" component={Pricing} />
          <Route>
            <div className="min-h-screen flex items-center justify-center">
              <div className="text-center">
                <h1 className="text-2xl font-bold mb-4">Page Not Found</h1>
                <p className="text-muted-foreground">The requested page could not be found.</p>
              </div>
            </div>
          </Route>
        </>
      )}
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="min-h-screen bg-background text-foreground">
          <Toaster />
          <Router />
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
