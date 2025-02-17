import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { SafeMarkdown } from "@/components/ui/safe-markdown";
import { Progress } from "@/components/ui/progress";
import { ResearchProgress } from "@shared/schema";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface ResearchProgressDisplayProps {
  progress: ResearchProgress | null;
  className?: string;
}

export function ResearchProgressDisplay({ progress, className }: ResearchProgressDisplayProps) {
  if (!progress) return null;

  // Calculate overall progress percentage
  const progressPercentage = progress.status === 'COMPLETED' 
    ? 100 
    : Math.round((progress.progress / progress.totalProgress) * 100);

  // Status text based on current state
  const getStatusText = () => {
    if (progress.status === 'ERROR') return progress.error || 'An error occurred';
    if (progress.status === 'COMPLETED') return 'Research completed successfully!';
    if (!progress.learnings?.length) return 'Searching and extracting information...';
    return 'Processing research findings...';
  };

  // Show progress stages
  const showProgressDetails = () => {
    const batchProgress = progress.batchProgress;
    const confidence = progress.completionConfidence;

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
        {batchProgress && progress.status !== 'COMPLETED' && (
          <div className="text-sm">
            <span className="font-medium">Processing findings: </span>
            <span className="text-muted-foreground">
              Batch {batchProgress.current} of {batchProgress.total}
            </span>
            <Progress 
              value={progress.status === 'COMPLETED' ? 100 : (batchProgress.current / batchProgress.total) * 100}
              className="mt-2"
            />
          </div>
        )}

        {/* Research Confidence */}
        {(confidence !== undefined || progress.status === 'COMPLETED') && (
          <div className="text-sm">
            <span className="font-medium">Research confidence: </span>
            <span className="text-muted-foreground">
              {progress.status === 'COMPLETED' ? '100' : Math.round(confidence * 100)}%
            </span>
          </div>
        )}

        {/* Sources Count */}
        {progress.visitedUrls && progress.visitedUrls.length > 0 && (
          <div className="text-sm">
            <span className="font-medium">Sources analyzed: </span>
            <span className="text-muted-foreground">{progress.visitedUrls.length}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className={cn("my-4", className)}>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-muted-foreground mb-4">
          {progress.status !== 'COMPLETED' && <Loader2 className="h-4 w-4 animate-spin" />}
          <span>{getStatusText()}</span>
        </div>
        {showProgressDetails()}

        {/* Show the report when completed */}
        {progress.status === 'COMPLETED' && progress.report && (
          <div className="mt-6 prose prose-sm max-w-none">
            <SafeMarkdown content={progress.report} />
          </div>
        )}
      </CardContent>
    </Card>
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