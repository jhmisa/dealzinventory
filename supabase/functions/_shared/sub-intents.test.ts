import { assertEquals } from "jsr:@std/assert";
import { resolveAutonomy, capAutonomyByTemplate, type SubIntentRow } from "./sub-intents.ts";
import type { SpecialistRow } from "./build-specialist-prompt.ts";

Deno.test("capAutonomyByTemplate: AUTO template keeps SEND", () => {
  assertEquals(capAutonomyByTemplate("SEND", "AUTO"), "SEND");
});
Deno.test("capAutonomyByTemplate: REFERENCE/DRAFT/OFF template downgrades SEND to DRAFT", () => {
  assertEquals(capAutonomyByTemplate("SEND", "REFERENCE"), "DRAFT");
  assertEquals(capAutonomyByTemplate("SEND", "DRAFT"), "DRAFT");
  assertEquals(capAutonomyByTemplate("SEND", "OFF"), "DRAFT");
});
Deno.test("capAutonomyByTemplate: no template used leaves autonomy unchanged", () => {
  assertEquals(capAutonomyByTemplate("SEND", null), "SEND");
  assertEquals(capAutonomyByTemplate("DRAFT", "AUTO"), "DRAFT");
  assertEquals(capAutonomyByTemplate("OFF", "AUTO"), "OFF");
});

const sales: SpecialistRow = {
  slug: "sales", name: "Sales", intents: ["product_inquiry"], playbook: "",
  always_escalate: false, is_active: true, sort_order: 0,
};
const aftersales: SpecialistRow = { ...sales, slug: "aftersales", always_escalate: true };

function sub(autonomy: SubIntentRow["autonomy"]): SubIntentRow {
  return {
    specialist_slug: "sales", slug: "x", name: "X",
    recognition_cues: "", handling_instructions: "", autonomy, is_active: true, sort_order: 0,
  };
}

Deno.test("no matched sub-intent (category default) -> DRAFT, never SEND", () => {
  assertEquals(resolveAutonomy({ subIntent: null, confidence: 0.99, specialist: sales, autoSendThreshold: 0.85 }), "DRAFT");
});

Deno.test("OFF is absolute, regardless of confidence", () => {
  assertEquals(resolveAutonomy({ subIntent: sub("OFF"), confidence: 0.2, specialist: sales, autoSendThreshold: 0.85 }), "OFF");
});

Deno.test("DRAFT request stays DRAFT", () => {
  assertEquals(resolveAutonomy({ subIntent: sub("DRAFT"), confidence: 0.99, specialist: sales, autoSendThreshold: 0.85 }), "DRAFT");
});

Deno.test("SEND above threshold on a normal specialist -> SEND", () => {
  assertEquals(resolveAutonomy({ subIntent: sub("SEND"), confidence: 0.9, specialist: sales, autoSendThreshold: 0.85 }), "SEND");
});

Deno.test("SEND below threshold downgrades to DRAFT", () => {
  assertEquals(resolveAutonomy({ subIntent: sub("SEND"), confidence: 0.8, specialist: sales, autoSendThreshold: 0.85 }), "DRAFT");
});

Deno.test("SEND under an always_escalate specialist downgrades to DRAFT", () => {
  assertEquals(resolveAutonomy({ subIntent: sub("SEND"), confidence: 0.99, specialist: aftersales, autoSendThreshold: 0.85 }), "DRAFT");
});

Deno.test("SEND with no matched specialist downgrades to DRAFT", () => {
  assertEquals(resolveAutonomy({ subIntent: sub("SEND"), confidence: 0.99, specialist: null, autoSendThreshold: 0.85 }), "DRAFT");
});

import { matchSubIntent } from "./sub-intents.ts";

const rows: SubIntentRow[] = [
  { specialist_slug: "sales", slug: "promo_raffle", name: "Promo", recognition_cues: "", handling_instructions: "no search", autonomy: "DRAFT", is_active: true, sort_order: 0 },
  { specialist_slug: "order_tracking", slug: "shipment_status", name: "Ship", recognition_cues: "", handling_instructions: "report", autonomy: "DRAFT", is_active: true, sort_order: 0 },
  { specialist_slug: "sales", slug: "inactive_one", name: "Old", recognition_cues: "", handling_instructions: "", autonomy: "SEND", is_active: false, sort_order: 0 },
];

Deno.test("matchSubIntent finds the row by specialist + slug", () => {
  const r = matchSubIntent("sales", "promo_raffle", rows);
  assertEquals(r?.handling_instructions, "no search");
});

Deno.test("matchSubIntent returns null when slug is null (category default)", () => {
  assertEquals(matchSubIntent("sales", null, rows), null);
});

Deno.test("matchSubIntent returns null when slug belongs to a different specialist", () => {
  assertEquals(matchSubIntent("sales", "shipment_status", rows), null);
});

Deno.test("matchSubIntent ignores inactive rows", () => {
  assertEquals(matchSubIntent("sales", "inactive_one", rows), null);
});

import { buildClassificationPrompt } from "./sub-intents.ts";

Deno.test("buildClassificationPrompt lists specialists, their intents, and sub-intent cues", () => {
  const prompt = buildClassificationPrompt({ specialists: [sales], subIntents: rows });
  // Mentions the specialist + its legacy intent (valid intents the model may emit)
  if (!prompt.includes("Sales")) throw new Error("missing specialist name");
  if (!prompt.includes("product_inquiry")) throw new Error("missing legacy intent");
  // Lists the sub-intent slug + its recognition cues so the model can pick it
  if (!prompt.includes("promo_raffle")) throw new Error("missing sub-intent slug");
  // Asks for the structured classification fields
  if (!prompt.includes("sub_intent_slug")) throw new Error("missing output schema");
  if (!prompt.includes("confidence")) throw new Error("missing confidence field");
});

Deno.test("buildClassificationPrompt only includes the active specialist's own sub-intents", () => {
  const prompt = buildClassificationPrompt({ specialists: [sales], subIntents: rows });
  // shipment_status belongs to order_tracking (not passed) -> must not appear
  if (prompt.includes("shipment_status")) throw new Error("leaked another specialist's sub-intent");
});
