import { createContext, useContext, useCallback, useState } from 'react';
import { Research, ResearchProgress } from '@shared/schema';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { useLocation } from 'wouter';

type ResearchContextType = {
  startResearch: (research: Research) => void;
  progress: ResearchProgress | null;
  isResearching: boolean;
};

const ResearchContext = createContext<ResearchContextType | null>(null);

export function ResearchProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [progress, setProgress] = useState<ResearchProgress | null>(null);
  const [isResearching, setIsResearching] = useState(false);
  const { toast } = useToast();
  const { user, getToken } = useAuth();
  const [, setLocation] = useLocation();

  const startResearch = useCallback(async (research: Research) => {
    console.log('[ResearchProvider] Starting research', { 
      hasUser: !!user, 
      research 
    });

    if (!user) {
      console.log('[ResearchProvider] No user found, redirecting to auth');
      toast({
        title: 'Authentication Required',
        description: 'Please log in to start research.',
        variant: 'destructive',
      });
      setLocation('/auth');
      return;
    }

    // Close any existing socket connection
    if (socket) {
      console.log('[ResearchProvider] Closing existing socket connection');
      socket.close();
    }

    try {
      // Get auth token
      console.log('[ResearchProvider] Getting authentication token');
      const token = await getToken();

      if (!token) {
        console.error('[ResearchProvider] Failed to get authentication token');
        throw new Error('Authentication failed. Please try logging in again.');
      }

      console.log('[ResearchProvider] Successfully got authentication token');

      // Get the current host and construct WebSocket URL
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = window.location.host;
      const wsUrl = `${wsProtocol}//${wsHost}/ws`;

      console.log('[ResearchProvider] Connecting to WebSocket:', wsUrl);

      // Create new WebSocket connection
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[WebSocket] Connection established');
        setIsResearching(true);

        // Send authentication token first
        const authMessage = JSON.stringify({ authorization: `Bearer ${token}` });
        console.log('[WebSocket] Sending auth message');
        ws.send(authMessage);

        // Then send research data
        const researchMessage = JSON.stringify({ 
          userId: user.id,
          ...research
        });
        console.log('[WebSocket] Sending research message');
        ws.send(researchMessage);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[WebSocket] Received message:', data);

          setProgress(data);

          if (data.status === 'ERROR') {
            if (data.error?.toLowerCase().includes('authentication') || 
                data.error?.toLowerCase().includes('jwt')) {
              console.log('[WebSocket] Authentication error:', data.error);
              toast({
                title: 'Session Expired',
                description: 'Your session has expired. Please sign in again.',
                variant: 'destructive',
              });
              setLocation('/auth');
            } else {
              console.log('[WebSocket] Research error:', data.error);
              toast({
                title: 'Research Error',
                description: data.error || 'An error occurred during research',
                variant: 'destructive',
              });
            }
            setIsResearching(false);
            ws.close();
          }

          if (data.status === 'COMPLETED') {
            console.log('[WebSocket] Research completed');
            toast({
              title: 'Research Complete',
              description: 'Your research has been completed successfully',
            });
            setIsResearching(false);
            ws.close();
          }
        } catch (error) {
          console.error('[WebSocket] Error parsing message:', error);
          toast({
            title: 'Error',
            description: 'Failed to process research update',
            variant: 'destructive',
          });
        }
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Connection error:', error);
        toast({
          title: 'Connection Error',
          description: 'Failed to connect to research service',
          variant: 'destructive',
        });
        setIsResearching(false);
      };

      ws.onclose = () => {
        console.log('[WebSocket] Connection closed');
        if (isResearching) {
          toast({
            title: 'Connection Lost',
            description: 'Lost connection to research service',
            variant: 'destructive',
          });
          setIsResearching(false);
        }
      };

      setSocket(ws);
    } catch (error) {
      console.error('[ResearchProvider] Error setting up WebSocket:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to setup connection';

      if (errorMessage.toLowerCase().includes('authentication')) {
        toast({
          title: 'Authentication Error',
          description: 'Please sign in again to continue',
          variant: 'destructive',
        });
        setLocation('/auth');
      } else {
        toast({
          title: 'Connection Error',
          description: errorMessage,
          variant: 'destructive',
        });
      }
      setIsResearching(false);
    }
  }, [toast, socket, isResearching, user, getToken, setLocation]);

  return (
    <ResearchContext.Provider value={{ startResearch, progress, isResearching }}>
      {children}
    </ResearchContext.Provider>
  );
}

export function useResearch() {
  const context = useContext(ResearchContext);
  if (!context) {
    throw new Error('useResearch must be used within a ResearchProvider');
  }
  return context;
}