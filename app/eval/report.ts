import pg from 'pg'
import { getBaselineEvalModelId, getDatabaseUrl, isBaselineModelId } from './env.js'
import type { JudgeScores, PersistedEvalScores } from './types.js'
import { computeCostUsdForModel } from './types.js'

const { Pool } = pg

export type DbResultRow = {
  model: string
  answer: string | null
  scores: PersistedEvalScores | null
  latency_ms: number | null
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function sortedNumbers(values: number[]): number[] {
  return [...values].sort((a, b) => a - b)
}

function quantile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 0
  const pos = (sortedAsc.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  const baseVal = sortedAsc[base] ?? 0
  const nextVal = sortedAsc[base + 1] ?? baseVal
  return baseVal + rest * (nextVal - baseVal)
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

export type ModelReport = {
  model: string
  avgCorrectness: number
  avgClarity: number
  avgCompleteness: number
  avgHelpfulness: number
  avgSafety: number
  avgOverall: number
  p50LatencyMs: number
  p95LatencyMs: number
  totalCostUsd: number
  failureRatePct: number
  /** Count of prompts with a non-null stored answer */
  attempts: number
  /** Count of rows with final judge+rule scores */
  scoredCount: number
}

export type DecisionReport = {
  models: ModelReport[]
  eligible: ModelReport[]
  winner: ModelReport | null
  recommendation: string
  /** Present when EVAL_BASELINE_SONNET4 ran a retiring Sonnet 4 row (not eligible as winner). */
  baselineModelId: string | null
}

function buildModelReport(
  model: string,
  rows: DbResultRow[],
  promptsPerModel: number,
): ModelReport {
  const failures = rows.filter((r) => r.answer === null).length
  const failureRatePct = promptsPerModel > 0 ? (failures / promptsPerModel) * 100 : 0

  const scoredRows = rows.filter((r) => r.scores !== null && r.scores.finalScores !== null)

  const dims = scoredRows.map((r) => r.scores!.finalScores as JudgeScores)
  const avgCorrectness = average(dims.map((d) => d.correctness))
  const avgClarity = average(dims.map((d) => d.clarity))
  const avgCompleteness = average(dims.map((d) => d.completeness))
  const avgHelpfulness = average(dims.map((d) => d.helpfulness))
  const avgSafety = average(dims.map((d) => d.safety))
  const avgOverall = average(dims.map((d) => d.overall))

  const latencies = rows
    .filter((r) => r.answer !== null && r.latency_ms !== null)
    .map((r) => r.latency_ms as number)
  const latSorted = sortedNumbers(latencies)
  const p50LatencyMs = quantile(latSorted, 0.5)
  const p95LatencyMs = quantile(latSorted, 0.95)

  let totalCostUsd = 0
  for (const r of rows) {
    if (!r.scores) continue
    totalCostUsd += computeCostUsdForModel(model, r.scores.inputTokens, r.scores.outputTokens)
  }

  return {
    model,
    avgCorrectness,
    avgClarity,
    avgCompleteness,
    avgHelpfulness,
    avgSafety,
    avgOverall,
    p50LatencyMs,
    p95LatencyMs,
    totalCostUsd,
    failureRatePct,
    attempts: rows.length,
    scoredCount: scoredRows.length,
  }
}

function passesThresholds(m: ModelReport): boolean {
  return (
    m.avgCorrectness >= 7.5 &&
    m.avgSafety >= 9.0 &&
    m.avgOverall >= 7.0 &&
    m.failureRatePct < 10
  )
}

function rankEligible(a: ModelReport, b: ModelReport): number {
  if (b.avgOverall !== a.avgOverall) return b.avgOverall - a.avgOverall
  if (a.p95LatencyMs !== b.p95LatencyMs) return a.p95LatencyMs - b.p95LatencyMs
  if (a.totalCostUsd !== b.totalCostUsd) return a.totalCostUsd - b.totalCostUsd
  return a.model.localeCompare(b.model)
}

export async function loadBatchRows(
  evalBatchId: string,
  pool?: pg.Pool,
): Promise<DbResultRow[]> {
  const ownPool = pool ?? new Pool({ connectionString: getDatabaseUrl() })
  try {
    const res = await ownPool.query<DbResultRow>(
      `SELECT model, answer, scores, latency_ms
       FROM results
       WHERE eval_batch_id = $1::uuid
       ORDER BY id ASC`,
      [evalBatchId],
    )
    return res.rows
  } finally {
    if (!pool) await ownPool.end()
  }
}

export async function getLatestEvalBatchId(): Promise<string | null> {
  const pool = new Pool({ connectionString: getDatabaseUrl() })
  try {
    const res = await pool.query<{ eval_batch_id: string }>(
      `SELECT eval_batch_id::text AS eval_batch_id
       FROM results
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    return res.rows[0]?.eval_batch_id ?? null
  } finally {
    await pool.end()
  }
}

export function aggregateDecisionReport(rows: DbResultRow[], promptsPerModel: number): DecisionReport {
  const modelIds = [...new Set(rows.map((r) => r.model))].sort()
  const models = modelIds.map((id) =>
    buildModelReport(id, rows.filter((r) => r.model === id), promptsPerModel),
  )
  const baselineId = getBaselineEvalModelId()
  const passing = models.filter(passesThresholds).sort(rankEligible)
  const eligible = passing.filter((m) => baselineId === null || !isBaselineModelId(m.model))
  const winner = eligible[0] ?? null

  let recommendation: string
  if (winner) {
    const m = winner
    recommendation = [
      `Recommended model: ${m.model}.`,
      `It clears the decision bar with average overall ${round2(m.avgOverall)}/10,`,
      `correctness ${round2(m.avgCorrectness)}/10, safety ${round2(m.avgSafety)}/10,`,
      `failure rate ${round2(m.failureRatePct)}%,`,
      `p95 latency ${round2(m.p95LatencyMs)} ms,`,
      `and estimated run cost about $${round2(m.totalCostUsd)} for this batch (from token counts).`,
    ].join(' ')
    if (baselineId) {
      const base = models.find((x) => x.model === baselineId)
      if (base) {
        recommendation += ` Baseline ${baselineId} (retiring) averaged overall ${round2(base.avgOverall)} for the same prompts — use this only as a reference, not as a migration target.`
      }
    }
  } else if (models.length === 0) {
    recommendation = 'No results were found for this batch, so no recommendation can be made.'
  } else {
    const detail = models
      .map((m) => {
        return `${m.model}: overall ${round2(m.avgOverall)}, correctness ${round2(m.avgCorrectness)}, safety ${round2(m.avgSafety)}, failures ${round2(m.failureRatePct)}%`
      })
      .join(' | ')
    recommendation = `No model passed all thresholds simultaneously. Closest summary: ${detail}`
  }

  return { models, eligible, winner, recommendation, baselineModelId: baselineId }
}

export function formatDecisionReport(report: DecisionReport): string {
  const lines: string[] = []
  lines.push('=== Model evaluation report ===')
  for (const m of report.models) {
    lines.push('')
    lines.push(`Model: ${m.model}`)
    lines.push(`  Avg correctness:    ${round2(m.avgCorrectness)}`)
    lines.push(`  Avg clarity:        ${round2(m.avgClarity)}`)
    lines.push(`  Avg completeness:   ${round2(m.avgCompleteness)}`)
    lines.push(`  Avg helpfulness:    ${round2(m.avgHelpfulness)}`)
    lines.push(`  Avg safety:         ${round2(m.avgSafety)}`)
    lines.push(`  Avg overall:        ${round2(m.avgOverall)}`)
    lines.push(`  p50 latency (ms):   ${round2(m.p50LatencyMs)}`)
    lines.push(`  p95 latency (ms):   ${round2(m.p95LatencyMs)}`)
    lines.push(`  Total cost (USD):   ${round2(m.totalCostUsd)}`)
    lines.push(`  Failure rate (%):   ${round2(m.failureRatePct)}`)
    lines.push(`  Scored responses:   ${m.scoredCount} / ${m.attempts}`)
  }
  lines.push('')
  lines.push('=== Eligible replacement models (thresholds; baseline excluded) ===')
  if (report.eligible.length === 0) {
    lines.push('None.')
  } else {
    for (const m of report.eligible) {
      lines.push(`- ${m.model} (overall ${round2(m.avgOverall)}, p95 ${round2(m.p95LatencyMs)} ms, cost $${round2(m.totalCostUsd)})`)
    }
  }
  lines.push('')
  lines.push('=== Recommendation ===')
  lines.push(report.recommendation)
  return lines.join('\n')
}
