import dotenv from 'dotenv'

dotenv.config()
dotenv.config({ path: '.env.local', override: true })

import { exportEvalBatchJson } from '../app/eval/exportBatch.js'
import { aggregateDecisionReport, formatDecisionReport, getLatestEvalBatchId, loadBatchRows } from '../app/eval/report.js'
import { runAll } from '../app/eval/runEval.js'
import { EVAL_DATASET } from '../app/eval/dataset.js'

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const reportOnly = args.includes('--report-only')
  const batchArg = args.find((a) => a.startsWith('--batch='))?.slice('--batch='.length)

  if (reportOnly) {
    const batchId = batchArg ?? (await getLatestEvalBatchId())
    if (!batchId) {
      console.error('No eval batch found in the database. Run `npm start` first.')
      process.exitCode = 1
      return
    }
    const rows = await loadBatchRows(batchId)
    const report = aggregateDecisionReport(rows, EVAL_DATASET.length)
    console.log(formatDecisionReport(report))
    return
  }

  const { evalBatchId, runErrors } = await runAll()
  console.log(`Eval batch completed: ${evalBatchId}`)

  const rows = await loadBatchRows(evalBatchId)
  const report = aggregateDecisionReport(rows, EVAL_DATASET.length)
  console.log('')
  console.log(formatDecisionReport(report))

  if (runErrors.length > 0) {
    console.log('')
    console.log('=== Errors collected during run ===')
    for (const err of runErrors) {
      console.log(`- ${err}`)
    }
  }

  try {
    const out = await exportEvalBatchJson(evalBatchId)
    console.log('')
    console.log(`JSON export: ${out}`)
  } catch (e) {
    console.warn('Could not write eval-output/latest-run.json:', e instanceof Error ? e.message : e)
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exitCode = 1
})
