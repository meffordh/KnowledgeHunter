import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ResearchReport } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ReportCustomizer } from "@/components/ReportCustomizer";
import { Loader2 } from "lucide-react";
import { SafeMarkdown } from "@/components/ui/safe-markdown";

export default function ReportViewPage() {
  const [location] = useLocation();
  const reportId = parseInt(location.split('/').pop() || '0');

  const { data: report, isLoading } = useQuery<ResearchReport>({
    queryKey: [`/api/reports/${reportId}`],
    enabled: !!reportId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="container mx-auto py-8">
        <p className="text-center text-muted-foreground">Report not found.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">{report.query}</h1>

      <div className="grid gap-6 md:grid-cols-[2fr,1fr]">
        <Card>
          <CardContent className="p-6">
            <div className="prose prose-slate dark:prose-invert max-w-none">
              <SafeMarkdown content={report.report} />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold mb-4">Customize Report</h2>
              <ReportCustomizer reportId={report.id} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}