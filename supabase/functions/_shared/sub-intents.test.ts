import { assertEquals } from "jsr:@std/assert";
import { resolveAutonomy, type SubIntentRow } from "./sub-intents.ts";
import type { SpecialistRow } from "./build-specialist-prompt.ts";

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
