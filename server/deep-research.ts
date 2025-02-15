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
    // const tokenizerName = "cl100k_base"; // Always use cl100k_base tokenizer
    const enc = encodingForModel("gpt-4");

    const tokens = enc.encode(text);

    let maxTokens = modelConfig.maxTokens;
    // Adjust token limits based on model context
    if (modelConfig.name.includes("gpt-4o")) {
      maxTokens = Math.min(maxTokens, 100000);
    } else if (modelConfig.name.includes("o3-mini")) {
      maxTokens = Math.min(maxTokens, 100000);
    }

    if (tokens.length <= maxTokens) {
      return text;
    }

    console.warn(
      `Prompt exceeds token limit (${tokens.length} > ${maxTokens}) for model ${modelConfig.name}. Trimming prompt.`,
    );

    // Trim to token limit and decode back to text
    const trimmedTokens = tokens.slice(0, maxTokens);
    return enc.decode(trimmedTokens);
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

// -----------------------------
// Helper: analyzeImageWithVision
// -----------------------------
async function analyzeImagesWithVision(urls: string[]): Promise<AnalyzedImage[]> {
  try {
    // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
    const response = await openai.chat.completions.create({
      model: MODEL_CONFIG.MEDIA,
      messages: [
        {
          role: "system",
          content: "You are a precise JSON generator for vision analysis. Your response must be ONLY valid JSON, with no additional text, comments, or formatting. The JSON must follow this exact schema: { \"images\": [ { \"url\": string, \"isUseful\": boolean, \"title\": string, \"description\": string } ] }. Do not include any explanations or markdown formatting.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze these images and determine which ones could be useful for research purposes. Respond with ONLY valid JSON:\n${JSON.stringify(urls)}`,
            }
          ],
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.error("Empty response from vision analysis");
      return urls.map(url => ({ url, isUseful: false }));
    }

    let parsedContent;
    try {
      parsedContent = JSON.parse(content);

      if (!Array.isArray(parsedContent.images)) {
        console.error("Invalid response structure from vision analysis:", content);
        return urls.map(url => ({ url, isUseful: false }));
      }

      // Additional validation of the parsed content
      const isValidImage = (img: any): img is AnalyzedImage => {
        return typeof img.url === 'string' &&
               typeof img.isUseful === 'boolean' &&
               (!img.title || typeof img.title === 'string') &&
               (!img.description || typeof img.description === 'string');
      };

      const validImages = parsedContent.images.filter(isValidImage);
      if (validImages.length === 0) {
        console.error("No valid image analysis results found");
        return urls.map(url => ({ url, isUseful: false }));
      }

      return validImages;
    } catch (error) {
      console.error("Failed to parse vision analysis response:", error);
      console.error("Raw response content:", content);
      return urls.map(url => ({ url, isUseful: false }));
    }
  } catch (error) {
    console.error("Error in batch vision analysis:", error);
    return urls.map(url => ({ url, isUseful: false }));
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
    const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g;
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
      if (imgUrl.includes("icon") || imgUrl.includes("logo") || imgUrl.includes("spacer")) {
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
            if (dimensions && dimensions.width >= 400 && dimensions.width <= 2500) {
              mediaContent.push({
                type: "image",
                url: image.url,
                title: image.title,
                description: image.description,
              });
            }
          } catch (error) {
            console.error("Error processing image dimensions:", image.url, error);
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
        {
          role: "system",
          content: `Generate an engaging content piece encompassing your vast knowledge and given findings to thoroughly answer the users explicit and implicit question, to engage them in the topic and wow them with your capabilities while adhering to these guidelines:
- Use markdown formatting for structure and content
- Use headings to organize sections
- Incorporate a section for key findings near the beginning
- Use writing style that is appropriate given the context of the query
- Use tabular data to display findings where relevant
- Incorporate media references where relevant, using proper markdown image syntax ![description](url) 
- Place relevant images near their related content
- For each image or video, include a brief caption explaining its relevance
- Use markdown formatting for structure
- Cite sources using footnotes
- Conclude with key insights and recommendations
- Include a sources section`,
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

    const fcResult = await firecrawl.search(query);
    const parsedResult = FirecrawlResult.safeParse(fcResult);

    if (!parsedResult.success) {
      console.warn(`Failed to parse Firecrawl results for query: ${query}`);
      return {
        findings: ["Error processing search results."],
        urls: [],
        media: [],
      };
    }

    const urls = parsedResult.data.data.map((item) => item.url);

    // Fetch pages directly
    console.log(`Fetching ${urls.length} pages for detailed content analysis`);
    const rawHtmlPromises = urls.map((url) => fetchWithTimeout(url, 5000));
    const rawHtmlResults = await Promise.allSettled(rawHtmlPromises);

    const extractedContent = rawHtmlResults
      .map((result, index) => {
        if (result.status === "fulfilled") {
          return { url: urls[index], html: result.value };
        } else {
          console.warn(`Skipping failed fetch for URL: ${urls[index]}`);
          return null;
        }
      })
      .filter(
        (result): result is { url: string; html: string } => result !== null,
      );

    // Process both Firecrawl content and fetched HTML
    const findings: string[] = [];

    // Add Firecrawl findings first
    const firecrawlFindings = parsedResult.data.data
      .map((item) => item.content || "")
      .filter((content) => content.trim() !== "");
    findings.push(...firecrawlFindings);

    // Add extracted content from HTML
    for (const { url, html } of extractedContent) {
      try {
        // Extract main content from HTML (avoiding navigation, headers, footers)
        const contentMatch =
          html.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ||
          html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
          html.match(
            /<div[^>]*?class="[^"]*?(?:content|main)[^"]*?"[^>]*>([\s\S]*?)<\/div>/i,
          );

        if (contentMatch) {
          const textContent = contentMatch[1]
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();

          if (textContent.length > 100) {
            // Only add substantial content
            findings.push(`From ${url}: ${textContent}`);
          }
        }
      } catch (error) {
        console.warn(`Error extracting content from ${url}:`, error);
      }
    }

    // If no findings were gathered, provide a placeholder
    if (findings.length === 0) {
      console.warn(`No usable content found for query: ${query}`);
      findings.push("No relevant findings available for this query.");
    }

    // Detect media content from the fetched pages
    const mediaPromises = extractedContent.map(({ url }) =>
      detectMediaContent(url),
    );
    const mediaResults = await Promise.all(mediaPromises);
    const media = mediaResults.flat();

    console.log(
      `Found ${findings.length} findings and ${media.length} media items for query: ${query}`,
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
      totalDepth: research.fastMode ? 2 : 4,
      currentBreadth: 0,
      totalBreadth: research.fastMode ? 2 : 5,
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

      // Update progress before starting the batch
      const startMetrics = calculateProgressMetrics(context);
      sendProgress(
        constructProgressUpdate(context, "IN_PROGRESS", startMetrics),
      );

      const results = await Promise.all(
        queries.map(async (query) => {
          console.log(`Executing query: ${query}`);
          const result = await researchQuery(query);

          // Send progress update after each query completion
          const queryMetrics = calculateProgressMetrics({
            ...context,
            processedQueries: context.processedQueries + 1,
          });
          sendProgress(
            constructProgressUpdate(context, "IN_PROGRESS", queryMetrics),
          );

          return result;
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

        // Send progress update after processing each batch of findings
        const batchMetrics = calculateProgressMetrics(context);
        sendProgress(
          constructProgressUpdate(context, "IN_PROGRESS", batchMetrics),
        );
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