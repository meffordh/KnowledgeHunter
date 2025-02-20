import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { SafeMarkdown } from "@/components/ui/safe-markdown";
import { Progress } from "@/components/ui/progress";
import { ResearchProgress, StreamingResearchUpdateType, ResearchFindingType, ResearchMediaUpdateType, ResearchSourceAnalysisType } from "@shared/schema";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useResearch } from "@/hooks/use-research";
import { Badge } from "@/components/ui/badge";

interface ResearchProgressDisplayProps {
  className?: string;
}

export function ResearchProgressDisplay({ className }: ResearchProgressDisplayProps) {
  const { progress, streamingUpdate, isResearching } = useResearch();
  const [updates, setUpdates] = useState<(StreamingResearchUpdateType & { key: string })[]>([]);

  // Keep track of all updates with deduplication
  useEffect(() => {
    if (streamingUpdate) {
      setUpdates(prev => {
        // Create a unique key for the update
        const timestamp = new Date(streamingUpdate.timestamp).getTime();
        const key = `${streamingUpdate.type}-${timestamp}-${Math.random().toString(36).substr(2, 9)}`;
        const newUpdate = { ...streamingUpdate, key };

        // Check if this update is already in the list
        const exists = prev.some(update => 
          update.type === newUpdate.type && 
          update.timestamp === newUpdate.timestamp
        );

        if (exists) return prev;
        return [...prev, newUpdate];
      });
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

  // Filter updates by type
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

          {/* Progress bar and details */}
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Research Progress</span>
                <span className="text-sm text-muted-foreground">{progressPercentage}%</span>
              </div>
              <Progress value={progressPercentage} />
            </div>
            {progress?.visitedUrls && progress.visitedUrls.length > 0 && (
              <div className="text-sm">
                <span className="font-medium">Sources analyzed: </span>
                <span className="text-muted-foreground">{progress.visitedUrls.length}</span>
              </div>
            )}
          </div>

          {/* Show the report when completed */}
          {progress?.status === 'COMPLETED' && progress.report && (
            <div className="mt-6">
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
              {sourceUpdates.map(update => (
                <Card key={update.key} className="mb-4">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <Badge>{(update.data as ResearchSourceAnalysisType).contentType}</Badge>
                      <Progress value={(update.data as ResearchSourceAnalysisType).credibilityScore * 100} className="w-20" />
                    </div>
                    <h3 className="font-medium mb-1">
                      {(update.data as ResearchSourceAnalysisType).title || 'Untitled Source'}
                    </h3>
                    <a 
                      href={(update.data as ResearchSourceAnalysisType).url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm text-blue-500 hover:underline"
                    >
                      View Source
                    </a>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Findings Section */}
          {findingUpdates.length > 0 && (
            <div className="mb-6">
              <h4 className="text-md font-medium mb-3">Findings</h4>
              {findingUpdates.map(update => (
                <Card key={update.key} className="mb-4">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="default">{(update.data as ResearchFindingType).type}</Badge>
                    </div>
                    <SafeMarkdown content={(update.data as ResearchFindingType).content} />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Media Section */}
          {mediaUpdates.length > 0 && (
            <div className="mb-6">
              <h4 className="text-md font-medium mb-3">Media</h4>
              {mediaUpdates.map(update => {
                const mediaData = update.data as ResearchMediaUpdateType;
                return (
                  <Card key={update.key} className="mb-4">
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="default">{mediaData.media.type}</Badge>
                      </div>
                      {mediaData.media.type === 'image' ? (
                        <div className="mt-2">
                          <img 
                            src={mediaData.media.url} 
                            alt={mediaData.media.description || 'Research media'} 
                            className="w-full h-auto rounded-md"
                          />
                          {mediaData.media.description && (
                            <p className="mt-2 text-sm text-muted-foreground">
                              {mediaData.media.description}
                            </p>
                          )}
                        </div>
                      ) : mediaData.media.type === 'video' && (
                        <div className="mt-2">
                          {mediaData.media.embedCode ? (
                            <div 
                              className="aspect-video"
                              dangerouslySetInnerHTML={{ __html: mediaData.media.embedCode }} 
                            />
                          ) : (
                            <div className="aspect-video bg-muted rounded-md flex items-center justify-center">
                              <a 
                                href={mediaData.media.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex flex-col items-center text-muted-foreground hover:text-primary"
                              >
                                <img 
                                  src={`https://img.youtube.com/vi/${mediaData.media.url.split('v=')[1]}/0.jpg`}
                                  alt="Video thumbnail"
                                  className="w-full h-auto rounded-md"
                                />
                                <span className="mt-2">Watch on YouTube</span>
                              </a>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}