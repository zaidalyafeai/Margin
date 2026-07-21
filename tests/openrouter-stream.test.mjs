import assert from "node:assert/strict";
import test from "node:test";
import { readOpenRouterStream } from "../lib/openrouter-stream.ts";

function body(chunks) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  });
}

async function collect(chunks) {
  const events = [];
  for await (const event of readOpenRouterStream(body(chunks))) events.push(event);
  return events;
}

test("parses fragmented CRLF events and data without a space", async () => {
  assert.deepEqual(
    await collect(['data:{"choices":[{"delta":{"content":"Hel', 'lo"}}]}\r\n\r\n']),
    [{ type: "content", text: "Hello" }],
  );
});

test("flushes a final event without a trailing newline", async () => {
  assert.deepEqual(
    await collect(['data: {"choices":[{"delta":{"content":"Done"}}]}']),
    [{ type: "content", text: "Done" }],
  );
});

test("reports reasoning and in-stream errors", async () => {
  assert.deepEqual(
    await collect([
      'data: {"choices":[{"delta":{"reasoning":"working"}}]}\n\n',
      'data: {"error":{"message":"Provider failed"}}\n\n',
    ]),
    [{ type: "reasoning" }, { type: "error", message: "Provider failed" }],
  );
});
