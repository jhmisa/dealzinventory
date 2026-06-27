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

/**
 * Build the system prompt for the cheap CLASSIFY pass. Enumerates each active specialist
 * (Category), its legacy intents (the valid `intent` values the model may emit), and its
 * active sub-intents with recognition cues, then asks for a compact JSON classification.
 */
export function buildClassificationPrompt(args: {
  specialists: SpecialistRow[];
  subIntents: SubIntentRow[];
}): string {
  const active = args.specialists
    .filter((s) => s.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);

  let prompt =
    "You are a message classifier for a Filipino-facing resale shop's customer chat. " +
    "Read the latest customer message (and any screenshot) in the context below and classify it.\n\n" +
    "# Categories, intents, and sub-intents\n";

  for (const s of active) {
    prompt += `\n## ${s.name} — intents: ${s.intents.join(", ")}\n`;
    const subs = args.subIntents
      .filter((si) => si.is_active && si.specialist_slug === s.slug)
      .sort((a, b) => a.sort_order - b.sort_order);
    if (subs.length === 0) {
      prompt += "(no specific sub-intents — use sub_intent_slug = null)\n";
      continue;
    }
    for (const si of subs) {
      prompt += `- sub_intent_slug "${si.slug}" (${si.name}): ${si.recognition_cues}\n`;
    }
  }

  prompt +=
    "\n# Output\nRespond ONLY with a JSON object, no markdown fences:\n" +
    '- "intent": the single best legacy intent from the lists above (e.g. "product_inquiry"); ' +
    'use "unknown" if nothing fits.\n' +
    '- "sub_intent_slug": the most specific matching sub_intent_slug from the chosen category, ' +
    "or null if the message fits the category generally but no specific sub-intent.\n" +
    '- "confidence": 0.0-1.0, how sure you are of this classification.\n' +
    "Pick a sub_intent_slug ONLY when the message clearly matches its cues; otherwise use null.";

  return prompt;
}
