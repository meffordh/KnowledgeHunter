import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { ResearchReport } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Download } from "lucide-react";
import { format } from "date-fns";

export default function ResearchHistoryPage() {
  const { user } = useAuth();

  const { data: reports, isLoading } = useQuery<ResearchReport[]>({
    queryKey: ["/api/research/history"],
    enabled: !!user,
    staleTime: 0, // Always fetch fresh data
    cacheTime: 0, // Don't cache the data
    retry: 3,
    retryDelay: 1000,
    onError: (error) => {
      console.error('Error fetching research history:', error);
    },
  });

  const downloadReport = (report: ResearchReport) => {
    const blob = new Blob([report.report], { type: 'text/markdown' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `research-${format(new Date(report.createdAt || ''), 'yyyy-MM-dd-HH-mm')}.md`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  console.log('Rendering research history with:', reports?.length, 'reports');

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Research History</h1>
      <div className="grid gap-4">
        {reports && reports.length > 0 ? (
          reports.map((report) => (
            <Card key={report.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="text-lg font-semibold">{report.query}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => downloadReport(report)}
                    title="Download Report"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(report.createdAt || ''), 'PPpp')}
                </p>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none">
                  {report.report.slice(0, 200)}...
                </div>
                {report.visitedUrls && report.visitedUrls.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-medium">Sources: {report.visitedUrls.length}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        ) : (
          <p className="text-center text-muted-foreground">
            No research reports found. Start a new research to see it here!
          </p>
        )}
      </div>
    </div>
  );
}