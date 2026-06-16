// Token usage normalized across providers (input/output token counts).
export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface ModelPrice {
  inputPerMillion: number;
  outputPerMillion: number;
}

// Approximate USD prices per 1M tokens. These are estimates for cost telemetry
// (relative trend matters more than to-the-cent accuracy). Update as pricing changes.
export const MODEL_PRICES: Record<string, ModelPrice> = {
  'claude-sonnet-4-5-20250929': { inputPerMillion: 3, outputPerMillion: 15 },
  'claude-opus-4-1': { inputPerMillion: 15, outputPerMillion: 75 },
  'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 },
  'gemini-2.0-flash': { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  'gemini-2.5-flash': { inputPerMillion: 0.3, outputPerMillion: 2.5 },
  'google/gemini-2.5-flash': { inputPerMillion: 0.3, outputPerMillion: 2.5 },
};

// Conservative fallback when a model id is not in the table.
const FALLBACK_PRICE: ModelPrice = { inputPerMillion: 3, outputPerMillion: 15 };

export function estimateCostUsd(modelId: string, usage: TokenUsage): number {
  const price = MODEL_PRICES[modelId] ?? FALLBACK_PRICE;
  const cost =
    (usage.input_tokens / 1_000_000) * price.inputPerMillion +
    (usage.output_tokens / 1_000_000) * price.outputPerMillion;
  // Round to 6 decimals to match numeric(10,6) column.
  return Math.round(cost * 1_000_000) / 1_000_000;
}
