import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { SafeMarkdown } from "@/components/ui/safe-markdown";
import { Progress } from "@/components/ui/progress";
import { ResearchProgress, StreamingResearchUpdateType, ResearchFindingType, ResearchMediaUpdateType, ResearchSourceAnalysisType } from "@shared/schema";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { StreamingResearchProgress } from "@/components/StreamingResearchProgress";
import { useResearch } from "@/hooks/use-research";
import {Badge} from "@/components/ui/badge";

interface ResearchProgressDisplayProps {
  className?: string;
}

export function ResearchProgressDisplay({ className }: ResearchProgressDisplayProps) {
  const { progress, streamingUpdate, isResearching } = useResearch();
  const [updates, setUpdates] = useState<StreamingResearchUpdateType[]>([]);

  // Keep track of all updates
  useEffect(() => {
    if (streamingUpdate) {
      setUpdates(prev => [...prev, streamingUpdate]);
    }
  }, [streamingUpdate]);

  if (!progress && !streamingUpdate) return null;

  // Calculate overall progress percentage
  const progressPercentage = progress?.status === 'COMPLETED' 
    ? 100 
    : Math.round((progress?.progress || 0) / (progress?.totalProgress || 1) * 100);

  // Status text based on current state
  const getStatusText = () => {
    if (progress?.status === 'ERROR') return progress.error || 'An error occurred';
    if (progress?.status === 'COMPLETED') return 'Research completed successfully!';
    if (!progress?.learnings?.length) return 'Searching and extracting information...';
    return 'Processing research findings...';
  };

  // Show progress stages
  const showProgressDetails = () => {
    const batchProgress = progress?.batchProgress;
    const confidence = progress?.completionConfidence;

    return (
      <div className="space-y-4">
        {/* Current Stage Status */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Research Progress</span>
            <span className="text-sm text-muted-foreground">{progressPercentage}%</span>
          </div>
          <Progress value={progressPercentage} />
        </div>

        {/* Batch Progress */}
        {batchProgress && progress?.status !== 'COMPLETED' && (
          <div className="text-sm">
            <span className="font-medium">Processing findings: </span>
            <span className="text-muted-foreground">
              Batch {batchProgress.current} of {batchProgress.total}
            </span>
            <Progress 
              value={progress?.status === 'COMPLETED' ? 100 : (batchProgress.current / batchProgress.total) * 100}
              className="mt-2"
            />
          </div>
        )}

        {/* Research Confidence */}
        {(confidence !== undefined || progress?.status === 'COMPLETED') && (
          <div className="text-sm">
            <span className="font-medium">Research confidence: </span>
            <span className="text-muted-foreground">
              {progress?.status === 'COMPLETED' ? '100' : Math.round(confidence * 100)}%
            </span>
          </div>
        )}

        {/* Sources Count */}
        {progress?.visitedUrls && progress.visitedUrls.length > 0 && (
          <div className="text-sm">
            <span className="font-medium">Sources analyzed: </span>
            <span className="text-muted-foreground">{progress.visitedUrls.length}</span>
          </div>
        )}
      </div>
    );
  };

  const renderStreamingContent = (update: StreamingResearchUpdateType) => {
    switch (update.type) {
      case 'FINDING':
        const findingData = update.data.content;
        return (
          <Card key={update.timestamp} className="mb-4">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <Badge variant="default">{update.data.type}</Badge>
                <span className="text-sm text-muted-foreground">
                  {new Date(update.timestamp).toLocaleTimeString()}
                </span>
              </div>
              {typeof findingData === 'string' ? (
                <p className="text-sm">{findingData}</p>
              ) : (
                <div className="text-sm">
                  <h4 className="font-medium">{findingData.title}</h4>
                  <a href={findingData.url} target="_blank" rel="noopener noreferrer" 
                     className="text-blue-500 hover:underline">
                    View Source
                  </a>
                  {findingData.media_analysis && (
                    <p className="mt-2 text-muted-foreground">{findingData.media_analysis}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      case 'MEDIA':
        return (
          <Card key={update.timestamp} className="mb-4">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <Badge variant="default">{update.data.media.type}</Badge>
                <span className="text-sm text-muted-foreground">
                  {new Date(update.timestamp).toLocaleTimeString()}
                </span>
              </div>
              {update.data.media.type === 'image' ? (
                <div className="mt-2">
                  <img 
                    src={update.data.media.url} 
                    alt={update.data.media.description || 'Research media'} 
                    className="w-full h-auto rounded-md"
                  />
                  {update.data.media.description && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {update.data.media.description}
                    </p>
                  )}
                </div>
              ) : update.data.media.type === 'video' && update.data.media.embedCode ? (
                <div className="mt-2">
                  <div 
                    className="aspect-video"
                    dangerouslySetInnerHTML={{ __html: update.data.media.embedCode }} 
                  />
                  {update.data.media.description && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {update.data.media.description}
                    </p>
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      case 'SOURCE':
        return (
          <Card key={update.timestamp} className="mb-4">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <Badge>{update.data.contentType}</Badge>
                <Progress value={update.data.credibilityScore * 100} className="w-20" />
              </div>
              <h3 className="font-medium mb-1">{update.data.title || 'Untitled Source'}</h3>
              <a href={update.data.url} target="_blank" rel="noopener noreferrer" 
                 className="text-sm text-blue-500 hover:underline">
                View Source
              </a>
            </CardContent>
          </Card>
        );
      default:
        return null;
    }
  };

  // Group updates by type
  const findingUpdates = updates.filter(u => u.type === 'FINDING');
  const mediaUpdates = updates.filter(u => u.type === 'MEDIA');
  const sourceUpdates = updates.filter(u => u.type === 'SOURCE');

  return (
    <div className={className}>
      <Card className="my-4">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-muted-foreground mb-4">
            {isResearching && <Loader2 className="h-4 w-4 animate-spin" />}
            <span>{getStatusText()}</span>
          </div>
          {showProgressDetails()}

          {/* Show the report when completed */}
          {progress?.status === 'COMPLETED' && progress.report && (
            <div className="mt-6 prose prose-sm max-w-none">
              <SafeMarkdown content={progress.report} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Live Updates Section */}
      {isResearching && (
        <div className="mt-4">
          <h3 className="text-lg font-semibold mb-4">Live Updates</h3>

          {/* Sources Section */}
          {sourceUpdates.length > 0 && (
            <div className="mb-6">
              <h4 className="text-md font-medium mb-3">Sources</h4>
              {sourceUpdates.map(update => renderStreamingContent(update))}
            </div>
          )}

          {/* Findings Section */}
          {findingUpdates.length > 0 && (
            <div className="mb-6">
              <h4 className="text-md font-medium mb-3">Findings</h4>
              {findingUpdates.map(update => renderStreamingContent(update))}
            </div>
          )}

          {/* Media Section */}
          {mediaUpdates.length > 0 && (
            <div className="mb-6">
              <h4 className="text-md font-medium mb-3">Media</h4>
              {mediaUpdates.map(update => renderStreamingContent(update))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// We can keep the FindingsAccordion component for the history view
interface FindingsAccordionProps {
  findings: {
    title: string;
    content: string;
  }[];
  className?: string;
}

export function FindingsAccordion({ findings, className }: FindingsAccordionProps) {
  return (
    <div className={cn("w-full", className)}>
      {findings.map((finding, index) => (
        <div key={index} className="mb-4">
          <h3 className="text-sm font-medium mb-2">{finding.title}</h3>
          <SafeMarkdown content={finding.content} />
        </div>
      ))}
    </div>
  );
}