# Agate Workflow Automation App

Nuxt-based workflow automation app that uses OpenAI API to:
- generate structured workflow plans (`topic` + ordered `steps`),
- execute each step with approval/edit flow,
- track token consumption,
- persist workflow, steps, execution logs, and analytics in Supabase PostgreSQL,
- provide history + analytics pages, and deploy on Vercel.

## Main Features
- Local auth (register/login) with profile table.
- Workflow builder API (JSON output only: `topic`, `step[]`).
- Step-by-step executor with retry, run-all, and editable step input/output.
- Save/load workflow from database.
- Workflow execution logs per step.
- Token analytics (overview, by day, by workflow).

## Tech Stack
- Nuxt (Nitro server routes)
- OpenAI Responses API
- Supabase PostgreSQL
- Vercel deployment

## Setup Instructions

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
Copy `.env.example` into `.env`, then fill values:
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`
- `OPENAI_TEMPERATURE`
- `OPENAI_MAX_OUTPUT_TOKENS`
- `OPENAI_SYSTEM_PROMPT`
- `APP_TIMEZONE`
- `DB_URL`
- `DB_SSL_MODE`

### 3. Prepare database schema (Supabase SQL Editor)
Run:
- `db/app_auth_schema.sql`
- `db/workflow_schema.sql`

### 4. Run locally
```bash
npm run dev
```

### 5. Build preview
```bash
npm run build
npm run preview
```

## API Overview (Core)
- `POST /api/workflowbuilder`
- `POST /api/workflowexecute-step`
- `GET /api/workflows/history`
- `GET /api/workflows/:id/executions`
- `GET /api/analytics/token-summary`
- `POST /api/workflows`
- `GET /api/workflows/:id`
- `PUT /api/workflows/:id`

## Time Log

| Activity | Time Range (WIB) | Duration |
|---|---|---|
| Initial setup Nuxt project, base API hit OpenAI, create GitHub repo | 2026-03-08 10:48 - 11:30 | 42 menit |
| Create API for workflow and step builder | 2026-03-08 11:30 - 12:00 | 30 menit |
| Revamp workflow API to return JSON only (`topic`, `step`) | 2026-03-08 12:00 - 12:20 | 20 menit |
| Create workflow execution for each step from workflow API | 2026-03-08 12:20 - 13:00 | 40 menit |
| Create approve + edit flow per step, add current-time context to AI | 2026-03-08 13:00 - 13:30 | 30 menit |
| Add token consumption monitoring per step + run-all button | 2026-03-08 13:30 - 13:50 | 20 menit |
| Integrate Supabase DB + tables for login/workflow/steps | 2026-03-08 13:50 - 14:20 | 30 menit |
| Create token execution analytics page + workflow load menu | 2026-03-08 14:20 - 14:25 | 5 menit |
| Minor UX revamp + implement to Vercel | 2026-03-08 14:25 - 14:40 | 15 menit |
| Ensure all project requirements are fulfilled | 2026-03-08 14:25 - 15:00 | 35 menit |

## Requirement Fulfillment
- Workflow builder with strict JSON output: done.
- Step-by-step execution with approval/edit/retry/run-all: done.
- Time-aware context for relative date prompts: done.
- Token usage tracking (input/output/total/cached): done.
- Save/load workflow + execution logs + analytics via DB: done.
- History page + execution detail page + analytics page: done.
- Deployment target (Vercel): done.

## AI Tools Used
- OpenAI API: core reasoning engine for workflow generation and step execution.
- Codex: coding assistant tool for implementation and refactor.
- ChatGPT: application flow brainstorming and document wording/polishing.

## Deployed Link
- https://automation-test-snowy.vercel.app?_vercel_share=HNtbzt1Hj7V5vXQ7NE98PJoklaaiyShq

## Demo Login (If you do not want to create a new account, you can use the following credentials)
Email: agate@testing.com
password : 12345678