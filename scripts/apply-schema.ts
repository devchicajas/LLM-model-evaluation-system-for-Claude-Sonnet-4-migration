import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import pg from 'pg'

dotenv.config()
dotenv.config({ path: '.env.local', override: true })

const { Pool } = pg

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!databaseUrl) {
    console.error('Missing DATABASE_URL. Set it in .env or .env.local.')
    process.exitCode = 1
    return
  }

  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const sqlPath = join(root, 'sql', 'schema.sql')
  const sql = readFileSync(sqlPath, 'utf8')

  const pool = new Pool({ connectionString: databaseUrl })
  try {
    await pool.query(sql)
    console.log('Schema applied:', sqlPath)
  } finally {
    await pool.end()
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exitCode = 1
})
