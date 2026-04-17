import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { EVAL_DATASET, EVAL_DATASET_VERSION } from './dataset.js'
import {
  getBaselineEvalModelId,
  getCategoryScoreWeights,
  getCurrentJudgeModelId,
  getDatabaseUrl,
  getEvalRuntimeMode,
  getMaxP95LatencyMsGate,
  getOpenRouterCandidateSlugs,
} from './env.js'
import { aggregateDecisionReport, DECISION_THRESHOLDS, loadBatchRows } from './report.js'
import { FREE_TIER_EVAL_MODEL_IDS, STANDARD_EVAL_MODEL_IDS } from './types.js'
import type { PersistedEvalScores } from './types.js'

const { Pool } = pg

export type ExportResultRow = {
  model: string
  prompt_id: number
  category: string
  prompt: string
  answer: string | null
  scores: PersistedEvalScores | null
  latency_ms: number | null
}

/** Snapshot for auditors: what was evaluated, under which rules, with which judge (current env). */
export type ReproducibilityInfo = {
  appName: string
  packageVersion: string
  nodeVersion: string
  datasetVersion: string
  /** SHA-256 of canonical JSON of all prompts (id, category, prompt text). */
  datasetSha256: string
  evalRuntimeMode: ReturnType<typeof getEvalRuntimeMode>
  candidateModels: readonly string[]
  baselineModelId: string | null
  judgeModelId: string
  decisionThresholds: typeof DECISION_THRESHOLDS
  /** When set, eligibility also requires p95 latency ≤ this value (ms). */
  maxP95LatencyMsGate: number | null
  /** When set, per-dimension averages use these category weights (unknown categories weight 1). */
  categoryScoreWeights: Record<string, number> | null
}

export type EvalRunExport = {
  evalBatchId: string
  exportedAt: string
  datasetPromptCount: number
  /** Full prompt set embedded so exports stand alone without git checkout. */
  dataset: readonly { id: string; category: string; prompt: string }[]
  reproducibility: ReproducibilityInfo
  report: ReturnType<typeof aggregateDecisionReport>
  results: ExportResultRow[]
}

function datasetSha256(): string {
  const canonical = EVAL_DATASET.map((d) => ({ id: d.id, category: d.category, prompt: d.prompt }))
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

function candidateModelsForRepro(): readonly string[] {
  try {
    const mode = getEvalRuntimeMode()
    if (mode === 'openrouter') return getOpenRouterCandidateSlugs()
    if (mode === 'free_tier') return FREE_TIER_EVAL_MODEL_IDS
    return STANDARD_EVAL_MODEL_IDS
  } catch {
    return []
  }
}

function readPackageVersion(root: string): { name: string; version: string } {
  try {
    const raw = readFileSync(join(root, 'package.json'), 'utf8')
    const j = JSON.parse(raw) as { name?: string; version?: string }
    return { name: j.name ?? 'unknown', version: j.version ?? '0.0.0' }
  } catch {
    return { name: 'unknown', version: '0.0.0' }
  }
}

function buildReproducibilityInfo(root: string): ReproducibilityInfo {
  const pkg = readPackageVersion(root)
  return {
    appName: pkg.name,
    packageVersion: pkg.version,
    nodeVersion: process.version,
    datasetVersion: EVAL_DATASET_VERSION,
    datasetSha256: datasetSha256(),
    evalRuntimeMode: getEvalRuntimeMode(),
    candidateModels: candidateModelsForRepro(),
    baselineModelId: getBaselineEvalModelId(),
    judgeModelId: getCurrentJudgeModelId(),
    decisionThresholds: DECISION_THRESHOLDS,
    maxP95LatencyMsGate: getMaxP95LatencyMsGate(),
    categoryScoreWeights: getCategoryScoreWeights(),
  }
}

export async function loadBatchRowsWithPrompts(
  evalBatchId: string,
  pool?: pg.Pool,
): Promise<ExportResultRow[]> {
  const ownPool = pool ?? new Pool({ connectionString: getDatabaseUrl() })
  try {
    const res = await ownPool.query<ExportResultRow>(
      `SELECT r.model, r.prompt_id, p.category, p.prompt, r.answer, r.scores, r.latency_ms
       FROM results r
       JOIN prompts p ON p.id = r.prompt_id
       WHERE r.eval_batch_id = $1::uuid
       ORDER BY r.id ASC`,
      [evalBatchId],
    )
    return res.rows
  } finally {
    if (!pool) await ownPool.end()
  }
}

/**
 * Builds the same JSON payload written to disk and served by the UI API.
 * `reproducibility` reflects **current** process env (see README); re-export after a run for a perfect match.
 */
export async function buildEvalRunExport(evalBatchId: string): Promise<EvalRunExport> {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const rowsFlat = await loadBatchRows(evalBatchId)
  const report = aggregateDecisionReport(rowsFlat, EVAL_DATASET.length)
  const results = await loadBatchRowsWithPrompts(evalBatchId)
  const dataset = EVAL_DATASET.map((d) => ({ id: d.id, category: d.category, prompt: d.prompt }))

  return {
    evalBatchId,
    exportedAt: new Date().toISOString(),
    datasetPromptCount: EVAL_DATASET.length,
    dataset,
    reproducibility: buildReproducibilityInfo(root),
    report,
    results,
  }
}

/**
 * Writes a JSON snapshot for the UI, submissions, or offline review.
 */
export async function exportEvalBatchJson(
  evalBatchId: string,
  outputRelativePath = 'eval-output/latest-run.json',
): Promise<string> {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const outPath = join(root, outputRelativePath)
  await mkdir(dirname(outPath), { recursive: true })

  const payload = await buildEvalRunExport(evalBatchId)
  await writeFile(outPath, JSON.stringify(payload, null, 2), 'utf8')
  return outPath
}
