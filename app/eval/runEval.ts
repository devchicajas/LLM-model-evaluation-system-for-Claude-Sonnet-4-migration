import { randomUUID } from 'node:crypto'
import pg from 'pg'
import {
  createAnthropicClaude35SonnetAdapter,
  createAnthropicMessagesAdapter,
} from './adapters/anthropic.js'
import { createGemini25ProAdapter, createGeminiGenerativeAdapter } from './adapters/google.js'
import { createOpenAiGpt4oMiniAdapter } from './adapters/openai.js'
import { createOpenRouterModelAdapter } from './adapters/openrouter.js'
import { EVAL_DATASET } from './dataset.js'
import {
  getActiveEvalModelIds,
  getDatabaseUrl,
  getFreeTierJudgeGeminiModelId,
  getOpenRouterCandidateSlugs,
  getOpenRouterJudgeModelSlug,
  isBaselineSonnet4Enabled,
  isFreeTierEval,
  isOpenRouterEval,
  validateApiKeys,
} from './env.js'
import {
  judgeResponse,
  judgeResponseGemini,
  judgeResponseOpenRouter,
} from './judge.js'
import { applyRuleBasedScoring } from './rules.js'
import { sleep, withRetries } from './retry.js'
import type { DatasetPrompt, GenerateResponse, ModelAdapter, PersistedEvalScores } from './types.js'
import { FREE_TIER_EVAL_MODEL_IDS } from './types.js'

const { Pool } = pg

/** Some providers reject a completely empty user message; the judge still sees the real prompt. */
const EMPTY_PROMPT_MODEL_INPUT =
  '[Eval harness: the real user message is empty. Respond helpfully and note no request text was provided.]'

function promptForModelApi(datasetPrompt: string): string {
  return datasetPrompt.trim() === '' ? EMPTY_PROMPT_MODEL_INPUT : datasetPrompt
}

export type JudgeRuntimeContext =
  | { kind: 'anthropic'; apiKey: string }
  | { kind: 'openrouter'; apiKey: string; judgeSlug: string }
  | { kind: 'google'; apiKey: string; judgeModelId: string }

function assertKnownEvalModel(modelId: string): void {
  const allowed = getActiveEvalModelIds()
  if (!(allowed as readonly string[]).includes(modelId)) {
    throw new Error(`Unknown evaluated model id: ${modelId}`)
  }
}

/**
 * Calls the model adapter with up to two retries (three attempts total) and 1s / 2s backoff.
 */
export async function generate(
  adapter: ModelAdapter,
  prompt: string,
  ctx: { datasetPromptId: string },
  runErrors: string[],
): Promise<{ ok: true; data: GenerateResponse } | { ok: false; error: string }> {
  let lastErr = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await sleep(attempt === 1 ? 1000 : 2000)
    }
    try {
      const data = await adapter.generate(prompt)
      if (data.latencyMs > 15_000) {
        console.warn(
          `Model ${adapter.modelId} exceeded 15s (${data.latencyMs}ms) for prompt ${ctx.datasetPromptId}`,
        )
      }
      return { ok: true, data }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  const msg = `Final failure: prompt_id=${ctx.datasetPromptId} model=${adapter.modelId}: ${lastErr}`
  console.error(msg)
  runErrors.push(msg)
  return { ok: false, error: lastErr }
}

/**
 * Scores a model output with the LLM judge plus rule-based adjustments.
 */
export async function evaluate(params: {
  evalBatchId: string
  datasetItem: DatasetPrompt
  candidateModelId: string
  userPrompt: string
  generated: GenerateResponse
  runErrors: string[]
  judgeCtx: JudgeRuntimeContext
}): Promise<PersistedEvalScores> {
  let judgeRaw = null
  try {
    judgeRaw = await withRetries(
      async () => {
        if (params.judgeCtx.kind === 'anthropic') {
          return judgeResponse({
            anthropicApiKey: params.judgeCtx.apiKey,
            datasetItem: params.datasetItem,
            candidateModelId: params.candidateModelId,
            userPrompt: params.userPrompt,
            modelAnswer: params.generated.text,
          })
        }
        if (params.judgeCtx.kind === 'openrouter') {
          return judgeResponseOpenRouter({
            openrouterApiKey: params.judgeCtx.apiKey,
            judgeModelSlug: params.judgeCtx.judgeSlug,
            datasetItem: params.datasetItem,
            candidateModelId: params.candidateModelId,
            userPrompt: params.userPrompt,
            modelAnswer: params.generated.text,
          })
        }
        return judgeResponseGemini({
          googleApiKey: params.judgeCtx.apiKey,
          judgeModelId: params.judgeCtx.judgeModelId,
          datasetItem: params.datasetItem,
          candidateModelId: params.candidateModelId,
          userPrompt: params.userPrompt,
          modelAnswer: params.generated.text,
        })
      },
      { label: `judge:${params.datasetItem.id}:${params.candidateModelId}` },
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const line = `Judge failure: prompt_id=${params.datasetItem.id} model=${params.candidateModelId}: ${msg}`
    console.error(line)
    params.runErrors.push(line)
    return {
      evalBatchId: params.evalBatchId,
      inputTokens: params.generated.inputTokens,
      outputTokens: params.generated.outputTokens,
      judgeRaw: null,
      finalScores: null,
      issues: [`Judge failed after retries: ${msg}`],
      appliedRules: [],
    }
  }

  const ruled = applyRuleBasedScoring({
    category: params.datasetItem.category,
    responseText: params.generated.text,
    outputTokens: params.generated.outputTokens,
    judge: judgeRaw,
  })

  return {
    evalBatchId: params.evalBatchId,
    inputTokens: params.generated.inputTokens,
    outputTokens: params.generated.outputTokens,
    judgeRaw,
    finalScores: ruled.scores,
    issues: ruled.scores.issues,
    appliedRules: ruled.appliedRules,
  }
}

function buildBaselineAdapter(): ModelAdapter | null {
  if (!isBaselineSonnet4Enabled()) return null
  if (isFreeTierEval()) {
    console.warn('EVAL_BASELINE_SONNET4 is ignored when EVAL_FREE_TIER=true.')
    return null
  }
  if (isOpenRouterEval()) {
    const apiKey = process.env.OPENROUTER_API_KEY?.trim()
    if (!apiKey) throw new Error('OPENROUTER_API_KEY is missing.')
    const slug = process.env.OPENROUTER_BASELINE_SLUG?.trim() || 'anthropic/claude-sonnet-4'
    const candidates = [...getOpenRouterCandidateSlugs()]
    const judgeSlug = getOpenRouterJudgeModelSlug()
    if (candidates.includes(slug)) {
      throw new Error(`OPENROUTER_BASELINE_SLUG (${slug}) cannot match a candidate model.`)
    }
    if (slug === judgeSlug) {
      throw new Error(
        `OPENROUTER_BASELINE_SLUG (${slug}) cannot match OPENROUTER_JUDGE_MODEL (${judgeSlug}).`,
      )
    }
    return createOpenRouterModelAdapter(apiKey, slug)
  }
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!anthropicApiKey) throw new Error('ANTHROPIC_API_KEY is required for Sonnet 4 baseline in direct API mode.')
  const model = process.env.BASELINE_ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4'
  return createAnthropicMessagesAdapter(anthropicApiKey, model)
}

function buildAdaptersAndJudge(): {
  adapters: readonly ModelAdapter[]
  judgeCtx: JudgeRuntimeContext
  baselineAdapter: ModelAdapter | null
} {
  if (isOpenRouterEval()) {
    const apiKey = process.env.OPENROUTER_API_KEY?.trim()
    if (!apiKey) throw new Error('OPENROUTER_API_KEY is missing.')
    const slugs = [...getOpenRouterCandidateSlugs()]
    const judgeSlug = getOpenRouterJudgeModelSlug()
    if (slugs.includes(judgeSlug)) {
      throw new Error(
        `OPENROUTER_JUDGE_MODEL (${judgeSlug}) must not be one of the three candidate models.`,
      )
    }
    const adapters = slugs.map((slug) => createOpenRouterModelAdapter(apiKey, slug))
    return { adapters, judgeCtx: { kind: 'openrouter', apiKey, judgeSlug }, baselineAdapter: buildBaselineAdapter() }
  }

  if (isFreeTierEval()) {
    const apiKey = process.env.GOOGLE_API_KEY?.trim()
    if (!apiKey) throw new Error('GOOGLE_API_KEY is missing.')
    const ids = [...FREE_TIER_EVAL_MODEL_IDS]
    const judgeModelId = getFreeTierJudgeGeminiModelId()
    if ((FREE_TIER_EVAL_MODEL_IDS as readonly string[]).includes(judgeModelId)) {
      throw new Error(
        `FREE_JUDGE_MODEL_ID (${judgeModelId}) must not be one of the three candidate Gemini models.`,
      )
    }
    const adapters = ids.map((id) => createGeminiGenerativeAdapter(apiKey, id))
    return { adapters, judgeCtx: { kind: 'google', apiKey, judgeModelId }, baselineAdapter: buildBaselineAdapter() }
  }

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY?.trim()
  const openaiApiKey = process.env.OPENAI_API_KEY?.trim()
  const googleApiKey = process.env.GOOGLE_API_KEY?.trim()
  if (!anthropicApiKey || !openaiApiKey || !googleApiKey) {
    throw new Error('API keys were validated but are unexpectedly empty.')
  }
  const adapters: readonly ModelAdapter[] = [
    createOpenAiGpt4oMiniAdapter(openaiApiKey),
    createAnthropicClaude35SonnetAdapter(anthropicApiKey),
    createGemini25ProAdapter(googleApiKey),
  ]
  return {
    adapters,
    judgeCtx: { kind: 'anthropic', apiKey: anthropicApiKey },
    baselineAdapter: buildBaselineAdapter(),
  }
}

/**
 * Runs the full evaluation loop: one DB transaction per run, concurrent models per prompt,
 * prompts processed sequentially.
 */
export async function runAll(): Promise<{ evalBatchId: string; runErrors: string[] }> {
  validateApiKeys()
  const databaseUrl = getDatabaseUrl()
  const { adapters, judgeCtx, baselineAdapter } = buildAdaptersAndJudge()
  const allAdapters: readonly ModelAdapter[] = baselineAdapter
    ? [...adapters, baselineAdapter]
    : [...adapters]

  const evalBatchId = randomUUID()
  const runErrors: string[] = []
  const pool = new Pool({ connectionString: databaseUrl })
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const promptDbIds = new Map<string, number>()
    for (const item of EVAL_DATASET) {
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO prompts (category, prompt, eval_batch_id) VALUES ($1, $2, $3::uuid) RETURNING id`,
        [item.category, item.prompt, evalBatchId],
      )
      const row = inserted.rows[0]
      if (!row) throw new Error('Failed to insert prompt row.')
      promptDbIds.set(item.id, row.id)
    }

    for (const item of EVAL_DATASET) {
      const dbPromptId = promptDbIds.get(item.id)
      if (dbPromptId === undefined) {
        throw new Error(`Missing DB prompt id for dataset item ${item.id}`)
      }

      const generations = await Promise.all(
        allAdapters.map((adapter) =>
          generate(adapter, promptForModelApi(item.prompt), { datasetPromptId: item.id }, runErrors),
        ),
      )

      for (let i = 0; i < allAdapters.length; i++) {
        const adapter = allAdapters[i]!
        const gen = generations[i]!
        if (!gen.ok) {
          await client.query(
            `INSERT INTO results (model, prompt_id, answer, scores, latency_ms, cost_usd, eval_batch_id)
             VALUES ($1, $2, NULL, NULL, NULL, NULL, $3::uuid)`,
            [adapter.modelId, dbPromptId, evalBatchId],
          )
          continue
        }

        assertKnownEvalModel(adapter.modelId)
        const persisted = await evaluate({
          evalBatchId,
          datasetItem: item,
          candidateModelId: adapter.modelId,
          userPrompt: item.prompt,
          generated: gen.data,
          runErrors,
          judgeCtx,
        })

        await client.query(
          `INSERT INTO results (model, prompt_id, answer, scores, latency_ms, cost_usd, eval_batch_id)
           VALUES ($1, $2, $3, $4::jsonb, $5, NULL, $6::uuid)`,
          [
            adapter.modelId,
            dbPromptId,
            gen.data.text,
            JSON.stringify(persisted),
            gen.data.latencyMs,
            evalBatchId,
          ],
        )
      }
    }

    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
    await pool.end()
  }

  return { evalBatchId, runErrors }
}
