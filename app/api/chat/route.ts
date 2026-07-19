export const runtime = "nodejs";
export const maxDuration = 60;

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
  const userApiKey = request.headers.get("x-openrouter-key")?.trim();
  const baseUrl = userApiKey
    ? "https://openrouter.ai/api/v1"
    : (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const apiKey = userApiKey || process.env.OPENAI_API_KEY;
  if (!apiKey && baseUrl === "https://api.openai.com/v1") {
    return Response.json({ error: "Ask paper needs an OPENAI_API_KEY in your .env.local file." }, { status: 503 });
  }

  try {
    const body = (await request.json()) as { paperText?: string; model?: string; messages?: ChatMessage[] };
    if (!body.paperText || !Array.isArray(body.messages) || body.messages.length === 0) {
      return Response.json({ error: "A paper and question are required." }, { status: 400 });
    }
    if (body.model && !/^[a-zA-Z0-9_~.:/-]{1,200}$/.test(body.model)) {
      return Response.json({ error: "The selected model name is invalid." }, { status: 400 });
    }
    if (userApiKey && !body.model) {
      return Response.json({ error: "Choose an OpenRouter model in Ask paper settings." }, { status: 400 });
    }

    const pages = body.paperText.slice(0, 100_000);

    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        ...(baseUrl === "https://openrouter.ai/api/v1" ? { "HTTP-Referer": new URL(request.url).origin, "X-OpenRouter-Title": "Margin" } : {}),
      },
      body: JSON.stringify({
        model: body.model || process.env.OPENAI_MODEL || "gpt-4.1-mini",
        temperature: 0.2,
        stream: true,
        messages: [
          {
            role: "system",
            content:
              "You are a careful research-paper assistant. Answer only from the supplied paper. Distinguish explicit claims from your inference. If the paper does not support an answer, say so. Cite evidence using [p. N] with the exact page number. Be concise but substantive.",
          },
          { role: "system", content: `PAPER TEXT:\n${pages}` },
          ...body.messages.slice(-8),
        ],
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const details = await upstream.json().catch(() => null);
      throw new Error(details?.error?.message || "The language model request failed.");
    }

    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let buffer = "";
    const stream = new ReadableStream({
      async start(controller) {
        const reader = upstream.body!.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
              try {
                const event = JSON.parse(line.slice(6));
                const text = event.choices?.[0]?.delta?.content;
                if (text) controller.enqueue(encoder.encode(text));
              } catch {
                // Ignore incomplete provider events; the next complete event continues the stream.
              }
            }
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "The assistant could not answer." }, { status: 500 });
  }
}
