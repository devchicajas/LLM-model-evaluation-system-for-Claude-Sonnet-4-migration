import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { aggregateDecisionReport, loadBatchRows } from './report.js'
import { EVAL_DATASET } from './dataset.js'
import { getDatabaseUrl } from './env.js'
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

export type EvalRunExport = {
  evalBatchId: string
  exportedAt: string
  datasetPromptCount: number
  report: ReturnType<typeof aggregateDecisionReport>
  results: ExportResultRow[]
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
 * Writes a JSON snapshot for the UI, submissions, or offline review.
 */
export async function exportEvalBatchJson(
  evalBatchId: string,
  outputRelativePath = 'eval-output/latest-run.json',
): Promise<string> {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const outPath = join(root, outputRelativePath)
  await mkdir(dirname(outPath), { recursive: true })

  const rowsFlat = await loadBatchRows(evalBatchId)
  const report = aggregateDecisionReport(rowsFlat, EVAL_DATASET.length)
  const results = await loadBatchRowsWithPrompts(evalBatchId)

  const payload: EvalRunExport = {
    evalBatchId,
    exportedAt: new Date().toISOString(),
    datasetPromptCount: EVAL_DATASET.length,
    report,
    results,
  }

  await writeFile(outPath, JSON.stringify(payload, null, 2), 'utf8')
  return outPath
}
