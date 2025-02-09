import OpenAI from 'openai';
import { z } from 'zod';
import FirecrawlApp from '@mendable/firecrawl-js';
import { WebSocket } from 'ws';
import { Research, ResearchProgress } from '@shared/schema';
import { encodingForModel } from 'js-tiktoken';

// Initialize API clients using environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;

if (!OPENAI_API_KEY || !FIRECRAWL_API_KEY) {
  throw new Error('Missing required API keys. Please set OPENAI_API_KEY and FIRECRAWL_API_KEY in Secrets.');
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const firecrawl = new FirecrawlApp({ apiKey: FIRECRAWL_API_KEY });

const MODEL_CONFIG = {
  FAST: "gpt-4o-mini-2024-07-18",
  BALANCED: "gpt-4o-2024-08-06",
  DEEP: "o3-mini-2025-01-31"
} as const;

// Token management utilities
function trimPrompt(text: string, model: string): string {
  try {
    let maxTokens = 4000; // default

    // Adjust token limit based on model
    switch(model) {
      case MODEL_CONFIG.DEEP:
        maxTokens = 128000;
        break;
      case MODEL_CONFIG.BALANCED:
        maxTokens = 8000;
        break;
      case MODEL_CONFIG.FAST:
        maxTokens = 4000;
        break;
    }

    const enc = encodingForModel(model === MODEL_CONFIG.DEEP ? "gpt-4" : model);
    const tokens = enc.encode(text);

    if (tokens.length <= maxTokens) {
      return text;
    }

    const chunks: string[] = [];
    let currentChunk = '';
    const sentences = text.split(/(?<=[.!?])\s+/);

    for (const sentence of sentences) {
      const potentialChunk = currentChunk + sentence;
      const chunkTokens = enc.encode(potentialChunk).length;

      if (chunkTokens <= maxTokens) {
        currentChunk = potentialChunk;
      } else if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = sentence;
      }
      else {
        const words = sentence.split(/\s+/);
        for (const word of words) {
          if (enc.encode(currentChunk + word).length <= maxTokens) {
            currentChunk += (currentChunk ? ' ' : '') + word;
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
    console.error('Error trimming prompt:', error);
    return text;
  }
}

async function determineResearchParameters(query: string): Promise<{ breadth: number; depth: number }> {
  try {
    const trimmedQuery = trimPrompt(query, MODEL_CONFIG.FAST);
    const response = await openai.chat.completions.create({
      model: MODEL_CONFIG.FAST,
      messages: [
        {
          role: 'system',
          content: 'You are an expert at determining optimal research parameters. Analyze the query complexity and scope to suggest appropriate breadth (2-10) and depth (1-5) values.'
        },
        {
          role: 'user',
          content: `Given this research query: "${trimmedQuery}", determine optimal research settings. Consider:
1. Query complexity and scope
2. Need for diverse sources (affects breadth)
3. Need for detailed exploration (affects depth)
Respond in JSON format with 'breadth' (2-10) and 'depth' (1-5).`
        }
      ],
      response_format: { type: "json_object" }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.log('Invalid AI response for parameter determination, using defaults');
      return { breadth: 4, depth: 2 };
    }

    const params = JSON.parse(content);
    return {
      breadth: Math.min(Math.max(Math.round(params.breadth), 2), 10),
      depth: Math.min(Math.max(Math.round(params.depth), 1), 5)
    };
  } catch (error) {
    console.error('Error determining research parameters:', error);
    return { breadth: 4, depth: 2 }; // Default fallback values
  }
}

async function generateClarifyingQuestions(query: string): Promise<string[]> {
  try {
    const trimmedQuery = trimPrompt(query, "gpt-4o");
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: 'user',
          content: `Generate 3 clarifying questions to better understand this research topic: "${trimmedQuery}"\nMake the questions specific and focused on understanding the user's research goals.`
        }
      ]
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.error('Invalid response from OpenAI:', response);
      return ['What specific aspects of this topic interest you the most?'];
    }

    const questions = content
      .split('\n')
      .map(line => line.replace(/^\d+\.\s*/, ''))
      .filter(q => q.length > 0);

    return questions.slice(0, 3);
  } catch (error) {
    console.error('Error generating clarifying questions:', error);
    return ['What specific aspects of this topic interest you the most?'];
  }
}

async function determineReportStructure(query: string, learnings: string[]): Promise<string> {
  try {
    const trimmedQuery = trimPrompt(query, "gpt-4o");
    const trimmedLearnings = learnings.map(l => l.slice(0, 100)).join('\n').slice(0, 500); 

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: 'system',
          content: 'You are an expert at determining the most appropriate structure for research reports. If the query asks for a ranked list or top N items, ensure the structure emphasizes that list format. Consider the nature of the query and findings to suggest the most suitable sections.'
        },
        {
          role: 'user',
          content: `Given this research query: "${trimmedQuery}" and sample findings like:\n${trimmedLearnings}\n\nProvide a report structure that would best present this information. If this is a "top N" or ranking query, make sure to include a numbered list section. Return only the section names in a simple list format.`
        }
      ]
    });

    return response.choices[0]?.message?.content || 'Introduction\nRanked List\nConclusion';
  } catch (error) {
    console.error('Error determining report structure:', error);
    return 'Introduction\nRanked List\nConclusion'; 
  }
}

async function formatReport(query: string, learnings: string[], visitedUrls: string[]): Promise<string> {
  try {
    const trimmedQuery = trimPrompt(query, "gpt-4o");
    const trimmedLearnings = learnings.map(l => trimPrompt(l, "gpt-4o"));
    const trimmedVisitedUrls = visitedUrls.map(url => trimPrompt(url, "gpt-4o"));

    const reportStructure = await determineReportStructure(query, learnings);
    const isRankingQuery = /top|best|ranking|rated|popular/i.test(query);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: 'system',
          content: isRankingQuery ?
            'You are creating a research report that requires a clear ranked list. Ensure the ranking is explicit and numbered. Maintain the requested ranking count (e.g., top 10) and format using markdown. Each ranked item should have a clear title and supporting details.' :
            'You are creating a detailed research report that presents information in a clear, structured format using markdown.'
        },
        {
          role: 'user',
          content: `Create a research report about "${trimmedQuery}" using these findings:\n\n${trimmedLearnings.join('\n')}\n\nUse this structure:\n${reportStructure}\n\nAdd a Sources section at the end listing these URLs:\n${trimmedVisitedUrls.join('\n')}\n\nUse markdown formatting. ${isRankingQuery ? 'Ensure rankings are clearly numbered and each item has supporting details.' : ''}`
        }
      ]
    });

    return response.choices[0]?.message?.content || 'Error generating report';
  } catch (error) {
    console.error('Error formatting report:', error);
    return 'Error generating research report';
  }
}

async function expandQuery(query: string): Promise<string[]> {
  try {
    const trimmedQuery = trimPrompt(query, "gpt-4o");
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: 'user',
          content: `Generate 3 follow-up questions to research this topic: ${trimmedQuery}\nFormat: Numbered list 1., 2., 3.`
        }
      ]
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.error('Invalid response from OpenAI:', response);
      return [];
    }

    return content
      .split('\n')
      .map(line => line.replace(/^\d+\.\s*/, ''))
      .filter(q => q.length > 0)
      .slice(0, 3);
  } catch (error) {
    console.error('Error expanding query:', error);
    return [];
  }
}

async function researchQuery(query: string): Promise<{ findings: string[], urls: string[] }> {
  try {
    console.log('Starting search for query:', query);
    const searchResults = await firecrawl.search(query, {
      limit: 5,
      wait: true, 
      timeout: 30000 
    });

    console.log('Search results:', JSON.stringify(searchResults, null, 2));

    if (!searchResults?.success || !Array.isArray(searchResults.data)) {
      console.error('Invalid search results structure:', searchResults);
      return { findings: ['No relevant information found.'], urls: [] };
    }

    const urls = searchResults.data.map(result => result.url);
    const context = searchResults.data
      .map(result => `${result.title}\n${result.description}`)
      .filter(text => text.length > 0)
      .join('\n\n');

    if (!context) {
      return { findings: ['No relevant information found.'], urls: [] };
    }

    const trimmedContext = trimPrompt(context, "gpt-4o");
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: 'user',
          content: `Analyze this research data and provide key findings about '${query}':\n\n${trimmedContext}\n\nFindings:`
        }
      ]
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { findings: ['Error analyzing research data.'], urls };
    }

    const findings = content
      .split('\n')
      .map(line => line.replace(/^[-•*]|\d+\.\s*/, '').trim())
      .filter(f => f.length > 0);

    return {
      findings: findings.length > 0 ? findings : ['Analysis completed but no clear findings extracted.'],
      urls
    };
  } catch (error) {
    console.error('Error researching query:', error);
    return {
      findings: [`Error while researching: ${error instanceof Error ? error.message : 'Unknown error'}`],
      urls: []
    };
  }
}

async function handleResearch(
  research: Research,
  ws: WebSocket,
  onComplete?: (report: string, visitedUrls: string[]) => Promise<void>
) {
  const sendProgress = (progress: ResearchProgress) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(progress));
    }
  };

  try {
    const { breadth, depth } = await determineResearchParameters(research.query);
    const autoResearch = { ...research, breadth, depth };

    const allLearnings: string[] = [];
    const visitedUrls: string[] = [];
    let completedQueries = 0;
    const totalQueries = autoResearch.breadth * autoResearch.depth;

    sendProgress({
      status: 'IN_PROGRESS',
      currentQuery: autoResearch.query,
      learnings: [],
      progress: 0,
      totalProgress: totalQueries,
      visitedUrls: []
    });

    let currentQueries = [autoResearch.query];

    for (let depth = 0; depth < autoResearch.depth; depth++) {
      const newQueries: string[] = [];

      for (let i = 0; i < currentQueries.length && i < autoResearch.breadth; i++) {
        const query = currentQueries[i];
        completedQueries++;

        sendProgress({
          status: 'IN_PROGRESS',
          currentQuery: query,
          learnings: allLearnings,
          progress: completedQueries,
          totalProgress: totalQueries,
          visitedUrls
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

    console.log('Generating final report with:', {
      queryCount: allLearnings.length,
      learnings: allLearnings,
      urlCount: visitedUrls.length
    });

    const formattedReport = await formatReport(autoResearch.query, allLearnings, visitedUrls);

    if (onComplete) {
      console.log('Calling onComplete callback with report and URLs');
      await onComplete(formattedReport, visitedUrls);
    }

    sendProgress({
      status: 'COMPLETED',
      learnings: allLearnings,
      progress: totalQueries,
      totalProgress: totalQueries,
      report: formattedReport,
      visitedUrls
    });

  } catch (error) {
    console.error('Error in handleResearch:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    sendProgress({
      status: 'ERROR',
      learnings: [],
      progress: 0,
      totalProgress: 1,
      error: errorMessage,
      visitedUrls: []
    });
  }
}

export { generateClarifyingQuestions, handleResearch };