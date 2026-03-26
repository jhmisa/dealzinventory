import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ParsedSpecs {
  brand?: string;
  model_name?: string;
  cpu?: string;
  ram_gb?: number;
  storage_gb?: number;
  screen_size?: number;
  serial_number?: string;
}

interface ParsedLineItem {
  line_number: number;
  product_description: string;
  quantity: number;
  unit_price: number;
  confidence: number;
  notes?: string;
  specs?: ParsedSpecs;
}

interface ParseInvoiceResponse {
  success: boolean;
  line_items: ParsedLineItem[];
  invoice_date?: string;
  invoice_total?: number;
  error?: string;
}

// ── Spec Parsing Helpers ────────────────────────────────────

function parseRamGb(raw: string): number | undefined {
  if (!raw) return undefined;
  const match = raw.match(/(\d+)\s*GB/i);
  return match ? parseInt(match[1], 10) : undefined;
}

function parseStorageGb(raw: string): number | undefined {
  if (!raw) return undefined;
  const tbMatch = raw.match(/(\d+(?:\.\d+)?)\s*TB/i);
  if (tbMatch) return Math.round(parseFloat(tbMatch[1]) * 1024);
  const gbMatch = raw.match(/(\d+)\s*GB/i);
  return gbMatch ? parseInt(gbMatch[1], 10) : undefined;
}

function parseScreenSize(raw: string): number | undefined {
  if (!raw) return undefined;
  const match = raw.match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : undefined;
}

// ── CSV Helpers ─────────────────────────────────────────────

function parseCSVRow(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

function normalizeFullWidth(str: string): string {
  return str.replace(/[\uff01-\uff5e]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
  );
}

async function fetchAndDecodeCSV(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download CSV: ${response.status} ${response.statusText}`);
  }
  const buffer = new Uint8Array(await response.arrayBuffer());
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('shift-jis').decode(buffer);
  }
}

function isAuctionCSV(headers: string[]): boolean {
  return headers.some(h => h.includes('\u51fa\u54c1\u756a\u53f7')) &&
         headers.some(h => h.includes('\u843d\u672d\u4fa1\u683c'));
}

// ── JP → EN Translation ───────────────────────────────────

const BRAND_MAP: Record<string, string> = {
  '\u30a2\u30c3\u30d7\u30eb': 'Apple',
  '\u30ec\u30ce\u30dc': 'Lenovo',
  '\u30c7\u30eb': 'Dell',
  '\u30a8\u30a4\u30c1\u30d4\u30fc': 'HP',
  'HP': 'HP',
  '\u30a8\u30a4\u30b9\u30fc\u30b9': 'ASUS',
  '\u30a8\u30a4\u30b5\u30fc': 'Acer',
  '\u30de\u30a4\u30af\u30ed\u30bd\u30d5\u30c8': 'Microsoft',
  '\u30b5\u30e0\u30b9\u30f3': 'Samsung',
  '\u30bd\u30cb\u30fc': 'Sony',
  '\u30d1\u30ca\u30bd\u30cb\u30c3\u30af': 'Panasonic',
  'NEC': 'NEC',
  '\u30b7\u30e3\u30fc\u30d7': 'Sharp',
  '\u30d5\u30a1\u30fc\u30a6\u30a7\u30a4': 'Huawei',
  '\u5bcc\u58eb\u901a': 'Fujitsu',
  '\u6771\u829d': 'Toshiba',
  'TOSHIBA': 'Toshiba',
  'DYNABOOK': 'Dynabook',
};

const COLOR_MAP: Record<string, string> = {
  '\u9ed2': 'Black',
  '\u30d6\u30e9\u30c3\u30af': 'Black',
  '\u767d': 'White',
  '\u30db\u30ef\u30a4\u30c8': 'White',
  '\u30b7\u30eb\u30d0\u30fc': 'Silver',
  '\u9280': 'Silver',
  '\u30b0\u30ec\u30fc': 'Gray',
  '\u30b0\u30ec\u30a4': 'Gray',
  '\u30b4\u30fc\u30eb\u30c9': 'Gold',
  '\u91d1': 'Gold',
  '\u30d4\u30f3\u30af': 'Pink',
  '\u30d6\u30eb\u30fc': 'Blue',
  '\u9752': 'Blue',
  '\u30ec\u30c3\u30c9': 'Red',
  '\u8d64': 'Red',
  '\u30b0\u30ea\u30fc\u30f3': 'Green',
  '\u30b9\u30da\u30fc\u30b9\u30b0\u30ec\u30fc': 'Space Gray',
  '\u30b9\u30da\u30fc\u30b9\u30b0\u30ec\u30a4': 'Space Gray',
  '\u30ed\u30fc\u30ba\u30b4\u30fc\u30eb\u30c9': 'Rose Gold',
  '\u30df\u30c3\u30c9\u30ca\u30a4\u30c8': 'Midnight',
  '\u30b9\u30bf\u30fc\u30e9\u30a4\u30c8': 'Starlight',
};

const FEATURE_MAP: Record<string, string> = {
  'SSD': 'SSD',
  '\u30ab\u30e1\u30e9': 'Camera',
  '\u30bf\u30c3\u30c1': 'Touch',
  '10\u30ad\u30fc': '10-Key',
  'RETINA\u30c7\u30a3\u30b9\u30d7\u30ec\u30a4': 'Retina Display',
  '\u30ab\u30e1\u30e9\u3001RETINA\u30c7\u30a3\u30b9\u30d7\u30ec\u30a4': 'Camera, Retina Display',
};

const CONDITION_MAP: Record<string, string> = {
  'NO': 'OK',
  '\u90e8\u53d6': 'Parts Only',
  '\u5909\u8272': 'Discolored',
  '\u7834\u640d': 'Damaged',
  '\u8a33\u3042\u308a': 'Defective',
};

const SYMPTOMS_MAP: Record<string, string> = {
  '\u5b8c\u5168\u672a\u691c\u67fb(\u901a\u96fb\u306e\u307f)': 'Uninspected (power only)',
  'BIOS\u78ba\u8a8d\u53ef': 'BIOS verified',
  'BIOS\u78ba\u8a8d\u4e2d': 'BIOS check pending',
  '\u30b9\u30da\u30c3\u30af\u306e\u307f': 'Specs only',
  '\u5b8c\u5168\u672a\u691c\u67fb': 'Uninspected',
};

const YES_NO_MAP: Record<string, string> = {
  '\u6709': 'Yes',
  '\u7121': 'No',
};

// ── Description Translation (for simple CSV & fallback) ────

const DESCRIPTION_TERMS_MAP: Record<string, string> = {
  // Condition & grade (longest first to avoid partial matches)
  '\u672a\u4f7f\u7528\u54c1': 'Unused',
  '\u672a\u4f7f\u7528': 'Unused',
  '\u672a\u958b\u5c01': 'Sealed',
  '\u4e2d\u53e4': 'Used',
  '\u65b0\u54c1': 'New',
  '\u30e9\u30f3\u30af': ' Grade',
  '\u7f8e\u54c1': 'Excellent',
  '\u826f\u54c1': 'Good',
  '\u96e3\u3042\u308a': 'Has Issues',
  '\u8a33\u3042\u308a': 'Defective',
  '\u30b8\u30e3\u30f3\u30af': 'Junk',
  '\u90e8\u54c1\u53d6\u308a': 'Parts Only',
  // Warranty & company
  '\u30f6\u6708\u9593\u4fdd\u8a3c': '-Month Warranty',
  '\u30f6\u6708\u4fdd\u8a3c': '-Month Warranty',
  '\u30f6\u6708\u9593': '-Month',
  '\u30f6\u6708': '-Month',
  '\u4fdd\u8a3c': 'Warranty',
  '\u5f53\u793e': 'Our ',
  // SIM / carrier
  'SIM\u30ed\u30c3\u30af\u89e3\u9664\u6e08\u307f': 'SIM Unlocked',
  'SIM\u30ed\u30c3\u30af\u89e3\u9664\u6e08': 'SIM Unlocked',
  'SIM\u30d5\u30ea\u30fc': 'SIM-Free',
  '\u56fd\u5185\u7248': 'Domestic',
  // Generation & model year
  '\u7b2c1\u4e16\u4ee3': '1st Gen',
  '\u7b2c2\u4e16\u4ee3': '2nd Gen',
  '\u7b2c3\u4e16\u4ee3': '3rd Gen',
  '\u7b2c4\u4e16\u4ee3': '4th Gen',
  '\u7b2c5\u4e16\u4ee3': '5th Gen',
  '\u7b2c6\u4e16\u4ee3': '6th Gen',
  '\u7b2c7\u4e16\u4ee3': '7th Gen',
  '\u7b2c8\u4e16\u4ee3': '8th Gen',
  '\u7b2c9\u4e16\u4ee3': '9th Gen',
  '\u7b2c10\u4e16\u4ee3': '10th Gen',
  '\u5e74\u30e2\u30c7\u30eb': ' Model',
  // Accessories & physical condition
  '\u5145\u96fb\u30b1\u30fc\u30b9\u4ed8\u304d': 'with Charging Case',
  '\u5145\u96fb\u5668\u4ed8\u304d': 'With Charger',
  '\u4ed8\u5c5e\u54c1\u306a\u3057': 'No Accessories',
  '\u4ed8\u5c5e\u54c1': 'Accessories',
  '\u7bb1\u306a\u3057': 'No Box',
  '\u7bb1\u4ed8\u304d': 'With Box',
  '\u672c\u4f53\u306e\u307f': 'Unit Only',
  '\u30d0\u30c3\u30c6\u30ea\u30fc': 'Battery',
  '\u753b\u9762\u5272\u308c': 'Cracked Screen',
  '\u50b7\u3042\u308a': 'Scratched',
  // Inspection status
  '\u52d5\u4f5c\u78ba\u8a8d\u6e08\u307f': 'Tested',
  '\u52d5\u4f5c\u78ba\u8a8d\u6e08': 'Tested',
  '\u521d\u671f\u5316\u6e08\u307f': 'Factory Reset',
  '\u521d\u671f\u5316\u6e08': 'Factory Reset',
};

// Combined replacement list sorted longest-first to avoid partial matches
const _ALL_JP_TERMS: [string, string][] = [
  ...Object.entries(BRAND_MAP),
  ...Object.entries(COLOR_MAP),
].sort((a, b) => b[0].length - a[0].length);

const _ALL_DESCRIPTION_TERMS: [string, string][] = [
  ...Object.entries(DESCRIPTION_TERMS_MAP),
  ..._ALL_JP_TERMS,
].sort((a, b) => b[0].length - a[0].length);

function translateDescription(text: string): string {
  if (!text) return '';
  let result = normalizeFullWidth(text);
  for (const [jp, en] of _ALL_DESCRIPTION_TERMS) {
    if (result.includes(jp)) {
      result = result.replaceAll(jp, en);
    }
  }
  return result;
}

function translateCommon(text: string): string {
  if (!text) return '';
  let result = text;
  for (const [jp, en] of _ALL_JP_TERMS) {
    if (result.includes(jp)) {
      result = result.replaceAll(jp, en);
    }
  }
  return result;
}

function translateBrand(raw: string): string {
  if (!raw) return '';
  return BRAND_MAP[raw] ?? raw;
}

function translateFeatures(raw: string): string {
  if (!raw) return '';
  const normalized = normalizeFullWidth(raw);
  const parts = normalized.split(/[\u3001,]/).map(p => p.trim()).filter(Boolean);
  const translated = parts.map(p => FEATURE_MAP[p] ?? p);
  return translated.join(', ');
}

function translateCondition(raw: string): string {
  if (!raw) return '';
  const normalized = normalizeFullWidth(raw).trim();
  return CONDITION_MAP[normalized] ?? normalized;
}

function translateSymptoms(raw: string): string {
  if (!raw) return '';
  const normalized = normalizeFullWidth(raw).trim();
  return SYMPTOMS_MAP[normalized] ?? normalized;
}

function translateYesNo(raw: string): string {
  if (!raw) return '';
  const normalized = normalizeFullWidth(raw).trim();
  return YES_NO_MAP[normalized] ?? normalized;
}

// ── Auction CSV Parser ──────────────────────────────────────

function parseAuctionCSV(csvText: string): ParseInvoiceResponse {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) {
    return { success: false, line_items: [], error: 'CSV must have a header and at least one data row' };
  }

  const headers = parseCSVRow(lines[0]);
  const hIdx: Record<string, number> = {};
  headers.forEach((h, i) => { hIdx[h] = i; });

  const C = {
    date:        hIdx['\u958b\u50ac\u65e5'],
    lot:         hIdx['\u51fa\u54c1\u756a\u53f7'],
    structure:   hIdx['\u69cb\u6210'],
    maker:       hIdx['\u30e1\u30fc\u30ab\u30fc'],
    product:     hIdx['\u5546\u54c1\u540d'],
    model:       hIdx['\u578b\u756a'],
    series:      hIdx['\u30b7\u30ea\u30fc\u30ba\u540d'],
    serial:      hIdx['\uff33\uff0f\uff2e'],
    cpu:         hIdx['CPU\uff08\u6027\u80fd\uff09'],
    ram:         hIdx['RAM\u30b5\u30a4\u30ba'],
    storage:     hIdx['\uff28\uff24\u5bb9\u91cf'],
    screen:      hIdx['\u6db2\u6676'],
    specs:       hIdx['\u4ed5\u69d8'],
    condition:   hIdx['\u72b6\u614b'],
    symptoms:    hIdx['\u75c7\u72b6'],
    remarks:     hIdx['\u5099\u8003'],
    supplement:  hIdx['\u88dc\u8db3'],
    accessories: hIdx['\u4ed8\u5c5e\u54c1'],
    bid:         hIdx['\u843d\u672d\u4fa1\u683c'],
    fee:         hIdx['\u843d\u672d\u6599'],
    powerCable:  hIdx['\u96fb\u6e90\u30b1\u30fc\u30d6\u30eb\u6709\u7121'],
  };

  interface LotInfo {
    lotNumber: string;
    bidPrice: number;
    auctionFee: number;
    items: string[][];
    date?: string;
  }

  const lots: LotInfo[] = [];
  let currentLot: LotInfo | null = null;

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const row = parseCSVRow(lines[i]);
    const structureVal = (row[C.structure] ?? '').trim();
    const isSetRow = structureVal === '\u30bb\u30c3\u30c8' || structureVal === '\u5358\u4f53';

    if (isSetRow) {
      const rawDate = (row[C.date] ?? '').trim();
      currentLot = {
        lotNumber: (row[C.lot] ?? '').trim(),
        bidPrice:  parseInt(row[C.bid] ?? '0', 10) || 0,
        auctionFee: parseInt(row[C.fee] ?? '0', 10) || 0,
        items: [],
        date: rawDate.length === 8
          ? `${rawDate.slice(0,4)}-${rawDate.slice(4,6)}-${rawDate.slice(6,8)}`
          : undefined,
      };
      lots.push(currentLot);
    } else if (currentLot) {
      currentLot.items.push(row);
    }
  }

  const lineItems: ParsedLineItem[] = [];
  let invoiceTotal = 0;
  let invoiceDate: string | undefined;

  for (const lot of lots) {
    if (!invoiceDate && lot.date) invoiceDate = lot.date;

    const taxRate = parseFloat(Deno.env.get('JOA_TAX_RATE') ?? '0.10');
    const totalLotCost = Math.round((lot.bidPrice + lot.auctionFee) * (1 + taxRate));
    const itemCount = lot.items.length;
    if (itemCount === 0) continue;

    const perItemCost = Math.floor(totalLotCost / itemCount);

    for (let j = 0; j < itemCount; j++) {
      const item = lot.items[j];
      const isLast = j === itemCount - 1;
      const unitPrice = isLast
        ? totalLotCost - (perItemCost * (itemCount - 1))
        : perItemCost;

      // Core specs — translate brand and apply common translations to series
      const makerRaw = normalizeFullWidth((item[C.maker] ?? '').trim());
      const maker   = translateBrand(makerRaw);
      const model   = normalizeFullWidth((item[C.model]   ?? '').trim());
      const series  = translateCommon(normalizeFullWidth((item[C.series]  ?? '').trim()));
      const cpu     = normalizeFullWidth((item[C.cpu]     ?? '').trim());
      const ram     = normalizeFullWidth((item[C.ram]     ?? '').trim());
      const storage = normalizeFullWidth((item[C.storage] ?? '').trim());
      const screen  = normalizeFullWidth((item[C.screen]  ?? '').trim());
      const serial  = normalizeFullWidth((item[C.serial]  ?? '').trim());

      // Fields to translate
      const featuresRaw   = (item[C.specs]      ?? '').trim();
      const conditionRaw  = (item[C.condition]   ?? '').trim();
      const symptomsRaw   = (item[C.symptoms]    ?? '').trim();
      const powerCableRaw = (item[C.powerCable]  ?? '').trim();

      const features   = translateFeatures(featuresRaw);
      const condition   = translateCondition(conditionRaw);
      const symptoms    = translateSymptoms(symptomsRaw);
      const powerCable  = translateYesNo(powerCableRaw);

      // Build description: core specs first, then translated extras
      const descParts: string[] = [];
      if (maker) descParts.push(maker);
      if (model) descParts.push(model);
      if (series) descParts.push(`(${series})`);
      if (cpu) descParts.push(cpu);
      const memStorage = [ram, storage].filter(Boolean).join('/');
      if (memStorage) descParts.push(memStorage);
      if (screen) descParts.push(`${screen}"`);

      let description = descParts.length > 0
        ? `[Lot ${lot.lotNumber}] ${descParts.join(' ')}`
        : `Lot ${lot.lotNumber} Item ${j + 1}`;

      // Append translated fields separated by pipes
      const extras: string[] = [];
      if (features)  extras.push(features);
      if (condition)  extras.push(`Cond: ${condition}`);
      if (symptoms)   extras.push(symptoms);
      if (powerCable) extras.push(`AC: ${powerCable}`);
      if (serial)     extras.push(`S/N: ${serial}`);

      if (extras.length > 0) {
        description += ' | ' + extras.join(' | ');
      }

      // Notes: remaining info (remarks, supplement, accessories)
      const noteParts: string[] = [];
      const remarks     = (item[C.remarks]     ?? '').trim();
      const supplement  = (item[C.supplement]  ?? '').trim();
      const accessories = (item[C.accessories] ?? '').trim();
      if (remarks)     noteParts.push(remarks);
      if (supplement)  noteParts.push(supplement);
      if (accessories) noteParts.push(`\u4ed8\u5c5e:${accessories}`);

      // Build structured specs object
      const specs: ParsedSpecs = {};
      if (maker) specs.brand = maker;
      if (model) specs.model_name = model;
      if (cpu) specs.cpu = cpu;
      const ramGb = parseRamGb(ram);
      if (ramGb !== undefined) specs.ram_gb = ramGb;
      const storageGb = parseStorageGb(storage);
      if (storageGb !== undefined) specs.storage_gb = storageGb;
      const screenSize = parseScreenSize(screen);
      if (screenSize !== undefined) specs.screen_size = screenSize;
      if (serial) specs.serial_number = serial;

      lineItems.push({
        line_number: lineItems.length + 1,
        product_description: description,
        quantity: 1,
        unit_price: unitPrice,
        confidence: 1.0,
        notes: noteParts.join(' | '),
        specs: Object.keys(specs).length > 0 ? specs : undefined,
      });

      invoiceTotal += unitPrice;
    }
  }

  return {
    success: true,
    line_items: lineItems,
    invoice_date: invoiceDate,
    invoice_total: invoiceTotal,
  };
}

// ── Simple CSV Parser ───────────────────────────────────────

function parseCSV(csvText: string): ParseInvoiceResponse {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) {
    return { success: false, line_items: [], error: 'CSV must have a header row and at least one data row' };
  }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

  const descIdx = headers.findIndex(h =>
    ['description', 'product', 'item', 'name', '\u5546\u54c1\u540d', '\u54c1\u540d', '\u5546\u54c1'].includes(h)
  );
  const qtyIdx = headers.findIndex(h =>
    ['quantity', 'qty', 'count', '\u6570\u91cf', '\u500b\u6570'].includes(h)
  );
  const priceIdx = headers.findIndex(h =>
    ['unit_price', 'price', 'unit price', '\u5358\u4fa1', '\u4fa1\u683c'].includes(h)
  );

  if (descIdx === -1) {
    return { success: false, line_items: [], error: 'Could not find product description column.' };
  }

  const lineItems: ParsedLineItem[] = [];
  let invoiceTotal = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim());
    if (cols.length <= descIdx || !cols[descIdx]) continue;

    const desc = translateDescription(cols[descIdx]);
    const qty = qtyIdx !== -1 ? parseInt(cols[qtyIdx], 10) || 1 : 1;
    const price = priceIdx !== -1 ? parseInt(cols[priceIdx], 10) || 0 : 0;

    lineItems.push({
      line_number: lineItems.length + 1,
      product_description: desc,
      quantity: qty,
      unit_price: price,
      confidence: 1.0,
    });

    invoiceTotal += qty * price;
  }

  return {
    success: true,
    line_items: lineItems,
    invoice_total: invoiceTotal,
  };
}

// ── AI Parsing ───────────────────────────────────────────

const SYSTEM_PROMPT_TEMPLATE = (supplierContext: string) => `You are an invoice parser for a Japanese refurbished electronics business. Extract line items from the invoice image/document.

${supplierContext}

Return ONLY valid JSON in this exact format:
{
  "line_items": [
    {
      "line_number": 1,
      "product_description": "Product name/description",
      "quantity": 1,
      "unit_price": 10000,
      "confidence": 0.95,
      "specs": {
        "brand": "Apple",
        "model_name": "MacBook Air",
        "cpu": "M1",
        "ram_gb": 8,
        "storage_gb": 256,
        "screen_size": 13.3,
        "serial_number": "C02X..."
      }
    }
  ],
  "invoice_date": "2024-01-15",
  "invoice_total": 50000
}

Rules:
- Extract ALL line items from the invoice
- unit_price should be in Japanese Yen (whole numbers, no decimals)
- confidence is 0.0-1.0 indicating how certain you are about each field
- The invoice is likely in Japanese. ALL product_description text MUST be in English. Translate every Japanese word — keep only model numbers, part numbers (e.g., MWP22J/A, A1823, MXP63J/A), and stock/lot numbers as-is.
- Common translations: \u4e2d\u53e4\u2192Used, \u65b0\u54c1\u2192New, \u672a\u4f7f\u7528\u54c1\u2192Unused, C\u30e9\u30f3\u30af\u2192C-Grade, SIM\u30d5\u30ea\u30fc\u2192SIM-Free, SIM\u30ed\u30c3\u30af\u89e3\u9664\u6e08\u2192SIM Unlocked, \u7b2cX\u4e16\u4ee3\u2192Xth Gen, \u5f53\u793eX\u30f6\u6708\u9593\u4fdd\u8a3c\u2192Our X-Month Warranty, \u56fd\u5185\u7248\u2192Domestic, \u5e74\u30e2\u30c7\u30eb\u2192Model Year, \u30db\u30ef\u30a4\u30c8\u2192White, \u30b7\u30eb\u30d0\u30fc\u2192Silver, \u30b9\u30da\u30fc\u30b9\u30b0\u30ec\u30a4\u2192Space Gray, \u5145\u96fb\u30b1\u30fc\u30b9\u4ed8\u304d\u2192with Charging Case
- Recognize Japanese column headers (\u5546\u54c1\u540d, \u6570\u91cf, \u5358\u4fa1, \u91d1\u984d) to identify the correct fields
- If a field is unclear, use your best guess and lower the confidence
- invoice_date in YYYY-MM-DD format
- invoice_total is the grand total in Yen
- For the specs object: extract brand, model_name, cpu, ram_gb (integer GB), storage_gb (integer GB), screen_size (decimal inches), and serial_number when visible. Omit fields you cannot determine.`;

function detectProvider(apiEndpoint: string): 'anthropic' | 'openai' | 'google' | 'generic' {
  if (apiEndpoint.includes('anthropic.com')) return 'anthropic';
  if (apiEndpoint.includes('openai.com')) return 'openai';
  if (apiEndpoint.includes('googleapis.com') || apiEndpoint.includes('generativelanguage')) return 'google';
  return 'generic';
}

async function callAnthropic(apiEndpoint: string, apiKey: string, systemPrompt: string, base64: string, mediaType: string): Promise<string> {
  const response = await fetch(apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: 'Parse this invoice and extract all line items as JSON.' },
        ],
      }],
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI API error: ${response.status} ${errText}`);
  }
  const result = await response.json();
  return result.content?.[0]?.text ?? '';
}

async function callOpenAI(apiEndpoint: string, apiKey: string, systemPrompt: string, base64: string, mediaType: string): Promise<string> {
  const response = await fetch(apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
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
      max_tokens: 4096,
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI API error: ${response.status} ${errText}`);
  }
  const result = await response.json();
  return result.choices?.[0]?.message?.content ?? '';
}

async function callGoogle(apiEndpoint: string, apiKey: string, systemPrompt: string, base64: string, mediaType: string): Promise<string> {
  let url = apiEndpoint;
  if (!url.includes(':generateContent')) {
    url = url.replace(/\/+$/, '');
    if (!url.match(/\/models\/[\w-]+$/)) {
      url += '/models/gemini-2.0-flash';
    }
    url += ':generateContent';
  }
  const separator = url.includes('?') ? '&' : '?';
  url += `${separator}key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: mediaType, data: base64 } },
          { text: 'Parse this invoice and extract all line items as JSON.' },
        ],
      }],
      generationConfig: {
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      },
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI API error: ${response.status} ${errText}`);
  }
  const result = await response.json();
  return result.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function callGeneric(apiEndpoint: string, apiKey: string, systemPrompt: string, base64: string, mediaType: string): Promise<string> {
  const response = await fetch(apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
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
      max_tokens: 4096,
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI API error: ${response.status} ${errText}`);
  }
  const result = await response.json();
  return result.choices?.[0]?.message?.content ?? result.content?.[0]?.text ?? '';
}

async function parseWithAI(
  fileUrl: string,
  fileType: string,
  supplierType: string | undefined,
  apiEndpoint: string,
  apiKey: string
): Promise<ParseInvoiceResponse> {
  const supplierContext = supplierType === 'auction'
    ? 'This is an auction invoice. Items may have lot numbers, hammer prices, and buyer premiums.'
    : supplierType === 'wholesaler'
    ? 'This is a wholesale invoice with standard line items.'
    : 'This is a supplier invoice.';

  const fileResponse = await fetch(fileUrl);
  if (!fileResponse.ok) {
    return { success: false, line_items: [], error: `Failed to download invoice file: ${fileResponse.status} ${fileResponse.statusText}` };
  }
  const fileBuffer = await fileResponse.arrayBuffer();
  const base64 = encodeBase64(new Uint8Array(fileBuffer));
  const mediaType = fileType === 'pdf' ? 'application/pdf' : `image/${fileType === 'jpg' ? 'jpeg' : fileType}`;
  const systemPrompt = SYSTEM_PROMPT_TEMPLATE(supplierContext);
  const provider = detectProvider(apiEndpoint);

  try {
    let responseText: string;
    switch (provider) {
      case 'anthropic':
        responseText = await callAnthropic(apiEndpoint, apiKey, systemPrompt, base64, mediaType);
        break;
      case 'openai':
        responseText = await callOpenAI(apiEndpoint, apiKey, systemPrompt, base64, mediaType);
        break;
      case 'google':
        responseText = await callGoogle(apiEndpoint, apiKey, systemPrompt, base64, mediaType);
        break;
      default:
        responseText = await callGeneric(apiEndpoint, apiKey, systemPrompt, base64, mediaType);
    }

    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, responseText];
    const jsonStr = (jsonMatch[1] ?? responseText).trim();
    const parsed = JSON.parse(jsonStr);

    const lineItems: ParsedLineItem[] = (parsed.line_items ?? []).map((li: ParsedLineItem) => ({
      ...li,
      specs: li.specs && Object.keys(li.specs).length > 0 ? li.specs : undefined,
    }));

    return {
      success: true,
      line_items: lineItems,
      invoice_date: parsed.invoice_date,
      invoice_total: parsed.invoice_total,
    };
  } catch (err) {
    return {
      success: false,
      line_items: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Main Handler ────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(
      JSON.stringify({ success: false, error: 'Missing authorization header' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid or expired token' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { file_url, file_type, supplier_type, mode, config_id } = await req.json();

    if (!file_url) {
      return new Response(
        JSON.stringify({ success: false, error: 'file_url is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const detectedType = file_type ?? (file_url.match(/\.(csv|jpg|jpeg|png|pdf)$/i)?.[1]?.toLowerCase() ?? 'jpg');
    const normalizedType = detectedType === 'jpeg' ? 'jpg' : detectedType;

    if (normalizedType === 'csv') {
      const csvText = await fetchAndDecodeCSV(file_url);
      const firstLine = csvText.trim().split(/\r?\n/)[0] ?? '';
      const headers = parseCSVRow(firstLine);

      if (isAuctionCSV(headers)) {
        const result = parseAuctionCSV(csvText);
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const result = parseCSV(csvText);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let aiConfig;
    if (config_id) {
      const { data, error } = await supabase
        .from('ai_configurations')
        .select('*')
        .eq('id', config_id)
        .single();
      if (error || !data) {
        return new Response(
          JSON.stringify({ success: false, error: 'AI configuration not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      aiConfig = data;
    } else {
      const { data, error } = await supabase
        .from('ai_configurations')
        .select('*')
        .eq('is_active', true)
        .maybeSingle();
      if (error || !data) {
        return new Response(
          JSON.stringify({ success: false, error: 'No active AI configuration found. Please configure an AI service in Settings.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      aiConfig = data;
    }

    const result = await parseWithAI(
      file_url,
      normalizedType,
      supplier_type,
      aiConfig.api_endpoint_url,
      aiConfig.api_key_encrypted
    );

    if (mode === 'test' && result.success) {
      await supabase
        .from('ai_configurations')
        .update({ last_test_at: new Date().toISOString() })
        .eq('id', aiConfig.id);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
