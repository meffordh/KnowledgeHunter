import OpenAI from "openai";
import { z } from "zod";
import FirecrawlApp from "@mendable/firecrawl-js";
import { WebSocket } from "ws";
import { Research, ResearchProgress } from "@shared/schema";
import { encodingForModel } from "js-tiktoken";

// Initialize API clients using environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
if (!OPENAI_API_KEY || !FIRECRAWL_API_KEY) {
  throw new Error(
    "Missing required API keys. Please set OPENAI_API_KEY and FIRECRAWL_API_KEY in Secrets.",
  );
}

// Use models that support json_schema structured outputs
const MODEL_CONFIG = {
  BALANCED: "gpt-4o-2024-08-06", // Supported for Structured Outputs (8K window, but actual context up to 128K tokens)
  DEEP: "o3-mini-2025-01-31", // For deep reasoning tasks with large context window
} as const;

// Utility function to trim text based on the token limit of the selected model.
function trimPrompt(text: string, model: string): string {
  try {
    let maxTokens = 8000; // default fallback

    // Adjust token limits per model.
    // (BALANCED: 16K tokens allowed; DEEP: 128K tokens allowed)
    switch (model) {
      case MODEL_CONFIG.DEEP:
        maxTokens = 128000;
        break;
      case MODEL_CONFIG.BALANCED:
      default:
        maxTokens = 16000;
        break;
    }
    const enc = encodingForModel(model === MODEL_CONFIG.DEEP ? "gpt-4" : model);
    const tokens = enc.encode(text);
    if (tokens.length <= maxTokens) return text;

    // Split text into chunks on sentence boundaries.
    const chunks: string[] = [];
    let currentChunk = "";
    const sentences = text.split(/(?<=[.!?])\s+/);
    for (const sentence of sentences) {
      const potentialChunk = currentChunk + sentence;
      const chunkTokens = enc.encode(potentialChunk).length;
      if (chunkTokens <= maxTokens) {
        currentChunk = potentialChunk;
      } else if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = sentence;
      } else {
        // If a single sentence exceeds the limit, split it by words.
        const words = sentence.split(/\s+/);
        for (const word of words) {
          if (enc.encode(currentChunk + word).length <= maxTokens) {
            currentChunk += (currentChunk ? " " : "") + word;
          } else if (currentChunk) {
            chunks.push(currentChunk);
            currentChunk = word;
          }
        }
      }
    }
    if (currentChunk) chunks.push(currentChunk);
    // Return the first chunk that fits.
    return chunks[0] || text.slice(0, Math.floor(maxTokens / 4));
  } catch (error) {
    console.error("Error trimming prompt:", error);
    return text;
  }
}

// -----------------------
// Parameter Determination
// -----------------------
// Use the BALANCED model to determine research parameters.
// The response is forced to strictly adhere to the JSON schema.
async function determineResearchParameters(
  query: string,
): Promise<{ breadth: number; depth: number }> {
  try {
    const trimmedQuery = trimPrompt(query, MODEL_CONFIG.BALANCED);
    const response = await openai.chat.completions.create({
      model: MODEL_CONFIG.BALANCED,
      messages: [
        {
          role: "system",
          content:
            "You are an expert at determining optimal research parameters. Analyze the query's complexity and scope to suggest appropriate breadth (2-10) and depth (1-5) values.",
        },
        {
          role: "user",
          content: `Given this research query: "${trimmedQuery}", determine optimal research settings. Consider:
1. Query complexity and scope
2. Need for diverse sources (affects breadth)
3. Need for detailed exploration (affects depth)
Respond strictly in JSON format with keys "breadth" and "depth".`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "research_parameters",
          strict: true,
          schema: {
            type: "object",
            properties: {
              breadth: { type: "number" },
              depth: { type: "number" },
            },
            required: ["breadth", "depth"],
            additionalProperties: false,
          },
        },
      },
    });
    const content = response.choices[0]?.message?.content;
    // Defensive check: ensure response looks like JSON.
    if (!content || !content.trim().startsWith("{")) {
      console.log(
        "Invalid AI response for parameter determination, using defaults",
      );
      return { breadth: 4, depth: 2 };
    }
    const params = JSON.parse(content);
    return {
      breadth: Math.min(Math.max(Math.round(params.breadth), 2), 10),
      depth: Math.min(Math.max(Math.round(params.depth), 1), 5),
    };
  } catch (error) {
    console.error("Error determining research parameters:", error);
    return { breadth: 4, depth: 2 };
  }
}

// -------------------------------
// Clarifying Questions Generation
// -------------------------------
// Use the BALANCED model with json_schema structured outputs to generate clarifying questions.
async function generateClarifyingQuestions(query: string): Promise<string[]> {
  try {
    const trimmedQuery = trimPrompt(query, MODEL_CONFIG.BALANCED);
    const response = await openai.chat.completions.create({
      model: MODEL_CONFIG.BALANCED,
      messages: [
        {
          role: "system",
          content:
            "You are a research assistant tasked with generating clarifying questions to refine research queries. Output must strictly adhere to the provided JSON schema with no extra commentary or HTML.",
        },
        {
          role: "user",
          content: `Generate clarifying questions for this research query: "${trimmedQuery}"`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "clarifying_questions",
          strict: true,
          schema: {
            type: "object",
            properties: {
              questions: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: ["questions"],
            additionalProperties: false,
          },
        },
      },
      max_tokens: 1500,
    });
    const content = response.choices[0]?.message?.content;
    if (!content || !content.trim().startsWith("{")) {
      console.error("Invalid response from OpenAI:", response);
      return ["What specific aspects of this topic interest you the most?"];
    }
    const parsedResponse = JSON.parse(content);
    if (
      !Array.isArray(parsedResponse.questions) ||
      parsedResponse.questions.length === 0
    ) {
      console.error("Invalid questions format in response:", parsedResponse);
      return ["What specific aspects of this topic interest you the most?"];
    }
    return parsedResponse.questions.slice(0, 3);
  } catch (error) {
    console.error("Error generating clarifying questions:", error);
    return ["What specific aspects of this topic interest you the most?"];
  }
}

// --------------------------
// Report Structure Determination
// --------------------------
// Use the BALANCED model to generate multiple candidate report structures.
// In this refactor we instruct the model to return three candidates separated by "###"
// and then select the candidate with the most sections.
async function determineReportStructure(
  query: string,
  learnings: string[],
): Promise<string> {
  try {
    const trimmedQuery = trimPrompt(query, MODEL_CONFIG.BALANCED);
    const trimmedLearnings = learnings
      .map((l) => l.slice(0, 100))
      .join("\n")
      .slice(0, 500);
    const response = await openai.chat.completions.create({
      model: MODEL_CONFIG.BALANCED,
      messages: [
        {
          role: "system",
          content:
            "You are an expert at determining optimal research report structures. Analyze the query and sample findings to suggest three candidate structures (as lists of section headings), separated by '###'. Then, choose the best candidate and return only that structure.",
        },
        {
          role: "user",
          content: `Given this research query: "${trimmedQuery}" and sample findings:\n${trimmedLearnings}\n\nGenerate 3 report structure candidates. Separate each candidate with "###".`,
        },
      ],
      temperature: 0.7,
    });
    const content = response.choices[0]?.message?.content;
    if (!content) {
      return "Executive Summary\nKey Findings\nDetailed Analysis\nConclusion\nSources";
    }
    const candidates = content
      .split("###")
      .map((c) => c.trim())
      .filter((c) => c);
    if (candidates.length === 0) {
      return "Executive Summary\nKey Findings\nDetailed Analysis\nConclusion\nSources";
    }
    // Select candidate with the most sections (most newline breaks)
    return candidates.reduce((a, b) =>
      a.split("\n").length > b.split("\n").length ? a : b,
    );
  } catch (error) {
    console.error("Error determining report structure:", error);
    return "Executive Summary\nKey Findings\nDetailed Analysis\nConclusion\nSources";
  }
}

// --------------------------
// Model Selection Logic
// --------------------------
// We decide between BALANCED and DEEP modes.
// If there is a very large volume of findings (e.g., > 100 items), use DEEP.
async function determineModelType(
  query: string,
  learnings?: string[],
): Promise<keyof typeof MODEL_CONFIG> {
  try {
    if (learnings && learnings.length > 100) {
      return "DEEP";
    }
    // Otherwise, default to BALANCED.
    return "BALANCED";
  } catch (error) {
    console.error("Error determining model type:", error);
    return "BALANCED";
  }
}

// --------------------------
// Final Report Generation
// --------------------------
// Generate a detailed, dynamic research report using either the BALANCED or DEEP model.
// The prompt instructs the model to produce an extensive markdown-formatted report.
async function formatReport(
  query: string,
  learnings: string[],
  visitedUrls: string[],
): Promise<string> {
  try {
    const isRankingQuery = /top|best|ranking|rated|popular|versus|vs\./i.test(
      query,
    );
    const modelType = await determineModelType(query, learnings);
    const model = MODEL_CONFIG[modelType];
    const trimmedQuery = trimPrompt(query, model);
    const trimmedLearnings = learnings.map((l) => trimPrompt(l, model));
    const trimmedVisitedUrls = visitedUrls.map((url) => trimPrompt(url, model));
    const reportStructure = await determineReportStructure(query, learnings);
    const response = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: isRankingQuery
            ? `You are creating a detailed research report that requires clear, numbered rankings. Your report must be very verbose (aim for at least 3000 tokens if context allows), use markdown formatting, and adapt section headings based on the content provided.`
            : `You are creating a comprehensive research report with dynamic sections tailored to the content. Provide extensive details (aim for at least 3000 tokens if context allows) and use markdown formatting for clarity.`,
        },
        {
          role: "user",
          content: `Create a very detailed research report about "${trimmedQuery}" using these findings:\n\n${trimmedLearnings.join("\n")}\n\nFollow this structure:\n${reportStructure}\n\nInclude a comprehensive Sources section with these URLs:\n${trimmedVisitedUrls.join("\n")}\n\n${
            isRankingQuery
              ? "Ensure rankings are clearly numbered with detailed explanations for each item."
              : "Provide extensive analysis and insights throughout each section."
          }`,
        },
      ],
      temperature: 0.7,
      max_tokens: model === MODEL_CONFIG.DEEP ? 6000 : 4000,
    });
    return response.choices[0]?.message?.content || "Error generating report";
  } catch (error) {
    console.error("Error formatting report:", error);
    return "Error generating research report";
  }
}

// --------------------------
// Expand Query: Generate Follow-Up Questions
// --------------------------
async function expandQuery(query: string): Promise<string[]> {
  try {
    const trimmedQuery = trimPrompt(query, MODEL_CONFIG.BALANCED);
    const response = await openai.chat.completions.create({
      model: MODEL_CONFIG.BALANCED,
      messages: [
        {
          role: "user",
          content: `Generate 3 follow-up questions to research this topic: ${trimmedQuery}\nFormat: Numbered list 1., 2., 3.`,
        },
      ],
    });
    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.error("Invalid response from OpenAI:", response);
      return [];
    }
    return content
      .split("\n")
      .map((line) => line.replace(/^\d+\.\s*/, ""))
      .filter((q) => q.length > 0)
      .slice(0, 3);
  } catch (error) {
    console.error("Error expanding query:", error);
    return [];
  }
}

// --------------------------
// Research Query: Search for Findings and URLs
// --------------------------
async function researchQuery(
  query: string,
): Promise<{ findings: string[]; urls: string[] }> {
  try {
    console.log("Starting search for query:", query);
    const searchResults = await firecrawl.search(query, {
      limit: 5,
      wait: true,
      timeout: 30000,
    });
    console.log("Search results:", JSON.stringify(searchResults, null, 2));
    if (!searchResults?.success || !Array.isArray(searchResults.data)) {
      console.error("Invalid search results structure:", searchResults);
      return { findings: ["No relevant information found."], urls: [] };
    }
    const urls = searchResults.data.map((result) => result.url);
    const context = searchResults.data
      .map((result) => `${result.title}\n${result.description}`)
      .filter((text) => text.length > 0)
      .join("\n\n");
    if (!context) {
      return { findings: ["No relevant information found."], urls: [] };
    }
    const trimmedContext = trimPrompt(context, MODEL_CONFIG.BALANCED);
    const response = await openai.chat.completions.create({
      model: MODEL_CONFIG.BALANCED,
      messages: [
        {
          role: "user",
          content: `Analyze this research data and provide key findings about '${query}':\n\n${trimmedContext}\n\nFindings:`,
        },
      ],
    });
    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { findings: ["Error analyzing research data."], urls };
    }
    const findings = content
      .split("\n")
      .map((line) => line.replace(/^[-•*]|\d+\.\s*/, "").trim())
      .filter((f) => f.length > 0);
    return {
      findings:
        findings.length > 0
          ? findings
          : ["Analysis completed but no clear findings extracted."],
      urls,
    };
  } catch (error) {
    console.error("Error researching query:", error);
    return {
      findings: [
        `Error while researching: ${error instanceof Error ? error.message : "Unknown error"}`,
      ],
      urls: [],
    };
  }
}

// --------------------------
// Main Research Handler
// --------------------------
// This function orchestrates the research process:
// - Determines research parameters
// - Gathers findings through web search and follow-up queries
// - Generates a detailed final report
async function handleResearch(
  research: Research,
  ws: WebSocket,
  onComplete?: (report: string, visitedUrls: string[]) => Promise<void>,
) {
  const sendProgress = (progress: ResearchProgress) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(progress));
    }
  };
  try {
    // Determine research parameters using the BALANCED model.
    const { breadth, depth } = await determineResearchParameters(
      research.query,
    );
    const autoResearch = { ...research, breadth, depth };
    const allLearnings: string[] = [];
    const visitedUrls: string[] = [];
    let completedQueries = 0;
    const totalQueries = autoResearch.breadth * autoResearch.depth;
    sendProgress({
      status: "IN_PROGRESS",
      currentQuery: autoResearch.query,
      learnings: [],
      progress: 0,
      totalProgress: totalQueries,
      visitedUrls: [],
    });
    let currentQueries = [autoResearch.query];
    for (let d = 0; d < autoResearch.depth; d++) {
      const newQueries: string[] = [];
      for (
        let i = 0;
        i < currentQueries.length && i < autoResearch.breadth;
        i++
      ) {
        const query = currentQueries[i];
        completedQueries++;
        sendProgress({
          status: "IN_PROGRESS",
          currentQuery: query,
          learnings: allLearnings,
          progress: completedQueries,
          totalProgress: totalQueries,
          visitedUrls,
        });
        const { findings, urls } = await researchQuery(query);
        allLearnings.push(...findings);
        visitedUrls.push(...urls);
        if (d < autoResearch.depth - 1) {
          const followUpQueries = await expandQuery(query);
          newQueries.push(...followUpQueries);
        }
      }
      currentQueries = newQueries;
    }
    console.log("Generating final report with:", {
      queryCount: allLearnings.length,
      learnings: allLearnings,
      urlCount: visitedUrls.length,
    });
    const formattedReport = await formatReport(
      autoResearch.query,
      allLearnings,
      visitedUrls,
    );
    if (onComplete) {
      console.log("Calling onComplete callback with report and URLs");
      await onComplete(formattedReport, visitedUrls);
    }
    sendProgress({
      status: "COMPLETED",
      learnings: allLearnings,
      progress: totalQueries,
      totalProgress: totalQueries,
      report: formattedReport,
      visitedUrls,
    });
  } catch (error) {
    console.error("Error in handleResearch:", error);
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    sendProgress({
      status: "ERROR",
      learnings: [],
      progress: 0,
      totalProgress: 1,
      error: errorMessage,
      visitedUrls: [],
    });
  }
}

export { generateClarifyingQuestions, handleResearch };
