import { getSetting, logActivity } from './db.js'

export class OpsBlockedError extends Error {}

/** Wrap every tool: kill-switch gate (all tools) + autonomy gate (writes) + audit log. */
export async function runTool<T>(
  name: string,
  args: Record<string, unknown>,
  opts: { write?: boolean },
  fn: () => Promise<T>,
): Promise<T> {
  const enabled = await getSetting('ai_ops_enabled')
  if (enabled !== 'true') {
    await logActivity(name, args, 'BLOCKED: kill-switch off')
    throw new OpsBlockedError(
      'AI Ops is disabled (kill-switch). A staff member must re-enable it in the AI Operations page.',
    )
  }
  if (opts.write) {
    const autonomy = await getSetting('ai_ops_autonomy_reply')
    if (autonomy === 'OFF') {
      await logActivity(name, args, 'BLOCKED: reply capability is OFF')
      throw new OpsBlockedError(
        'The reply capability is set to OFF. A staff member must raise it to PROPOSE in the AI Operations page.',
      )
    }
  }
  try {
    const result = await fn()
    await logActivity(name, args, summarize(result), extractProposalId(result))
    return result
  } catch (err) {
    if (!(err instanceof OpsBlockedError)) {
      await logActivity(name, args, `ERROR: ${err instanceof Error ? err.message : String(err)}`)
    }
    throw err
  }
}

function summarize(result: unknown): string {
  if (Array.isArray(result)) return `ok (${result.length} rows)`
  if (result && typeof result === 'object') return `ok ${JSON.stringify(result).slice(0, 200)}`
  return 'ok'
}

function extractProposalId(result: unknown): string | undefined {
  if (result && typeof result === 'object' && 'proposal_id' in result) {
    return (result as { proposal_id?: string }).proposal_id
  }
  return undefined
}
