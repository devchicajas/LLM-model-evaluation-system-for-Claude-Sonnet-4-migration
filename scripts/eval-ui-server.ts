import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import express from 'express'

dotenv.config()
dotenv.config({ path: '.env.local', override: true })

import { buildEvalRunExport } from '../app/eval/exportBatch.js'
import { getLatestEvalBatchId } from '../app/eval/report.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const port = Number(process.env.EVAL_UI_PORT || '3847')

const app = express()

app.get('/api/batch/latest', async (_req, res) => {
  try {
    const batchId = await getLatestEvalBatchId()
    if (!batchId) {
      res.status(404).json({ error: 'No evaluation batches found. Run npm start first.' })
      return
    }
    const payload = await buildEvalRunExport(batchId)
    res.json(payload)
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

app.get('/', (_req, res) => {
  const htmlPath = join(__dirname, '../public/index.html')
  const html = readFileSync(htmlPath, 'utf8')
  res.type('html').send(html)
})

app.listen(port, () => {
  console.log(`Eval dashboard: http://localhost:${port}`)
  console.log(`API: http://localhost:${port}/api/batch/latest`)
})
