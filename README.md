# ResearchHunter

ResearchHunter is an intelligent web-based research platform designed to simplify complex information gathering through advanced AI-powered authentication and data retrieval mechanisms. The application focuses on robust, scalable OAuth integration with comprehensive error handling and social platform connectivity.

## Features

- AI-powered research assistance using OpenAI GPT-4
- LinkedIn OAuth authentication with OpenID Connect
- Real-time research progress tracking via WebSocket
- Persistent storage with PostgreSQL
- Comprehensive error handling and logging
- TypeScript/Node.js backend with Express
- React frontend with shadcn/ui components
- WebSocket for real-time communication
- Firecrawl integration for web crawling

## Prerequisites

- Node.js 20.x or higher
- PostgreSQL database
- LinkedIn Developer account
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
```

## API Documentation

### Authentication Endpoints

- `POST /api/register` - Register a new user
- `POST /api/login` - Login with email/password
- `GET /api/auth/linkedin` - Initiate LinkedIn OAuth flow
- `GET /api/auth/linkedin/callback` - LinkedIn OAuth callback
- `POST /api/logout` - Logout current user
- `GET /api/user` - Get current user information

### Research Endpoints

- `POST /api/clarify` - Generate clarifying questions
- `GET /api/research/history` - Get user's research history
- `WebSocket /ws` - Real-time research updates

## Development Guidelines

- Follow the TypeScript coding style
- Use Drizzle ORM for database operations
- Implement proper error handling
- Add comprehensive logging
- Test authentication flows thoroughly

## License

MIT

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request
