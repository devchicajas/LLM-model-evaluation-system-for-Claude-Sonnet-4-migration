import {
  FREE_TIER_EVAL_MODEL_IDS,
  OPENROUTER_DEFAULT_CANDIDATES,
  STANDARD_EVAL_MODEL_IDS,
} from './types.js'

const STANDARD_REQUIRED_KEYS = [
  { name: 'ANTHROPIC_API_KEY', env: 'ANTHROPIC_API_KEY' },
  { name: 'OPENAI_API_KEY', env: 'OPENAI_API_KEY' },
  { name: 'GOOGLE_API_KEY', env: 'GOOGLE_API_KEY' },
] as const

export function isOpenRouterEval(): boolean {
  const v = process.env.EVAL_OPENROUTER?.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

export function isFreeTierEval(): boolean {
  if (isOpenRouterEval()) return false
  const v = process.env.EVAL_FREE_TIER?.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

export function validateApiKeys(): void {
  if (isOpenRouterEval()) {
    if (!process.env.OPENROUTER_API_KEY?.trim()) {
      throw new Error(
        'OpenRouter eval (EVAL_OPENROUTER=true) requires OPENROUTER_API_KEY. See .env.example.',
      )
    }
    return
  }
  if (isFreeTierEval()) {
    if (!process.env.GOOGLE_API_KEY?.trim()) {
      throw new Error(
        'Free-tier eval (EVAL_FREE_TIER=true) requires GOOGLE_API_KEY. See .env.example.',
      )
    }
    return
  }

  const missing = STANDARD_REQUIRED_KEYS.filter(({ env }) => {
    const val = process.env[env]
    return val === undefined || val.trim() === ''
  }).map(({ name }) => name)

  if (missing.length > 0) {
    throw new Error(
      `Missing required API key environment variables: ${missing.join(
        ', ',
      )}. Alternatives: set EVAL_OPENROUTER=true with OPENROUTER_API_KEY, or EVAL_FREE_TIER=true with GOOGLE_API_KEY. See .env.example.`,
    )
  }
}

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL
  if (url === undefined || url.trim() === '') {
    throw new Error(
      'Missing DATABASE_URL. Set it to your PostgreSQL connection string (see .env.example).',
    )
  }
  return url
}

export function getOpenRouterCandidateSlugs(): readonly string[] {
  const raw = process.env.OPENROUTER_CANDIDATE_MODELS?.trim()
  if (!raw) {
    return OPENROUTER_DEFAULT_CANDIDATES
  }
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  if (parts.length !== 3) {
    throw new Error(
      'OPENROUTER_CANDIDATE_MODELS must list exactly three comma-separated OpenRouter model slugs (e.g. openai/gpt-4o-mini,anthropic/claude-3.5-sonnet,google/gemini-2.5-flash). Check https://openrouter.ai/models if you see 404 or "not a valid model ID".',
    )
  }
  return parts
}

/** Must not match any candidate slug for the same run. */
export function getOpenRouterJudgeModelSlug(): string {
  const raw = process.env.OPENROUTER_JUDGE_MODEL?.trim()
  if (raw) return raw
  return 'google/gemini-2.5-pro'
}

export function isBaselineSonnet4Enabled(): boolean {
  const v = process.env.EVAL_BASELINE_SONNET4?.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

/**
 * Retiring production model for side-by-side scoring (not eligible as "winner").
 * Ignored when EVAL_FREE_TIER=true (use OpenRouter or direct mode for baseline).
 */
export function getBaselineEvalModelId(): string | null {
  if (!isBaselineSonnet4Enabled() || isFreeTierEval()) return null
  if (isOpenRouterEval()) {
    return process.env.OPENROUTER_BASELINE_SLUG?.trim() || 'anthropic/claude-sonnet-4'
  }
  return process.env.BASELINE_ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4'
}

export function isBaselineModelId(model: string): boolean {
  const b = getBaselineEvalModelId()
  return b !== null && model === b
}

export function getActiveEvalModelIds(): readonly string[] {
  const main: readonly string[] = isOpenRouterEval()
    ? getOpenRouterCandidateSlugs()
    : isFreeTierEval()
      ? FREE_TIER_EVAL_MODEL_IDS
      : STANDARD_EVAL_MODEL_IDS
  const b = getBaselineEvalModelId()
  return b ? [...main, b] : [...main]
}

export function getFreeTierJudgeGeminiModelId(): string {
  const raw = process.env.FREE_JUDGE_MODEL_ID?.trim()
  if (raw) return raw
  return 'gemini-2.5-flash'
}
