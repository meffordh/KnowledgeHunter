import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { SafeMarkdown } from "@/components/ui/safe-markdown";
import { Progress } from "@/components/ui/progress";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
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
  const progressPercentage = Math.round((progress.progress / progress.totalProgress) * 100);

  // Show progress stages
  const showStageProgress = () => {
    if (!progress.learnings) return null;

    const findingsCount = progress.learnings.length;
    const batchProgress = progress.batchProgress;
    const confidence = progress.completionConfidence;

    return (
      <div className="space-y-4">
        {/* Current Stage Status */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Overall Progress</span>
            <span className="text-sm text-muted-foreground">{progressPercentage}%</span>
          </div>
          <Progress value={progressPercentage} />
        </div>

        {/* Findings Count */}
        {findingsCount > 0 && (
          <div className="text-sm">
            <span className="font-medium">Findings discovered: </span>
            <span className="text-muted-foreground">{findingsCount}</span>
          </div>
        )}

        {/* Batch Progress */}
        {batchProgress && (
          <div className="text-sm">
            <span className="font-medium">Processing findings: </span>
            <span className="text-muted-foreground">
              Batch {batchProgress.current} of {batchProgress.total}
            </span>
            <Progress 
              value={(batchProgress.current / batchProgress.total) * 100}
              className="mt-2"
            />
          </div>
        )}

        {/* Research Confidence */}
        {confidence !== undefined && (
          <div className="text-sm">
            <span className="font-medium">Research confidence: </span>
            <span className="text-muted-foreground">{Math.round(confidence * 100)}%</span>
          </div>
        )}
      </div>
    );
  };

  // Show loading state when no findings yet
  if (progress.learnings.length === 0) {
    return (
      <Card className={cn("my-4", className)}>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Searching and extracting information...</span>
          </div>
          {showStageProgress()}
        </CardContent>
      </Card>
    );
  }

  // Display current findings in a card if there's only one or a few
  if (progress.learnings.length <= 3) {
    return (
      <Card className={cn("my-4", className)}>
        <CardHeader>
          <CardTitle>Current Findings</CardTitle>
        </CardHeader>
        <CardContent>
          {showStageProgress()}
          <div className="mt-4">
            {progress.learnings.map((finding, index) => (
              <div key={index} className="mb-4">
                <SafeMarkdown content={finding} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Use accordion for multiple findings
  return (
    <div className={className}>
      {showStageProgress()}
      <Accordion type="single" collapsible className="w-full mt-4">
        {progress.learnings.map((finding, index) => (
          <AccordionItem key={index} value={`finding-${index}`}>
            <AccordionTrigger>Finding {index + 1}</AccordionTrigger>
            <AccordionContent>
              <SafeMarkdown content={finding} />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

interface FindingsAccordionProps {
  findings: {
    title: string;
    content: string;
  }[];
  className?: string;
}

export function FindingsAccordion({ findings, className }: FindingsAccordionProps) {
  return (
    <Accordion type="single" collapsible className={cn("w-full", className)}>
      {findings.map((finding, index) => (
        <AccordionItem key={index} value={`item-${index}`}>
          <AccordionTrigger>{finding.title}</AccordionTrigger>
          <AccordionContent>
            <SafeMarkdown content={finding.content} />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}