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
