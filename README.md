# DecisionRoom V1

DecisionRoom is a greenfield Next.js 16 application for decision intelligence workflows:

1. Capture a decision prompt and structured constraints.
2. Run an LLM-assisted clarification loop to produce a canonical `DecisionBrief`.
3. Execute multi-framework analysis (Top-12 deep + remaining registry frameworks).
4. Build a propagated consensus/conflict map across frameworks.
5. Export markdown and zipped visual assets (`.svg` + `.png`).

## V1 Coverage

- 50 framework registry entries.
- 12 deep analyzers:
  - Eisenhower Matrix
  - SWOT
  - BCG Matrix
  - Project Portfolio Matrix
  - Pareto Principle
  - Hype Cycle
  - Chasm/Diffusion
  - Monte Carlo Simulation
  - Consequences Model
  - Crossroads Model
  - Conflict Resolution Model
  - Double-Loop Learning
- Hybrid provider routing:
  - Local: Ollama
  - Hosted: Anthropic
  - Fallback behavior for unavailable providers

## Tech Stack

- Next.js App Router + TypeScript
- Prisma + SQLite
- Zod contracts
- D3 + Framer Motion visual workspace
- Archiver + Sharp export pipeline
- Vitest test suite

## Quick Start

```bash
npm install
cp .env.example .env
npm run db:generate
npm run db:push
npm run dev
```

Open: `http://localhost:3000`

## Environment Variables

```env
DATABASE_URL="file:./dev.db"
ANTHROPIC_API_KEY=""
ANTHROPIC_MODEL="claude-3-5-sonnet-latest"
OLLAMA_BASE_URL="http://localhost:11434"
OLLAMA_MODEL="llama3.2"
```

## Key Scripts

- `npm run dev` - development server
- `npm run build` - production build
- `npm run lint` - ESLint
- `npm run typecheck` - TypeScript checks
- `npm run test` - Vitest
- `npm run db:push` - sync Prisma schema to SQLite
- `npm run db:seed` - seed framework definitions

## API Routes

- `POST /api/decisions`
- `POST /api/decisions/:id/refine`
- `POST /api/decisions/:id/analyze`
- `GET /api/runs/:runId`
- `GET /api/decisions/:id/results`
- `GET /api/decisions/:id/export?format=md|zip`

## Notes

- V1 is single-user and local SQLite by default.
- Long-running analysis execution is queued in-process for local/dev runtime.
- Exports are generated on demand and tracked in `ExportArtifact`.
