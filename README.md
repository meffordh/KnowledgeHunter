# KnowledgeHunter

**KnowledgeHunter** is an advanced research and report generation platform that leverages AI, real-time data extraction, and cutting-edge analysis to deliver comprehensive, high-quality research reports. With dynamic query processing, customizable report templates, and robust real-time progress updates, KnowledgeHunter transforms the way research is performed and shared.

[![Live Demo](https://img.shields.io/badge/Demo-Live-brightgreen)](https://knowledgehunter.io)
[![Developer](https://img.shields.io/badge/Developer-Hunter_Mefford-blue)](https://www.linkedin.com/in/mefford)

---

## Overview

KnowledgeHunter automates research workflows by:

- **Dynamic Query Processing:** Intelligent trimming and parameter determination via AI models.
- **Iterative Research Loops:** Automatically generates follow-up queries to refine and deepen research.
- **Multi-Modal Data Extraction:** Uses Firecrawl to search the web, validate YouTube videos, and detect media content.
- **Vision Model Integration:** Applies a vision model to analyze and validate image content, ensuring only high-quality images are considered.
- **Adaptive Research Modes:** Choose between **Quick Hunter** (balanced, faster research) and **Deep Hunter** (comprehensive, detailed analysis) modes.
- **Rich Report Rendering:** Produces final reports in Markdown—including markdown table rendering and rich media embeds.
- **Real-Time Progress Indicators:** Provides live progress updates over WebSockets so users can follow research in real time.
- **UI/UX Enhancements:** A refreshed, responsive, and intuitive user interface with improved interactions, error boundaries, and clear status feedback.

---

## Updated Research Flow

The updated process now distinguishes between Quick Hunter vs Deep Hunter modes, integrates vision-based image analysis and YouTube video validation, and enriches report rendering with markdown table support. Below is the updated Mermaid flowchart:


```mermaid
flowchart TD
    A["Start: handleResearch"]
    B["Trim query with trimPrompt (BALANCED)"]
    C["Determine research parameters (Model: BALANCED)"]
    D["Output: breadth & depth\n(Quick Hunter vs Deep Hunter)"]
    E["Loop over query iterations"]
    F["Process iteration with researchQuery"]
    G["Search via FirecrawlApp.search"]
    H["Detect media content & validate YouTube videos"]
    I["Vision Model Analysis for Images"]
    J["Compile & trim context (trimPrompt with MEDIA)"]
    K["Analyze data with OpenAI (Model: MEDIA)"]
    L["Render Markdown with Tables & Formatting"]
    M["Generate follow-up queries (BALANCED)"]
    N["Accumulate learnings, URLs & Media"]
    O["Format report (Model: MEDIA)"]
    P["Final Report in Markdown with Progress Indicators"]
    Q["Send real-time progress updates (WebSocket)"]

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
    K --> L
    L --> N
    E -- Optional --> M
    M --> N
    N --> O
    O --> P
    P --> Q
```

## Key Features

### Adaptive Research Modes: Quick Hunter vs Deep Hunter
- **Quick Hunter:** Uses a fixed minimal set of research parameters for faster, balanced research output.
- **Deep Hunter:** Dynamically calculates optimal breadth and depth based on query complexity to perform an in-depth investigation.

### Enhanced Media Analysis
- **Vision Model for Image Analysis:** Integrates a vision model (via OpenAI's latest vision-enabled models) to analyze and validate image content before including it in the report.
- **YouTube Video Validation:** Verifies YouTube video availability and validity by checking for error markers and parsing the embedded player response.

### Improved Report Rendering & UI/UX
- **Markdown Table Rendering:** Final reports can now include well-formatted markdown tables to clearly present comparative data.
- **Progress Indicators:** Real-time progress feedback is provided throughout the research process, helping users monitor the evolving analysis.
- **UI/UX Improvements:** A refreshed frontend with enhanced styling, intuitive interactions, and robust error boundaries (e.g., in markdown rendering) ensure a seamless user experience.

### Real-Time Updates & Interactivity
- **Live Progress Updates:** Uses WebSockets to push continuous progress updates (e.g., current query status, percentage complete, and interim findings).
- **Interactive Query Refinement:** The system generates clarifying questions and follow-up queries, allowing users to refine their research inputs interactively.

### Architecture & Technology Stack

#### Frontend
- **React & TypeScript:** Modern, type-safe UI built with React.
- **Tailwind CSS:** Highly customizable and responsive styling.
- **Framer Motion:** Smooth animations for transitions and UI feedback.
- **Component Library:** Reusable components for dialogs, forms, notifications, and more.

#### Backend
- **Express & Node.js:** Robust REST API and WebSocket server.
- **PostgreSQL & Drizzle ORM:** Structured, type-safe database interactions.
- **Clerk Authentication:** Secure user authentication and session management.
- **Firecrawl & OpenAI Integration:** For advanced web crawling, search, and AI-driven analysis.

#### Shared
- **Zod & Drizzle-Zod:** Schema validation for both client and server.
- **Common Types:** Shared schemas and types ensure consistency across the codebase.

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