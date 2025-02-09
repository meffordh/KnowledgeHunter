import { pgTable, text, serial, integer, boolean, timestamp, foreignKey, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text('name'),
  researchCount: integer("research_count").notNull().default(0),
});

export const researchReports = pgTable("research_reports", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  query: text("query").notNull(),
  report: text("report").notNull(),
  visitedUrls: text("visited_urls").array(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const linkedinShares = pgTable("linkedin_shares", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  reportId: integer("report_id").references(() => researchReports.id),
  linkedinPostId: text("linkedin_post_id").notNull(),
  sharedAt: timestamp("shared_at").defaultNow(),
});

export const reportTemplates = pgTable("report_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  template: text("template").notNull(),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const reportCustomizations = pgTable("report_customizations", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").references(() => researchReports.id),
  templateId: integer("template_id").references(() => reportTemplates.id),
  citationStyle: text("citation_style").notNull().default('APA'),
  metadata: jsonb("metadata").$type<{
    includeAuthor: boolean;
    includeDate: boolean;
    includeKeywords: boolean;
    customNotes: string;
  }>(),
  exportFormat: text("export_format").notNull().default('PDF'),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  researchCount: true,
});

export const insertResearchReportSchema = createInsertSchema(researchReports).omit({
  id: true,
  createdAt: true,
});

export const insertLinkedinShareSchema = createInsertSchema(linkedinShares).omit({
  id: true,
  sharedAt: true,
});

export const insertReportTemplateSchema = createInsertSchema(reportTemplates).omit({
  id: true,
  createdAt: true,
});

export const insertReportCustomizationSchema = createInsertSchema(reportCustomizations).omit({
  id: true,
  createdAt: true,
});

export const citationStyleSchema = z.enum(['APA', 'MLA', 'Chicago', 'Harvard', 'Vancouver']);
export const exportFormatSchema = z.enum(['PDF', 'DOCX', 'HTML']);

export const metadataSchema = z.object({
  includeAuthor: z.boolean().default(true),
  includeDate: z.boolean().default(true),
  includeKeywords: z.boolean().default(true),
  customNotes: z.string().optional(),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertResearchReport = z.infer<typeof insertResearchReportSchema>;
export type ResearchReport = typeof researchReports.$inferSelect;
export type Research = z.infer<typeof researchSchema>;
export type ResearchProgress = z.infer<typeof researchProgressSchema>;
export type InsertLinkedinShare = z.infer<typeof insertLinkedinShareSchema>;
export type LinkedinShare = typeof linkedinShares.$inferSelect;

export type ReportTemplate = typeof reportTemplates.$inferSelect;
export type InsertReportTemplate = z.infer<typeof insertReportTemplateSchema>;
export type ReportCustomization = typeof reportCustomizations.$inferSelect;
export type InsertReportCustomization = z.infer<typeof insertReportCustomizationSchema>;
export type CitationStyle = z.infer<typeof citationStyleSchema>;
export type ExportFormat = z.infer<typeof exportFormatSchema>;
export type Metadata = z.infer<typeof metadataSchema>;

export const researchSchema = z.object({
  query: z.string().min(1, "Query is required"),
  breadth: z.number().min(2).max(10),
  depth: z.number().min(1).max(5),
  clarifications: z.record(z.string(), z.string()).optional(),
});

export const researchProgressSchema = z.object({
  status: z.enum(['WAITING', 'IN_PROGRESS', 'COMPLETED', 'ERROR']),
  currentQuery: z.string().optional(),
  learnings: z.array(z.string()),
  progress: z.number(),
  totalProgress: z.number(),
  error: z.string().optional(),
  report: z.string().optional(),
  visitedUrls: z.array(z.string())
});