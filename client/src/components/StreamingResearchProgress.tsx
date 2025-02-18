'use client';

import { experimental_useObject as useObject } from '@ai-sdk/react';
import { StreamingResearchUpdateType, ResearchFindingType, ResearchMediaUpdateType, ResearchSourceAnalysisType } from '@shared/schema';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface StreamingResearchProgressProps {
  query: string;
  onComplete?: (data: any) => void;
}

export function StreamingResearchProgress({ query, onComplete }: StreamingResearchProgressProps) {
  const { toast } = useToast();
  const { object, submit, isLoading, error } = useObject<StreamingResearchUpdateType>({
    api: '/api/research/stream',
    schema: 'StreamingResearchUpdate',
  });

  const renderFinding = (finding: ResearchFindingType) => (
    <Card className="p-4 mb-2">
      <div className="flex items-center justify-between mb-2">
        <Badge variant={finding.type === 'FACT' ? 'default' : 'secondary'}>
          {finding.type}
        </Badge>
        <span className="text-sm text-muted-foreground">
          {new Date(finding.timestamp).toLocaleTimeString()}
        </span>
      </div>
      <p className="text-sm">{finding.content}</p>
      {finding.source && (
        <a href={finding.source} target="_blank" rel="noopener noreferrer" 
           className="text-xs text-blue-500 hover:underline mt-2 block">
          Source
        </a>
      )}
    </Card>
  );

  const renderMediaUpdate = (mediaUpdate: ResearchMediaUpdateType) => (
    <Card className="p-4 mb-2">
      <div className="flex items-center justify-between mb-2">
        <Badge variant={mediaUpdate.processingStatus === 'PROCESSED' ? 'default' : 'secondary'}>
          {mediaUpdate.processingStatus}
        </Badge>
        <span className="text-sm text-muted-foreground">
          {new Date(mediaUpdate.extractedAt).toLocaleTimeString()}
        </span>
      </div>
      {mediaUpdate.media.type === 'image' ? (
        <div className="relative aspect-video">
          <img 
            src={mediaUpdate.media.url} 
            alt={mediaUpdate.media.description || 'Research media'} 
            className="object-cover rounded-md"
          />
        </div>
      ) : (
        <div dangerouslySetInnerHTML={{ __html: mediaUpdate.media.embedCode || '' }} />
      )}
    </Card>
  );

  const renderSourceAnalysis = (source: ResearchSourceAnalysisType) => (
    <Card className="p-4 mb-2">
      <div className="flex items-center justify-between mb-2">
        <Badge>{source.contentType}</Badge>
        <div className="flex items-center gap-2">
          <span className="text-sm">Credibility:</span>
          <Progress value={source.credibilityScore * 100} className="w-20" />
        </div>
      </div>
      <h3 className="font-medium mb-1">{source.title || 'Untitled Source'}</h3>
      <a href={source.url} target="_blank" rel="noopener noreferrer" 
         className="text-sm text-blue-500 hover:underline">
        View Source
      </a>
    </Card>
  );

  const renderStreamingUpdate = (update: StreamingResearchUpdateType) => {
    switch (update.type) {
      case 'FINDING':
        return renderFinding(update.data as ResearchFindingType);
      case 'MEDIA':
        return renderMediaUpdate(update.data as ResearchMediaUpdateType);
      case 'SOURCE':
        return renderSourceAnalysis(update.data as ResearchSourceAnalysisType);
      case 'PROGRESS':
        // Progress updates are handled separately in the UI
        return null;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Research Progress</h2>
        {isLoading && <Badge variant="outline">Processing</Badge>}
      </div>

      {error && (
        <Card className="p-4 bg-destructive/10 text-destructive">
          Error: {error.message}
        </Card>
      )}

      <ScrollArea className="h-[600px] rounded-md border p-4">
        {object && renderStreamingUpdate(object)}
      </ScrollArea>

      <div className="flex justify-end">
        <button
          onClick={() => submit({ query })}
          disabled={isLoading}
          className={cn(
            "px-4 py-2 rounded-md bg-primary text-primary-foreground",
            isLoading && "opacity-50 cursor-not-allowed"
          )}
        >
          {isLoading ? "Researching..." : "Start Research"}
        </button>
      </div>
    </div>
  );
}