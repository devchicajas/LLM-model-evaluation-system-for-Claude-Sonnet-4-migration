# LLM model evaluation (Claude Sonnet 4 migration)

Small evaluation pipeline to pick a **replacement** model before **Anthropic retires `claude-sonnet-4` on the Claude API (June 15, 2026, 9am PT)**.

## Quick start

1. Copy `.env.example` → `.env` or `.env.local` and set `DATABASE_URL` plus one API mode (OpenRouter, direct keys, or Google-only free tier — see `.env.example`).
2. Create tables: `npm run db:schema`
3. Run eval: `npm start`
4. Open dashboard: `npm run ui` → [http://localhost:3847](http://localhost:3847)

Artifacts: terminal report, `eval-output/latest-run.json`, rows in Postgres.

## Docs

- **[MODEL_EVAL_RUNBOOK.md](./MODEL_EVAL_RUNBOOK.md)** — full method for engineers and stakeholders (dataset, scoring, decision, baseline).
- **[docs/ANTHROPIC_MODEL_LINEUP.md](./docs/ANTHROPIC_MODEL_LINEUP.md)** — Opus 4.7 / Sonnet 4.6 / Haiku 4.5 **API IDs** and how they relate to Sonnet 4 migration vs this repo’s defaults.

## Scripts

| Command | Purpose |
|--------|---------|
| `npm start` | Run full eval + print report + write `eval-output/latest-run.json` |
| `npm run report` | Re-print report for latest batch (or `--batch=<uuid>`) |
| `npm run db:schema` | Apply `sql/schema.sql` |
| `npm run ui` | Local dashboard (reads latest batch from DB) |
| `npm run typecheck` | TypeScript |

## Repo layout

- `app/eval/` — dataset, adapters, judge, rules, `runEval`, `report`, export
- `scripts/` — CLI + UI server + schema apply
- `public/` — dashboard static page
- `sql/schema.sql` — Postgres schema
