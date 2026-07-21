export type OpenRouterStreamEvent =
  | { type: "content"; text: string }
  | { type: "reasoning" }
  | { type: "error"; message: string };

function parseEventBlock(block: string): OpenRouterStreamEvent[] {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""))
    .join("\n")
    .trim();
  if (!data || data === "[DONE]") return [];

  try {
    const event = JSON.parse(data);
    if (event.error) return [{ type: "error", message: event.error.message || "The language model request failed." }];
    const delta = event.choices?.[0]?.delta;
    const events: OpenRouterStreamEvent[] = [];
    if (delta?.reasoning || delta?.reasoning_content || delta?.reasoning_details) events.push({ type: "reasoning" });
    if (typeof delta?.content === "string" && delta.content) events.push({ type: "content", text: delta.content });
    return events;
  } catch {
    return [{ type: "error", message: "The language model returned an invalid stream event." }];
  }
}

export async function* readOpenRouterStream(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || "";
      for (const block of blocks) {
        for (const event of parseEventBlock(block)) yield event;
      }
      if (done) break;
    }
    if (buffer.trim()) {
      for (const event of parseEventBlock(buffer)) yield event;
    }
  } finally {
    reader.releaseLock();
  }
}
