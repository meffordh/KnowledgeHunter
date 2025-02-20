import { createContext, useContext, useCallback, useState } from 'react';
import { Research, ResearchProgress, StreamingResearchUpdateType } from '@shared/schema';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { useLocation } from 'wouter';
import { useClerk } from '@clerk/clerk-react';

type ResearchContextType = {
  startResearch: (research: Research) => void;
  progress: ResearchProgress | null;
  streamingUpdate: StreamingResearchUpdateType | null;
  isResearching: boolean;
};

const ResearchContext = createContext<ResearchContextType | null>(null);

export function ResearchProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [progress, setProgress] = useState<ResearchProgress | null>(null);
  const [streamingUpdate, setStreamingUpdate] = useState<StreamingResearchUpdateType | null>(null);
  const [isResearching, setIsResearching] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { session } = useClerk();
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

    // Close any existing socket connection and clean up state
    if (socket) {
      console.log('Closing existing WebSocket connection');
      socket.close();
      setSocket(null);
    }

    // Reset state at the start of new research
    setProgress(null);
    setStreamingUpdate(null);
    setIsResearching(false);

    try {
      const token = await session?.getToken();
      if (!token) {
        throw new Error('Failed to get authentication token');
      }

      // Get the window location and construct WebSocket URL
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = window.location.host;
      const wsUrl = `${wsProtocol}//${wsHost}/ws`;

      console.log('Connecting to WebSocket URL:', wsUrl);

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('WebSocket connection established');
        setIsResearching(true);

        // Send research request with auth token
        const message = {
          authorization: `Bearer ${token}`,
          ...research,
          userId: user.id
        };
        console.log('Sending research request:', message);
        ws.send(JSON.stringify(message));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Received WebSocket message:', data);

          // Handle streaming updates
          if (data.type && data.data) {
            setStreamingUpdate(data);

            // If it's a progress update, also update the progress state
            if (data.type === 'PROGRESS') {
              setProgress(data.data);

              if (data.data.status === 'ERROR') {
                handleError(data.data.error);
              } else if (data.data.status === 'COMPLETED') {
                handleCompletion(data.data);
              }
            }
          } else {
            // Handle legacy progress updates
            setProgress(data);

            if (data.status === 'ERROR') {
              handleError(data.error);
            } else if (data.status === 'COMPLETED') {
              handleCompletion(data);
            }
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
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
        console.log('WebSocket connection closed', {
          isResearching,
          hasProgress: Boolean(progress),
          progressStatus: progress?.status
        });

        if (isResearching && (!progress || progress.status !== 'COMPLETED')) {
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
      handleError(error instanceof Error ? error.message : 'Unknown error');
    }
  }, [toast, socket, isResearching, user, session, setLocation]);

  const handleError = (errorMessage: string) => {
    if (errorMessage?.toLowerCase().includes('authentication') || 
        errorMessage?.toLowerCase().includes('jwt')) {
      toast({
        title: 'Session Expired',
        description: 'Your session has expired. Please sign in again.',
        variant: 'destructive',
      });
      setLocation('/auth');
    } else {
      toast({
        title: 'Research Error',
        description: errorMessage || 'An error occurred during research',
        variant: 'destructive',
      });
    }
    setIsResearching(false);
  };

  const handleCompletion = (data: ResearchProgress) => {
    console.log('Research completed successfully', {
      hasReport: Boolean(data.report),
      reportLength: data.report?.length || 0
    });

    if (data.report) {
      toast({
        title: 'Research Complete',
        description: 'Your research has been completed successfully',
      });
      setTimeout(() => {
        setIsResearching(false);
      }, 500);
    } else {
      console.warn('Completed status received but no report found');
      toast({
        title: 'Warning',
        description: 'Research completed but no report was generated',
        variant: 'destructive',
      });
    }
  };

  return (
    <ResearchContext.Provider value={{ 
      startResearch, 
      progress, 
      streamingUpdate,
      isResearching 
    }}>
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