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
import { Loader2, Search } from 'lucide-react';

export default function HomePage() {
  const { startResearch, progress, isResearching } = useResearch();
  const form = useForm<Research>({
    resolver: zodResolver(researchSchema),
    defaultValues: {
      query: '',
      breadth: 4,
      depth: 2,
    },
  });

  const onSubmit = (data: Research) => {
    startResearch(data);
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
                  ) : (
                    <>
                      <Search className="mr-2 h-4 w-4" />
                      Start Research
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
                    <Card>
                      <CardContent className="prose prose-sm max-w-none pt-6">
                        <ReactMarkdown>{progress.report}</ReactMarkdown>
                      </CardContent>
                    </Card>
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