// Specialist-playbook prompt assembly for the messaging AI (Plan 3b).
//
// Approach A: one model call. The system prompt embeds every active specialist's playbook (with its
// tagged knowledge grouped beneath); the model classifies the intent and follows the matching one.
// These are pure functions so they can be unit-tested without a DB.

export interface SpecialistRow {
  slug: string;
  name: string;
  intents: string[];
  playbook: string;
  always_escalate: boolean; // not used here; enforced in generate-draft.ts after the model call
  is_active: boolean;
  sort_order: number;
  target_folder?: string | null; // optional topic-folder home for routing (see generate-draft routeAndFlag)
}

export interface GuardrailEntry {
  title: string;
  content: string;
}

export interface KnowledgeEntry {
  title: string;
  content: string;
  specialist_tags: string[];
}

export interface BuildSpecialistPromptArgs {
  guardrails: GuardrailEntry[];
  personaSystemPrompt: string;
  knowledge: KnowledgeEntry[];
  specialists: SpecialistRow[];
}

// "tracking, order_status" -> "tracking, order status" (human-readable intent list for headers).
function humanIntents(intents: string[]): string {
  return intents.map((i) => i.replace(/_/g, ' ')).join(', ');
}

// Resolve an emitted intent to its owning active specialist. Ties (should not happen with the
// seeded data) break by lowest sort_order. Returns null when no active specialist owns the intent.
export function specialistForIntent(
  intent: string,
  specialists: SpecialistRow[],
): SpecialistRow | null {
  const matches = specialists
    .filter((s) => s.is_active && s.intents.includes(intent))
    .sort((a, b) => a.sort_order - b.sort_order);
  return matches[0] ?? null;
}

export function buildSpecialistSystemPrompt(args: BuildSpecialistPromptArgs): string {
  const { guardrails, personaSystemPrompt, knowledge, specialists } = args;
  let prompt = '';

  // 1. Guardrails — always all, numbered + bolded.
  if (guardrails.length > 0) {
    const rules = guardrails
      .map((g, i) => `${i + 1}. **${g.title}**: ${g.content}`)
      .join('\n');
    prompt += `# Rules (NEVER violate)\n${rules}\n\n`;
  }

  // 2. Base persona.
  prompt += personaSystemPrompt;

  // 3. Specialist playbooks (active, sorted), each with its tagged knowledge.
  const active = specialists
    .filter((s) => s.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);
  const activeSlugs = new Set(active.map((s) => s.slug));

  if (active.length > 0) {
    prompt +=
      `\n\n# Specialist Playbooks\nIdentify which specialist the customer's message fits, then follow ONLY that playbook.`;
    for (const s of active) {
      prompt += `\n\n## ${s.name} — ${humanIntents(s.intents)}\n${s.playbook}`;
      // An article tagged for several active specialists intentionally appears under each of their
      // sections (so the followed playbook always has its knowledge) — we do not deduplicate.
      const tagged = knowledge.filter((k) => k.specialist_tags.some((t) => t === s.slug));
      if (tagged.length > 0) {
        const articles = tagged.map((k) => `### ${k.title}\n${k.content}`).join('\n\n');
        prompt += `\n\nRelevant knowledge:\n${articles}`;
      }
    }
  }

  // 4. Shared knowledge: untagged, OR tagged only for specialists that are not active (so nothing
  //    silently disappears).
  const shared = knowledge.filter(
    (k) => k.specialist_tags.length === 0 || !k.specialist_tags.some((t) => activeSlugs.has(t)),
  );
  if (shared.length > 0) {
    const articles = shared.map((k) => `## ${k.title}\n${k.content}`).join('\n\n');
    prompt += `\n\n# General Knowledge\n${articles}`;
  }

  return prompt;
}
