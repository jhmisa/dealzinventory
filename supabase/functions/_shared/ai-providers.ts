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

  const result: ChatMessage[] = [{ ...messages[0] }];
  for (let i = 1; i < messages.length; i++) {
    const prev = result[result.length - 1];
    if (messages[i].role === prev.role) {
      prev.content += '\n' + messages[i].content;
    } else {
      result.push({ ...messages[i] });
    }
  }
  return result;
}

// ---------- Provider-agnostic dispatcher ----------

export async function generateAIReply(
  provider: AIProvider,
  systemPrompt: string,
  contextBlock: string,
  messages: ChatMessage[],
): Promise<AIResponse> {
  switch (provider.provider) {
    case 'anthropic':
      return callClaude(provider, systemPrompt, contextBlock, messages);
    case 'openai':
      return callOpenAI(provider, systemPrompt, contextBlock, messages);
    case 'google':
      return callGemini(provider, systemPrompt, contextBlock, messages);
    case 'openrouter':
      return callOpenRouter(provider, systemPrompt, contextBlock, messages);
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
): Promise<AIResponse> {
  const anthropicMessages = consolidateMessages(messages).map((m) => ({
    role: m.role === 'customer' ? 'user' as const : 'assistant' as const,
    content: m.content,
  }));

  // Add the latest customer message context prompt
  const fullSystem = `${systemPrompt}\n\n---\n\n# Current Customer Context\n${contextBlock}\n\n---\n\nRespond with a JSON object containing:\n- "reply": your message to the customer\n- "confidence": 0.0-1.0 how confident you are this reply is correct and complete\n- "intent": one of tracking|order_status|product_inquiry|complaint|return|kaitori|general|unknown\n- "data_used": array of data references used e.g. ["order:ORD000123"]\n- "escalation_reason": null if no escalation needed, otherwise a short reason string\n\nRespond ONLY with the JSON object, no markdown fences.`;

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
  return parseAIResponse(text);
}

// ---------- OpenAI (GPT) ----------

async function callOpenAI(
  provider: AIProvider,
  systemPrompt: string,
  contextBlock: string,
  messages: ChatMessage[],
): Promise<AIResponse> {
  const openaiMessages = [
    {
      role: 'system',
      content: `${systemPrompt}\n\n---\n\n# Current Customer Context\n${contextBlock}\n\n---\n\nRespond with a JSON object containing:\n- "reply": your message to the customer\n- "confidence": 0.0-1.0 how confident you are this reply is correct and complete\n- "intent": one of tracking|order_status|product_inquiry|complaint|return|kaitori|general|unknown\n- "data_used": array of data references used e.g. ["order:ORD000123"]\n- "escalation_reason": null if no escalation needed, otherwise a short reason string\n\nRespond ONLY with the JSON object, no markdown fences.`,
    },
    ...consolidateMessages(messages).map((m) => ({
      role: m.role === 'customer' ? 'user' as const : 'assistant' as const,
      content: m.content,
    })),
  ];

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
  return parseAIResponse(text);
}

// ---------- OpenRouter (OpenAI-compatible) ----------

async function callOpenRouter(
  provider: AIProvider,
  systemPrompt: string,
  contextBlock: string,
  messages: ChatMessage[],
): Promise<AIResponse> {
  const openrouterMessages = [
    {
      role: 'system',
      content: `${systemPrompt}\n\n---\n\n# Current Customer Context\n${contextBlock}\n\n---\n\nRespond with a JSON object containing:\n- "reply": your message to the customer\n- "confidence": 0.0-1.0 how confident you are this reply is correct and complete\n- "intent": one of tracking|order_status|product_inquiry|complaint|return|kaitori|general|unknown\n- "data_used": array of data references used e.g. ["order:ORD000123"]\n- "escalation_reason": null if no escalation needed, otherwise a short reason string\n\nRespond ONLY with the JSON object, no markdown fences.`,
    },
    ...consolidateMessages(messages).map((m) => ({
      role: m.role === 'customer' ? 'user' as const : 'assistant' as const,
      content: m.content,
    })),
  ];

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
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content ?? '';
      return parseAIResponse(text);
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
): Promise<AIResponse> {
  const geminiContents = consolidateMessages(messages).map((m) => ({
    role: m.role === 'customer' ? 'user' : 'model',
    parts: [{ text: m.content }],
  }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${provider.model_id}:generateContent?key=${provider.api_key_encrypted}`;
  const body = JSON.stringify({
    systemInstruction: {
      parts: [{
        text: `${systemPrompt}\n\n---\n\n# Current Customer Context\n${contextBlock}\n\n---\n\nRespond with a JSON object containing:\n- "reply": your message to the customer\n- "confidence": 0.0-1.0 how confident you are this reply is correct and complete\n- "intent": one of tracking|order_status|product_inquiry|complaint|return|kaitori|general|unknown\n- "data_used": array of data references used e.g. ["order:ORD000123"]\n- "escalation_reason": null if no escalation needed, otherwise a short reason string\n\nRespond ONLY with the JSON object, no markdown fences.`,
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
      return parseAIResponse(text);
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

function parseAIResponse(text: string): AIResponse {
  try {
    // Strip markdown fences if present
    const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      reply: String(parsed.reply ?? ''),
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence ?? 0.5))),
      intent: String(parsed.intent ?? 'unknown'),
      data_used: Array.isArray(parsed.data_used) ? parsed.data_used.map(String) : [],
      escalation_reason: parsed.escalation_reason ? String(parsed.escalation_reason) : null,
    };
  } catch {
    // If parsing fails, use the raw text as the reply with low confidence
    return {
      reply: text,
      confidence: 0.3,
      intent: 'unknown',
      data_used: [],
      escalation_reason: 'AI response could not be parsed as structured JSON',
    };
  }
}
