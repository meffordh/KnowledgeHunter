import { pgTable, text, serial, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const researchSchema = z.object({
  query: z.string().min(1, "Query is required"),
  breadth: z.number().min(2).max(10),
  depth: z.number().min(1).max(5),
});

export type Research = z.infer<typeof researchSchema>;

export const researchProgressSchema = z.object({
  status: z.enum(['WAITING', 'IN_PROGRESS', 'COMPLETED', 'ERROR']),
  currentQuery: z.string().optional(),
  learnings: z.array(z.string()),
  progress: z.number(),
  totalProgress: z.number(),
  error: z.string().optional()
});

export type ResearchProgress = z.infer<typeof researchProgressSchema>;
