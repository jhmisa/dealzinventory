// Deno-pure port of the canonical item-description builder used by the frontend
// (src/lib/utils.ts buildShortDescription/getItemDescription + src/lib/constants.ts
// AVAILABLE_SPEC_FIELDS/getSpecFieldLabel). Kept identical so AI replies and the manual
// Messages-tab paste render the SAME description string. Parity is guarded by
// item-description.test.ts golden values — update both together if the frontend changes.

const SPEC_FIELD_LABELS: Record<string, string> = {
  brand: 'Brand', model_name: 'Model Name', model_number: 'Model Number', part_number: 'Part Number',
  color: 'Color', cpu: 'CPU', ram_gb: 'Memory', storage_gb: 'Storage', os_family: 'OS Family',
  gpu: 'GPU', carrier: 'Carrier', is_unlocked: 'Unlocked', keyboard_layout: 'Keyboard Layout',
  screen_size: 'Screen Size', has_touchscreen: 'Touchscreen', has_thunderbolt: 'Thunderbolt',
  supports_stylus: 'Stylus Support', has_cellular: 'Cellular', imei_slot_count: 'IMEI Slot Count',
  chipset: 'Chipset', ports: 'Ports', year: 'Year', other_features: 'Other Features',
  has_camera: 'Camera', has_bluetooth: 'Bluetooth', battery_health_pct: 'Battery Health (%)',
  condition_notes: 'Condition Notes',
};

export function getSpecFieldLabel(key: string): string {
  return SPEC_FIELD_LABELS[key] ?? key;
}

export function buildShortDescription(
  values: Record<string, unknown>,
  descriptionFields: string[],
): string {
  return descriptionFields
    .map((key) => {
      const val = values[key];
      if (val == null || val === '' || val === false) return null;
      if (key === 'ram_gb' && val) return String(val);
      if (key === 'storage_gb' && val) return String(val);
      if (key === 'screen_size' && val) return `${val}"`;
      if (key === 'battery_health_pct' && val) return `Battery ${val}%`;
      if (key === 'condition_notes' && val) return String(val);
      if (typeof val === 'boolean') return val ? getSpecFieldLabel(key) : null;
      return String(val);
    })
    .filter(Boolean)
    .join(' ');
}

export function getItemDescription(
  item: Record<string, unknown>,
  productModel?: Record<string, unknown> | null,
  descriptionFields?: string[] | null,
): string {
  if (descriptionFields && descriptionFields.length > 0) {
    const resolvedValues: Record<string, unknown> = {};
    for (const key of descriptionFields) {
      resolvedValues[key] = item[key] ?? productModel?.[key];
    }
    return buildShortDescription(resolvedValues, descriptionFields) || (item.supplier_description as string) || '';
  }
  const brand = item.brand ?? productModel?.brand;
  const modelName = item.model_name ?? productModel?.model_name;
  const fullModel = brand && modelName ? `${brand} ${modelName}` : null;
  const screenSize = item.screen_size ?? productModel?.screen_size;
  const parts = [
    fullModel,
    item.cpu,
    item.ram_gb,
    item.storage_gb,
    screenSize ? `${screenSize}"` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' / ') : ((item.supplier_description as string) || '');
}
