import { QueryClientProvider } from "@tanstack/react-query";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/hooks/use-auth";
import { ResearchProvider } from "@/hooks/use-research";
import { ProtectedRoute } from "@/lib/protected-route";
import HomePage from "@/pages/home-page";
import AuthPage from "@/pages/auth-page";
import ResearchHistoryPage from "@/pages/research-history";
import ReportViewPage from "@/pages/report-view";
import NotFound from "@/pages/not-found";
import Navbar from "@/components/navbar";

function Router() {
  return (
    <div>
      <Navbar />
      <Switch>
        <ProtectedRoute path="/" component={HomePage} />
        <ProtectedRoute path="/history" component={ResearchHistoryPage} />
        <ProtectedRoute path="/reports/:id" component={ReportViewPage} />
        <Route path="/auth" component={AuthPage} />
        <Route component={NotFound} />
      </Switch>
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