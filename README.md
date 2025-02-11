# KnowledgeHunter

**KnowledgeHunter** is an advanced research and report generation platform that leverages AI and real-time data extraction to deliver comprehensive, high-quality research reports. With dynamic query processing, customizable report templates, and robust real-time progress updates, KnowledgeHunter transforms the way research is performed and shared.

[![Live Demo](https://img.shields.io/badge/Demo-Live-brightgreen)](https://knowledgehunter.io)
[![Developer](https://img.shields.io/badge/Developer-Hunter_Mefford-blue)](https://www.linkedin.com/in/mefford)

## Overview

KnowledgeHunter automates research workflows by:

- **Dynamically processing queries** and determining the optimal breadth and depth
- **Extracting web data** using Firecrawl and detecting media content
- **Analyzing research data** with context-aware AI models
- **Generating comprehensive reports** in Markdown with customizable sections
- **Sending real-time progress updates** via WebSockets

The application is built using modern web technologies including React with TypeScript, Express on the backend, PostgreSQL for storage, and integrates third-party services such as OpenAI, Clerk for authentication, and Firecrawl for data extraction.

## Research Flow

Below is a diagram that outlines the core research process:

```mermaid
flowchart TD
    A["Start: handleResearch"]
    B["Trim query with trimPrompt (BALANCED)"]
    C["Determine research parameters (Model: BALANCED)"]
    D["Output: breadth & depth"]
    E["Loop over query iterations"]
    F["Process query iteration with researchQuery"]
    G["Search with FirecrawlApp.search"]
    H["Detect media content (local: detectMediaContent)"]
    I["Compile and trim context (trimPrompt with MEDIA)"]
    J["Analyze research data (Model: MEDIA)"]
    K["Output: findings, URLs, media"]
    L["Generate followup queries (Model: BALANCED)"]
    M["Output: followup queries"]
    N["Accumulate learnings and media"]
    O["Format report with formatReport (Model: MEDIA)"]
    P["Final Report in Markdown"]
    Q["Send progress updates (WebSocket: sendProgress)"]

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
    E -- Optional --> L
    L --> M
    M --> E
    E --> N
    N --> O
    O --> P
    P --> Q
```

## Key Features

### Advanced Research Capabilities

- **Dynamic Query Processing**: Intelligent trimming and parameter determination using AI models
- **Iterative Query Handling**: Automatically loops over query iterations and generates follow-up questions
- **Web Data Extraction**: Integrates with Firecrawl to search the web and detect media content
- **Context Accumulation**: Compiles and analyzes findings, URLs, and media content
- **Real-Time Updates**: Provides live progress updates via WebSockets

### Report Customization & Rendering

- **Multiple Report Templates**: Offers various styles and citation formats
- **Flexible Section Ordering**: Lets users customize the report layout
- **Advanced Markdown Rendering**: Robust markdown (with table support) is rendered through a dedicated component wrapped in error boundaries
- **Export Options**: Supports PDF, DOCX, and HTML exports along with a live preview

### User Experience

- **Clean, Modern Interface**: A responsive, mobile-friendly design with dark mode support
- **Interactive Query Refinement**: Real-time adjustments to research queries
- **Real-Time Progress**: Keeps users informed with continuous updates

### AI Integration & Technical Features

- **OpenAI-Powered Analysis**: Uses state-of-the-art models for data summarization and analysis
- **Source Verification**: Ensures accurate research outputs with context-aware follow-up queries
- **Error Resilience**: Implements error boundaries (for example, in markdown rendering) to prevent crashes
- **Modern Tech Stack**: Built using React, TypeScript, Express, PostgreSQL, Clerk authentication, and RESTful APIs

## Prerequisites

Before you begin, ensure you have the following installed and configured:

- Node.js 20.x or higher
- PostgreSQL database
- A Clerk account
- An OpenAI API key
- A Firecrawl API key

## Environment Variables

Create a `.env` file in the root directory with the following variables:

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

3. Configure Environment Variables:
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
│   │   ├── lib/          # Utility functions and helper modules
│   │   └── pages/        # Page components
├── server/               # Backend Express application
│   ├── auth.ts          # Authentication setup
│   ├── deep-research.ts # Research logic (modularized for clarity)
│   ├── routes.ts        # API endpoints and routes
│   └── storage.ts       # Database interface
└── shared/              # Shared types and schemas
```

## Additional Updates & Modularization

### Markdown Rendering Modularization

To avoid cluttering `deep-research.ts`, we extracted the markdown rendering into its own component. For example, in `SafeMarkdown.tsx`:

```tsx
// SafeMarkdown.tsx
import React from 'react';
import ReactMarkdown from 'react-markdown';
import ErrorBoundary from './ErrorBoundary';

const SafeMarkdown = ({ content }: { content: string }) => (
  <ErrorBoundary fallback={<div>Error rendering markdown.</div>}>
    <ReactMarkdown>{content}</ReactMarkdown>
  </ErrorBoundary>
);

export default SafeMarkdown;
```

### Error Boundaries

The new error boundary component ensures that any errors (e.g., "this.setData is not a function") during markdown rendering do not crash the entire application.

### Real-Time Progress Updates

The `sendProgress` function (using WebSockets) provides users with live updates throughout the research process.

## Contributing

Contributions, issues, and feature requests are welcome! Please check [Issues](https://github.com/meffordh/KnowledgeHunter/issues) or open a pull request.