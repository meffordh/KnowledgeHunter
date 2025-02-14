// deep-research.ts - True drop-in replacement

import OpenAI from "openai";
import { z } from "zod";
import FirecrawlApp from "@mendable/firecrawl-js";
import { WebSocket } from "ws";
import { Research, ResearchProgress } from "@shared/schema";
import { encodingForModel } from "js-tiktoken";
import { isYouTubeVideoValid } from "./youtubeVideoValidator";
import { fetchWithTimeout } from "./utils/fetchUtils";
import sizeOf from "image-size";
import { LRUCache } from "lru-cache";

// -----------------------------
// Initialization & Model Config
// -----------------------------
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
if (!OPENAI_API_KEY || !FIRECRAWL_API_KEY) {
  throw new Error("Missing required API keys");
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const firecrawl = new FirecrawlApp({ apiKey: FIRECRAWL_API_KEY });

// Cache for image dimensions (TTL 1 hour)
const imageDimensionCache = new LRUCache<
  string,
  { width: number; height: number }
>({
  max: 500,
  ttl: 1000 * 60 * 60,
});

// Enhanced model configuration
const MODEL_CONFIG = {
  BALANCED: {
    name: "gpt-4o-2024-11-20",
    maxTokens: 128000,
    summaryTokens: 8000,
    tokenizer: "cl100k_base",
  },
  DEEP: {
    name: "o3-mini-2025-01-31",
    maxTokens: 128000,
    summaryTokens: 12000,
    tokenizer: "cl100k_base",
  },
  MEDIA: {
    name: "gpt-4o-mini-2024-07-18",
    maxTokens: 16000,
    summaryTokens: 4000,
    tokenizer: "cl100k_base",
  },
} as const;

// -----------------------------
// Zod Schemas for Validation
// -----------------------------
const FirecrawlResult = z.object({
  success: z.boolean(),
  data: z.array(
    z.object({
      url: z.string().url(),
      title: z.string().optional(),
      description: z.string().optional(),
      content: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
});

const OpenAIMessage = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});

const OpenAIResponse = z.object({
  id: z.string(),
  choices: z.array(
    z.object({
      message: OpenAIMessage,
      finish_reason: z
        .enum(["stop", "length", "content_filter", "tool_calls"])
        .optional(),
      index: z.number(),
    }),
  ),
  usage: z
    .object({
      prompt_tokens: z.number(),
      completion_tokens: z.number(),
      total_tokens: z.number(),
    })
    .optional(),
});

const QueryExpansionResponse = z.object({
  queries: z.array(z.string()),
  reasoning: z.string().optional(),
  confidence: z.number().min(0).max(1),
});

const SufficiencyResponse = z.object({
  isComplete: z.boolean(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  suggestedNextSteps: z.array(z.string()).optional(),
  analysis: z
    .object({
      coverage: z.number().min(0).max(1),
      depth: z.number().min(0).max(1),
      relevance: z.number().min(0).max(1),
    })
    .optional(),
});

// -----------------------------
// Types & Interfaces
// -----------------------------
interface MediaContent {
  type: "video" | "image";
  url: string;
  title?: string;
  description?: string;
  embedCode?: string;
}

interface ResearchContext {
  query: string;
  learnings: string[];
  visitedUrls: string[];
  clarifications: Record<string, string>;
  media: MediaContent[];
  currentDepth: number;
  totalDepth: number;
  currentBreadth: number;
  totalBreadth: number;
  processedQueries: number;
  batchesInCurrentDepth: number;
}

interface ResearchProgressInfo {
  breadthProgress?: {
    current: number;
    total: number;
  };
  completionConfidence?: number;
  batchProgress?: {
    current: number;
    total: number;
  };
}

type EnhancedProgress = ResearchProgress & ResearchProgressInfo;

// -----------------------------
// Helper: trimPrompt
// -----------------------------
function trimPrompt(
  text: string,
  modelConfig: (typeof MODEL_CONFIG)[keyof typeof MODEL_CONFIG],
): string {
  try {
    const enc = encodingForModel(modelConfig.tokenizer);
    const tokens = enc.encode(text);
    if (tokens.length <= modelConfig.maxTokens) return text;
    console.warn(
      `Prompt exceeds token limit (${tokens.length} > ${modelConfig.maxTokens}) for model ${modelConfig.name}. Trimming prompt.`,
    );
    const sentences = text.split(/(?<=[.!?])\s+/);
    let trimmedText = "";
    let currentTokens = 0;
    for (const sentence of sentences) {
      const candidateText = trimmedText
        ? `${trimmedText} ${sentence}`
        : sentence;
      const candidateTokens = enc.encode(candidateText).length;
      if (candidateTokens <= modelConfig.maxTokens) {
        trimmedText = candidateText;
        currentTokens = candidateTokens;
      } else {
        break;
      }
    }
    console.warn(
      `Trimmed prompt for ${modelConfig.name} from ${tokens.length} to ${currentTokens} tokens`,
    );
    return trimmedText;
  } catch (error) {
    console.error(`Error trimming prompt for ${modelConfig.name}:`, error);
    return text;
  }
}

// -----------------------------
// Helper: getImageDimensions with Caching
// -----------------------------
async function getImageDimensions(
  imageUrl: string,
): Promise<{ width: number; height: number } | null> {
  try {
    const cached = imageDimensionCache.get(imageUrl);
    if (cached) {
      console.log(`Using cached dimensions for ${imageUrl}`);
      return cached;
    }
    console.log(`Fetching dimensions for ${imageUrl}`);
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.warn(
        `Failed to fetch image ${imageUrl}: ${response.status} ${response.statusText}`,
      );
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const dimensions = sizeOf(buffer);
    if (
      !dimensions ||
      typeof dimensions.width !== "number" ||
      typeof dimensions.height !== "number"
    ) {
      console.warn(`Could not determine dimensions for ${imageUrl}`);
      return null;
    }
    const result = { width: dimensions.width, height: dimensions.height };
    imageDimensionCache.set(imageUrl, result);
    return result;
  } catch (error) {
    console.error(`Error getting dimensions for ${imageUrl}:`, error);
    return null;
  }
}

// -----------------------------
// Helper: analyzeImageWithVision
// -----------------------------
async function analyzeImageWithVision(
  imageUrl: string,
): Promise<{ isUseful: boolean; title?: string; description?: string }> {
  try {
    const response = await openai.chat.completions.create({
      model: MODEL_CONFIG.MEDIA.name,
      messages: [
        {
          role: "system",
          content:
            "You are a visual analysis assistant. Analyze the image and respond in JSON with keys: isUseful (boolean), title (short descriptive title), description (short description). Only return valid JSON.",
        },
        {
          role: "user",
          content: JSON.stringify({
            prompt:
              "Analyze this image and determine if it's useful for research purposes:",
            image_url: imageUrl,
          }),
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 150,
    });
    const content = response.choices[0]?.message?.content;
    if (!content || !content.trim().startsWith("{")) return { isUseful: false };
    return JSON.parse(content);
  } catch (error) {
    console.error("Vision analysis error for", imageUrl, error);
    return { isUseful: false };
  }
}

// -----------------------------
// Helper: detectMediaContent
// -----------------------------
async function detectMediaContent(url: string): Promise<MediaContent[]> {
  if (!url) {
    console.warn("Received empty URL in detectMediaContent");
    return [];
  }
  try {
    const html = await fetchWithTimeout(url, 5000);
    const mediaContent: MediaContent[] = [];
    // Process YouTube videos
    const youtubeRegex =
      /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g;
    const youtubeMatches = html.matchAll(youtubeRegex);
    for (const match of Array.from(youtubeMatches)) {
      const videoId = match[1];
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      console.log(`Validating YouTube video: ${videoUrl}`);
      if (await isYouTubeVideoValid(videoUrl)) {
        mediaContent.push({
          type: "video",
          url: videoUrl,
          embedCode: `<iframe width="560" height="315" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`,
        });
        console.log(`Added valid YouTube video: ${videoUrl}`);
      } else {
        console.log(`Skipped invalid YouTube video: ${videoUrl}`);
      }
    }
    // Process images
    const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/g;
    const imgMatches = html.matchAll(imgRegex);
    const imageUrls: string[] = [];
    for (const match of Array.from(imgMatches)) {
      let imgUrl = match[1];
      if (!imgUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
        console.log(`Skipping non-image URL: ${imgUrl}`);
        continue;
      }
      if (imgUrl.includes("icon") || imgUrl.includes("logo")) {
        console.log(`Skipping icon/logo image: ${imgUrl}`);
        continue;
      }
      if (imgUrl.startsWith("/")) {
        const urlObj = new URL(url);
        imgUrl = `${urlObj.protocol}//${urlObj.host}${imgUrl}`;
        console.log(`Converted relative URL to absolute: ${imgUrl}`);
      } else if (!imgUrl.startsWith("http")) {
        const urlObj = new URL(url);
        imgUrl = `${urlObj.protocol}//${urlObj.host}/${imgUrl}`;
        console.log(`Added protocol and host to URL: ${imgUrl}`);
      }
      imageUrls.push(imgUrl);
    }
    console.log(`Found ${imageUrls.length} potential images to analyze`);
    const imageAnalysisPromises = imageUrls.map(async (imgUrl) => {
      try {
        console.log(`Analyzing image: ${imgUrl}`);
        const analysis = await analyzeImageWithVision(imgUrl);
        if (analysis.isUseful) {
          const dimensions = await getImageDimensions(imgUrl);
          if (
            dimensions &&
            dimensions.width >= 400 &&
            dimensions.width <= 2500
          ) {
            console.log(
              `Adding useful image: ${imgUrl} (${dimensions.width}x${dimensions.height})`,
            );
            return {
              type: "image",
              url: imgUrl,
              title: analysis.title,
              description: analysis.description,
            };
          } else {
            console.log(`Skipping image due to dimensions: ${imgUrl}`);
          }
        } else {
          console.log(`Skipping non-useful image: ${imgUrl}`);
        }
      } catch (error) {
        console.error(`Error processing image ${imgUrl}:`, error);
      }
      return null;
    });
    const analyzedImages = await Promise.all(imageAnalysisPromises);
    const validImages = analyzedImages.filter(
      (img): img is MediaContent => img !== null,
    );
    mediaContent.push(...validImages);
    console.log(
      `Successfully processed ${mediaContent.length} media items from ${url}`,
    );
    return mediaContent;
  } catch (error) {
    console.error(`Error detecting media content from ${url}:`, error);
    return [];
  }
}

// -----------------------------
// Helper: processBatchFindings
// -----------------------------
async function processBatchFindings(
  findings: string[],
  modelConfig: (typeof MODEL_CONFIG)[keyof typeof MODEL_CONFIG],
  context: ResearchContext,
): Promise<string[]> {
  try {
    if (findings.length === 0) {
      console.log("Skipping batch processing - no findings to process");
      return [];
    }
    const batchSize = 10;
    const processedFindings: string[] = [];
    const totalBatches = Math.ceil(findings.length / batchSize);
    context.batchesInCurrentDepth = totalBatches;
    console.log(
      `Processing ${findings.length} findings in ${totalBatches} batches`,
    );
    for (let i = 0; i < findings.length; i += batchSize) {
      const currentBatch = Math.floor(i / batchSize) + 1;
      console.log(`Processing batch ${currentBatch}/${totalBatches}`);
      const batch = findings.slice(i, i + batchSize);
      const batchText = batch.join("\n\n");
      const trimmedBatch = trimPrompt(batchText, modelConfig);
      const response = await openai.chat.completions.create({
        model: modelConfig.name,
        messages: [
          {
            role: "system",
            content:
              "Summarize and combine related findings into coherent insights.",
          },
          { role: "user", content: trimmedBatch },
        ],
        max_tokens: modelConfig.summaryTokens,
      });
      const summary = response.choices[0]?.message?.content;
      if (summary) {
        processedFindings.push(summary);
        console.log(
          `Batch ${currentBatch}: Successfully processed ${batch.length} findings`,
        );
      } else {
        console.warn(`Batch ${currentBatch}: No summary generated`);
      }
    }
    console.log(
      `Finished processing all batches. Generated ${processedFindings.length} summaries`,
    );
    return processedFindings;
  } catch (error) {
    console.error("Error processing batch findings:", error);
    return findings;
  }
}

// -----------------------------
// Helper: expandQuery
// -----------------------------
async function expandQuery(context: ResearchContext): Promise<string[]> {
  try {
    const modelConfig = MODEL_CONFIG.BALANCED;
    const trimmedContext = {
      query: context.query,
      learnings: context.learnings.slice(-5),
      clarifications: context.clarifications,
      progress: {
        currentDepth: context.currentDepth,
        totalDepth: context.totalDepth,
        currentBreadth: context.currentBreadth,
        processedQueries: context.processedQueries,
      },
    };
    const response = await openai.chat.completions.create({
      model: modelConfig.name,
      messages: [
        {
          role: "system",
          content: `Generate follow-up queries based on current findings and gaps in knowledge.
Consider depth ${context.currentDepth + 1}/${context.totalDepth} when generating queries.
Return a JSON object with:
- queries: array of strings (new queries to investigate)
- reasoning: optional string explaining query selection`,
        },
        { role: "user", content: JSON.stringify(trimmedContext) },
      ],
      response_format: { type: "json_object" },
      max_tokens: 1000,
    });
    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.warn("Empty response from OpenAI for query expansion");
      return [];
    }
    try {
      const parsedResponse = JSON.parse(content);
      const validatedResponse = QueryExpansionResponse.parse(parsedResponse);
      if (validatedResponse.reasoning) {
        console.log("Query expansion reasoning:", validatedResponse.reasoning);
      }
      return validatedResponse.queries;
    } catch (parseError) {
      console.error(
        "Failed to parse or validate query expansion response:",
        parseError,
      );
      console.error("Raw response:", content);
      return [];
    }
  } catch (error) {
    console.error("Error in expandQuery:", error);
    return [];
  }
}

// -----------------------------
// Helper: isResearchSufficient
// -----------------------------
async function isResearchSufficient(
  context: ResearchContext,
): Promise<z.infer<typeof SufficiencyResponse>> {
  try {
    const modelConfig = MODEL_CONFIG.BALANCED;
    const trimmedContext = {
      query: context.query,
      learnings: context.learnings,
      clarifications: context.clarifications,
      progress: {
        currentDepth: context.currentDepth,
        totalDepth: context.totalDepth,
        currentBreadth: context.currentBreadth,
        totalBreadth: context.totalBreadth,
        totalFindings: context.learnings.length,
        processedQueries: context.processedQueries,
        batchesProcessed: context.batchesInCurrentDepth,
      },
    };
    const response = await openai.chat.completions.create({
      model: modelConfig.name,
      messages: [
        {
          role: "system",
          content: `Analyze if the user context provided is sufficient to answer the original query.
Consider:
- Coverage of key aspects
- Depth of analysis
- Quality of sources
- Consistency of findings
Return a JSON object with:
- isComplete: boolean
- confidence: number (0-1)
- reasoning: string
- suggestedNextSteps: optional array of strings`,
        },
        { role: "user", content: JSON.stringify(trimmedContext) },
      ],
      response_format: { type: "json_object" },
      max_tokens: 1000,
    });
    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.warn("Empty response from OpenAI for sufficiency check");
      return {
        isComplete: false,
        confidence: 0,
        reasoning: "No response received",
      };
    }
    try {
      const parsedResponse = JSON.parse(content);
      const validatedResponse = SufficiencyResponse.parse(parsedResponse);
      console.log("Research sufficiency check:", {
        isComplete: validatedResponse.isComplete,
        confidence: validatedResponse.confidence,
        reasoning: validatedResponse.reasoning,
      });
      if (validatedResponse.suggestedNextSteps?.length > 0) {
        console.log(
          "Suggested next steps:",
          validatedResponse.suggestedNextSteps,
        );
      }
      return validatedResponse;
    } catch (parseError) {
      console.error(
        "Failed to parse or validate sufficiency check response:",
        parseError,
      );
      console.error("Raw response:", content);
      return {
        isComplete: false,
        confidence: 0,
        reasoning: "Failed to parse response",
      };
    }
  } catch (error) {
    console.error("Error in isResearchSufficient:", error);
    return {
      isComplete: false,
      confidence: 0,
      reasoning: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// -----------------------------
// Helper: generateClarifyingQuestions
// -----------------------------
async function generateClarifyingQuestions(query: string): Promise<string[]> {
  try {
    const trimmedQuery = trimPrompt(query, MODEL_CONFIG.BALANCED);
    const response = await openai.chat.completions.create({
      model: MODEL_CONFIG.BALANCED.name,
      messages: [
        {
          role: "system",
          content:
            "Generate clarifying questions to refine queries. Your output must be strictly formatted as valid JSON that exactly matches the provided schema.",
        },
        {
          role: "user",
          content: `Generate clarifying questions for this research query: "${trimmedQuery}"`,
        },
      ],
      response_format: {
        type: "json_object",
        schema: {
          type: "object",
          properties: {
            questions: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["questions"],
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

// -----------------------------
// Helper: formatReport
// -----------------------------
async function formatReport(
  query: string,
  learnings: string[],
  visitedUrls: string[],
  media: MediaContent[],
): Promise<string> {
  try {
    const modelConfig = MODEL_CONFIG.DEEP;
    const context = {
      query,
      learnings: learnings.slice(-50),
      sources: visitedUrls,
      mediaContent: media.map((m) => ({
        type: m.type,
        url: m.url,
        title: m.title || undefined,
        description: m.description || undefined,
      })),
    };
    const response = await openai.chat.completions.create({
      model: modelConfig.name,
      messages: [
        {
          role: "system",
          content: `Generate an engaging content piece encompassing your vast knowledge and given findings to thoroughly answer the users explicit and implicit question, to engage them in the topic and wow them with your capabilities while adhering to these guidelines:
- Use markdown formatting for structure and content
- Use headings to organize sections
- Incorporate a section for key findings near the beginning
- Use writing style that is appropriate given the context of the query
- Use tabular data to display findings where relevant
- Incorporate media references where relevant
- Use markdown formatting for structure
- Cite sources using footnotes
- Conclude with key insights and recommendations
- Do not include place holders for the query, learnings, sources, mdeia, or any other information
- Focus on relevance and engagment
- Include a sources section`,
        },
        { role: "user", content: JSON.stringify(context) },
      ],
      max_tokens: modelConfig.maxTokens - 1000,
    });
    const report = response.choices[0]?.message?.content;
    if (!report) throw new Error("Failed to generate report content");
    return report;
  } catch (error) {
    console.error("Error formatting report:", error);
    return `Error generating content: ${error instanceof Error ? error.message : "Unknown error"}

## Raw Findings
${learnings.join("\n\n")}

## Sources
${visitedUrls.join("\n")}`;
  }
}

// -----------------------------
// Progress Tracking Helpers
// -----------------------------
interface ProgressMetrics {
  currentDepth: number;
  totalDepth: number;
  currentBreadth: number;
  totalBreadth: number;
  processedQueries: number;
  totalQueriesProcessed: number;
  currentBatchProgress: number;
  totalBatches: number;
  confidence: number;
}

function calculateProgressMetrics(context: ResearchContext): ProgressMetrics {
  return {
    currentDepth: context.currentDepth,
    totalDepth: context.totalDepth,
    currentBreadth: context.currentBreadth,
    totalBreadth: context.totalBreadth,
    processedQueries: context.processedQueries,
    totalQueriesProcessed: context.processedQueries,
    currentBatchProgress: context.batchesInCurrentDepth,
    totalBatches: Math.ceil(context.learnings.length / 10),
    confidence: 0,
  };
}

function constructProgressUpdate(
  context: ResearchContext,
  status: "IN_PROGRESS" | "COMPLETED" | "ERROR",
  metrics: ProgressMetrics,
  report?: string,
  error?: string,
): EnhancedProgress {
  return {
    status,
    currentQuery:
      context.learnings[context.learnings.length - 1] || context.query,
    learnings: context.learnings,
    progress: context.currentDepth,
    totalProgress: context.totalDepth,
    visitedUrls: context.visitedUrls,
    media: context.media,
    breadthProgress: {
      current: metrics.currentBreadth,
      total: metrics.totalBreadth,
    },
    completionConfidence: metrics.confidence,
    batchProgress: {
      current: metrics.currentBatchProgress,
      total: metrics.totalBatches,
    },
    ...(report ? { report } : {}),
    ...(error ? { error } : {}),
  };
}

function updateResearchContext(
  context: ResearchContext,
  updates: Partial<ResearchContext>,
): ResearchContext {
  return {
    ...context,
    ...updates,
    processedQueries:
      updates.processedQueries !== undefined
        ? updates.processedQueries
        : context.processedQueries + (updates.currentBreadth || 0),
    batchesInCurrentDepth:
      updates.batchesInCurrentDepth !== undefined
        ? updates.batchesInCurrentDepth
        : context.batchesInCurrentDepth,
  };
}

// -----------------------------
// New Implementation: researchQuery
// -----------------------------
async function researchQuery(
  query: string,
): Promise<{ findings: string[]; urls: string[]; media: MediaContent[] }> {
  try {
    console.log("Performing research query:", query);
    // Use Firecrawl to perform the search
    const fcResult = await firecrawl.search({ query });
    const parsedResult = FirecrawlResult.parse(fcResult);
    const findings = parsedResult.data
      .map((item) => item.content || "")
      .filter((content) => content.trim() !== "");
    const urls = parsedResult.data.map((item) => item.url);
    // Media processing could be extended here if desired.
    const media: MediaContent[] = [];
    return { findings, urls, media };
  } catch (error) {
    console.error("Error in researchQuery for query:", query, error);
    return { findings: [], urls: [], media: [] };
  }
}

// -----------------------------
// Main Research Handler: handleResearch
// -----------------------------
async function handleResearch(
  research: Research,
  ws: WebSocket,
  onComplete?: (report: string, visitedUrls: string[]) => Promise<void>,
) {
  const sendProgress = (progress: EnhancedProgress) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(progress));
    }
  };

  try {
    let context: ResearchContext = {
      query: research.query,
      learnings: [],
      visitedUrls: [],
      clarifications: research.clarifications || {},
      media: [],
      currentDepth: 0,
      totalDepth: research.fastMode ? 2 : 5,
      currentBreadth: 0,
      totalBreadth: research.fastMode ? 3 : 8,
      processedQueries: 0,
      batchesInCurrentDepth: 0,
    };

    let currentQueries = [context.query];
    let completionConfidence = 0;

    console.log("Starting research:", {
      query: research.query,
      fastMode: research.fastMode,
      maxDepth: context.totalDepth,
      maxBreadth: context.totalBreadth,
    });

    while (context.currentDepth < context.totalDepth) {
      const queries = currentQueries.slice(0, context.totalBreadth);
      context = updateResearchContext(context, {
        currentBreadth: queries.length,
      });

      console.log(
        `Processing depth ${context.currentDepth + 1}/${context.totalDepth} with ${context.currentBreadth} queries`,
      );

      const results = await Promise.all(
        queries.map(async (query) => {
          console.log(`Executing query: ${query}`);
          return await researchQuery(query);
        }),
      );

      let newFindings = 0;
      for (const result of results) {
        const processedFindings = await processBatchFindings(
          result.findings,
          MODEL_CONFIG.BALANCED,
          context,
        );
        newFindings += processedFindings.length;
        context.learnings.push(...processedFindings);
        context.visitedUrls.push(...result.urls);
        context.media.push(...result.media);
      }

      context = updateResearchContext(context, {
        processedQueries: context.processedQueries + queries.length,
      });

      console.log(
        `Depth ${context.currentDepth + 1}: Found ${newFindings} new findings, processed ${queries.length} queries`,
      );

      const metrics = calculateProgressMetrics(context);
      sendProgress(constructProgressUpdate(context, "IN_PROGRESS", metrics));

      const sufficientResponse = await isResearchSufficient(context);
      completionConfidence = sufficientResponse.confidence;

      if (
        sufficientResponse.isComplete &&
        sufficientResponse.confidence >= 0.8
      ) {
        console.log(
          `Research deemed sufficient with ${(sufficientResponse.confidence * 100).toFixed(1)}% confidence`,
        );
        console.log("Reasoning:", sufficientResponse.reasoning);
        break;
      }

      if (context.currentDepth < context.totalDepth - 1) {
        currentQueries = await expandQuery(context);
        if (currentQueries.length === 0) {
          console.log("No more queries to expand, stopping iteration");
          break;
        }
        console.log(
          `Generated ${currentQueries.length} follow-up queries for next depth`,
        );
      }

      context = updateResearchContext(context, {
        currentDepth: context.currentDepth + 1,
        currentBreadth: 0,
        batchesInCurrentDepth: 0,
      });
    }

    console.log("Generating final report");
    const report = await formatReport(
      context.query,
      context.learnings,
      context.visitedUrls,
      context.media,
    );

    if (onComplete) {
      await onComplete(report, context.visitedUrls);
    }

    console.log("Research completed successfully");
    const finalMetrics = calculateProgressMetrics(context);
    sendProgress(
      constructProgressUpdate(
        context,
        "COMPLETED",
        { ...finalMetrics, confidence: completionConfidence },
        report,
      ),
    );
  } catch (error) {
    console.error("Error in handleResearch:", error);
    sendProgress({
      status: "ERROR",
      learnings: [],
      progress: 0,
      totalProgress: 1,
      error: error instanceof Error ? error.message : "Unknown error occurred",
      visitedUrls: [],
      media: [],
    });
  }
}

// -----------------------------
// Exports
// -----------------------------
export {
  handleResearch,
  generateClarifyingQuestions,
  formatReport,
  researchQuery,
  type MediaContent,
  type ResearchContext,
  type ResearchProgressInfo,
  type EnhancedProgress,
};
