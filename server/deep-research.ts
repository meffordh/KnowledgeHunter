import OpenAI from "openai";
import { z } from "zod";
import FirecrawlApp from "@mendable/firecrawl-js";
import { WebSocket } from "ws";
import { Research, ResearchProgress } from "@shared/schema";
import { encodingForModel } from "js-tiktoken";
import { isYouTubeVideoValid } from './youtubeVideoValidator';

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

// Update MODEL_CONFIG to use specific model for media-rich content
const MODEL_CONFIG = {
  BALANCED: "gpt-4o-2024-08-06",
  DEEP: "o3-mini-2025-01-31",
  MEDIA: "gpt-4o-mini-2024-07-18", // Using gpt-4o-mini for media processing due to its cost-efficient capabilities
} as const;

// Fix for encodingForModel type issue
function trimPrompt(text: string, model: string): string {
  try {
    let maxTokens = 8000; // default
    // Adjust token limit based on the selected model.
    switch (model) {
      case MODEL_CONFIG.DEEP:
        maxTokens = 128000;
        break;
      case MODEL_CONFIG.BALANCED:
      case MODEL_CONFIG.MEDIA:
      default:
        maxTokens = 16000;
        break;
    }
    // Use cl100k_base for all models as it's the most compatible
    const enc = encodingForModel("gpt-4");
    const tokens = enc.encode(text);
    if (tokens.length <= maxTokens) {
      return text;
    }
    // Chunk text while preserving sentence boundaries.
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
        // If a single sentence is too long, split by words.
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
    return chunks[0] || text.slice(0, Math.floor(maxTokens / 4));
  } catch (error) {
    console.error("Error trimming prompt:", error);
    return text;
  }
}

// Determine research parameters using a structured JSON schema response.
// We now use only the BALANCED model for parameter determination.
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
            "You are an expert at determining optimal research parameters. Analyze the query complexity and scope to suggest appropriate breadth (2-10) and depth (1-5) values.",
        },
        {
          role: "user",
          content: `Given this research query: "${trimmedQuery}", determine optimal research settings. Consider:
1. Query complexity and scope
2. Need for diverse sources (affects breadth)
3. Need for detailed exploration (affects depth)
Respond in JSON format with keys "breadth" and "depth".`,
        },
      ],
      // Use structured outputs via json_schema for guaranteed schema adherence.
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

// Generate clarifying questions using Structured Outputs.
// We use the BALANCED model and a json_schema response format to enforce valid JSON.
async function generateClarifyingQuestions(query: string): Promise<string[]> {
  try {
    const trimmedQuery = trimPrompt(query, MODEL_CONFIG.BALANCED);
    const response = await openai.chat.completions.create({
      model: MODEL_CONFIG.BALANCED,
      messages: [
        {
          role: "system",
          content:
            "You are a research assistant tasked with generating clarifying questions to refine research queries. Your output must be strictly formatted as valid JSON that exactly matches the provided schema. Do not include any additional commentary, whitespace, or HTML. Output only valid JSON.",
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
      max_completion_tokens: 1500,
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

// Determine report structure by asking the model for candidate outlines.
// We use the BALANCED model and instruct it to return multiple candidates separated by a delimiter.
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
            "You are an expert at determining optimal content structures. Analyze the query and sample findings to suggest multiple content structures. Each option should be a list of section headings tailored to the content. Separate options with '###'.",
        },
        {
          role: "user",
          content: `Given this research query: "${trimmedQuery}" and sample findings:\n${trimmedLearnings}\n\nGenerate 3 content structure candidates. Return them separated by "###", then choose the best candidate and output only that structure.`,
        },
      ],
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
    // Choose the candidate with the most sections.
    return candidates.reduce((a, b) =>
      a.split("\n").length > b.split("\n").length ? a : b,
    );
  } catch (error) {
    console.error("Error determining report structure:", error);
    return "Executive Summary\nKey Findings\nDetailed Analysis\nConclusion\nSources";
  }
}

// Determine the optimal model type based on the query and volume of learnings.
// Since we have removed FAST mode, we only decide between BALANCED and DEEP.
async function determineModelType(
  query: string,
  learnings?: string[],
): Promise<keyof typeof MODEL_CONFIG> {
  try {
    // If there is a very large volume of learnings, use DEEP mode.
    if (learnings && learnings.length > 100) {
      return "DEEP";
    }
    const trimmedQuery = trimPrompt(query, MODEL_CONFIG.BALANCED);
    const response = await openai.chat.completions.create({
      model: MODEL_CONFIG.BALANCED,
      messages: [
        {
          role: "system",
          content:
            "You are an expert at determining optimal AI model selection based on query complexity and research data volume. Choose between BALANCED and DEEP modes based on the following criteria:\n\nBALANCED: For multi-faceted topics with moderate complexity and data volume.\nDEEP: For complex technical topics or when there are many findings requiring extensive context.",
        },
        {
          role: "user",
          content: `Given this research query: "${trimmedQuery}" and a total of ${
            learnings?.length || 0
          } findings, respond with exactly one option: "BALANCED" or "DEEP".`,
        },
      ],
    });
    const content = response.choices[0]?.message?.content?.trim().toUpperCase();
    if (content && content in MODEL_CONFIG) {
      return content as keyof typeof MODEL_CONFIG;
    }
    return "BALANCED";
  } catch (error) {
    console.error("Error determining model type:", error);
    return "BALANCED";
  }
}

// Add media detection functionality
interface MediaContent {
  type: "video" | "image";
  url: string;
  title?: string;
  description?: string;
  embedCode?: string;
}

// Fix for undefined URL issue in detectMediaContent
async function detectMediaContent(url: string): Promise<MediaContent[]> {
  if (!url) {
    console.warn("Received empty URL in detectMediaContent");
    return [];
  }
  try {
    const response = await fetch(url);
    const html = await response.text();
    const mediaContent: MediaContent[] = [];

    // Detect YouTube videos
    const youtubeRegex =
      /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g;
    const youtubeMatches = Array.from(html.matchAll(youtubeRegex));

    // Process each YouTube video match
    for (const match of youtubeMatches) {
      const videoId = match[1];
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

      // Validate the video before adding it
      const isValid = await isYouTubeVideoValid(videoUrl);
      if (isValid) {
        mediaContent.push({
          type: "video",
          url: videoUrl,
          embedCode: `<iframe width="560" height="315" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`,
        });
      } else {
        console.warn(`Skipping invalid YouTube video: ${videoUrl}`);
      }
    }

    // Fix for undefined matches in image detection
    const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/g;
    const imgMatches = Array.from(html.matchAll(imgRegex));
    for (const match of imgMatches) {
      const imgUrl = match[1];
      if (imgUrl && imgUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
        if (
          !imgUrl.includes("icon") &&
          !imgUrl.includes("logo") &&
          !imgUrl.includes("spacer")
        ) {
          mediaContent.push({
            type: "image",
            url: imgUrl,
          });
        }
      }
    }

    return mediaContent;
  } catch (error) {
    console.error("Error detecting media content:", error);
    return [];
  }
}

// Update researchQuery to include media content
async function researchQuery(
  query: string,
): Promise<{ findings: string[]; urls: string[]; media: MediaContent[] }> {
  try {
    console.log("Starting search for query:", query);
    const searchResults = await firecrawl.search(query, {
      limit: 5,
      wait: true,
      timeout: 30000,
    });

    if (!searchResults?.success || !Array.isArray(searchResults.data)) {
      return {
        findings: ["No relevant information found."],
        urls: [],
        media: [],
      };
    }

    const urls = searchResults.data.map((result) => result.url);
    const mediaPromises = urls.map((url) => detectMediaContent(url));
    const mediaResults = await Promise.all(mediaPromises);
    const allMedia = mediaResults.flat();

    // Include media information in the context for AI analysis
    const context = searchResults.data
      .map((result, index) => {
        const mediaForUrl = mediaResults[index];
        return `${result.title}\n${result.description}\n${
          mediaForUrl.length > 0
            ? `Related media: ${mediaForUrl
                .map((m) => `${m.type.toUpperCase()}: ${m.url}`)
                .join("\n")}`
            : ""
        }`;
      })
      .filter((text) => text.length > 0)
      .join("\n\n");

    if (!context) {
      return {
        findings: ["No relevant information found."],
        urls: [],
        media: [],
      };
    }

    const trimmedContext = trimPrompt(context, MODEL_CONFIG.MEDIA);
    const response = await openai.chat.completions.create({
      model: MODEL_CONFIG.MEDIA,
      messages: [
        {
          role: "system",
          content:
            "Analyze the research data including any media content. For videos and images, evaluate their relevance and potential value to the research. Include specific references to media content in your findings when appropriate.",
        },
        {
          role: "user",
          content: `Analyze this research data and provide key findings about '${query}', including relevant media content:\n\n${trimmedContext}\n\nFindings:`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return {
        findings: ["Error analyzing research data."],
        urls,
        media: allMedia,
      };
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
      media: allMedia,
    };
  } catch (error) {
    console.error("Error researching query:", error);
    return {
      findings: [
        `Error while researching: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      ],
      urls: [],
      media: [],
    };
  }
}

// Update formatReport to include media content
async function formatReport(
  query: string,
  learnings: string[],
  visitedUrls: string[],
  media: MediaContent[],
): Promise<string> {
  try {
    const isRankingQuery = /top|best|ranking|rated|popular|versus|vs\./i.test(
      query,
    );
    const modelType = "DEEP"; // Always use MEDIA model for final report
    const model = MODEL_CONFIG[modelType];

    const maxCompletionTokens = modelType === "DEEP" ? 8000 : 4000;

    const trimmedQuery = trimPrompt(query, model);
    const trimmedLearnings = learnings.map((l) => trimPrompt(l, model));
    const trimmedVisitedUrls = visitedUrls.map((url) => trimPrompt(url, model));

    // Format media content for the AI
    const mediaContext = media
      .map(
        (m) =>
          `${m.type.toUpperCase()}: ${m.url}${m.title ? ` - ${m.title}` : ""}${m.description ? `\nDescription: ${m.description}` : ""}`,
      )
      .join("\n\n");

    const reportStructure = await determineReportStructure(query, learnings);

    const response = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: `You are creating a comprehensive piece of content that incorporates both textual findings and rich media content. Use markdown formatting and generate a verbose output (at least 3000 tokens if context permits). When referencing media content:
          - For videos: Include them as embedded content using provided embed codes or as markdown links
          - For images: Include them using markdown image syntax
          - For other media types: Include them as markdown links
          - For sources: use footnotes to reference the source
          - For comparisons: include a markdown table if appropriate for the context
          Structure the report to flow naturally between text and media elements.`,
        },
        {
          role: "user",
          content: `Create a detailed research report about "${trimmedQuery}" using these findings and media content:

Findings:
${trimmedLearnings.join("\n")}

Available Media Content:
${mediaContext}

Follow this structure:
${reportStructure}

Include a comprehensive Sources section with these URLs:
${trimmedVisitedUrls.join("\n")}

${isRankingQuery ? "Ensure rankings are clearly numbered with detailed explanations for each item." : "Provide extensive analysis and insights throughout each section."}

Important: Integrate relevant media content naturally within the report where it adds value to the discussion.`,
        },
      ],
      max_completion_tokens: maxCompletionTokens,
    });

    let report =
      response.choices[0]?.message?.content || "Error generating report";

    // Post-process the report to ensure proper media embedding
    media.forEach((m) => {
      if (m.type === "video" && m.embedCode) {
        // Handle both watch and embed URLs
        const videoUrlPatterns = [
          new RegExp(`\\[.*?\\]\\(${m.url}\\)`, "g"), // Markdown link format
          new RegExp(m.url, "g"), // Plain URL
          new RegExp(m.url.replace("watch?v=", "embed/"), "g") // Embed URL format
        ];

        videoUrlPatterns.forEach(pattern => {
          report = report.replace(pattern, "\n\n" + m.embedCode + "\n\n");
        });
      }
    });

    // Clean up any remaining plain YouTube URLs by converting them to markdown links
    report = report.replace(
      /https?:\/\/(www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/g,
      "[$&]($&)"
    );

    return report;
  } catch (error) {
    console.error("Error formatting report:", error);
    return "Error generating research report";
  }
}

// Generate follow-up queries for a given query using the BALANCED model.
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

// Update handleResearch to manage media content
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
    const allMedia: MediaContent[] = [];
    let completedQueries = 0;
    const totalQueries = autoResearch.breadth * autoResearch.depth;

    sendProgress({
      status: "IN_PROGRESS",
      currentQuery: autoResearch.query,
      learnings: [],
      progress: 0,
      totalProgress: totalQueries,
      visitedUrls: [],
      media: [],
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
          media: allMedia,
        });
        const { findings, urls, media } = await researchQuery(query);
        allLearnings.push(...findings);
        visitedUrls.push(...urls);
        allMedia.push(...media);
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
      mediaCount: allMedia.length,
    });
    const formattedReport = await formatReport(
      autoResearch.query,
      allLearnings,
      visitedUrls,
      allMedia,
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
      media: allMedia, // Include media in the final progress update
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
      media: [], // Include empty media array in error state
    });
  }
}

export { generateClarifyingQuestions, handleResearch };