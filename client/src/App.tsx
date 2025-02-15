import { QueryClientProvider } from "@tanstack/react-query";
import { Switch, Route, useLocation } from "wouter";
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
import { useClerk } from "@clerk/clerk-react";
import { useEffect } from "react";

function Router() {
  const { user } = useClerk();
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Redirect to home if user is authenticated and on auth page
    if (user && window.location.pathname === '/auth') {
      setLocation('/');
    }
  }, [user, setLocation]);

  return (
    <div className="relative min-h-screen flex flex-col">
      {user && <Navbar />}
      <BaseLayout>
        <Switch>
          <Route path="/auth">
            {() => user ? <HomePage /> : <AuthPage />}
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