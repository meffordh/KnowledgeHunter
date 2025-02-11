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
    if (!user) {
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
      socket.close();
    }

    try {
      // Get auth token
      const token = await getToken();

      if (!token) {
        console.error('Failed to get authentication token');
        throw new Error('Authentication failed. Please try logging in again.');
      }

      // Get the current host
      const host = window.location.host;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${host}/ws`;

      console.log('Connecting to WebSocket URL:', wsUrl);

      // Create new WebSocket connection
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('WebSocket connection established');
        setIsResearching(true);

        // Send authentication token first
        ws.send(JSON.stringify({ authorization: `Bearer ${token}` }));

        // Then send research data
        ws.send(JSON.stringify({ 
          userId: user.id,
          ...research
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Received WebSocket message:', data);

          setProgress(data);

          if (data.status === 'ERROR') {
            if (data.error?.toLowerCase().includes('authentication') || 
                data.error?.toLowerCase().includes('jwt')) {
              toast({
                title: 'Session Expired',
                description: 'Your session has expired. Please sign in again.',
                variant: 'destructive',
              });
              setLocation('/auth');
            } else {
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
            toast({
              title: 'Research Complete',
              description: 'Your research has been completed successfully',
            });
            setIsResearching(false);
            ws.close();
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
          toast({
            title: 'Error',
            description: 'Failed to process research update',
            variant: 'destructive',
          });
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        toast({
          title: 'Connection Error',
          description: 'Failed to connect to research service',
          variant: 'destructive',
        });
        setIsResearching(false);
      };

      ws.onclose = () => {
        console.log('WebSocket connection closed');
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
      console.error('Error setting up WebSocket:', error);
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