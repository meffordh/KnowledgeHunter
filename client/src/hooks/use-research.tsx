import { createContext, useContext, useCallback, useState } from 'react';
import { Research, ResearchProgress } from '@shared/schema';
import { useToast } from '@/hooks/use-toast';

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

  const startResearch = useCallback((research: Research) => {
    // Close any existing socket connection
    if (socket) {
      socket.close();
    }

    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      ws.send(JSON.stringify(research));
      setIsResearching(true);
    };

    ws.onmessage = (event) => {
      try {
        const progress: ResearchProgress = JSON.parse(event.data);
        setProgress(progress);

        if (progress.status === 'ERROR') {
          toast({
            title: 'Research Error',
            description: progress.error || 'An error occurred during research',
            variant: 'destructive',
          });
          setIsResearching(false);
        }

        if (progress.status === 'COMPLETED') {
          toast({
            title: 'Research Complete',
            description: 'Your research has been completed successfully',
          });
          setIsResearching(false);
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
  }, [toast, socket, isResearching]);

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