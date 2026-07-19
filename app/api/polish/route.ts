import { REVIEW_FIELD_LABELS } from "@/lib/review-configs";

export const runtime = "nodejs";
export const maxDuration = 60;

const OPENROUTER_TIMEOUT_MS = 40_000;

export async function POST(request: Request) {
  const apiKey = request.headers.get("x-openrouter-key")?.trim();
  if (!apiKey) {
    return Response.json({ error: "Connect OpenRouter before polishing a review field." }, { status: 401 });
  }

  let upstreamTimedOut = false;
  try {
    const body = (await request.json()) as { content?: string; field?: string; model?: string };
    const content = body.content?.trim();
    if (!content) return Response.json({ error: "Write something before polishing this field." }, { status: 400 });
    if (content.length > 30_000) return Response.json({ error: "This review field is too long to polish." }, { status: 400 });
    if (!body.model || !/^[a-zA-Z0-9_~.:/-]{1,200}$/.test(body.model)) {
      return Response.json({ error: "Choose an OpenRouter model before polishing." }, { status: 400 });
    }
    if (!body.field || !REVIEW_FIELD_LABELS.has(body.field)) {
      return Response.json({ error: "The review field is invalid." }, { status: 400 });
    }

    const upstreamController = new AbortController();
    const abortUpstream = () => upstreamController.abort();
    request.signal.addEventListener("abort", abortUpstream, { once: true });
    const timeout = setTimeout(() => {
      upstreamTimedOut = true;
      upstreamController.abort();
    }, OPENROUTER_TIMEOUT_MS);

    let upstream: Response;
    try {
      upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": new URL(request.url).origin,
          "X-OpenRouter-Title": "Margin",
        },
        signal: upstreamController.signal,
        body: JSON.stringify({
          model: body.model,
          temperature: 0.15,
          max_tokens: Math.min(4_000, Math.max(256, Math.ceil(content.length / 3))),
          messages: [
            {
              role: "system",
              content:
                "You are an academic copy editor for peer reviews. Rewrite the supplied review field in clear, concise, professional academic prose. Preserve the reviewer's meaning, level of certainty, criticism, praise, technical terminology, Markdown formatting, and page citations. Do not add evidence, claims, citations, headings, or conclusions. Return only the revised field text, with no preamble or quotation marks.",
            },
            { role: "user", content: `FIELD: ${body.field}\n\nTEXT:\n${content}` },
          ],
        }),
      });
    } finally {
      clearTimeout(timeout);
      request.signal.removeEventListener("abort", abortUpstream);
    }

    const result = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      return Response.json({ error: result?.error?.message || "OpenRouter could not polish this field." }, { status: upstream.status });
    }

    const polished = result?.choices?.[0]?.message?.content?.trim();
    if (!polished) throw new Error("The selected model returned an empty response.");
    return Response.json({ polished });
  } catch (error) {
    if (upstreamTimedOut) {
      return Response.json({ error: "OpenRouter took too long to polish this field. Try again or choose a faster model." }, { status: 504 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "This field could not be polished." }, { status: 500 });
  }
}
