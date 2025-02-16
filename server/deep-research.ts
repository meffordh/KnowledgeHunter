import LRUCache from "lru-cache";
import OpenAI from "openai";
import { z } from "zod";
import FirecrawlApp from "@mendable/firecrawl-js";
import { WebSocket } from "ws";
import { Research, ResearchProgress } from "@shared/schema";
import { encodingForModel } from "js-tiktoken";
import { isYouTubeVideoValid } from "./youtubeVideoValidator";
import { fetchWithTimeout } from "./utils/fetchUtils";
import sizeOf from "image-size";

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
    maxTokens: 100000,
    summaryTokens: 8000,
    tokenizer: "cl100k_base",
  },
  DEEP: {
    name: "o3-mini-2025-01-31",
    maxTokens: 100000,
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
      extractedData: z.record(z.string(), z.unknown()).optional(),
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
  confidence: z.number().min(0).max(1).optional().default(0.5),
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

interface AnalyzedImage {
  url: string;
  isUseful: boolean;
  title?: string;
  description?: string;
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

// Add media detection functionality

type EnhancedProgress = ResearchProgress & ResearchProgressInfo;

// -----------------------------
// Helper: trimPrompt
// -----------------------------
function trimPrompt(
  text: string,
  modelConfig: (typeof MODEL_CONFIG)[keyof typeof MODEL_CONFIG],
): string {
  try {
    const enc = encodingForModel("gpt-4"); // Always use the same tokenizer
    const tokens = enc.encode(text);
    let maxTokens = modelConfig.maxTokens;

    if (tokens.length <= maxTokens) {
      return text;
    }

    console.warn(
      `Prompt exceeds token limit (${tokens.length} > ${maxTokens}) for model ${modelConfig.name}. Trimming prompt.`,
    );

    // Split text into sentences and accumulate until the token limit is reached
    const sentences = text.split(/(?<=[.!?])\s+/);
    let trimmedText = "";
    let currentTokenCount = 0;

    for (const sentence of sentences) {
      const sentenceTokens = enc.encode(sentence).length;
      if (currentTokenCount + sentenceTokens > maxTokens) {
        break;
      }
      trimmedText += sentence + " ";
      currentTokenCount += sentenceTokens;
    }
    return trimmedText.trim() || enc.decode(tokens.slice(0, maxTokens));
  } catch (error) {
    console.error(`Error trimming prompt for ${modelConfig.name}:`, error);
    return text;
  }
}

// -----------------------------
// Helper: analyzeImagesWithVision (Enhanced JSON Validation)
// -----------------------------
async function analyzeImagesWithVision(
  urls: string[],
): Promise<AnalyzedImage[]> {
  try {
    // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
    const response = await openai.chat.completions.create({
      model: MODEL_CONFIG.MEDIA.name,
      messages: [
        {
          role: "system",
          content:
            'You are a precise JSON generator for vision analysis. Your response must be ONLY valid JSON, with no additional text, comments, or formatting. The JSON must follow this exact schema: { "images": [ { "url": string, "isUseful": boolean, "title": string, "description": string } ] }. Do not include any explanations or markdown formatting.',
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze these images and determine which ones could be useful for research purposes. Respond with ONLY valid JSON:\n${JSON.stringify(urls)}`,
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.error("Empty response from vision analysis");
      return urls.map((url) => ({ url, isUseful: false }));
    }

    let parsedContent;
    try {
      parsedContent = JSON.parse(content);

      if (!Array.isArray(parsedContent.images)) {
        console.error(
          "Invalid response structure from vision analysis:",
          content,
        );
        return urls.map((url) => ({ url, isUseful: false }));
      }

      // Additional validation of the parsed content
      const isValidImage = (img: any): img is AnalyzedImage => {
        return (
          typeof img.url === "string" &&
          typeof img.isUseful === "boolean" &&
          (!img.title || typeof img.title === "string") &&
          (!img.description || typeof img.description === "string")
        );
      };

      const validImages = parsedContent.images.filter(isValidImage);
      if (validImages.length === 0) {
        console.error("No valid image analysis results found");
        return urls.map((url) => ({ url, isUseful: false }));
      }

      return validImages;
    } catch (error) {
      console.error("Failed to parse vision analysis response:", error);
      console.error("Raw response content:", content);
      return urls.map((url) => ({ url, isUseful: false }));
    }
  } catch (error) {
    console.error("Error in batch vision analysis:", error);
    return urls.map((url) => ({ url, isUseful: false }));
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
    // Use our new utility to fetch HTML with a 5-second timeout
    const html = await fetchWithTimeout(url, 5000);
    const mediaContent: MediaContent[] = [];

    // Process YouTube videos (existing code remains unchanged)
    const youtubeRegex =
      /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g;
    const youtubeMatches = Array.from(html.matchAll(youtubeRegex));

    for (const match of youtubeMatches) {
      const videoId = match[1];
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

      const isValid = await isYouTubeVideoValid(videoUrl);
      if (isValid) {
        mediaContent.push({
          type: "video",
          url: videoUrl,
          embedCode: `<iframe width="560" height="315" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`,
        });
      }
    }

    // Enhanced batch image detection
    const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/g;
    const imgMatches = Array.from(html.matchAll(imgRegex));
    const imageUrls: string[] = [];

    // Collect and normalize image URLs
    for (const match of imgMatches) {
      let imgUrl = match[1];
      if (!imgUrl || !imgUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i)) continue;

      // Skip images with undesired keywords
      if (
        imgUrl.includes("icon") ||
        imgUrl.includes("logo") ||
        imgUrl.includes("spacer")
      ) {
        continue;
      }

      // Handle relative URLs
      if (imgUrl.startsWith("/")) {
        const urlObj = new URL(url);
        imgUrl = `${urlObj.protocol}//${urlObj.host}${imgUrl}`;
      } else if (!imgUrl.startsWith("http")) {
        const urlObj = new URL(url);
        imgUrl = `${urlObj.protocol}//${urlObj.host}/${imgUrl}`;
      }

      imageUrls.push(imgUrl);
    }

    // Batch analyze images with vision model
    if (imageUrls.length > 0) {
      const analyzedImages = await analyzeImagesWithVision(imageUrls);

      // Only check dimensions for useful images
      for (const image of analyzedImages) {
        if (image.isUseful) {
          try {
            const dimensions = await getImageDimensions(image.url);
            if (
              dimensions &&
              dimensions.width >= 400 &&
              dimensions.width <= 2500
            ) {
              mediaContent.push({
                type: "image",
                url: image.url,
                title: image.title,
                description: image.description,
              });
            }
          } catch (error) {
            console.error(
              "Error processing image dimensions:",
              image.url,
              error,
            );
          }
        }
      }
    }

    return mediaContent;
  } catch (error) {
    console.error("Error detecting media content:", error);
    return [];
  }
}

// -----------------------------
// Helper: image dimensions new
// -----------------------------
// New helper function for getting image dimensions
async function getImageDimensions(
  imageUrl: string,
): Promise<{ width: number; height: number } | null> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return null;

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const dimensions = sizeOf(buffer);

    if (
      !dimensions ||
      typeof dimensions.width !== "number" ||
      typeof dimensions.height !== "number"
    ) {
      return null;
    }

    return {
      width: dimensions.width,
      height: dimensions.height,
    };
  } catch (error) {
    console.error("Error getting image dimensions for", imageUrl, error);
    return null;
  }
}

// New helper function for vision analysis
async function analyzeImageWithVision(imageUrl: string): Promise<{
  isUseful: boolean;
  title?: string;
  description?: string;
}> {
  try {
    // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
    const response = await openai.chat.completions.create({
      model: MODEL_CONFIG.MEDIA.name,
      messages: [
        {
          role: "system",
          content:
            "You are a visual analysis assistant. Analyze the image at the given URL and respond in JSON with keys: isUseful (boolean), title (short descriptive title), description (short description). Only return valid JSON.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyze this image and determine if it's useful for research purposes:",
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
              },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 150,
    });

    const content = response.choices[0]?.message?.content;
    if (!content || !content.trim().startsWith("{")) {
      return { isUseful: false };
    }
    return JSON.parse(content);
  } catch (error) {
    console.error("Vision analysis error for", imageUrl, error);
    return { isUseful: false };
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
            "Generate clarifying questions to refine queries. Return questions in a JSON array format.",
        },
        {
          role: "user",
          content: `Generate clarifying questions for this research query: "${trimmedQuery}"`,
        },
      ],
      response_format: { type: "json_object" },
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
const MAX_COMPLETION_TOKENS = 100000;

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
        embedCode: m.embedCode,
      })),
    };

    const response = await openai.chat.completions.create({
      model: modelConfig.name,
      messages: [
        // In formatReport, update the system message to something like:
        {
          role: "system",
          content: `You are creating a comprehensive piece of content that incorporates both textual findings and rich media content. Use markdown to expertly craft the content, with markdown formatting for footnotes to sources, with markdown tables and markdown for media where appropriate within your output. Generate a verbose output (at least 3000 tokens if the context permits). When referencing media content:
        - For videos: Include them as embedded content using provided embed codes or as markdown links.
        - For images: Include them using markdown image syntax.
        - For other media types: Include them as markdown links.
        - For sources: Use footnotes to reference the source.
        - For comparisons: Include a markdown table if appropriate for the context.
        Important Rules to Always Follow:
        - Structure the content so it flows naturally.
        - Adjust your style—including voice and tone—based on the user's needs.
        - Use the provided findings and media content along with your expertise to deliver an incredible work product comprised of a balanced mix of media, images, sources, and videos.
        - Pay attention to the structure requested by the user and adhere to it as closely as possible.
        - Ensure the markdown output is fully renderable by common markdown viewers.`,
        },
        { role: "user", content: JSON.stringify(context) },
      ],
      max_completion_tokens: Math.min(
        modelConfig.maxTokens - 1000,
        MAX_COMPLETION_TOKENS,
      ),
    });

    const report = response.choices[0]?.message?.content;
    if (!report) throw new Error("Failed to generate report content");
    return report;
  } catch (error) {
    console.error("Error formatting report:", error);
    return `Error generating report: ${error instanceof Error ? error.message : "Unknown error"}`;
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

    const fcResult = await firecrawl.search(query, {
      scrape: true,
      extractContent: true,
      extractMetadata: true,
      extractorOptions: {
        prompt: `Extract detailed information relevant to: ${query}. Include specific facts, numbers, and key details.`,
        selector: 'body'
      }
    });

    console.log("Raw Firecrawl response:", {
      success: fcResult.success,
      dataCount: fcResult.data?.length,
      firstItemContent: fcResult.data?.[0]?.content?.substring(0, 100),
      firstItemMetadata: fcResult.data?.[0]?.metadata
    });

    const parsedResult = FirecrawlResult.safeParse(fcResult);

    if (!parsedResult.success) {
      console.warn(`Failed to parse Firecrawl results for query: ${query}`);
      return {
        findings: ["Error processing search results."],
        urls: [],
        media: [],
      };
    }

    const findings: string[] = [];
    const urls = parsedResult.data.data.map((item) => item.url);
    const media: MediaContent[] = [];

    // Process structured data and metadata from Firecrawl
    for (const item of parsedResult.data.data) {
      console.log("Processing item:", {
        url: item.url,
        hasContent: Boolean(item.content),
        contentLength: item.content?.length || 0,
        hasMetadata: Boolean(item.metadata),
      });

      // Process content if available
      if (item.content) {
        const content = item.content.trim();
        if (content.length > 0) {
          findings.push(`From ${item.url}: ${content}`);
          console.log(`Added content from ${item.url}, length: ${content.length}`);
        }
      }

      // Add metadata-based findings
      if (item.metadata?.title || item.metadata?.description) {
        const metadataContent = [
          item.metadata.title,
          item.metadata.description,
        ]
          .filter(Boolean)
          .join(" - ")
          .trim();

        if (metadataContent) {
          findings.push(`Metadata from ${item.url}: ${metadataContent}`);
          console.log(`Added metadata from ${item.url}: ${metadataContent.substring(0, 100)}...`);
        }
      }
    }

    // Only add placeholder if we truly have no findings
    if (findings.length === 0) {
      console.warn(`No usable content found for query: ${query}`);
      findings.push("No relevant findings available for this query.");
    }

    console.log(
      `Research results for "${query}":`,      {
        findingsCount: findings.length,
        mediaCount: media.length,
        urlsCount: urls.length,
        sampleFindings: findings.slice(0, 2).map(f => f.substring(0, 100) + "..."),
      },
    );

    return { findings, urls, media };
  } catch (error) {
    console.error("Error in researchQuery for query:", query, error);
    return { findings: ["Error retrieving results."], urls: [], media: [] };
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
    if (ws.readyState === WebSocket.OPEN) {      ws.send(JSON.stringify(progress));
    }
  };

  try{
    let context: ResearchContext = {
      query: research.query,
      learnings: [],
      visitedUrls: [],
      clarifications: research.clarifications || {},
      media: [],
      currentDepth: 0,
      totalDepth: research.fastMode ? 2 : 4,
      currentBreadth: 0,
      totalBreadth: research.fastMode ? 2 : 5,
      processedQueries: 0,
      batchesInCurrentDepth: 0,
    };

    let currentQueries = [context.query];

    console.log("Starting research:", {
      query: research.query,
      fastMode: research.fastMode,
      maxDepth: context.totalDepth,
      maxBreadth: context.totalBreadth,
    });

    while (context.currentDepth < context.totalDepth) {
      const queriesToProcess = currentQueries.slice(0, context.totalBreadth);
      context = updateResearchContext(context, {
        currentBreadth: queriesToProcess.length,
      });

      // Update progress before starting this batch
      const startMetrics = calculateProgressMetrics(context);
      sendProgress(constructProgressUpdate(context, "IN_PROGRESS", startMetrics));

      // Process all queries concurrently
      const results = await Promise.all(
        queriesToProcess.map(async (query) => {
          console.log(`Starting concurrent processing for query: ${query}`);
          const result = await researchQuery(query);
          console.log(`Finished query "${query}":`, {
            findingsCount: result.findings.length,
            urlsCount: result.urls.length,
            mediaCount: result.media.length,
          });

          // Optionally generate follow-up queries concurrently if not in fastMode
          let followUpQueries: string[] = [];
          if (!research.fastMode && context.currentDepth < context.totalDepth - 1) {
            followUpQueries = await expandQuery(context);
            console.log(`Generated ${followUpQueries.length} follow-up queries for "${query}"`);
          }
          return { result, followUpQueries };
        })
      );

      // Aggregate results from each query
      const newQueries: string[] = [];
      let newFindingsCount = 0;

      results.forEach(({ result, followUpQueries }) => {
        // Process findings
        if (result.findings.length > 0) {
          context.learnings.push(...result.findings);
          newFindingsCount += result.findings.length;
        }

        // Update other context data
        context.visitedUrls.push(...result.urls);
        context.media.push(...result.media);
        newQueries.push(...followUpQueries);
      });

      console.log(`Depth ${context.currentDepth + 1}/${context.totalDepth} completed:`, {
        newFindings: newFindingsCount,
        totalFindings: context.learnings.length,
        newQueries: newQueries.length,
      });

      // Update context and send progress
      context = updateResearchContext(context, {
        processedQueries: context.processedQueries + queriesToProcess.length,
        currentBreadth: queriesToProcess.length,
      });

      // Send progress update with current findings
      const currentMetrics = calculateProgressMetrics(context);
      sendProgress(
        constructProgressUpdate(
          context,
          "IN_PROGRESS",
          currentMetrics
        )
      );

      // Check if research is sufficient
      const sufficientResponse = await isResearchSufficient(context);
      if (sufficientResponse.isComplete && sufficientResponse.confidence >= 0.8) {
        console.log("Research deemed sufficient:", {
          confidence: sufficientResponse.confidence,
          reasoning: sufficientResponse.reasoning,
          totalFindings: context.learnings.length
        });
        break;
      }

      // Set up new queries for the next depth level
      currentQueries = newQueries;
      context = updateResearchContext(context, {
        currentDepth: context.currentDepth + 1,
        currentBreadth: 0,
        batchesInCurrentDepth: 0,
      });
    }

    // Generate final report
    const report = await formatReport(
      context.query,
      context.learnings,
      context.visitedUrls,
      context.media
    );

    // Send final progress update
    const finalMetrics = calculateProgressMetrics(context);
    sendProgress(
      constructProgressUpdate(context, "COMPLETED", finalMetrics, report)
    );

    if (onComplete) {
      await onComplete(report, context.visitedUrls);
    }
  } catch (error) {
    console.error("Research error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown research error";
    const errorMetrics = calculateProgressMetrics({
      ...context,
      currentDepth: 0,
      totalDepth: 1,
    });
    sendProgress(
      constructProgressUpdate(
        context,
        "ERROR",
        errorMetrics,
        undefined,
        errorMessage
      )
    );
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