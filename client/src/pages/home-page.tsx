import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { researchSchema, type Research } from '@shared/schema';
import { useResearch } from '@/hooks/use-research';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import ReactMarkdown from 'react-markdown';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Loader2, Search, Copy, Download, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function HomePage() {
  const { startResearch, progress, isResearching } = useResearch();
  const { toast } = useToast();
  const [clarifyingQuestions, setClarifyingQuestions] = useState<Record<string, string>>({});
  const [showQuestions, setShowQuestions] = useState(false);

  const form = useForm<Research>({
    resolver: zodResolver(researchSchema),
    defaultValues: {
      query: '',
      breadth: 4,
      depth: 2,
    },
  });

  const onSubmit = async (data: Research) => {
    if (!showQuestions) {
      // First, get clarifying questions
      try {
        const response = await fetch('/api/clarify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: data.query }),
        });

        if (!response.ok) throw new Error('Failed to get clarifying questions');

        const { questions } = await response.json();
        const questionsObj = questions.reduce((acc: Record<string, string>, q: string) => {
          acc[q] = '';
          return acc;
        }, {});

        setClarifyingQuestions(questionsObj);
        setShowQuestions(true);
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to generate clarifying questions',
          variant: 'destructive',
        });
      }
    } else {
      // Start research with clarifications
      startResearch({
        ...data,
        clarifications: clarifyingQuestions,
      });
      setShowQuestions(false);
    }
  };

  const handleCopyReport = async () => {
    if (progress?.report) {
      try {
        await navigator.clipboard.writeText(progress.report);
        toast({
          title: 'Success',
          description: 'Report copied to clipboard',
        });
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to copy report',
          variant: 'destructive',
        });
      }
    }
  };

  const handleDownloadReport = () => {
    if (progress?.report) {
      const blob = new Blob([progress.report], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'research-report.md';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <Card>
          <CardHeader className="text-2xl font-bold">Deep Research</CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="query"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Research Query</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter your research topic..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {showQuestions && Object.keys(clarifyingQuestions).length > 0 && (
                  <div className="space-y-4">
                    <h3 className="font-medium">Please answer these clarifying questions:</h3>
                    {Object.entries(clarifyingQuestions).map(([question, answer]) => (
                      <div key={question} className="space-y-2">
                        <p className="text-sm font-medium">{question}</p>
                        <Input
                          value={answer}
                          onChange={(e) => setClarifyingQuestions(prev => ({
                            ...prev,
                            [question]: e.target.value
                          }))}
                          placeholder="Your answer..."
                        />
                      </div>
                    ))}
                  </div>
                )}

                {!showQuestions && (
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="breadth"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Breadth (2-10)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={2}
                              max={10}
                              {...field}
                              onChange={e => field.onChange(Number(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="depth"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Depth (1-5)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              max={5}
                              {...field}
                              onChange={e => field.onChange(Number(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isResearching}
                >
                  {isResearching ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Researching...
                    </>
                  ) : showQuestions ? (
                    <>
                      <Search className="mr-2 h-4 w-4" />
                      Start Research
                    </>
                  ) : (
                    <>
                      <Search className="mr-2 h-4 w-4" />
                      Generate Questions
                    </>
                  )}
                </Button>
              </form>
            </Form>

            {progress && (
              <div className="mt-8 space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Progress</span>
                    <span>{Math.round((progress.progress / progress.totalProgress) * 100)}%</span>
                  </div>
                  <Progress value={(progress.progress / progress.totalProgress) * 100} />
                </div>

                {progress.currentQuery && (
                  <div>
                    <h3 className="font-medium">Current Query:</h3>
                    <p className="text-sm text-muted-foreground">{progress.currentQuery}</p>
                  </div>
                )}

                {progress.report && (
                  <div className="mt-8">
                    <div className="flex justify-end gap-2 mb-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopyReport}
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Copy
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadReport}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </Button>
                    </div>
                    <Card>
                      <CardContent className="prose prose-sm max-w-none pt-6">
                        <ReactMarkdown>{progress.report}</ReactMarkdown>
                      </CardContent>
                    </Card>

                    {progress.visitedUrls && progress.visitedUrls.length > 0 && (
                      <div className="mt-4">
                        <h3 className="font-medium mb-2">Sources:</h3>
                        <ul className="space-y-1">
                          {progress.visitedUrls.map((url, index) => (
                            <li key={index} className="flex items-center text-sm">
                              <ExternalLink className="h-4 w-4 mr-2 flex-shrink-0" />
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline truncate"
                              >
                                {url}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {!progress.report && progress.learnings.length > 0 && (
                  <div>
                    <h3 className="font-medium">Learnings:</h3>
                    <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
                      {progress.learnings.map((learning, index) => (
                        <li key={index}>{learning}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}