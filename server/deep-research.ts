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
  BALANCED: "gpt-4o-2024-11-20", // Used for both fast and normal mode
  DEEP: "o3-mini-2025-01-31", // Used only for detailed analysis in normal mode
  MEDIA: "gpt-4o-mini-2024-07-18", // Used for media processing
} as const;

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
function trimPrompt(text: string, model: string): string {
  try {
    // Always use a safe, known tokenizer
    const enc = encodingForModel("gpt-4");

    let maxTokens = 8000; // Default token limit
    if (model.includes("o3-mini")) {
      maxTokens = 128000;
    } else if (model.includes("gpt-4o")) {
      maxTokens = 16000;
    }

    const tokens = enc.encode(text);
    if (tokens.length <= maxTokens) {
      return text;
    }

    console.warn(
      `Prompt exceeds ${maxTokens} tokens for ${model}. Trimming...`,
    );

    // Sentence-based trimming
    const sentences = text.split(/(?<=[.!?])\s+/);
    let trimmedText = "";
    let currentTokens = 0;

    for (const sentence of sentences) {
      const candidateText = trimmedText
        ? `${trimmedText} ${sentence}`
        : sentence;
      const candidateTokens = enc.encode(candidateText).length;

      if (candidateTokens <= maxTokens) {
        trimmedText = candidateText;
        currentTokens = candidateTokens;
      } else {
        break;
      }
    }

    // Word-level fallback trimming if needed
    if (currentTokens > maxTokens) {
      const words = trimmedText.split(" ");
      let finalTrimmedText = "";
      for (const word of words) {
        const candidateTokens = enc.encode(
          finalTrimmedText + " " + word,
        ).length;
        if (candidateTokens <= maxTokens) {
          finalTrimmedText += " " + word;
        } else {
          break;
        }
      }
      return finalTrimmedText.trim();
    }

    return trimmedText;
  } catch (error) {
    console.error(`Error trimming prompt for ${model}:`, error);
    return text.slice(0, 5000); // Return a hardcoded safe fallback
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
  imageUrls: string[],
): Promise<Array<{ isUseful: boolean; title?: string; description?: string }>> {
  try {
    // Build messages array with text content and multiple images
    const messages = [
      {
        role: "system" as const,
        content:
          "You are a visual analysis assistant. Analyze the images and respond in a JSON array where each element corresponds to one image. Each element should have keys: isUseful (boolean), title (a short descriptive title), and description (a short description). Only return valid JSON.",
      },
      {
        role: "user" as const,
        content: [
          {
            type: "text",
            text: "Analyze these images and determine if they are useful for research purposes:",
          },
          ...imageUrls.map((url) => ({
            type: "image_url",
            image_url: { url },
          })),
        ],
      },
    ];

    const response = await openai.chat.completions.create({
      model: MODEL_CONFIG.MEDIA.name,
      messages,
      max_tokens: 150 * imageUrls.length, // Adjust tokens based on batch size
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content || !content.trim().startsWith("[")) {
      console.warn("Invalid vision analysis response format");
      return imageUrls.map(() => ({ isUseful: false }));
    }

    return JSON.parse(content);
  } catch (error) {
    console.error("Vision analysis error for images:", error);
    return imageUrls.map(() => ({ isUseful: false }));
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

    // Process YouTube videos first
    const youtubeRegex =
      /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g;
    const youtubeMatches = html.matchAll(youtubeRegex);
    for (const match of Array.from(youtubeMatches)) {
      const videoId = match[1];
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      if (await isYouTubeVideoValid(videoUrl)) {
        mediaContent.push({
          type: "video",
          url: videoUrl,
          embedCode: `<iframe width="560" height="315" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`,
        });
      }
    }

    // Batch process images
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/g;
    const imgMatches = html.matchAll(imgRegex);
    const imageUrls = new Set<string>();
    const imagesToAnalyze: string[] = [];

    // Collect and filter images
    for (const match of Array.from(imgMatches)) {
      let imgUrl = match[1];

      // Skip non-content images
      if (
        imgUrl.includes("icon") ||
        imgUrl.includes("logo") ||
        imgUrl.includes("avatar") ||
        imgUrl.includes("thumbnail") ||
        !imgUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i)
      ) {
        continue;
      }

      // Convert relative URLs to absolute
      if (imgUrl.startsWith("/")) {
        const urlObj = new URL(url);
        imgUrl = `${urlObj.protocol}//${urlObj.host}${imgUrl}`;
      } else if (!imgUrl.startsWith("http")) {
        const urlObj = new URL(url);
        imgUrl = `${urlObj.protocol}//${urlObj.host}/${imgUrl}`;
      }

      // Only process unique images
      if (!imageUrls.has(imgUrl)) {
        imageUrls.add(imgUrl);
        imagesToAnalyze.push(imgUrl);
      }
    }

    // Process images in batches
    const BATCH_SIZE = 10;
    for (let i = 0; i < imagesToAnalyze.length; i += BATCH_SIZE) {
      const batch = imagesToAnalyze.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch of ${batch.length} images from ${url}`);

      try {
        const analyses = await analyzeImageWithVision(batch);

        // Process each analyzed image
        await Promise.all(
          analyses.map(async (analysis, index) => {
            if (analysis.isUseful) {
              const imgUrl = batch[index];
              const dimensions = await getImageDimensions(imgUrl);

              if (
                dimensions &&
                dimensions.width >= 400 &&
                dimensions.width <= 2500
              ) {
                mediaContent.push({
                  type: "image",
                  url: imgUrl,
                  title: analysis.title,
                  description: analysis.description,
                });
              }
            }
          }),
        );
      } catch (error) {
        console.error(`Error processing image batch from ${url}:`, error);
      }
    }

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
- Incorporate media references where relevant, using proper markdown image syntax ![description](url) or embedding provided YouTube iframes
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
    currentQuery: context.learnings[context.learnings.length - 1] || context.query,
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
  const sendProgress = (progress: ResearchProgress) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(progress));
    }
  };

  try {
    console.log(
      `Starting research in ${research.fastMode ? "Quick Hunt" : "Deep Hunt"} mode`,
    );

    // Always use fixed minimal parameters for fast mode
    const parameters = research.fastMode
      ? { breadth: 1, depth: 1 }
      : await determineResearchParameters(research.query);

    // Calculate total steps for progress tracking
    const totalSteps = research.fastMode ? 4 : parameters.breadth * parameters.depth;
    console.log(
      `Research parameters: breadth=${parameters.breadth}, depth=${parameters.depth}, mode=${research.fastMode ? "Quick Hunt" : "Deep Hunt"}`,
    );

    const autoResearch = { ...research, ...parameters };
    const allLearnings: string[] = [];
    const visitedUrls: string[] = [];
    const allMedia: MediaContent[] = [];
    let currentStep = 0;

    // Initial progress update
    sendProgress({
      status: "IN_PROGRESS",
      currentQuery: autoResearch.query,
      learnings: [],
      progress: currentStep,
      totalProgress: totalSteps,
      visitedUrls: [],
      media: [],
    });

    let currentQueries = [autoResearch.query];
    for (let d = 0; d < autoResearch.depth; d++) {
      // For each depth level, process all current queries concurrently up to the specified breadth
      const queriesToProcess = currentQueries.slice(0, autoResearch.breadth);

      // Map each query to a promise that processes the query
      const promises = queriesToProcess.map(async (query) => {
        // Update progress before starting each query
        currentStep++;
        sendProgress({
          status: "IN_PROGRESS",
          currentQuery: query,
          learnings: allLearnings,
          progress: currentStep,
          totalProgress: totalSteps,
          visitedUrls,
          media: allMedia,
        });

        // Process the query concurrently
        const result = await researchQuery(query);

        // If not in fast mode and if this is not the final depth,
        // generate follow-up queries concurrently
        let followUpQueries: string[] = [];
        if (!research.fastMode && d < autoResearch.depth - 1) {
          followUpQueries = await expandQuery(query);
        }
        return { result, followUpQueries };
      });

      // Await all queries in parallel
      const results = await Promise.all(promises);

      // Process each result and aggregate learnings, URLs, media, and next queries
      const newQueries: string[] = [];
      results.forEach(({ result, followUpQueries }) => {
        const { findings, urls, media } = result;
        allLearnings.push(...findings);
        visitedUrls.push(...urls.filter(Boolean));
        allMedia.push(...media);
        newQueries.push(...followUpQueries);
      });

      // Set up next depth level with the new queries generated
      currentQueries = newQueries;
    }

    // Update progress before report generation
    if (research.fastMode) {
      currentStep++;
      sendProgress({
        status: "IN_PROGRESS",
        currentQuery: "Generating final report...",
        learnings: allLearnings,
        progress: currentStep,
        totalProgress: totalSteps,
        visitedUrls,
        media: allMedia,
      });
    }

    console.log("Generating final report with:", {
      queryCount: allLearnings.length,
      learnings: allLearnings,
      urlCount: visitedUrls.length,
      mediaCount: allMedia.length,
      mode: research.fastMode ? "Quick Hunt" : "Deep Hunt",
    });

    const formattedReport = await formatReport(
      autoResearch.query,
      allLearnings,
      visitedUrls,
      allMedia,
    );

    if (onComplete) {
      await onComplete(formattedReport, visitedUrls);
    }

    // Send final progress update with completed report
    sendProgress({
      status: "COMPLETED",
      currentQuery: autoResearch.query,
      learnings: allLearnings,
      progress: totalSteps,
      totalProgress: totalSteps,
      visitedUrls,
      media: allMedia,
      report: formattedReport,
    });
  } catch (error) {
    console.error("Error in handleResearch:", error);
    sendProgress({
      status: "ERROR",      currentQuery: research.query,
      learnings: [],
      progress: 0,
      totalProgress: 1,
      visitedUrls: [],
      media: [],
      error: error instanceof Error ? error.message : "Unknown error occurred",
    });
  }
}

async function determineResearchParameters(
  query: string,
): Promise<{ breadth: number; depth: number }> {
  // Placeholder for a more sophisticated parameter determination logic
  // This could involve analyzing the query complexity or using a separate model
  const breadth = Math.floor(Math.random() * 5) + 3;
  const depth = Math.floor(Math.random() * 3) + 2;
  return { breadth, depth };
}


export { 
  handleResearch,
  generateClarifyingQuestions,
  formatReport,
  researchQuery,
  type MediaContent,
};