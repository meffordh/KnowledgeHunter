import { QueryClientProvider } from "@tanstack/react-query";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/hooks/use-auth";
import { ResearchProvider } from "@/hooks/use-research";
import { BaseLayout } from "@/components/ui/base-layout";
import HomePage from "@/pages/home-page";
import AuthPage from "@/pages/auth-page";
import ResearchHistoryPage from "@/pages/research-history";
import ReportViewPage from "@/pages/report-view";
import NotFound from "@/pages/not-found";
import Navbar from "@/components/navbar";
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { useEffect } from "react";

if (!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY) {
  throw new Error("Missing Clerk Publishable Key");
}

function Router() {
  const { isLoaded, userId } = useAuth();
  const [, setLocation] = useLocation();

  console.log('[Router] Auth state:', { isLoaded, userId, currentPath: window.location.pathname });

  useEffect(() => {
    if (isLoaded && userId && window.location.pathname === '/auth') {
      console.log('[Router] Redirecting authenticated user from /auth to /');
      setLocation('/');
    }
  }, [isLoaded, userId, setLocation]);

  if (!isLoaded) {
    console.log('[Router] Clerk still loading...');
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-lg font-semibold">Loading...</h2>
          <p className="text-muted-foreground">Please wait while we initialize the application</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex flex-col">
      {userId && <Navbar />}
      <BaseLayout>
        <Switch>
          <Route path="/auth">
            {() => {
              console.log('[Route /auth]', { userId });
              return userId ? <HomePage /> : <AuthPage />;
            }}
          </Route>
          <Route path="/">
            {() => {
              console.log('[Route /]', { userId });
              return userId ? <HomePage /> : <AuthPage />;
            }}
          </Route>
          <Route path="/history">
            {() => {
              console.log('[Route /history]', { userId });
              return userId ? <ResearchHistoryPage /> : <AuthPage />;
            }}
          </Route>
          <Route path="/reports/:id">
            {(params) => {
              console.log('[Route /reports/:id]', { userId, params });
              return userId ? <ReportViewPage id={params.id} /> : <AuthPage />;
            }}
          </Route>
          <Route>
            {() => {
              console.log('[Route catch-all]');
              return <NotFound />;
            }}
          </Route>
        </Switch>
      </BaseLayout>
    </div>
  );
}

export default function App() {
  console.log('[App] Initializing with Clerk key:', import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ? 'Present' : 'Missing');

  return (
    <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ResearchProvider>
            <Router />
            <Toaster />
          </ResearchProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}