const FAL_QUEUE_BASE = 'https://queue.fal.run';

// Decide which Fal queue URL to POST to.
// - If the configured endpoint already points at queue.fal.run/<model>, use it.
// - Otherwise compose FAL_QUEUE_BASE + model_id.
export function resolveFalModelUrl(endpoint: string, modelId?: string | null): string {
  const ep = (endpoint ?? '').trim().replace(/\/+$/, '');
  if (ep.includes('queue.fal.run/')) return ep;
  const model = (modelId ?? '').trim().replace(/^\/+|\/+$/g, '');
  if (!model) {
    throw new Error('Fal model is not configured. Set model_id or a full queue.fal.run/<model> endpoint.');
  }
  return `${FAL_QUEUE_BASE}/${model}`;
}

export function extractFalImageUrl(result: Record<string, unknown>): string | null {
  if (Array.isArray(result.images) && result.images.length > 0) {
    const first = result.images[0] as Record<string, unknown>;
    if (typeof first.url === 'string') return first.url;
  }
  if (result.image && typeof result.image === 'object') {
    const img = result.image as Record<string, unknown>;
    if (typeof img.url === 'string') return img.url;
  }
  if (typeof result.image_url === 'string') return result.image_url;
  return null;
}
