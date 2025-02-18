import { pgTable, text, serial, integer, boolean, timestamp, foreignKey, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Previous table definitions remain unchanged
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

// Previous schema type exports remain unchanged
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

// New: Add MediaContent schema
export const mediaContentSchema = z.object({
  type: z.enum(['video', 'image']),
  url: z.string().url(),
  title: z.string().optional(),
  description: z.string().optional(),
  embedCode: z.string().optional(),
});

// Add new types for metadata
export interface ResearchMetadata {
  title?: string;
  description?: string;
  ogImage?: string;
  url: string;
}

export interface StructuredContent {
  relevant_content: string;
  relevant_images: string[];
}

// Define researchProgressSchema before it's used
export const researchProgressSchema = z.object({
  status: z.enum(['WAITING', 'IN_PROGRESS', 'COMPLETED', 'ERROR']),
  currentQuery: z.string().optional(),
  learnings: z.array(z.string()),
  progress: z.number(),
  totalProgress: z.number(),
  error: z.string().optional(),
  report: z.string().optional(),
  visitedUrls: z.array(z.string()),
  media: z.array(mediaContentSchema),
  metadata: z.array(z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    ogImage: z.string().optional(),
    url: z.string(),
  })).optional(),
});

// New: Add streaming object schemas
export const ResearchFinding = z.object({
  content: z.string(),
  source: z.string().url().optional(),
  confidence: z.number().min(0).max(1),
  type: z.enum(['FACT', 'INFERENCE', 'QUOTE']),
  timestamp: z.string().datetime(),
});

export const ResearchMediaUpdate = z.object({
  media: mediaContentSchema,
  processingStatus: z.enum(['PENDING', 'PROCESSED', 'FAILED']),
  relevanceScore: z.number().min(0).max(1),
  extractedAt: z.string().datetime(),
});

export const ResearchSourceAnalysis = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  credibilityScore: z.number().min(0).max(1),
  contentType: z.enum(['ARTICLE', 'STUDY', 'NEWS', 'BLOG', 'OTHER']),
  analysisDate: z.string().datetime(),
});

export const StreamingResearchUpdate = z.object({
  type: z.enum(['FINDING', 'MEDIA', 'SOURCE', 'PROGRESS']),
  data: z.union([
    ResearchFinding,
    ResearchMediaUpdate,
    ResearchSourceAnalysis,
    researchProgressSchema,
  ]),
  timestamp: z.string().datetime(),
});

// Add types for the new schemas
export type ResearchFindingType = z.infer<typeof ResearchFinding>;
export type ResearchMediaUpdateType = z.infer<typeof ResearchMediaUpdate>;
export type ResearchSourceAnalysisType = z.infer<typeof ResearchSourceAnalysis>;
export type StreamingResearchUpdateType = z.infer<typeof StreamingResearchUpdate>;
export type ResearchProgressType = z.infer<typeof researchProgressSchema>;

export const researchSchema = z.object({
  query: z.string().min(1, "Query is required"),
  clarifications: z.record(z.string(), z.string()).optional(),
  fastMode: z.boolean().optional().default(false),
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
export type MediaContent = z.infer<typeof mediaContentSchema>;