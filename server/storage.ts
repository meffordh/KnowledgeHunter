import { db } from "./db";
import { eq, desc, sql } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";
import { users, researchReports, type User, type InsertUser, type ResearchReport, type InsertResearchReport } from "@shared/schema";

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
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true,
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
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
}

export const storage = new DatabaseStorage();