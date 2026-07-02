import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import {
  buildSpecialistSystemPrompt,
  renderLearnedCorrections,
  specialistForIntent,
  type CompanyFact,
  type SpecialistRow,
  type TemplateReply,
} from './build-specialist-prompt.ts';

const SPECIALISTS: SpecialistRow[] = [
  { slug: 'sales', name: 'Sales', intents: ['product_inquiry'], playbook: 'SALES_PLAY', always_escalate: false, is_active: true, sort_order: 1 },
  { slug: 'order_tracking', name: 'Order & Tracking', intents: ['tracking', 'order_status'], playbook: 'ORDER_PLAY', always_escalate: false, is_active: true, sort_order: 2 },
  { slug: 'aftersales', name: 'Aftersales', intents: ['return', 'complaint'], playbook: 'AFTER_PLAY', always_escalate: true, is_active: true, sort_order: 3 },
  { slug: 'generalist', name: 'Generalist', intents: ['general', 'unknown'], playbook: 'GEN_PLAY', always_escalate: false, is_active: true, sort_order: 5 },
];

Deno.test('specialistForIntent resolves each intent to its owning specialist', () => {
  assertEquals(specialistForIntent('product_inquiry', SPECIALISTS)?.slug, 'sales');
  assertEquals(specialistForIntent('tracking', SPECIALISTS)?.slug, 'order_tracking');
  assertEquals(specialistForIntent('order_status', SPECIALISTS)?.slug, 'order_tracking');
  assertEquals(specialistForIntent('return', SPECIALISTS)?.slug, 'aftersales');
  assertEquals(specialistForIntent('complaint', SPECIALISTS)?.slug, 'aftersales');
  assertEquals(specialistForIntent('general', SPECIALISTS)?.slug, 'generalist');
  assertEquals(specialistForIntent('unknown', SPECIALISTS)?.slug, 'generalist');
});

Deno.test('specialistForIntent returns null when no active specialist owns the intent', () => {
  assertEquals(specialistForIntent('kaitori', SPECIALISTS), null);
  assertEquals(specialistForIntent('garbage', SPECIALISTS), null);
});

Deno.test('specialistForIntent ignores inactive specialists', () => {
  const withInactive: SpecialistRow[] = [
    { slug: 'sales', name: 'Sales', intents: ['product_inquiry'], playbook: '', always_escalate: false, is_active: false, sort_order: 1 },
  ];
  assertEquals(specialistForIntent('product_inquiry', withInactive), null);
});

Deno.test('specialistForIntent breaks ties by lowest sort_order', () => {
  const dup: SpecialistRow[] = [
    { slug: 'b', name: 'B', intents: ['x'], playbook: '', always_escalate: false, is_active: true, sort_order: 9 },
    { slug: 'a', name: 'A', intents: ['x'], playbook: '', always_escalate: false, is_active: true, sort_order: 2 },
  ];
  assertEquals(specialistForIntent('x', dup)?.slug, 'a');
});

Deno.test('buildSpecialistSystemPrompt assembles all sections in order', () => {
  const prompt = buildSpecialistSystemPrompt({
    guardrails: [{ title: 'No prices', content: 'Never share costs.' }],
    personaSystemPrompt: 'PERSONA_BODY',
    knowledge: [
      { title: 'Shipping', content: 'Yamato 2-3 days.', specialist_tags: ['order_tracking'] },
      { title: 'Tagalog Guide', content: 'po = polite.', specialist_tags: [] },
    ],
    specialists: SPECIALISTS,
  });

  assertStringIncludes(prompt, '# Rules (NEVER violate)');
  assertStringIncludes(prompt, '1. **No prices**: Never share costs.');
  assertStringIncludes(prompt, 'PERSONA_BODY');
  assertStringIncludes(prompt, '# Specialist Playbooks');
  assertStringIncludes(prompt, '## Sales — product inquiry');
  assertStringIncludes(prompt, 'SALES_PLAY');
  assertStringIncludes(prompt, '## Order & Tracking — tracking, order status');
  assertStringIncludes(prompt, 'Relevant knowledge:');
  assertStringIncludes(prompt, '### Shipping');
  assertStringIncludes(prompt, '# General Knowledge');
  assertStringIncludes(prompt, '## Tagalog Guide');

  // Sections appear in the required order.
  const ruleIdx = prompt.indexOf('# Rules (NEVER violate)');
  const personaIdx = prompt.indexOf('PERSONA_BODY');
  const playbooksIdx = prompt.indexOf('# Specialist Playbooks');
  const generalIdx = prompt.indexOf('# General Knowledge');
  assert(ruleIdx < personaIdx, 'Rules must precede persona');
  assert(personaIdx < playbooksIdx, 'persona must precede specialist playbooks');
  assert(playbooksIdx < generalIdx, 'specialist playbooks must precede general knowledge');
  // A KB article tagged to an active specialist must NOT also leak into General Knowledge.
  // (Shipping is tagged order_tracking; it appears once, under its specialist as '### Shipping'.)
  // Use '\n## Shipping' to avoid false-positive: '## Shipping' is a substring of '### Shipping'.
  assertEquals(prompt.includes('\n## Shipping\n'), false);
});

Deno.test('buildSpecialistSystemPrompt puts orphaned-tag KB into General Knowledge', () => {
  const prompt = buildSpecialistSystemPrompt({
    guardrails: [],
    personaSystemPrompt: 'P',
    knowledge: [{ title: 'Kaitori Steps', content: 'steps', specialist_tags: ['kaitori'] }],
    specialists: SPECIALISTS,
  });
  assertStringIncludes(prompt, '# General Knowledge');
  assertStringIncludes(prompt, '## Kaitori Steps');
});

Deno.test('buildSpecialistSystemPrompt omits the specialist section when none are active', () => {
  const prompt = buildSpecialistSystemPrompt({
    guardrails: [],
    personaSystemPrompt: 'PERSONA',
    knowledge: [{ title: 'A', content: 'a', specialist_tags: [] }],
    specialists: [],
  });
  assertEquals(prompt.includes('# Specialist Playbooks'), false);
  assertStringIncludes(prompt, 'PERSONA');
  assertStringIncludes(prompt, '# General Knowledge');
});

Deno.test('buildSpecialistSystemPrompt renders a multi-tagged article under each active specialist', () => {
  const prompt = buildSpecialistSystemPrompt({
    guardrails: [],
    personaSystemPrompt: 'P',
    knowledge: [{ title: 'Condition Grades', content: 'S/A/B/C/D/J', specialist_tags: ['sales', 'aftersales'] }],
    specialists: SPECIALISTS,
  });
  // Appears twice: once under Sales, once under Aftersales (both active). Not deduplicated.
  const occurrences = prompt.split('### Condition Grades').length - 1;
  assertEquals(occurrences, 2);
  // And therefore not in General Knowledge.
  // Use '\n## Condition Grades' to avoid false-positive: '## X' is a substring of '### X'.
  assertEquals(prompt.includes('\n## Condition Grades\n'), false);
});

Deno.test('buildSpecialistSystemPrompt renders Approved Replies under the owning specialist', () => {
  const templates: TemplateReply[] = [
    { name: 'Info: Express Service', content_en: 'EXPRESS_BODY', specialist_slug: 'sales', ai_usage: 'AUTO', has_media: true },
    { name: 'Order: Offer Link', content_en: 'OFFER_BODY', specialist_slug: 'sales', ai_usage: 'REFERENCE', has_media: false },
    { name: 'Off One', content_en: 'HIDDEN_BODY', specialist_slug: 'sales', ai_usage: 'OFF', has_media: false },
    { name: 'Tracking: LBC', content_en: 'LBC_BODY', specialist_slug: 'order_tracking', ai_usage: 'REFERENCE', has_media: false },
  ];
  const prompt = buildSpecialistSystemPrompt({
    guardrails: [], personaSystemPrompt: 'P', knowledge: [], specialists: SPECIALISTS, templates,
  });
  assertStringIncludes(prompt, 'Approved Replies');
  assertStringIncludes(prompt, 'EXPRESS_BODY');
  assertStringIncludes(prompt, '[AUTO]');
  assertStringIncludes(prompt, '(has photo/video)');
  assertStringIncludes(prompt, 'OFFER_BODY');
  assertStringIncludes(prompt, '[REFERENCE]');
  assertStringIncludes(prompt, 'LBC_BODY');
  // OFF templates are never shown to the model.
  assertEquals(prompt.includes('HIDDEN_BODY'), false);
  // The sales templates appear under Sales, before the order_tracking one appears under Order & Tracking.
  assert(prompt.indexOf('EXPRESS_BODY') < prompt.indexOf('LBC_BODY'), 'sales replies precede order_tracking replies');
});

Deno.test('buildSpecialistSystemPrompt omits Approved Replies when a specialist has none', () => {
  const prompt = buildSpecialistSystemPrompt({
    guardrails: [], personaSystemPrompt: 'P', knowledge: [], specialists: SPECIALISTS, templates: [],
  });
  assertEquals(prompt.includes('Approved Replies'), false);
});

Deno.test('buildSpecialistSystemPrompt shows a null-specialist template under every specialist', () => {
  const templates: TemplateReply[] = [
    { name: 'Global', content_en: 'GLOBAL_BODY', specialist_slug: null, ai_usage: 'AUTO', has_media: false },
  ];
  const prompt = buildSpecialistSystemPrompt({
    guardrails: [], personaSystemPrompt: 'P', knowledge: [], specialists: SPECIALISTS, templates,
  });
  // Appears once under each of the 4 active specialists.
  assertEquals(prompt.split('GLOBAL_BODY').length - 1, 4);
});

Deno.test('buildSpecialistSystemPrompt renders company facts grouped by category', () => {
  const prompt = buildSpecialistSystemPrompt({
    guardrails: [],
    personaSystemPrompt: 'PERSONA',
    knowledge: [],
    specialists: [],
    companyFacts: [
      { key: 'paypal_name', label: 'PayPal account name', value_en: 'Yehey Japan Kabushiki Kaisha', value_ja: null, category: 'Payment' },
      { key: 'bank_holder', label: 'Bank account name', value_en: 'Yehey Japan K.K.', value_ja: 'ヤヘイジャパン株式会社', category: 'Banking' },
    ],
  });
  assertStringIncludes(prompt, '# Company Facts');
  assertStringIncludes(prompt, '## Payment');
  assertStringIncludes(prompt, '- PayPal account name: Yehey Japan Kabushiki Kaisha');
  assertStringIncludes(prompt, '## Banking');
  assertStringIncludes(prompt, '- Bank account name: Yehey Japan K.K. (JA: ヤヘイジャパン株式会社)');
});

Deno.test('buildSpecialistSystemPrompt omits JA suffix when value_ja is empty', () => {
  const prompt = buildSpecialistSystemPrompt({
    guardrails: [], personaSystemPrompt: 'P', knowledge: [], specialists: [],
    companyFacts: [{ key: 'order_format', label: 'Order number format', value_en: 'YJ-XXXXXX', value_ja: null, category: 'Orders' }],
  });
  assert(!prompt.includes('(JA:'));
  assertStringIncludes(prompt, '- Order number format: YJ-XXXXXX');
});

Deno.test('buildSpecialistSystemPrompt omits the Company Facts block when there are no facts', () => {
  const prompt = buildSpecialistSystemPrompt({
    guardrails: [], personaSystemPrompt: 'P', knowledge: [], specialists: [],
  });
  assert(!prompt.includes('# Company Facts'));
});

Deno.test('Company Facts block sits after persona and before Specialist Playbooks', () => {
  const prompt = buildSpecialistSystemPrompt({
    guardrails: [], personaSystemPrompt: 'PERSONA_BODY', knowledge: [],
    specialists: SPECIALISTS,
    companyFacts: [{ key: 'k', label: 'L', value_en: 'V', value_ja: null, category: 'Orders' }],
  });
  const personaIdx = prompt.indexOf('PERSONA_BODY');
  const factsIdx = prompt.indexOf('# Company Facts');
  const playbookIdx = prompt.indexOf('# Specialist Playbooks');
  assert(personaIdx < factsIdx && factsIdx < playbookIdx);
});

Deno.test('renderLearnedCorrections renders each correction with its note', () => {
  const out = renderLearnedCorrections([
    { customer_message: 'battery percentage po?', correct_reply: 'Look it up and share the exact %.', note: 'we track battery %' },
  ]);
  assertStringIncludes(out, '# Learned Corrections');
  assertStringIncludes(out, 'battery percentage po?');
  assertStringIncludes(out, 'Look it up and share the exact %.');
  assertStringIncludes(out, 'Why: we track battery %');
});

Deno.test('renderLearnedCorrections omits the Why line when note is empty', () => {
  const out = renderLearnedCorrections([
    { customer_message: 'q', correct_reply: 'a', note: null },
  ]);
  assertStringIncludes(out, 'q');
  assertEquals(out.includes('Why:'), false);
});

Deno.test('renderLearnedCorrections returns empty string when there are none', () => {
  assertEquals(renderLearnedCorrections([]), '');
});
