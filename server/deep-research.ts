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

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const firecrawl = new FirecrawlApp({ apiKey: FIRECRAWL_API_KEY });

// Add comments explaining token management
const MODEL_CONFIG = {
  FAST: "gpt-4o-mini-2024-07-18", // 4K tokens
  BALANCED: "gpt-4o-2024-08-06", // 8K tokens
  DEEP: "o3-mini-2025-01-31", // 128K tokens
} as const;

// Token management utilities
function trimPrompt(text: string, model: string): string {
  try {
    let maxTokens = 8000; // default

    // Adjust token limit based on model
    switch (model) {
      case MODEL_CONFIG.DEEP:
        maxTokens = 128000; // Large context window for deep analysis
        break;
      case MODEL_CONFIG.BALANCED:
        maxTokens = 16000; // Medium context for balanced analysis
        break;
      case MODEL_CONFIG.FAST:
        maxTokens = 16000; // Small context for quick analysis
        break;
    }

    const enc = encodingForModel(model === MODEL_CONFIG.DEEP ? "gpt-4" : model);
    const tokens = enc.encode(text);

    // Only trim if exceeding model's token limit
    if (tokens.length <= maxTokens) {
      return text;
    }

    // Chunk text while preserving sentence boundaries
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
        // If a single sentence exceeds token limit, split by words
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

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    // Return first chunk that fits within token limit
    return chunks[0] || text.slice(0, Math.floor(maxTokens / 4));
  } catch (error) {
    console.error("Error trimming prompt:", error);
    return text;
  }
}

async function determineResearchParameters(
  query: string,
): Promise<{ breadth: number; depth: number }> {
  try {
    const trimmedQuery = trimPrompt(query, MODEL_CONFIG.FAST);
    const response = await openai.chat.completions.create({
      model: MODEL_CONFIG.FAST,
      messages: [
        {
          role: "system",
          content:
            "You are an expert at determining optimal research parameters. Analyze the query complexity and scope to suggest appropriate breadth (2-10) and depth (1-5) values.",
        },
        {
          role: "user",
          content: `Given this research query: "${trimmedQuery}", determine optimal research settings. Consider:
1. Query complexity and scope
2. Need for diverse sources (affects breadth)
3. Need for detailed exploration (affects depth)
Respond in JSON format with 'breadth' (2-10) and 'depth' (1-5).`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
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
    return { breadth: 4, depth: 2 }; // Default fallback values
  }
}

async function generateClarifyingQuestions(query: string): Promise<string[]> {
  try {
    const trimmedQuery = trimPrompt(query, MODEL_CONFIG.FAST);
    const response = await openai.chat.completions.create({
      model: MODEL_CONFIG.FAST,
      messages: [
        {
          role: "system",
          content: "You are a research assistant tasked with generating clarifying questions to refine research queries. Your output must be strictly formatted as valid JSON that exactly matches the provided schema. Do not include any additional commentary or HTML."
        },
        {
          role: "user",
          content: `Generate clarifying questions for this research query: "${trimmedQuery}"`
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
                items: {
                  type: "string"
                }
              }
            },
            required: ["questions"],
            additionalProperties: false
          }
        }
      },
      max_tokens: 1500
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.error("Invalid response from OpenAI:", response);
      return ["What specific aspects of this topic interest you the most?"];
    }

    const parsedResponse = JSON.parse(content);
    if (!Array.isArray(parsedResponse.questions) || parsedResponse.questions.length === 0) {
      console.error("Invalid questions format in response:", parsedResponse);
      return ["What specific aspects of this topic interest you the most?"];
    }

    // Only return up to 3 questions
    return parsedResponse.questions.slice(0, 3);
  } catch (error) {
    console.error("Error generating clarifying questions:", error);
    return ["What specific aspects of this topic interest you the most?"];
  }
}

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
          content: `You are an expert at determining optimal research report structures. You analyze queries and findings to suggest the most effective way to present research results. For ranking queries, emphasize structured, numbered lists. Generate multiple candidate structures and select the most appropriate one based on the content.`,
        },
        {
          role: "user",
          content: `Given this research query: "${trimmedQuery}" and sample findings:\n${trimmedLearnings}\n\nGenerate 3 different report structure candidates. Each structure should be a list of section headings tailored to the content. If this is a ranking or "top N" query, ensure at least one candidate emphasizes numbered listings.\n\nSeparate each candidate with "###". Choose the best candidate based on content fit and return only that structure.`,
        },
      ],
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return "Executive Summary\nKey Findings\nDetailed Analysis\nConclusion\nSources";
    }

    // Split into candidates and select the best one
    const candidates = content.split("###").map(c => c.trim());
    // If the response didn't include multiple candidates, return the whole content
    if (candidates.length === 1) {
      return candidates[0];
    }

    // Filter out any empty candidates and return the most detailed one
    const validCandidates = candidates.filter(c => c.length > 0);
    // Select the candidate with the most sections as it's likely the most detailed
    return validCandidates.reduce((a, b) => 
      (a.split("\n").length > b.split("\n").length) ? a : b,
      validCandidates[0] || "Executive Summary\nKey Findings\nDetailed Analysis\nConclusion\nSources"
    );
  } catch (error) {
    console.error("Error determining report structure:", error);
    return "Executive Summary\nKey Findings\nDetailed Analysis\nConclusion\nSources";
  }
}

async function determineModelType(
  query: string,
  learnings?: string[],
): Promise<keyof typeof MODEL_CONFIG> {
  try {
    // If we have a large volume of learnings, default to DEEP
    if (learnings && learnings.length > 100) {
      return "DEEP";
    }

    const trimmedQuery = trimPrompt(query, MODEL_CONFIG.FAST);
    const response = await openai.chat.completions.create({
      model: MODEL_CONFIG.FAST,
      messages: [
        {
          role: "system",
          content: `You are an expert at determining optimal AI model selection based on query complexity and research data volume. Analyze queries to determine which model type would be most appropriate:

FAST: For simple fact-finding, time-sensitive requests, single-topic research
BALANCED: For multi-faceted topics, comparative analysis, mixed complexity
DEEP: For complex technical topics, multi-domain research, extensive reasoning needs`,
        },
        {
          role: "user",
          content: `Given this research query: "${trimmedQuery}", and considering that the total number of research findings is ${
            learnings?.length || 0
          }, determine the optimal model type. Consider:
1. Query complexity and need for deep reasoning
2. Time sensitivity of the request
3. Amount of context processing needed
4. Volume of research data to analyze

Respond with exactly one of these options: "FAST", "BALANCED", or "DEEP"`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content?.trim().toUpperCase();
    if (content && content in MODEL_CONFIG) {
      return content as keyof typeof MODEL_CONFIG;
    }

    return "BALANCED"; // Default to balanced approach
  } catch (error) {
    console.error("Error determining model type:", error);
    return "BALANCED"; // Default to balanced approach on error
  }
}

async function formatReport(
  query: string,
  learnings: string[],
  visitedUrls: string[],
): Promise<string> {
  try {
    // Determine if this is a ranking-style query
    const isRankingQuery = /top|best|ranking|rated|popular|versus|vs\./i.test(query);

    // Select model based on complexity and data volume
    const modelType = await determineModelType(query, learnings);
    const model = MODEL_CONFIG[modelType];

    // Trim inputs according to the selected model's token limit
    const trimmedQuery = trimPrompt(query, model);
    const trimmedLearnings = learnings.map((l) => trimPrompt(l, model));
    const trimmedVisitedUrls = visitedUrls.map((url) => trimPrompt(url, model));

    // Get dynamic report structure
    const reportStructure = await determineReportStructure(query, learnings);

    const response = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: isRankingQuery
            ? `You are creating a detailed research report that requires clear rankings. Ensure that:
               1. The ranking is explicit and numbered
               2. Each ranked item has a clear title and comprehensive supporting details
               3. The report maintains any specific ranking count (e.g., top 10)
               4. The content is extensively detailed, using 3000+ tokens if context allows
               5. Formatting uses markdown for optimal readability
               6. Sections follow the provided structure but adapt based on content`
            : `You are creating a comprehensive research report that:
               1. Avoids rigid templates and uses dynamic sections based on content
               2. Provides extensive detail using 3000+ tokens if context allows
               3. Incorporates clear examples and specific data points
               4. Uses markdown formatting for optimal readability
               5. Maintains logical flow between sections
               6. Adapts section content based on available research depth`,
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
      max_tokens: model === MODEL_CONFIG.DEEP ? 4000 : 2000,
    });

    return response.choices[0]?.message?.content || "Error generating report";
  } catch (error) {
    console.error("Error formatting report:", error);
    return "Error generating research report";
  }
}

async function expandQuery(query: string): Promise<string[]> {
  try {
    const trimmedQuery = trimPrompt(query, "gpt-4o");
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
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

    const trimmedContext = trimPrompt(context, "gpt-4o");
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
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

    for (let depth = 0; depth < autoResearch.depth; depth++) {
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

        if (depth < autoResearch.depth - 1) {
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