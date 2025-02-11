import { createContext, ReactNode, useContext, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { User } from "@shared/schema";
import { getQueryFn } from "../lib/queryClient";
import { useClerk, useAuth as useClerkAuth } from "@clerk/clerk-react";

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  error: Error | null;
  getToken: () => Promise<string | null>;
};

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { getToken: clerkGetToken } = useClerk();
  const { isLoaded: clerkIsLoaded, isSignedIn, userId } = useClerkAuth();

  console.log('[AuthProvider] Clerk state:', { clerkIsLoaded, isSignedIn, userId });

  const {
    data: user,
    error,
    isLoading,
  } = useQuery<User | null, Error>({
    queryKey: ["/api/auth/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: clerkIsLoaded && isSignedIn && !!userId,
  });

  useEffect(() => {
    console.log('[AuthProvider] User data state:', { 
      user: user ? 'Present' : 'Null',
      error: error?.message,
      isLoading
    });
  }, [user, error, isLoading]);

  const getToken = useCallback(async () => {
    console.log('[getToken] Attempting to get token:', { clerkIsLoaded, isSignedIn, userId });

    try {
      if (!clerkIsLoaded || !isSignedIn || !userId) {
        console.log('[getToken] Not authenticated:', { clerkIsLoaded, isSignedIn, userId });
        return null;
      }
      const token = await clerkGetToken();
      console.log('[getToken] Token retrieved:', token ? 'Present' : 'Null');
      return token;
    } catch (error) {
      console.error('[getToken] Error getting token:', error);
      return null;
    }
  }, [clerkGetToken, clerkIsLoaded, isSignedIn, userId]);

  const contextValue = {
    user: user ?? null,
    isLoading: isLoading || !clerkIsLoaded,
    error,
    getToken
  };

  console.log('[AuthProvider] Providing context:', {
    hasUser: !!contextValue.user,
    isLoading: contextValue.isLoading,
    hasError: !!contextValue.error
  });

  return (
    <AuthContext.Provider value={contextValue}>
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