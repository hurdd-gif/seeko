SEEKO Studio is a Vite + React Router app with a separate Hono API server.

## Getting Started

Run the frontend development server:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) with your browser to see the result.

## EKO Agent API

EKO uses the Hono API server endpoint at `POST /api/agent/chat`. In local development,
run both processes so Vite can proxy `/api` to the backend:

```bash
npm run start
npm run dev
```

Configure both providers in `.env.local`:

```bash
# hybrid routes general/status chat to OpenAI and write/risk/draft prep to Claude.
EKO_AGENT_PROVIDER=hybrid

# OpenAI Responses API
OPENAI_API_KEY=...
EKO_OPENAI_MODEL=gpt-5.4-mini

# Anthropic Messages API
ANTHROPIC_API_KEY=...
EKO_ANTHROPIC_MODEL=claude-sonnet-5
```

Typing `fail`, `error`, `offline`, or `timeout` into EKO chat triggers the local
failure state for UI testing without calling the provider.

React Router routes live in `src/rr-app/routes`. The page auto-updates as you edit source files.

### Favicon / app icon

Static app icons and logo assets are served from the public/static asset paths used by Vite.
