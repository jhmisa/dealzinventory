// Default vision models per provider for invoice parsing.
// Preserves prior hardcoded behavior when model_id is not set in config.
const DEFAULT_INVOICE_MODELS: Record<string, string> = {
  anthropic: 'claude-sonnet-4-5-20250929',
  openai: 'gpt-4o',
  google: 'gemini-2.0-flash',
  openrouter: 'google/gemini-2.5-flash',
};

export function resolveInvoiceModel(
  provider: string,
  configModelId?: string | null,
): string {
  const trimmed = (configModelId ?? '').trim();
  if (trimmed) return trimmed;
  return DEFAULT_INVOICE_MODELS[provider] ?? DEFAULT_INVOICE_MODELS.openrouter;
}

// OpenAI-compatible chat body (works for OpenRouter) with an inline image.
export function buildOpenRouterVisionBody(
  model: string,
  systemPrompt: string,
  base64: string,
  mediaType: string,
): Record<string, unknown> {
  return {
    model,
    max_tokens: 4096,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64}` } },
          { type: 'text', text: 'Parse this invoice and extract all line items as JSON.' },
        ],
      },
    ],
  };
}

// An image ready to attach to a multimodal model request.
export interface VisionImage {
  base64: string;
  mediaType: string;
}

// Pragmatic capability check: which provider/model combos accept images.
export function modelSupportsVision(provider: string, modelId: string): boolean {
  const m = (modelId ?? '').toLowerCase();
  switch (provider) {
    case 'anthropic':
      return m.includes('claude');
    case 'openai':
      return m.includes('gpt-4o') || m.includes('gpt-4.1') || m.includes('o4') || m.includes('gpt-5');
    case 'google':
      return m.includes('gemini');
    case 'openrouter':
      return m.includes('gemini') || m.includes('claude') || m.includes('gpt-4o') ||
        m.includes('gpt-4.1') || m.includes('gpt-5') || m.includes('llama-3.2') || m.includes('vision');
    default:
      return false;
  }
}

// Anthropic message content: plain string when no images, else text + image blocks.
export function toAnthropicContent(text: string, images: VisionImage[]): string | unknown[] {
  if (images.length === 0) return text;
  return [
    { type: 'text', text },
    ...images.map((img) => ({
      type: 'image',
      source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
    })),
  ];
}

// OpenAI / OpenRouter message content: plain string when no images, else text + image_url parts.
export function toOpenAIContent(text: string, images: VisionImage[]): string | unknown[] {
  if (images.length === 0) return text;
  return [
    { type: 'text', text },
    ...images.map((img) => ({
      type: 'image_url',
      image_url: { url: `data:${img.mediaType};base64,${img.base64}` },
    })),
  ];
}

// Gemini parts: always an array (Gemini requires parts[]), text first then inline images.
export function toGeminiParts(text: string, images: VisionImage[]): unknown[] {
  return [
    { text },
    ...images.map((img) => ({ inline_data: { mime_type: img.mediaType, data: img.base64 } })),
  ];
}
