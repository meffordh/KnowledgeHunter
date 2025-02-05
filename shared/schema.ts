import { pgTable, text, serial, integer, boolean, timestamp, foreignKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  researchCount: integer("research_count").notNull().default(0),
});

export const researchReports = pgTable("research_reports", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  query: text("query").notNull(),
  report: text("report").notNull(),
  visitedUrls: text("visited_urls").array(),
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

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertResearchReport = z.infer<typeof insertResearchReportSchema>;
export type ResearchReport = typeof researchReports.$inferSelect;
export type Research = z.infer<typeof researchSchema>;
export type ResearchProgress = z.infer<typeof researchProgressSchema>;