import { assertEquals } from 'jsr:@std/assert@1';
import {
  folderNameForIntent,
  shouldRouteOutOfInbox,
  isEscalatingIntent,
} from './intent-routing.ts';

Deno.test('folderNameForIntent maps each known intent to its folder name', () => {
  assertEquals(folderNameForIntent('product_inquiry'), 'Prospects');
  assertEquals(folderNameForIntent('tracking'), 'Order');
  assertEquals(folderNameForIntent('order_status'), 'Order');
  assertEquals(folderNameForIntent('return'), 'Aftersales');
  assertEquals(folderNameForIntent('complaint'), 'Concern');
  assertEquals(folderNameForIntent('kaitori'), 'Kaitori');
});

Deno.test('folderNameForIntent returns null for general/unknown and garbage', () => {
  assertEquals(folderNameForIntent('general'), null);
  assertEquals(folderNameForIntent('unknown'), null);
  assertEquals(folderNameForIntent('something-the-model-made-up'), null);
  assertEquals(folderNameForIntent(''), null);
});

Deno.test('shouldRouteOutOfInbox moves an unfiled conversation', () => {
  assertEquals(shouldRouteOutOfInbox(null, 'inbox-id', 'order-id'), true);
});

Deno.test('shouldRouteOutOfInbox moves a conversation sitting in Inbox', () => {
  assertEquals(shouldRouteOutOfInbox('inbox-id', 'inbox-id', 'order-id'), true);
});

Deno.test('shouldRouteOutOfInbox never moves a conversation already filed elsewhere', () => {
  assertEquals(shouldRouteOutOfInbox('concern-id', 'inbox-id', 'order-id'), false);
});

Deno.test('shouldRouteOutOfInbox does not move when already in the target folder', () => {
  assertEquals(shouldRouteOutOfInbox('order-id', 'inbox-id', 'order-id'), false);
});

Deno.test('shouldRouteOutOfInbox does not move when there is no target', () => {
  assertEquals(shouldRouteOutOfInbox('inbox-id', 'inbox-id', null), false);
  assertEquals(shouldRouteOutOfInbox(null, 'inbox-id', null), false);
  // Inbox id unknown (lookup failed): an unfiled conversation still routes; one already
  // filed in a real folder does not.
  assertEquals(shouldRouteOutOfInbox(null, null, 'order-id'), true);
  assertEquals(shouldRouteOutOfInbox('concern-id', null, 'order-id'), false);
});

Deno.test('isEscalatingIntent is true only for kaitori and complaint', () => {
  assertEquals(isEscalatingIntent('kaitori'), true);
  assertEquals(isEscalatingIntent('complaint'), true);
  assertEquals(isEscalatingIntent('order_status'), false);
  assertEquals(isEscalatingIntent('product_inquiry'), false);
  assertEquals(isEscalatingIntent('return'), false);
  assertEquals(isEscalatingIntent('general'), false);
  assertEquals(isEscalatingIntent('tracking'), false);
  assertEquals(isEscalatingIntent('unknown'), false);
});
