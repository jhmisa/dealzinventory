import { type TokenUsage } from "./ai-cost.ts";
import {
  modelSupportsVision,
  toAnthropicContent,
  toOpenAIContent,
  toGeminiParts,
  type VisionImage,
} from "./ai-vision.ts";

// ---------- Types ----------

export interface AIProvider {
  id: string;
  name: string;
  provider: 'anthropic' | 'openai' | 'google' | 'openrouter';
  model_id: string;
  api_key_encrypted: string;
}

export interface AIResponse {
  reply: string;
  confidence: number;
  intent: string;
  data_used: string[];
  escalation_reason: string | null;
  needs_clarification?: boolean;
  offer_codes?: string[];
  usage?: TokenUsage;
}

// Normalize token usage across provider response shapes.
export function extractUsage(provider: string, data: unknown): TokenUsage {
  const d = (data ?? {}) as Record<string, unknown>;
  if (provider === 'google') {
    const u = (d.usageMetadata ?? {}) as Record<string, unknown>;
    return {
      input_tokens: Number(u.promptTokenCount ?? 0),
      output_tokens: Number(u.candidatesTokenCount ?? 0),
    };
  }
  const u = (d.usage ?? {}) as Record<string, unknown>;
  return {
    input_tokens: Number(u.input_tokens ?? u.prompt_tokens ?? 0),
    output_tokens: Number(u.output_tokens ?? u.completion_tokens ?? 0),
  };
}

interface ChatMessage {
  role: string;
  content: string;
}

// ---------- Helpers ----------

/**
 * Merge consecutive messages with the same role into one.
 * LLM APIs (Anthropic, Gemini) require alternating user/assistant turns.
 * When FAILED messages are filtered out, we can end up with consecutive
 * customer messages that need to be consolidated.
 */
function consolidateMessages(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length === 0) return [];

  const result: ChatMessage[] = [];
  for (const m of messages) {
    const role = normalizeRole(m.role);
    const prev = result[result.length - 1];
    if (prev && prev.role === role) {
      prev.content += '\n' + m.content;
    } else {
      result.push({ role, content: m.content });
    }
  }
  return result;
}

// Collapse message roles to the two sides an LLM chat API understands.
// Customer messages are the "user" side; everything we send back
// (AI 'assistant' drafts AND human 'staff' replies) is the "assistant" side.
export function normalizeRole(role: string): 'customer' | 'assistant' {
  return role === 'customer' ? 'customer' : 'assistant';
}

// Test-only re-export so the pure consolidation logic can be unit-tested
// without going through a provider network call.
export function consolidateForTest(messages: ChatMessage[]): ChatMessage[] {
  return consolidateMessages(messages);
}

// ---------- Provider-agnostic dispatcher ----------

const INVENTORY_RESPONSE_RULE = `
# Response Strategy for Product Inquiries
First decide if the request is SPECIFIC or BROAD:
- SPECIFIC = the customer named a model/code/specs, or sent a photo/screenshot of one listing, or asks "is THIS still available?".
- BROAD = only a category/intent ("may laptop po ba kayo?", "may phone ba kayo?", "ano meron"), with no recipient, use-case, or budget yet.

For a SPECIFIC ask: confirm availability first. Use the search_inventory tool to find the matching AVAILABLE listing (it may be a different code than the customer quoted), then lead your reply with that concrete option (code, grade, price) and its order_url. Ask at most ONE short follow-up only if needed.

For a BROAD ask: do NOT dump a product and do NOT call search_inventory yet. Follow the active specialist's playbook to qualify first (reassure stock exists, then ask the key questions warmly), then hand off per the playbook.

Keep replies short — 2-4 sentences max. No walls of text.`;

const CLARIFY_BEFORE_ASSUMING_RULE = `
# Resolve before assuming — then ask ONE specific question
1. The customer’s most recent messages may be a burst — treat them as ONE request and answer them together.
2. Read the FULL conversation above before replying. NEVER re-ask something already asked or answered earlier in the thread.
3. A message must name WHAT it is about before you answer it. If it clearly refers to a topic but only omits the id (e.g. “ano na status ng order ko”, “ano na nangyari sa binili ko” → an order; “magkano quote ko” → a kaitori), resolve it from the Customer / Orders context and answer.
4. If the message is bare or OBJECTLESS — it does not say what it is about (e.g. just “ano na nangyari?”, “kamusta na?”, “update?”, “magkano?”, “pwede?”) — do NOT assume it means their most recent order or any single topic, EVEN IF only one order exists. Ask ONE short, polite clarifying question first, e.g. “Hi po! 😊 Ano po ang maitutulong ko sa inyo — order, item, o kaitori po ba ito?”, and set needs_clarification = true. Picking the most recent order for an objectless message is an ASSUMPTION — do not do it.
5. If a reference matches MULTIPLE candidates, ask ONE short, SPECIFIC question that cites the concrete options — e.g. “Order ORD000123 (iPhone 13) po ba ang tinatanong nyo?” — never a generic “ano pong tanong nyo?”. Set needs_clarification = true.
6. If the latest message is a bare screenshot or a fragment with no clear ask, briefly say what you see and ask one specific question. Do NOT guess.
7. NEVER invent facts (price, stock, order status, tracking) that are not present in the context above.`;

// Assemble the full system prompt sent to every messaging provider:
// persona/guardrails + the inventory strategy + the clarify-don’t-guess rule.
export function buildEnhancedPrompt(systemPrompt: string): string {
  return systemPrompt + "\n\n" + INVENTORY_RESPONSE_RULE + "\n\n" + CLARIFY_BEFORE_ASSUMING_RULE;
}

export async function generateAIReply(
  provider: AIProvider,
  systemPrompt: string,
  contextBlock: string,
  messages: ChatMessage[],
  latestImages: VisionImage[] = [],
  executeTool?: ToolExecutor,
): Promise<AIResponse> {
  // Inject inventory response strategy + clarify-don't-guess rule into every prompt
  const enhancedPrompt = buildEnhancedPrompt(systemPrompt);

  // Only forward images to vision-capable models; otherwise ignore them.
  const images = modelSupportsVision(provider.provider, provider.model_id) ? latestImages : [];

  switch (provider.provider) {
    case 'anthropic':
      return callClaude(provider, enhancedPrompt, contextBlock, messages, images);
    case 'openai':
      return callOpenAI(provider, enhancedPrompt, contextBlock, messages, images);
    case 'google':
      return callGemini(provider, enhancedPrompt, contextBlock, messages, images);
    case 'openrouter':
      return callOpenRouter(provider, enhancedPrompt, contextBlock, messages, images, executeTool);
    default:
      throw new Error(`Unsupported provider: ${provider.provider}`);
  }
}

// ---------- Anthropic (Claude) ----------

async function callClaude(
  provider: AIProvider,
  systemPrompt: string,
  contextBlock: string,
  messages: ChatMessage[],
  images: VisionImage[] = [],
): Promise<AIResponse> {
  const anthropicMessages: Array<{ role: 'user' | 'assistant'; content: string | unknown[] }> =
    consolidateMessages(messages).map((m) => ({
      role: m.role === 'customer' ? 'user' as const : 'assistant' as const,
      content: m.content as string | unknown[],
    }));

  // Attach images to the most recent user turn.
  if (images.length > 0) {
    for (let i = anthropicMessages.length - 1; i >= 0; i--) {
      if (anthropicMessages[i].role === 'user') {
        anthropicMessages[i].content = toAnthropicContent(anthropicMessages[i].content as string, images);
        break;
      }
    }
  }

  // Add the latest customer message context prompt
  const fullSystem = `${systemPrompt}\n\n---\n\n# Current Customer Context\n${contextBlock}\n\n---\n\nRespond with a JSON object containing:\n- "reply": your message to the customer\n- "confidence": 0.0-1.0 how confident you are this reply is correct and complete\n- "intent": one of tracking|order_status|product_inquiry|complaint|return|kaitori|general|unknown\n- "data_used": array of data references used e.g. ["order:ORD000123"]\n- "escalation_reason": null if no escalation needed, otherwise a short reason string\n- "needs_clarification": true if your reply is a question asking the customer to clarify their request (instead of answering it), otherwise false\n- "offer_codes": array of inventory codes you are offering in this reply (from search_inventory results), e.g. ["G000022"]; empty array if none\n\nRespond ONLY with the JSON object, no markdown fences.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': provider.api_key_encrypted,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: provider.model_id,
      max_tokens: 1024,
      system: fullSystem,
      messages: anthropicMessages,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text ?? '';
  return { ...parseAIResponse(text), usage: extractUsage('anthropic', data) };
}

// ---------- OpenAI (GPT) ----------

async function callOpenAI(
  provider: AIProvider,
  systemPrompt: string,
  contextBlock: string,
  messages: ChatMessage[],
  images: VisionImage[] = [],
): Promise<AIResponse> {
  const openaiMessages: Array<{ role: string; content: string | unknown[] }> = [
    {
      role: 'system',
      content: `${systemPrompt}\n\n---\n\n# Current Customer Context\n${contextBlock}\n\n---\n\nRespond with a JSON object containing:\n- "reply": your message to the customer\n- "confidence": 0.0-1.0 how confident you are this reply is correct and complete\n- "intent": one of tracking|order_status|product_inquiry|complaint|return|kaitori|general|unknown\n- "data_used": array of data references used e.g. ["order:ORD000123"]\n- "escalation_reason": null if no escalation needed, otherwise a short reason string\n- "needs_clarification": true if your reply is a question asking the customer to clarify their request (instead of answering it), otherwise false\n- "offer_codes": array of inventory codes you are offering in this reply (from search_inventory results), e.g. ["G000022"]; empty array if none\n\nRespond ONLY with the JSON object, no markdown fences.`,
    },
    ...consolidateMessages(messages).map((m) => ({
      role: m.role === 'customer' ? 'user' as const : 'assistant' as const,
      content: m.content as string | unknown[],
    })),
  ];

  // Attach images to the most recent user turn.
  if (images.length > 0) {
    for (let i = openaiMessages.length - 1; i >= 0; i--) {
      if (openaiMessages[i].role === 'user') {
        openaiMessages[i].content = toOpenAIContent(openaiMessages[i].content as string, images);
        break;
      }
    }
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.api_key_encrypted}`,
    },
    body: JSON.stringify({
      model: provider.model_id,
      max_tokens: 1024,
      messages: openaiMessages,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? '';
  return { ...parseAIResponse(text), usage: extractUsage('openai', data) };
}

// ---------- Tool: search_inventory ----------

export const SEARCH_INVENTORY_TOOL = {
  type: 'function' as const,
  function: {
    name: 'search_inventory',
    description:
      'Search Dealz live AVAILABLE inventory for products to confirm availability and make an offer. ' +
      'Use when a customer asks if a specific item is still available, names a model/code, or sends a photo/screenshot of a listing. ' +
      'Returns matching items (P-codes) and sell groups (G-codes) with code, description, grade, price, and order_url.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Model name, brand, code, or keywords read from the message/image, e.g. "Iris Ohyama LUCA tablet" or "G000022".' },
        category_id: { type: 'string', description: 'Optional category UUID filter.' },
        brand: { type: 'string', description: 'Optional exact brand filter.' },
        price_min: { type: 'number', description: 'Optional minimum yen price.' },
        price_max: { type: 'number', description: 'Optional maximum yen price.' },
      },
      required: ['query'],
    },
  },
};

type ToolCall = { id: string; type: string; function: { name: string; arguments: string } };
type LoopMessage = { role: string; content: string | unknown[] | null; tool_calls?: ToolCall[]; tool_call_id?: string };

export interface ToolLoopArgs {
  fetchImpl: typeof fetch;
  url: string;
  apiKey: string;
  model: string;
  messages: LoopMessage[];
  executeTool: (name: string, args: unknown) => Promise<unknown>;
  maxToolRounds: number;
}

export interface ToolLoopResult {
  finalText: string;
  usage: TokenUsage;
}

export type ToolExecutor = (name: string, args: unknown) => Promise<unknown>;

// Multi-turn OpenAI-compatible chat loop: runs tool calls in-process until the model
// returns a normal (content) message. Provider-agnostic over any OpenAI-shaped endpoint.
export async function runChatCompletionWithTools(args: ToolLoopArgs): Promise<ToolLoopResult> {
  const messages = [...args.messages];
  let inTok = 0, outTok = 0;

  for (let round = 0; round <= args.maxToolRounds; round++) {
    // After exhausting tool rounds, force a normal answer (omit tools).
    const includeTools = round < args.maxToolRounds;
    const body: Record<string, unknown> = {
      model: args.model,
      max_tokens: 1024,
      messages,
    };
    if (includeTools) {
      // While tools are offered, do NOT force json_object — some OpenRouter models
      // suppress tool_calls when a response_format is pinned. The final round (below)
      // omits tools and enforces JSON for a clean, parseable answer.
      body.tools = [SEARCH_INVENTORY_TOOL];
    } else {
      body.response_format = { type: 'json_object' };
    }

    // Retry 503/429 with backoff (mirrors existing provider behavior).
    let data: Record<string, unknown> | null = null;
    let lastError = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
      const res = await args.fetchImpl(args.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${args.apiKey}` },
        body: JSON.stringify(body),
      });
      if (res.ok) { data = await res.json(); break; }
      lastError = await res.text();
      const status = (res as Response).status;
      if (status !== 503 && status !== 429) throw new Error(`Tool-loop API error ${status}: ${lastError}`);
      if (attempt === 2) throw new Error(`Tool-loop API error after 3 retries: ${lastError}`);
    }
    if (!data) throw new Error('Tool-loop: no response');

    const usage = extractUsage('openrouter', data);
    inTok += usage.input_tokens; outTok += usage.output_tokens;

    const choice = (data.choices as Array<{ finish_reason?: string; message: LoopMessage }>)?.[0];
    const msg = choice?.message;
    const toolCalls = msg?.tool_calls ?? [];

    // No tool calls — or this was the final forced-answer round (tools omitted): return the
    // model's content. Empty content falls through to the caller, which escalates to a human.
    if (!toolCalls.length || !includeTools) {
      const content = typeof msg?.content === 'string' ? msg.content : '';
      return { finalText: content, usage: { input_tokens: inTok, output_tokens: outTok } };
    }

    // Record the assistant tool-call turn, then each tool result.
    messages.push({ role: 'assistant', content: msg!.content ?? null, tool_calls: toolCalls });
    for (const tc of toolCalls) {
      let parsed: unknown = {};
      try { parsed = JSON.parse(tc.function.arguments || '{}'); } catch { parsed = {}; }
      let result: unknown;
      try { result = await args.executeTool(tc.function.name, parsed); }
      catch (err) { result = { error: err instanceof Error ? err.message : 'tool error' }; }
      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
    }
  }

  // Unreachable in practice — the final round omits tools and returns content above.
  return { finalText: '', usage: { input_tokens: inTok, output_tokens: outTok } };
}

// ---------- OpenRouter (OpenAI-compatible) ----------

async function callOpenRouter(
  provider: AIProvider,
  systemPrompt: string,
  contextBlock: string,
  messages: ChatMessage[],
  images: VisionImage[] = [],
  executeTool?: ToolExecutor,
): Promise<AIResponse> {
  const openrouterMessages: Array<{ role: string; content: string | unknown[] }> = [
    {
      role: 'system',
      content: `${systemPrompt}\n\n---\n\n# Current Customer Context\n${contextBlock}\n\n---\n\nRespond with a JSON object containing:\n- "reply": your message to the customer\n- "confidence": 0.0-1.0 how confident you are this reply is correct and complete\n- "intent": one of tracking|order_status|product_inquiry|complaint|return|kaitori|general|unknown\n- "data_used": array of data references used e.g. ["order:ORD000123"]\n- "escalation_reason": null if no escalation needed, otherwise a short reason string\n- "needs_clarification": true if your reply is a question asking the customer to clarify their request (instead of answering it), otherwise false\n- "offer_codes": array of inventory codes you are offering in this reply (from search_inventory results), e.g. ["G000022"]; empty array if none\n\nRespond ONLY with the JSON object, no markdown fences.`,
    },
    ...consolidateMessages(messages).map((m) => ({
      role: m.role === 'customer' ? 'user' as const : 'assistant' as const,
      content: m.content as string | unknown[],
    })),
  ];

  // Attach images to the most recent user turn.
  if (images.length > 0) {
    for (let i = openrouterMessages.length - 1; i >= 0; i--) {
      if (openrouterMessages[i].role === 'user') {
        openrouterMessages[i].content = toOpenAIContent(openrouterMessages[i].content as string, images);
        break;
      }
    }
  }

  // Tool-enabled path: run the multi-turn loop so the model can call search_inventory.
  if (executeTool) {
    const { finalText, usage } = await runChatCompletionWithTools({
      fetchImpl: fetch,
      url: 'https://openrouter.ai/api/v1/chat/completions',
      apiKey: provider.api_key_encrypted,
      model: provider.model_id,
      messages: openrouterMessages as LoopMessage[],
      executeTool,
      maxToolRounds: 2,
    });
    return { ...parseAIResponse(finalText), usage };
  }

  // Retry up to 3 times with exponential backoff for 503/429 errors
  let lastError = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.api_key_encrypted}`,
      },
      body: JSON.stringify({
        model: provider.model_id,
        max_tokens: 1024,
        messages: openrouterMessages,
        response_format: { type: 'json_object' },
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content ?? '';
      return { ...parseAIResponse(text), usage: extractUsage('openrouter', data) };
    }

    lastError = await res.text();

    // Only retry on 503 (overloaded) and 429 (rate limit)
    if (res.status !== 503 && res.status !== 429) {
      throw new Error(`OpenRouter API error ${res.status}: ${lastError}`);
    }
  }

  throw new Error(`OpenRouter API error after 3 retries: ${lastError}`);
}

// ---------- Google (Gemini) ----------

async function callGemini(
  provider: AIProvider,
  systemPrompt: string,
  contextBlock: string,
  messages: ChatMessage[],
  images: VisionImage[] = [],
): Promise<AIResponse> {
  const consolidated = consolidateMessages(messages);
  const lastUserIdx = (() => {
    for (let i = consolidated.length - 1; i >= 0; i--) {
      if (consolidated[i].role === 'customer') return i;
    }
    return -1;
  })();

  const geminiContents = consolidated.map((m, idx) => ({
    role: m.role === 'customer' ? 'user' : 'model',
    parts: (images.length > 0 && idx === lastUserIdx)
      ? toGeminiParts(m.content, images)
      : [{ text: m.content }],
  }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${provider.model_id}:generateContent?key=${provider.api_key_encrypted}`;
  const body = JSON.stringify({
    systemInstruction: {
      parts: [{
        text: `${systemPrompt}\n\n---\n\n# Current Customer Context\n${contextBlock}\n\n---\n\nRespond with a JSON object containing:\n- "reply": your message to the customer\n- "confidence": 0.0-1.0 how confident you are this reply is correct and complete\n- "intent": one of tracking|order_status|product_inquiry|complaint|return|kaitori|general|unknown\n- "data_used": array of data references used e.g. ["order:ORD000123"]\n- "escalation_reason": null if no escalation needed, otherwise a short reason string\n- "needs_clarification": true if your reply is a question asking the customer to clarify their request (instead of answering it), otherwise false\n- "offer_codes": array of inventory codes you are offering in this reply (from search_inventory results), e.g. ["G000022"]; empty array if none\n\nRespond ONLY with the JSON object, no markdown fences.`,
      }],
    },
    contents: geminiContents,
    generationConfig: {
      maxOutputTokens: 1024,
      responseMimeType: 'application/json',
    },
  });

  // Retry up to 3 times with exponential backoff for 503/429 errors
  let lastError = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (res.ok) {
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      return { ...parseAIResponse(text), usage: extractUsage('google', data) };
    }

    lastError = await res.text();

    // Only retry on 503 (overloaded) and 429 (rate limit)
    if (res.status !== 503 && res.status !== 429) {
      throw new Error(`Gemini API error ${res.status}: ${lastError}`);
    }
  }

  throw new Error(`Gemini API error 503 after 3 retries: ${lastError}`);
}

// ---------- Response parser ----------

export function parseAIResponse(text: string): AIResponse {
  // Try multiple strategies to extract JSON from the response
  const strategies = [
    // 1. Raw text as-is
    () => JSON.parse(text.trim()),
    // 2. Strip markdown fences
    () => JSON.parse(text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()),
    // 3. Extract first JSON object found anywhere in the text
    () => {
      const match = text.match(/\{[\s\S]*"reply"[\s\S]*\}/);
      if (!match) throw new Error('No JSON object found');
      return JSON.parse(match[0]);
    },
  ];

  for (const strategy of strategies) {
    try {
      const parsed = strategy();
      if (parsed && typeof parsed.reply === 'string') {
        return {
          reply: String(parsed.reply),
          confidence: Math.min(1, Math.max(0, Number(parsed.confidence ?? 0.5))),
          intent: String(parsed.intent ?? 'unknown'),
          data_used: Array.isArray(parsed.data_used) ? parsed.data_used.map(String) : [],
          escalation_reason: parsed.escalation_reason ? String(parsed.escalation_reason) : null,
          needs_clarification: parsed.needs_clarification === true,
          offer_codes: Array.isArray(parsed.offer_codes) ? parsed.offer_codes.map(String) : [],
        };
      }
    } catch {
      // Try next strategy
    }
  }

  // Last resort: if the text looks like a normal reply (not JSON), use it directly
  // This handles models that ignore the JSON instruction entirely
  if (text.trim().length > 0 && !text.trim().startsWith('{')) {
    return {
      reply: text.trim(),
      confidence: 0.5,
      intent: 'general',
      data_used: [],
      escalation_reason: null,
      needs_clarification: false,
      offer_codes: [],
    };
  }

  return {
    reply: text,
    confidence: 0.3,
    intent: 'unknown',
    data_used: [],
    escalation_reason: 'AI response could not be parsed as structured JSON',
    needs_clarification: false,
    offer_codes: [],
  };
}
