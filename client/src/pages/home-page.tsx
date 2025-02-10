import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { researchSchema, type Research } from '@shared/schema';
import { useResearch } from '@/hooks/use-research';
import { Button } from '@/components/ui/button';
import { ShareButton } from '@/components/ui/share-button';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import ReactMarkdown from 'react-markdown';
import { SiGithub } from 'react-icons/si';
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
import { motion, AnimatePresence } from 'framer-motion';

export default function HomePage() {
  const { startResearch, progress, isResearching } = useResearch();
  const { toast } = useToast();
  const [clarifyingQuestions, setClarifyingQuestions] = useState<Record<string, string>>({});
  const [showQuestions, setShowQuestions] = useState(false);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);

  const form = useForm<Research>({
    resolver: zodResolver(researchSchema),
    defaultValues: {
      query: '',
    },
  });

  const onSubmit = async (data: Research) => {
    if (!showQuestions) {
      try {
        setIsGeneratingQuestions(true);
        console.log('Requesting clarifying questions for query:', data.query);
        const response = await fetch('/api/clarify', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ query: data.query }),
        });

        if (!response.ok) {
          throw new Error('Failed to get clarifying questions');
        }

        const responseData = await response.json();
        console.log('Received questions:', responseData.questions);

        if (!Array.isArray(responseData.questions) || responseData.questions.length === 0) {
          throw new Error('Invalid questions format received from server');
        }

        const questionsObj = responseData.questions.reduce((acc: Record<string, string>, question: string) => {
          acc[question] = '';
          return acc;
        }, {});

        setClarifyingQuestions(questionsObj);
        setShowQuestions(true);
      } catch (error) {
        console.error('Error getting clarifying questions:', error);
        toast({
          title: 'Error',
          description: error instanceof Error ? error.message : 'Failed to generate clarifying questions. Please try again.',
          variant: 'destructive',
        });
      } finally {
        setIsGeneratingQuestions(false);
      }
    } else {
      startResearch({
        ...data,
        clarifications: clarifyingQuestions,
      });
      setShowQuestions(false);
      setClarifyingQuestions({});
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
    <div className="min-h-screen flex flex-col">
      <div className="container mx-auto px-4 py-8 flex-grow">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8 space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="space-y-2"
            >
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
                Turn complex topics into
                <br />
                <span className="text-orange-600">actionable insights</span>
              </h1>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Harness AI-powered research to analyze, synthesize, and deliver comprehensive knowledge from multiple sources. Get detailed reports in minutes, not hours.
              </p>
            </motion.div>
          </div>

          <Card className="border-2 transition-all duration-200 hover:border-orange-200">
            <CardContent className="pt-6">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="query"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xl font-medium">What Would You Like to Research?</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Enter your research topic..." 
                            {...field} 
                            className="h-14 text-lg mt-2 transition-all duration-200 focus:scale-[1.01]"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <AnimatePresence>
                    {isGeneratingQuestions && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="flex items-center justify-center gap-2 text-muted-foreground"
                      >
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Generating clarifying questions...</span>
                      </motion.div>
                    )}

                    {showQuestions && Object.keys(clarifyingQuestions).length > 0 && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-4"
                      >
                        <h3 className="text-lg font-semibold mb-4">Please answer these clarifying questions:</h3>
                        <div className="space-y-6">
                          {Object.entries(clarifyingQuestions).map(([question, answer], index) => (
                            <motion.div
                              key={question}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: index * 0.1 }}
                            >
                              <FormItem>
                                <FormLabel className="text-base font-medium text-foreground">
                                  {question}
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    value={answer}
                                    onChange={(e) => setClarifyingQuestions(prev => ({
                                      ...prev,
                                      [question]: e.target.value
                                    }))}
                                    placeholder="Type your answer here..."
                                    className="mt-2"
                                  />
                                </FormControl>
                              </FormItem>
                            </motion.div>
                          ))}
                        </div>
                        <div className="text-sm text-muted-foreground mt-4">
                          Providing detailed answers will help us generate more accurate research results.
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <Button
                    type="submit"
                    className="w-full h-12 text-lg"
                    disabled={isResearching || isGeneratingQuestions}
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
                    ) : isGeneratingQuestions ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating Questions...
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
                      <Card className="mt-4">
                        <CardContent className="prose dark:prose-invert max-w-none py-4">
                          <div className="flex justify-end mb-4">
                            <ShareButton 
                              content={`Check out my research on: ${form.getValues().query}`} 
                              url={window.location.href}
                              // Remove reportId prop since it's not in the progress type
                            />
                          </div>
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

      <footer className="w-full border-t mt-8">
        <div className="container mx-auto px-4 py-6">
          <div className="flex justify-center items-center gap-2">
            <a
              href="https://github.com/meffordh/KnowledgeHunter"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <SiGithub className="h-5 w-5" />
              <span>View on GitHub</span>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}