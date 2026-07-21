import { formatPageNumbers, getAvailablePageNumbers } from "@/lib/citations";
import { readOpenRouterStream } from "@/lib/openrouter-stream";
import { buildPaperContext } from "@/lib/paper-context";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatMessage = { role: "user" | "assistant"; content: string };
const OPENROUTER_TIMEOUT_MS = 55_000;

export async function POST(request: Request) {
  const apiKey = request.headers.get("x-openrouter-key")?.trim();
  if (!apiKey) {
    return Response.json({ error: "Connect OpenRouter before asking the paper a question." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { paperText?: string; model?: string; messages?: ChatMessage[] };
    if (!body.paperText || !Array.isArray(body.messages) || body.messages.length === 0) {
      return Response.json({ error: "A paper and question are required." }, { status: 400 });
    }
    if (!body.model || !/^[a-zA-Z0-9_~.:/-]{1,200}$/.test(body.model)) {
      return Response.json({ error: "Choose an OpenRouter model in Ask paper settings." }, { status: 400 });
    }
    const messages = body.messages;
    const model = body.model;
    const paperText = body.paperText;

    const question = messages.slice(-4).map((message) => message.content).join("\n");
    const contextStartedAt = performance.now();
    const context = buildPaperContext(paperText.slice(0, 100_000), question);
    if (!context.text) return Response.json({ error: "No page-aware paper text is available." }, { status: 422 });
    const availablePages = formatPageNumbers(getAvailablePageNumbers(context.text));
    const contextMs = Math.round(performance.now() - contextStartedAt);

    const encoder = new TextEncoder();
    const upstreamController = new AbortController();
    let streamCancelled = false;
    const abortUpstream = () => upstreamController.abort();
    request.signal.addEventListener("abort", abortUpstream, { once: true });
    if (request.signal.aborted) abortUpstream();

    const stream = new ReadableStream({
      async start(controller) {
        const requestStartedAt = performance.now();
        let timedOut = false;
        let hasContent = false;
        let reasoningReported = false;
        const send = (event: Record<string, unknown>) => {
          if (!streamCancelled) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        };
        const timeout = setTimeout(() => {
          timedOut = true;
          upstreamController.abort();
        }, OPENROUTER_TIMEOUT_MS);

        try {
          send({ type: "status", status: "waiting", pages: context.pageNumbers });
          const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
              "HTTP-Referer": new URL(request.url).origin,
              "X-OpenRouter-Title": "Margin",
            },
            signal: upstreamController.signal,
            body: JSON.stringify({
              model,
              temperature: 0.2,
              stream: true,
              messages: [
                {
                  role: "system",
                  content:
                    `You are a careful research-paper assistant. Answer only from the supplied paper pages. Distinguish explicit claims from your inference. If the supplied pages do not support an answer, say so. Cite only the physical PDF page numbers shown in the page boundary markers, never printed page labels or page numbers mentioned in prose or references. The only valid page numbers in this context are: ${availablePages}. Use [p. N] for one page and [pp. N-M] only for a consecutive range; cite disjoint pages separately. Never cite a number outside the valid list. Be concise but substantive.`,
                },
                { role: "system", content: `RELEVANT PAPER PAGES:\n${context.text}` },
                ...messages.slice(-8).map(({ role, content }) => ({ role, content })),
              ],
            }),
          });

          if (!upstream.ok || !upstream.body) {
            const details = await upstream.json().catch(() => null);
            send({ type: "error", message: details?.error?.message || "The language model request failed." });
            return;
          }

          const upstreamHeadersMs = Math.round(performance.now() - requestStartedAt);
          let firstEventMs: number | undefined;
          let firstContentMs: number | undefined;
          for await (const event of readOpenRouterStream(upstream.body)) {
            firstEventMs ??= Math.round(performance.now() - requestStartedAt);
            if (event.type === "error") {
              send(event);
              return;
            }
            if (event.type === "reasoning") {
              if (!hasContent && !reasoningReported) send({ type: "status", status: "reasoning" });
              reasoningReported = true;
              continue;
            }
            if (!hasContent) {
              firstContentMs = Math.round(performance.now() - requestStartedAt);
              send({ type: "status", status: "writing" });
            }
            hasContent = true;
            send(event);
          }

          if (!hasContent) {
            send({ type: "error", message: "The selected model returned an empty response." });
            return;
          }
          send({
            type: "done",
            metrics: { contextMs, upstreamHeadersMs, firstEventMs, firstContentMs, contextCharacters: context.text.length, selectedPages: context.pageNumbers.length },
          });
        } catch (error) {
          if (timedOut) send({ type: "error", message: "OpenRouter took too long to answer. Try again or choose a faster model." });
          else if (!request.signal.aborted && !streamCancelled) send({ type: "error", message: error instanceof Error ? error.message : "The assistant could not answer." });
        } finally {
          clearTimeout(timeout);
          request.signal.removeEventListener("abort", abortUpstream);
          try { controller.close(); } catch { /* The browser may have already cancelled the stream. */ }
        }
      },
      cancel() {
        streamCancelled = true;
        upstreamController.abort();
        request.signal.removeEventListener("abort", abortUpstream);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "private, no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "The assistant could not answer." }, { status: 500 });
  }
}
