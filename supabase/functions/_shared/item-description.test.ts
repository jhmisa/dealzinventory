import { assertEquals } from 'jsr:@std/assert@1';
import { getItemDescription, buildShortDescription } from './item-description.ts';

// Golden values: these strings must match what the frontend builder (src/lib/utils.ts
// + src/lib/constants.ts) produces today. If the frontend builder changes, update both.

Deno.test('getItemDescription: category description_fields path (laptop)', () => {
  const item = {
    brand: 'Toshiba', model_name: 'Dynabook K50', ram_gb: '8GB', storage_gb: '128GB',
    cpu: 'Intel Celeron N4020 1.1GHz', gpu: 'Intel UHD Graphics 600',
    screen_size: 10.1, color: 'Silver', os_family: 'Windows 11',
  };
  const fields = ['brand', 'model_name', 'ram_gb', 'storage_gb', 'cpu', 'gpu', 'screen_size', 'color', 'os_family'];
  assertEquals(
    getItemDescription(item, null, fields),
    'Toshiba Dynabook K50 8GB 128GB Intel Celeron N4020 1.1GHz Intel UHD Graphics 600 10.1" Silver Windows 11',
  );
});

Deno.test('getItemDescription: no description_fields falls back to slash concat', () => {
  const item = { brand: 'Oppo', model_name: 'A5 5G', cpu: null, ram_gb: '4GB', storage_gb: '128GB', screen_size: 6.56 };
  assertEquals(getItemDescription(item, null, null), 'Oppo A5 5G / 4GB / 128GB / 6.56"');
});

Deno.test('getItemDescription: pulls missing fields from productModel', () => {
  const item = { ram_gb: '16GB' };
  const pm = { brand: 'Dell', model_name: 'XPS 13', storage_gb: '512GB' };
  const fields = ['brand', 'model_name', 'ram_gb', 'storage_gb'];
  assertEquals(getItemDescription(item, pm, fields), 'Dell XPS 13 16GB 512GB');
});

Deno.test('buildShortDescription: boolean field renders its label when true', () => {
  assertEquals(
    buildShortDescription({ model_name: 'iPhone 13', is_unlocked: true }, ['model_name', 'is_unlocked']),
    'iPhone 13 Unlocked',
  );
});

Deno.test('buildShortDescription: skips null/empty/false values', () => {
  assertEquals(
    buildShortDescription({ model_name: 'iPhone 13', color: null, is_unlocked: false }, ['model_name', 'color', 'is_unlocked']),
    'iPhone 13',
  );
});

Deno.test('getItemDescription: empty input falls back to supplier_description', () => {
  assertEquals(getItemDescription({ supplier_description: 'Used handset, no box' }, null, null), 'Used handset, no box');
});
