# Model evaluation runbook (Sonnet 4 → replacement)

**Start here for onboarding:** [README.md](./README.md) (overview, PM section, dataset listing, reproducibility). This runbook goes deeper on method and stakeholder narrative.

**TL;DR:** We run the same realistic prompts through each candidate model, score answers with an automated **LLM-as-judge** plus a few safety and quality rules, store everything in Postgres, then rank models using fixed thresholds. The winner is the best **replacement** — not the retiring baseline.

---

## 1. Background and why we are doing this

**What this is:** Anthropic will **retire `claude-sonnet-4` on the Claude API on June 15, 2026, 9am PT**. Anything still calling that model will break.

**Why it matters:** Our product depends on this class of model for user-facing answers. We need a **repeatable** way to compare replacements on **our** traffic (not generic benchmarks), so product and engineering can agree on a migration with evidence.

**Who should read this:** Engineers run the pipeline; product, design, and leadership can read sections 1–4 and 7–9 without touching code.

---

## 2. What we tested (dataset)

**What it is:** A fixed list of **10 prompts** in `app/eval/dataset.ts` that mimic real work: product questions, debugging, RAG-style “answer only from snippets,” vague inputs, edge cases (including an empty message), compliance (GDPR), and operations (incident summary).

**Why it matters:** The goal is not to test trivia; it is to see how each model behaves on **shapes of work we already see** — triage, code help, policy Q&A, ambiguous tickets, and failure modes.

---

## 3. Candidate models

**What it is:** We evaluate **at least two** (we use **three**) “replacement” models per configuration:

- **Direct API mode (default):** `gpt-4o-mini`, `claude-sonnet-4-6`, `gemini-2.5-pro` (judge: `claude-opus-4-7` by default, not a candidate). Override the Anthropic judge with **`DIRECT_JUDGE_MODEL_ID`** if needed; it must **not** match any candidate (validated at startup).
- **OpenRouter mode:** three slugs from `OPENROUTER_CANDIDATE_MODELS` (must match [openrouter.ai/models](https://openrouter.ai/models) — OpenRouter IDs differ from raw Anthropic/Google names).
- **Free-tier Google mode:** `gemini-2.5-flash-lite`, `gemini-2.5-pro`, `gemini-1.5-flash` (judge default `gemini-2.5-flash`, not in that set). See `docs/GEMINI_MODEL_LINEUP.md`.

**Plain pros/cons:**

| Approach | Pros | Cons |
|----------|------|------|
| **Direct APIs** | Closest to production integration; clear vendor SLAs. | Three keys and three billing relationships. |
| **OpenRouter** | One key, one wallet, easy to swap slugs. | Extra hop; model IDs must match OpenRouter’s catalog (404 if wrong). |
| **Google-only free tier** | Cheapest to experiment. | Not a cross-vendor comparison unless you change mode. |

---

## 4. How scoring works

### LLM-as-judge (plain English)

**LLM-as-judge** means we use a **separate** model to read each answer and fill in a scorecard automatically, so humans are not hand-rating hundreds of cells.

**What it returns (0–10 each, plus issues):** correctness, clarity, completeness, helpfulness, safety, overall, and a list of `issues`.

**Important:** The judge model is **never** one of the candidate models being evaluated (see `app/eval/judge.ts` and env for judge selection).

### Rule-based checks (on top of the judge)

**Why:** Catch predictable failures the judge might miss or weight oddly.

- **Safety override:** If the answer text contains certain blocked substrings, we force **safety = 0** and append to issues.
- **Short output:** If the model used **under 50 output tokens**, we penalize completeness.
- **Debugging bonus:** For debugging-category prompts, if the answer includes a **markdown code fence** (```), we add a small correctness bonus (capped at 10).

After rules, we **recompute “overall”** as the average of the five dimension scores so penalties flow into the headline number.

### Empty user message (edge case)

Some APIs reject a **completely empty** user string. For that dataset row only, we send a **short harness text** to the model API, but the **judge still sees the real (empty) prompt** so we still measure “how do you handle empty input?” fairly.

---

## 5. How to run the eval (CLI)

1. Install: `npm install`
2. Configure env: `.env` or `.env.local` (see `.env.example`).
3. Apply DB schema once: `npm run db:schema`
4. Run: `npm start`
5. Optional **Sonnet 4 baseline** (4th model, same prompts): set `EVAL_BASELINE_SONNET4=true`  
   - OpenRouter: optional `OPENROUTER_BASELINE_SLUG` (default `anthropic/claude-sonnet-4`)  
   - Direct API: optional `BASELINE_ANTHROPIC_MODEL` (default `claude-sonnet-4`)  
   - **Not** used with `EVAL_FREE_TIER=true`.

Re-print the latest report without re-running APIs: `npm run report`.

**Optional knobs (same code paths; see [README — Optional controls](./README.md#optional-controls-implemented) and `.env.example`):**

| Variable | When it applies | Effect |
|----------|-----------------|--------|
| `DIRECT_JUDGE_MODEL_ID` | Direct API mode | Anthropic model id for the judge instead of the default in `app/eval/types.ts`; must not equal any candidate. |
| `MAX_P95_LATENCY_MS` | Any mode | Adds an eligibility gate: models with **p95 latency above** this value are not eligible as winner. |
| `EVAL_CATEGORY_WEIGHTS` | Any mode | JSON map of **category → weight**; per-dimension **means** for the gates use these weights (unknown categories weight **1**). |

---

## 6. How to add a new model

**What you are doing:** Adding another row in the “candidates” list for the same harness.

**Steps:**

1. **OpenRouter:** Add the slug to `OPENROUTER_CANDIDATE_MODELS` (must remain **exactly three** comma-separated slugs unless you change code to support N). Pick a judge slug that is **not** one of the three candidates.
2. **Direct API:** Add a new adapter under `app/eval/adapters/`, wire it in `runEval.ts` `buildAdaptersAndJudge`, extend `STANDARD_EVAL_MODEL_IDS` and `MODEL_COST_RATES_USD_PER_1M` in `types.ts`.

Always keep **one** judge model that is not in the candidate set.

---

## 7. Decision matrix and how we choose

**What it is:** A model is **eligible** only if **all** are true (see `DECISION_THRESHOLDS` in `app/eval/report.ts` — single source of truth):

- Average **correctness** ≥ **7.5**
- Average **safety** ≥ **9.0**
- Average **overall** ≥ **7.0**
- **Failure rate** \< **10%** (failed generations for that model)

**Optional gates (env-driven; same source of truth in `app/eval/report.ts`):**

- If **`MAX_P95_LATENCY_MS`** is set, the model is eligible only if its **p95 latency** is **≤** that value (milliseconds).
- If **`EVAL_CATEGORY_WEIGHTS`** is set (JSON object), the **averages** used for correctness, safety, overall, etc. are **category-weighted** across prompts; categories not listed use weight **1**.

**Judge override (direct API only):** **`DIRECT_JUDGE_MODEL_ID`** selects which Anthropic model runs the judge; it must remain **disjoint** from the three candidates (`validateApiKeys` in `app/eval/env.ts`).

**Ranking among eligible models:**

1. Higher average **overall**
2. Lower **p95 latency**
3. Lower estimated **total cost** for the batch (from token counts × list prices in `types.ts`)

**Baseline:** If `EVAL_BASELINE_SONNET4` is enabled, we still **score** Sonnet 4 on the same prompts, but it is **never** selected as the “winner” — it is only a **reference** for “how good was production before migration.”

---

## 8. Results summary (where to look)

- **Terminal:** table printed at end of `npm start`
- **JSON:** `eval-output/latest-run.json` (full report + per-prompt rows)
- **Postgres:** `prompts` and `results` joined by `prompt_id`; `eval_batch_id` groups one run
- **UI:** `npm run ui` → `http://localhost:3847` (override with `EVAL_UI_PORT`) — dashboard for the **latest** batch from Postgres (`public/index.html`). Use **Per-prompt results → Details** for full prompt text, model answer, and stored scores JSON. **Screenshots** of the dashboard and terminal output live in [README — Screenshots](./README.md#screenshots).

---

## 9. Final recommendation (how to write it for leadership)

The code prints an automated **recommendation string** using the numbers from the latest run. For a stakeholder memo, copy that line and add **one paragraph of product context**: what user journeys matter most (e.g. “debugging quality matters more than creative writing”), any **latency SLO**, and **budget**. Numbers from the runbook justify the pick; product judgment explains **why** those numbers are the right trade for us.

---

## Glossary

| Term | Meaning |
|------|---------|
| **Candidate model** | A model we might migrate *to*. |
| **Baseline** | The retiring `claude-sonnet-4` (or OpenRouter slug) used only for comparison. |
| **LLM-as-judge** | A separate model that scores another model’s answer. |
| **Failure rate** | Share of prompts where that model returned no stored answer after retries. |
| **p95 latency gate** | Optional env `MAX_P95_LATENCY_MS`: a model is ineligible if its **p95** latency exceeds this value. |
| **Category weights** | Optional env `EVAL_CATEGORY_WEIGHTS` (JSON): weights each prompt’s category when computing **averages** for threshold checks. |

---

## Instructor checklist (mapping)

| Requirement | Where it lives |
|-------------|----------------|
| 5–10 realistic prompts | 10 prompts in `app/eval/dataset.ts` |
| ≥ 2 candidate models | 3 candidates (+ optional baseline) |
| Evaluation design | `judge.ts` + `rules.ts` |
| Compare across models | `report.ts` aggregation + thresholds |
| Justified choice | Automated recommendation + this runbook for narrative |

If coursework asks for a **single PDF**, export this file and paste the latest recommendation paragraph from `npm start` under section 9.
