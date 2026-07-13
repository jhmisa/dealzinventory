import { config } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// ops/server/src → repo root is three levels up. The server runs ONLY on Joey's machine.
const here = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(here, '../../../.env.local') })

export const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? ''
export const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('dealz-ops: missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in repo-root .env.local')
  process.exit(1)
}
