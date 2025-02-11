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
  const { user, signOut } = useAuth();
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
    setIsResearching(false);

    try {
      const host = window.location.host;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${host}/ws`;
      console.log('Connecting to WebSocket URL:', wsUrl);

      const token = await window.Clerk?.session?.getToken();
      if (!token) {
        throw new Error('Failed to get authentication token');
      }

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('WebSocket connection established');
        setIsResearching(true);

        // Send research request
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
          const progress: ResearchProgress = JSON.parse(event.data);
          console.log('Received progress update:', {
            status: progress.status,
            progress: progress.progress,
            totalProgress: progress.totalProgress,
            hasReport: Boolean(progress.report),
            reportLength: progress.report?.length || 0
          });

          // Store the progress update
          setProgress(progress);

          if (progress.status === 'ERROR') {
            console.error('Research error:', progress.error);
            if (progress.error?.toLowerCase().includes('authentication') || 
                progress.error?.toLowerCase().includes('jwt')) {
              toast({
                title: 'Session Expired',
                description: 'Your session has expired. Please sign in again.',
                variant: 'destructive',
              });
              signOut().then(() => setLocation('/auth'));
            } else {
              toast({
                title: 'Research Error',
                description: progress.error || 'An error occurred during research',
                variant: 'destructive',
              });
            }
            setIsResearching(false);
          }

          if (progress.status === 'COMPLETED') {
            console.log('Research completed successfully', {
              hasReport: Boolean(progress.report),
              reportLength: progress.report?.length || 0
            });

            // Ensure we have a report before showing completion
            if (progress.report) {
              toast({
                title: 'Research Complete',
                description: 'Your research has been completed successfully',
              });
              // Keep researching state true until we're sure report is rendered
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
      if (error instanceof Error && 
          (error.message.includes('authentication') || error.message.includes('jwt'))) {
        toast({
          title: 'Session Expired',
          description: 'Your session has expired. Please sign in again.',
          variant: 'destructive',
        });
        signOut().then(() => setLocation('/auth'));
      } else {
        toast({
          title: 'Connection Error',
          description: 'Failed to setup WebSocket connection',
          variant: 'destructive',
        });
      }
      setIsResearching(false);
    }
  }, [toast, socket, isResearching, user, signOut, setLocation]);

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