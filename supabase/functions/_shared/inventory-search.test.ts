import { assertEquals } from 'jsr:@std/assert@1';
import { mapInventoryResults, buildOrderUrl, type RawItemRow, type RawSellGroupRow } from './inventory-search.ts';

Deno.test('buildOrderUrl strips trailing /shop and appends /mine/{code}', () => {
  assertEquals(buildOrderUrl('https://dealzinventory.vercel.app/shop', 'G000022'),
    'https://dealzinventory.vercel.app/mine/G000022');
  assertEquals(buildOrderUrl('https://dealzinventory.vercel.app', 'P000825'),
    'https://dealzinventory.vercel.app/mine/P000825');
});

Deno.test('mapInventoryResults merges items + sell groups with order_url and effective price', () => {
  const items: RawItemRow[] = [{
    id: 'i1', item_code: 'P000825', condition_grade: 'A', selling_price: 7900, discount: 0,
    brand: 'Iris Ohyama', model_name: 'LUCA Tablet TM101',
    first_item_display_url: 'https://cdn/p.jpg', first_item_thumb_url: 'https://cdn/p_t.jpg',
    hero_media_url: null, first_product_media_url: null, condition_notes: null,
  }];
  const groups: RawSellGroupRow[] = [{
    id: 'g1', sell_group_code: 'G000022', condition_grade: 'A', effective_price: 7900,
    available_count: 1, brand: 'Iris Ohyama', model_name: 'LUCA Tablet TM101',
    hero_media_url: 'https://cdn/g.jpg',
  }];
  const out = mapInventoryResults(items, groups, 'https://dealzinventory.vercel.app');
  assertEquals(out.length, 2);
  const group = out.find((r) => r.type === 'sell_group')!;
  assertEquals(group.code, 'G000022');
  assertEquals(group.price, 7900);
  assertEquals(group.available_count, 1);
  assertEquals(group.order_url, 'https://dealzinventory.vercel.app/mine/G000022');
  const item = out.find((r) => r.type === 'item')!;
  assertEquals(item.code, 'P000825');
  assertEquals(item.order_url, 'https://dealzinventory.vercel.app/mine/P000825');
  assertEquals(item.display_url, 'https://cdn/p.jpg');
});

Deno.test('mapInventoryResults applies item discount to price', () => {
  const items: RawItemRow[] = [{
    id: 'i2', item_code: 'P000001', condition_grade: 'B', selling_price: 10000, discount: 1500,
    brand: 'Dell', model_name: 'OptiPlex',
    first_item_display_url: null, first_item_thumb_url: null, hero_media_url: null,
    first_product_media_url: null, condition_notes: null,
  }];
  const out = mapInventoryResults(items, [], 'https://x.app');
  assertEquals(out[0].price, 8500);
});

Deno.test('mapInventoryResults builds rich description from category description_fields', () => {
  const items: RawItemRow[] = [{
    id: 'i9', item_code: 'P001471', condition_grade: 'B', selling_price: 15900, discount: 0,
    brand: 'Toshiba', model_name: 'Dynabook K50',
    ram_gb: '8GB', storage_gb: '128GB', cpu: 'Intel Celeron N4020 1.1GHz',
    gpu: 'Intel UHD Graphics 600', screen_size: 10.1, color: 'Silver', os_family: 'Windows 11',
    category_description_fields: ['brand', 'model_name', 'ram_gb', 'storage_gb', 'cpu', 'gpu', 'screen_size', 'color', 'os_family'],
    first_item_display_url: 'https://cdn/k50.jpg', first_item_thumb_url: null,
    hero_media_url: null, first_product_media_url: null, condition_notes: null,
  }];
  const out = mapInventoryResults(items, [], 'https://dealzinventory.vercel.app');
  const item = out.find((r) => r.code === 'P001471')!;
  assertEquals(
    item.description,
    'Toshiba Dynabook K50 8GB 128GB Intel Celeron N4020 1.1GHz Intel UHD Graphics 600 10.1" Silver Windows 11',
  );
});

Deno.test('mapInventoryResults builds rich sell-group description, no available-count suffix', () => {
  const groups: RawSellGroupRow[] = [{
    id: 'g9', sell_group_code: 'G000099', condition_grade: 'B', effective_price: 15900,
    available_count: 3, brand: 'Toshiba', model_name: 'Dynabook K50',
    hero_media_url: 'https://cdn/g99.jpg',
    ram_gb: '8GB', storage_gb: '128GB', cpu: 'Intel Celeron N4020 1.1GHz',
    gpu: 'Intel UHD Graphics 600', screen_size: 10.1, color: 'Silver', os_family: 'Windows 11',
    category_description_fields: ['brand', 'model_name', 'ram_gb', 'storage_gb', 'cpu', 'gpu', 'screen_size', 'color', 'os_family'],
  }];
  const out = mapInventoryResults([], groups, 'https://dealzinventory.vercel.app');
  const group = out.find((r) => r.code === 'G000099')!;
  assertEquals(
    group.description,
    'Toshiba Dynabook K50 8GB 128GB Intel Celeron N4020 1.1GHz Intel UHD Graphics 600 10.1" Silver Windows 11',
  );
  assertEquals(group.description.includes('available'), false);
  assertEquals(group.available_count, 3);
});
