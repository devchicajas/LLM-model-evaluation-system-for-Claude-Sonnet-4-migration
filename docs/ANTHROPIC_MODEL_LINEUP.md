# Anthropic “latest models” lineup (API IDs filled in)

Your table had empty **Claude API ID** cells. Below are the **Messages API** model strings from Anthropic’s [models documentation](https://platform.claude.com/docs/en/about-claude/models) (same source as the comparison table).

| Feature | Claude Opus 4.7 | Claude Sonnet 4.6 | Claude Haiku 4.5 |
|--------|-----------------|-------------------|------------------|
| Role | Most capable GA model for complex reasoning and agentic coding | Best mix of speed and intelligence | Fastest, near-frontier |
| **Claude API ID** | `claude-opus-4-7` | `claude-sonnet-4-6` | `claude-haiku-4-5-20251001` |
| **Claude API alias** | `claude-opus-4-7` | `claude-sonnet-4-6` | `claude-haiku-4-5` |
| Pricing (list, per MTok) | $5 in / $25 out | $3 in / $15 out | $1 in / $5 out |
| Extended thinking | No | Yes | Yes |
| Adaptive thinking | Yes | Yes | No |
| Context (from docs table) | 1M | 1M | 200k |

Full pricing nuances (caching, batch, vision, etc.) stay on Anthropic’s pricing page, linked from those docs.

---

## How this connects to **Sonnet 4 retirement**

Anthropic documents **Claude Sonnet 4** (`claude-sonnet-4-20250514` and related) as **deprecated** with a migration path to **current** models. **Sonnet 4.6** (`claude-sonnet-4-6`) is the natural “same family, newer Sonnet” successor when your product cares about **speed + quality** at Sonnet-class pricing.

**Opus 4.7** is the right comparison when you care most about **maximum quality / hardest coding**, not lowest cost.

**Haiku 4.5** is the right comparison for **high volume, low latency, lower cost** workloads.

---

## How this repo uses Anthropic today

- **Default direct-API candidates** (cross-vendor benchmark): OpenAI + **Claude Sonnet 4.6 (`claude-sonnet-4-6`)** + **Gemini 2.5 Pro (`gemini-2.5-pro`)** — not the “three Anthropic models only” lineup above.
- **Judge** (direct API): **`claude-opus-4-7`** — must stay separate from candidates (matches current [Anthropic models](https://platform.claude.com/docs/en/about-claude/models) IDs).
- **Optional baseline**: **`claude-sonnet-4`** (or env override) when `EVAL_BASELINE_SONNET4=true`, for “before vs after” on the same prompts.

To **evaluate only** Opus 4.7 vs Sonnet 4.6 vs Haiku 4.5, you’d wire three `createAnthropicMessagesAdapter(key, '<id>')` instances (or the equivalent OpenRouter slugs) in `runEval.ts` / env — that’s a deliberate product choice, not the current default.

---

## Other platform IDs (from the same doc table)

If you deploy on **AWS Bedrock** or **Vertex AI**, use the **Bedrock ID** / **Vertex AI ID** columns from the official table, not the Claude API ID strings above.
