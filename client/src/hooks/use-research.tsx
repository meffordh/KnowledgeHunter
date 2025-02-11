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
      // Get auth token using the getToken function from useAuth
      const token = await getToken();

      if (!token) {
        throw new Error('Failed to get authentication token');
      }

      // Get the current host and construct WebSocket URL
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws`;
      console.log('Connecting to WebSocket URL:', wsUrl);

      // Create new WebSocket connection
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('WebSocket connection established');
        setIsResearching(true);

        // Send authentication and research data
        ws.send(JSON.stringify({ 
          authorization: `Bearer ${token}`,
          ...research,
          userId: user.id
        }));
      };

      ws.onmessage = (event) => {
        try {
          const progress: ResearchProgress = JSON.parse(event.data);
          setProgress(progress);

          if (progress.status === 'ERROR') {
            // Check for authentication errors
            if (progress.error?.toLowerCase().includes('authentication') || 
                progress.error?.toLowerCase().includes('jwt')) {
              toast({
                title: 'Session Expired',
                description: 'Your session has expired. Please sign in again.',
                variant: 'destructive',
              });
              setLocation('/auth');
            } else {
              toast({
                title: 'Research Error',
                description: progress.error || 'An error occurred during research',
                variant: 'destructive',
              });
            }
            setIsResearching(false);
            ws.close();
          }

          if (progress.status === 'COMPLETED') {
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

      // Handle authentication errors
      if (error instanceof Error && 
          (error.message.includes('authentication') || error.message.includes('jwt'))) {
        toast({
          title: 'Session Expired',
          description: 'Your session has expired. Please sign in again.',
          variant: 'destructive',
        });
        setLocation('/auth');
      } else {
        toast({
          title: 'Connection Error',
          description: 'Failed to setup WebSocket connection',
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