import { createContext, ReactNode, useContext, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { User } from "@shared/schema";
import { getQueryFn } from "../lib/queryClient";
import { useClerk, useUser } from "@clerk/clerk-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  error: Error | null;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const { signOut } = useClerk();
  const { user: clerkUser, isLoaded: clerkLoaded, isSignedIn } = useUser();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const {
    data: user,
    error,
    isLoading,
    refetch
  } = useQuery<User | null, Error>({
    queryKey: ["/api/auth/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: clerkLoaded && isSignedIn,
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  useEffect(() => {
    if (clerkLoaded) {
      if (!isSignedIn) {
        // If not signed in and not on auth page, redirect
        if (window.location.pathname !== '/auth') {
          setLocation('/auth');
        }
      } else if (window.location.pathname === '/auth') {
        // If signed in and on auth page, redirect to home
        setLocation('/');
      }
    }
  }, [clerkLoaded, isSignedIn, setLocation]);

  useEffect(() => {
    if (clerkLoaded && isSignedIn && !user && !isLoading) {
      refetch();
    }
  }, [clerkLoaded, isSignedIn, user, isLoading, refetch]);

  const handleSignOut = async () => {
    try {
      await signOut();
      queryClient.setQueryData(["/api/auth/user"], null);
      setLocation('/auth');
    } catch (error) {
      toast({
        title: "Error signing out",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const authValue: AuthContextType = {
    user: user ?? null,
    isLoading: isLoading || !clerkLoaded,
    error,
    signOut: handleSignOut,
  };

  return (
    <AuthContext.Provider value={authValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}