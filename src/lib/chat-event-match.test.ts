// Run with: bun test src/lib/chat-event-match.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { mentionedEvent } from "./chat-event-match";

const day = [
  { id: "a", title: "Pilates" },
  { id: "b", title: "Elisa Bettarini - compleanno" },
  { id: "c", title: "Benedetta Gracci - compleanno" },
];

test("the event named in the chat, only when it is one", () => {
  assert.equal(mentionedEvent(day, "Cosa mi metto per pilates domani mattina?")?.id, "a");
  assert.equal(mentionedEvent(day, "outfit per il compleanno"), null); // two birthdays: not guessed
  assert.equal(mentionedEvent(day, "festa di Elisa stasera")?.id, "b");
  assert.equal(mentionedEvent(day, "un look per l'ufficio"), null);
});
