import { db } from "./db";
import { eq, desc, sql } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";
import { users, researchReports, type User, type InsertUser, type ResearchReport, type InsertResearchReport } from "@shared/schema";
import crypto from 'crypto'; // Added for UUID generation

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  incrementResearchCount(userId: number): Promise<void>;
  getUserResearchCount(userId: number): Promise<number>;
  createResearchReport(report: InsertResearchReport): Promise<ResearchReport>;
  getUserReports(userId: number): Promise<ResearchReport[]>;
  sessionStore: session.Store;
  trackLinkedInShare(userId: string, reportId: string, linkedInPostId: string): Promise<{id:string, userId:string, reportId:string, linkedInPostId:string, sharedAt:Date}>;
  getReportShares(reportId: string): Promise< {id:string, userId:string, reportId:string, linkedInPostId:string, sharedAt:Date}[]>;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;
  private shares: {id:string, userId:string, reportId:string, linkedInPostId:string, sharedAt:Date}[] = []; // In-memory storage for shares - REPLACE WITH DATABASE TABLE

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true,
    });
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [newUser] = await db.insert(users)
      .values(user)
      .returning();
    return newUser;
  }

  async createOrUpdateUser(user: { id: string; email: string; name: string; researchCount: number }): Promise<User> {
    const existingUser = await this.getUser(user.id);
    if (existingUser) {
      const [updatedUser] = await db.update(users)
        .set({ email: user.email, name: user.name })
        .where(eq(users.id, user.id))
        .returning();
      return updatedUser;
    }
    return await this.createUser({
      id: user.id,
      email: user.email,
      name: user.name, 
      researchCount: 0
    });
  }

  async incrementResearchCount(userId: number): Promise<void> {
    await db.execute(
      sql`UPDATE ${users} SET research_count = research_count + 1 WHERE id = ${userId}`
    );
  }

  async getUserResearchCount(userId: number): Promise<number> {
    const [user] = await db.select({ count: users.researchCount })
      .from(users)
      .where(eq(users.id, userId));
    return user?.count || 0;
  }

  async createResearchReport(report: InsertResearchReport): Promise<ResearchReport> {
    const [newReport] = await db.insert(researchReports)
      .values(report)
      .returning();
    return newReport;
  }

  async getUserReports(userId: number): Promise<ResearchReport[]> {
    return await db.select()
      .from(researchReports)
      .where(eq(researchReports.userId, userId))
      .orderBy(desc(researchReports.createdAt));
  }

  async trackLinkedInShare(userId: string, reportId: string, linkedInPostId: string): Promise<{id:string, userId:string, reportId:string, linkedInPostId:string, sharedAt:Date}> {
    const share = {
      id: crypto.randomUUID(),
      userId,
      reportId,
      linkedInPostId,
      sharedAt: new Date()
    };

    this.shares.push(share);
    return share;
  }

  async getReportShares(reportId: string): Promise<{id:string, userId:string, reportId:string, linkedInPostId:string, sharedAt:Date}[]> {
    return this.shares.filter(share => share.reportId === reportId);
  }
}

export const storage = new DatabaseStorage();