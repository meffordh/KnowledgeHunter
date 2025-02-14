import { QueryClientProvider } from "@tanstack/react-query";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/hooks/use-auth";
import { ResearchProvider } from "@/hooks/use-research";
import { ProtectedRoute } from "@/lib/protected-route";
import { BaseLayout } from "@/components/ui/base-layout";
import HomePage from "@/pages/home-page";
import AuthPage from "@/pages/auth-page";
import ResearchHistoryPage from "@/pages/research-history";
import ReportViewPage from "@/pages/report-view";
import NotFound from "@/pages/not-found";
import Navbar from "@/components/navbar";
import { useAuth } from "@/hooks/use-auth";

function Router() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex flex-col">
      {user && <Navbar />}
      <BaseLayout>
        <Switch>
          <Route path="/auth">
            {user ? <HomePage /> : <AuthPage />}
          </Route>
          <ProtectedRoute path="/" component={HomePage} />
          <ProtectedRoute path="/history" component={ResearchHistoryPage} />
          <ProtectedRoute path="/reports/:id" component={ReportViewPage} />
          <Route component={NotFound} />
        </Switch>
      </BaseLayout>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ResearchProvider>
          <Router />
          <Toaster />
        </ResearchProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;