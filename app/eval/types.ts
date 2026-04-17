export type GenerateResponse = {
  text: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
}

export interface ModelAdapter {
  readonly modelId: string
  generate(prompt: string): Promise<GenerateResponse>
}

export type DatasetPrompt = {
  id: string
  category: string
  prompt: string
}

export type JudgeScores = {
  correctness: number
  clarity: number
  completeness: number
  helpfulness: number
  safety: number
  overall: number
  issues: string[]
}

/**
 * Persisted to `results.scores` (JSONB). Token counts stay raw; `cost_usd` is derived later.
 */
export type PersistedEvalScores = {
  evalBatchId: string
  inputTokens: number
  outputTokens: number
  /** Judge-only JSON output (audit trail). */
  judgeRaw: JudgeScores | null
  /** Scores after judge + rule-based adjustments. Null if judge failed. */
  finalScores: JudgeScores | null
  issues: string[]
  appliedRules: string[]
}

/** Direct-API cross-vendor benchmark (original product spec). */
export const STANDARD_EVAL_MODEL_IDS = [
  'gpt-4o-mini',
  'claude-sonnet-4-6',
  'gemini-2.5-pro',
] as const
export type StandardEvalModelId = (typeof STANDARD_EVAL_MODEL_IDS)[number]

/**
 * Google AI Studio–style lineup (often usable within free quotas; Google can change limits).
 */
export const FREE_TIER_EVAL_MODEL_IDS = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-pro',
  'gemini-1.5-flash',
] as const
export type FreeTierEvalModelId = (typeof FREE_TIER_EVAL_MODEL_IDS)[number]

/**
 * Default OpenRouter model slugs (one billable wallet; pricing follows OpenRouter + upstream).
 * Override with OPENROUTER_CANDIDATE_MODELS (exactly three comma-separated slugs).
 */
/** Slugs must match https://openrouter.ai/models (OpenRouter IDs differ from raw vendor names). */
export const OPENROUTER_DEFAULT_CANDIDATES = [
  'openai/gpt-4o-mini',
  'anthropic/claude-sonnet-4.6',
  'google/gemini-2.5-flash',
] as const
export type OpenRouterDefaultModelSlug = (typeof OPENROUTER_DEFAULT_CANDIDATES)[number]

/** Direct-API judge: must not appear in `STANDARD_EVAL_MODEL_IDS`. See Anthropic models docs. */
export const JUDGE_MODEL_ID = 'claude-opus-4-7' as const

export const FREE_TIER_JUDGE_GEMINI_MODEL_DEFAULT = 'gemini-2.5-flash' as const

export type CostRates = {
  inputPerMillionUsd: number
  outputPerMillionUsd: number
}

/**
 * Rough list prices for cost display (report totals only). OpenRouter adds a spread on top of upstream.
 *
 * **OpenAI** rows here use **Standard** text pricing (input + output per 1M tokens), not Batch / Flex / Priority.
 * See https://platform.openai.com/docs/pricing — e.g. `gpt-4o-mini` matches the flagship table at $0.15 in / $0.60 out
 * (cached-input and other columns are not modeled).
 */
export const MODEL_COST_RATES_USD_PER_1M: Record<string, CostRates> = {
  'gpt-4o-mini': { inputPerMillionUsd: 0.15, outputPerMillionUsd: 0.6 },
  'claude-3-5-sonnet-20241022': { inputPerMillionUsd: 3.0, outputPerMillionUsd: 15.0 },
  'claude-sonnet-4-6': { inputPerMillionUsd: 3.0, outputPerMillionUsd: 15.0 },
  'claude-opus-4-7': { inputPerMillionUsd: 5.0, outputPerMillionUsd: 25.0 },
  'gemini-1.5-pro': { inputPerMillionUsd: 1.25, outputPerMillionUsd: 5.0 },
  'gemini-2.5-pro': { inputPerMillionUsd: 1.25, outputPerMillionUsd: 10.0 },
  'gemini-1.5-flash-8b': { inputPerMillionUsd: 0.0375, outputPerMillionUsd: 0.15 },
  'gemini-1.5-flash': { inputPerMillionUsd: 0.075, outputPerMillionUsd: 0.3 },
  'gemini-2.5-flash': { inputPerMillionUsd: 0.075, outputPerMillionUsd: 0.3 },
  'gemini-2.5-flash-lite': { inputPerMillionUsd: 0.05, outputPerMillionUsd: 0.2 },
  'gemini-2.0-flash': { inputPerMillionUsd: 0.1, outputPerMillionUsd: 0.4 },
  'openai/gpt-4o-mini': { inputPerMillionUsd: 0.15, outputPerMillionUsd: 0.6 },
  'anthropic/claude-3.5-sonnet': { inputPerMillionUsd: 3.0, outputPerMillionUsd: 15.0 },
  'anthropic/claude-3-5-sonnet-20241022': { inputPerMillionUsd: 3.0, outputPerMillionUsd: 15.0 },
  'anthropic/claude-sonnet-4.6': { inputPerMillionUsd: 3.0, outputPerMillionUsd: 15.0 },
  'google/gemini-pro-1.5': { inputPerMillionUsd: 1.25, outputPerMillionUsd: 5.0 },
  'google/gemini-1.5-pro': { inputPerMillionUsd: 1.25, outputPerMillionUsd: 5.0 },
  'google/gemini-1.5-flash': { inputPerMillionUsd: 0.075, outputPerMillionUsd: 0.3 },
  'google/gemini-2.5-flash': { inputPerMillionUsd: 0.075, outputPerMillionUsd: 0.3 },
  'google/gemini-2.5-pro': { inputPerMillionUsd: 1.25, outputPerMillionUsd: 10.0 },
  /** Retiring baseline — approximate Sonnet-class list pricing for reporting only */
  'claude-sonnet-4': { inputPerMillionUsd: 3.0, outputPerMillionUsd: 15.0 },
  'anthropic/claude-sonnet-4': { inputPerMillionUsd: 3.0, outputPerMillionUsd: 15.0 },
}

export function computeCostUsdForModel(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rates = MODEL_COST_RATES_USD_PER_1M[model]
  if (!rates) return 0
  return (
    (inputTokens / 1_000_000) * rates.inputPerMillionUsd +
    (outputTokens / 1_000_000) * rates.outputPerMillionUsd
  )
}
