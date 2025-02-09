import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ReportTemplate } from "@shared/schema";


const customizationSchema = z.object({
  templateId: z.number({
    required_error: "Please select a template",
    invalid_type_error: "Please select a valid template",
  }),
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
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: templates, isLoading: loadingTemplates } = useQuery<ReportTemplate[]>({
    queryKey: ['/api/report-templates'],
    queryFn: async () => {
      const response = await fetch('/api/report-templates');
      if (!response.ok) throw new Error('Failed to fetch templates');
      return response.json();
    },
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
    mutationFn: async (data: CustomizationFormData) => {
      const response = await fetch(`/api/reports/${reportId}/customize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error('Failed to save customization');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/reports/${reportId}`] });
      toast({
        title: "Success",
        description: "Report customization saved successfully",
      });
      onComplete?.();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save customization",
        variant: "destructive",
      });
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
              <Select 
                onValueChange={(value) => field.onChange(parseInt(value))} 
                value={field.value?.toString()}
                disabled={loadingTemplates}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingTemplates ? "Loading..." : "Select a template"} />
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
        <Button 
          type="submit" 
          className="w-full" 
          disabled={mutation.isPending || !form.formState.isValid}
        >
          {mutation.isPending ? "Saving..." : "Save Customization"}
        </Button>
      </form>
    </Form>
  );
}