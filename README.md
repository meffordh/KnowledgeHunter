flowchart TD
    A[Start: handleResearch(research query)]
    B[trimPrompt(query, MODEL_CONFIG.BALANCED)]
    C[determineResearchParameters\n"Expert: Determine breadth & depth"\nModel: GPT-4o-2024-08-06]
    D[Output: {breadth, depth}]
    E[Loop over query iterations\n(for each depth & breadth)]
    F[researchQuery(query)]
    G[FirecrawlApp.search(query)\n(Returns search results)]
    H[detectMediaContent(url)\n(Local function: extracts media)]
    I[Compile context\nCombine search results & media;\ntrim via trimPrompt(context, MODEL_CONFIG.MEDIA)]
    J[OpenAI Chat Completion\n"Analyze research data including media"\nModel: GPT-4o-mini-2024-07-18]
    K[Output: {findings, urls, media}]
    L[expandQuery(query)\n"Generate 3 follow-up questions"\nModel: GPT-4o-2024-08-06]
    M[Output: Follow-up queries]
    N[Accumulate all learnings, URLs, and media]
    O[formatReport(query, learnings, visitedUrls, media)\nModel: GPT-4o-mini-2024-07-18]
    P[Final Report (Markdown with embedded media)]
    Q[Send progress updates via WebSocket\n(sendProgress)]

    A --> B
    B --> C
    C --> D
    D --> E
    E --> F
    F --> G
    G --> H
    H --> I
    I --> J
    J --> K
    K --> E
    E -- "if depth incomplete" --> L
    L --> M
    M --> E
    E --> N
    N --> O
    O --> P
    P --> Q
```

</details>

## Key Features

### Advanced Research Capabilities
- Dynamic query processing with AI-powered analysis
- Intelligent depth-based exploration
- Real-time progress tracking
- Comprehensive source citations
- Downloadable research reports
- Clarifying questions generation
- Automated follow-up queries

### Report Customization & Rendering
- Multiple report templates
- Customizable citation styles
- Flexible section ordering
- Advanced markdown rendering with table support
- Error-resilient content display
- Export options (PDF, DOCX, HTML)
- Real-time preview

### User Experience
- Clean, modern interface
- Real-time progress updates
- Interactive query refinement
- Markdown report rendering
- Share and export options
- Mobile-responsive design
- Dark mode support

### AI Integration
- OpenAI-powered analysis
- Firecrawl web data extraction
- Intelligent query expansion
- Context-aware summarization
- Source verification
- Media content detection

### Technical Features
- WebSocket real-time updates
- React with TypeScript
- Error boundaries for stability
- Clerk authentication
- PostgreSQL database
- RESTful API endpoints
- Robust error handling

## Prerequisites

- Node.js 20.x or higher
- PostgreSQL database
- Clerk account
- OpenAI API key
- Firecrawl API key

## Environment Variables

```bash
# Database Configuration
DATABASE_URL=postgresql://user:password@host:port/database
PGHOST=your_pg_host
PGPORT=your_pg_port
PGUSER=your_pg_user
PGPASSWORD=your_pg_password
PGDATABASE=your_pg_database

# API Keys
OPENAI_API_KEY=your_openai_api_key
FIRECRAWL_API_KEY=your_firecrawl_api_key
CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key
```

## Setup Instructions

1. Clone the repository:
```bash
git clone https://github.com/meffordh/KnowledgeHunter.git
cd KnowledgeHunter
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
   - Create a `.env` file in the root directory
   - Add all required environment variables as shown above

4. Start the development server:
```bash
npm run dev
```

## Project Structure

```
├── client/                # Frontend React application
│   ├── src/
│   │   ├── components/   # Reusable UI components
│   │   ├── hooks/        # Custom React hooks
│   │   ├── lib/          # Utility functions
│   │   └── pages/        # Page components
├── server/               # Backend Express application
│   ├── auth.ts          # Authentication setup
│   ├── deep-research.ts # Research logic
│   ├── routes.ts        # API routes
│   └── storage.ts       # Database interface
└── shared/              # Shared types and schemas