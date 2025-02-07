graph TD
    A[User Input] --> B[Clarifying Questions]
    B --> C[Research Parameters]
    C --> D[Initial Query Processing]
    D --> E{Depth Level Loop}
    E --> F[Query Expansion]
    F --> G[Web Crawling]
    G --> H[Content Analysis]
    H --> I[Knowledge Extraction]
    I --> J{More Depth?}
    J -->|Yes| E
    J -->|No| K[Report Generation]
    K --> L[Source Citation]
    L --> M[Final Report]
```

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

# OAuth Configuration
LINKEDIN_CLIENT_ID=your_linkedin_client_id
LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret

# API Keys
OPENAI_API_KEY=your_openai_api_key
FIRECRAWL_API_KEY=your_firecrawl_api_key
```

## Setup Instructions

1. Clone the repository:
```bash
git clone https://github.com/yourusername/research-hunter.git
cd research-hunter
```

2. Install dependencies:
```bash
npm install
```

3. Set up LinkedIn OAuth:
   - Create a LinkedIn application at https://www.linkedin.com/developers/apps
   - Enable "Sign In with LinkedIn using OpenID Connect"
   - Add your callback URL: `https://your-domain.com/api/auth/linkedin/callback`
   - Configure the required scopes: `openid`, `profile`, `email`, `w_member_social`
   - Copy your Client ID and Client Secret to the environment variables

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