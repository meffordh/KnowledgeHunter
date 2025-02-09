import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { CitationStyle, ExportFormat, Metadata } from "@shared/schema";

const customizationSchema = z.object({
  templateId: z.number(),
  citationStyle: z.enum(['APA', 'MLA', 'Chicago', 'Harvard', 'Vancouver']),
  metadata: z.object({
    includeAuthor: z.boolean(),
    includeDate: z.boolean(),
    includeKeywords: z.boolean(),
    customNotes: z.string().optional(),
  }),
  exportFormat: z.enum(['PDF', 'DOCX', 'HTML']),
});

type CustomizationFormData = z.infer<typeof customizationSchema>;

interface ReportCustomizerProps {
  reportId: number;
  onComplete?: () => void;
}

export function ReportCustomizer({ reportId, onComplete }: ReportCustomizerProps) {
  const queryClient = useQueryClient();

  const { data: templates = [] } = useQuery({
    queryKey: ['/api/report-templates'],
    queryFn: () => apiRequest('/api/report-templates').then(res => res.json()),
  });

  const form = useForm<CustomizationFormData>({
    resolver: zodResolver(customizationSchema),
    defaultValues: {
      citationStyle: 'APA',
      metadata: {
        includeAuthor: true,
        includeDate: true,
        includeKeywords: true,
        customNotes: '',
      },
      exportFormat: 'PDF',
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: CustomizationFormData) =>
      apiRequest(`/api/reports/${reportId}/customize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      }).then(res => res.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/reports/${reportId}`] });
      onComplete?.();
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-6">
        <FormField
          control={form.control}
          name="templateId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Report Template</FormLabel>
              <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value?.toString()}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a template" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {templates?.map((template) => (
                    <SelectItem key={template.id} value={template.id.toString()}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                Choose a template that best fits your research report style
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="citationStyle"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Citation Style</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select citation style" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="APA">APA</SelectItem>
                  <SelectItem value="MLA">MLA</SelectItem>
                  <SelectItem value="Chicago">Chicago</SelectItem>
                  <SelectItem value="Harvard">Harvard</SelectItem>
                  <SelectItem value="Vancouver">Vancouver</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                Choose how references should be cited in your report
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="metadata.includeAuthor"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">Include Author</FormLabel>
                  <FormDescription>
                    Display author information in the report
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="metadata.includeDate"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">Include Date</FormLabel>
                  <FormDescription>
                    Show the report generation date
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="metadata.includeKeywords"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">Include Keywords</FormLabel>
                  <FormDescription>
                    Display relevant keywords and topics
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="metadata.customNotes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Custom Notes</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Add any additional notes or comments"
                    className="resize-none"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Optional notes to include in the report
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="exportFormat"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Export Format</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select export format" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="PDF">PDF</SelectItem>
                  <SelectItem value="DOCX">DOCX</SelectItem>
                  <SelectItem value="HTML">HTML</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                Choose the format for downloading your report
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving..." : "Save Customization"}
        </Button>
      </form>
    </Form>
  );
}