import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { SafeMarkdown } from "@/components/ui/safe-markdown";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { ResearchProgress } from "@shared/schema";
import { cn } from "@/lib/utils";

interface ResearchProgressDisplayProps {
  progress: ResearchProgress | null;
  className?: string;
}

export function ResearchProgressDisplay({ progress, className }: ResearchProgressDisplayProps) {
  if (!progress) return null;

  // Display current findings in a card if there's only one or a few
  if (progress.learnings.length <= 3) {
    return (
      <Card className={cn("my-4", className)}>
        <CardHeader>
          <CardTitle>Current Findings</CardTitle>
        </CardHeader>
        <CardContent>
          {progress.learnings.map((finding, index) => (
            <div key={index} className="mb-4">
              <SafeMarkdown content={finding} />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  // Use accordion for multiple findings
  return (
    <Accordion type="single" collapsible className={cn("w-full", className)}>
      {progress.learnings.map((finding, index) => (
        <AccordionItem key={index} value={`finding-${index}`}>
          <AccordionTrigger>Finding {index + 1}</AccordionTrigger>
          <AccordionContent>
            <SafeMarkdown content={finding} />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
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
