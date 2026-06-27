import type { SpecialistRow } from "./build-specialist-prompt.ts";

export type Autonomy = "OFF" | "DRAFT" | "SEND";

export interface SubIntentRow {
  specialist_slug: string;
  slug: string;
  name: string;
  recognition_cues: string;
  handling_instructions: string;
  autonomy: Autonomy;
  target_folder?: string | null;   // optional topic-folder override; falls back to category/intent
  is_active: boolean;
  sort_order: number;
}

/**
 * Map a matched sub-intent to an effective autonomy, applying the safety rails:
 *  1. No matched sub-intent (category default / novel)  -> DRAFT  (never SEND)
 *  2. SEND below the confidence threshold               -> DRAFT
 *  3. SEND under an always_escalate specialist           -> DRAFT
 *  4. SEND with no resolvable specialist                 -> DRAFT
 * OFF is absolute; DRAFT stays DRAFT. (The global kill switch is enforced upstream.)
 */
export function resolveAutonomy(args: {
  subIntent: SubIntentRow | null;
  confidence: number;
  specialist: SpecialistRow | null;
  autoSendThreshold: number;
}): Autonomy {
  const { subIntent, confidence, specialist, autoSendThreshold } = args;
  if (!subIntent) return "DRAFT";              // rule 1
  if (subIntent.autonomy === "OFF") return "OFF";
  if (subIntent.autonomy === "DRAFT") return "DRAFT";
  // autonomy === "SEND" — apply downgrades
  if (!specialist || specialist.always_escalate) return "DRAFT"; // rules 3 & 4
  if (confidence < autoSendThreshold) return "DRAFT";            // rule 2
  return "SEND";
}

/**
 * Resolve a classified (specialistSlug, subIntentSlug) to its active SubIntentRow.
 * Returns null for a null slug (category default) or any non-active / cross-specialist slug.
 */
export function matchSubIntent(
  specialistSlug: string | null,
  subIntentSlug: string | null,
  subIntents: SubIntentRow[],
): SubIntentRow | null {
  if (!specialistSlug || !subIntentSlug) return null;
  return (
    subIntents.find(
      (si) => si.is_active && si.specialist_slug === specialistSlug && si.slug === subIntentSlug,
    ) ?? null
  );
}
