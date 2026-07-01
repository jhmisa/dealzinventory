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

// A canned reply from messaging_templates the AI may reuse. content_en is the Taglish body;
// ai_usage gates how far the AI may go (AUTO=near-verbatim send, DRAFT/REFERENCE=compose only).
export interface TemplateReply {
  name: string;
  content_en: string;
  specialist_slug: string | null; // null = shown under every specialist
  ai_usage: 'AUTO' | 'DRAFT' | 'REFERENCE' | 'OFF';
  has_media: boolean;
}

// A structured company fact (bank/SmartPit numbers, PayPal name, addresses, rates,
// order format). Rendered as an authoritative reference block the AI treats as fact.
export interface CompanyFact {
  key: string;
  label: string;
  value_en: string;
  value_ja?: string | null;
  category: string;
}

export interface BuildSpecialistPromptArgs {
  guardrails: GuardrailEntry[];
  personaSystemPrompt: string;
  knowledge: KnowledgeEntry[];
  specialists: SpecialistRow[];
  templates?: TemplateReply[];
  companyFacts?: CompanyFact[];
}

// Render active company facts as a "# Company Facts" section, grouped by category.
// Categories appear in first-seen order (input is pre-sorted by category, sort_order);
// facts keep loader order within a category. Returns '' when there are no facts.
function renderCompanyFacts(facts: CompanyFact[]): string {
  if (facts.length === 0) return '';
  const order: string[] = [];
  const byCategory = new Map<string, CompanyFact[]>();
  for (const f of facts) {
    if (!byCategory.has(f.category)) {
      byCategory.set(f.category, []);
      order.push(f.category);
    }
    byCategory.get(f.category)!.push(f);
  }
  const sections = order
    .map((cat) => {
      const lines = byCategory
        .get(cat)!
        .map((f) => `- ${f.label}: ${f.value_en}${f.value_ja ? ` (JA: ${f.value_ja})` : ''}`)
        .join('\n');
      return `## ${cat}\n${lines}`;
    })
    .join('\n\n');
  return `\n\n# Company Facts (authoritative — use these EXACT values; never invent account numbers, company names, addresses, or rates. If a needed fact is missing, escalate.)\n${sections}`;
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
  const templates = args.templates ?? [];
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

  // Company Facts: authoritative reference block, right after the persona.
  prompt += renderCompanyFacts(args.companyFacts ?? []);

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
      // Approved Replies: this specialist's canned templates (plus any global, null-specialist ones).
      // OFF templates are never shown. These are the authoritative wording — they win over knowledge.
      const replies = templates.filter(
        (t) => t.ai_usage !== 'OFF' && (t.specialist_slug === s.slug || t.specialist_slug === null),
      );
      if (replies.length > 0) {
        const block = replies
          .map((t) => `- "${t.name}" [${t.ai_usage}]${t.has_media ? ' (has photo/video)' : ''}:\n${t.content_en}`)
          .join('\n\n');
        prompt +=
          `\n\nApproved Replies (prefer this exact wording; fill {{variables}}; these OVERRIDE any other knowledge on conflict):\n${block}`;
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
