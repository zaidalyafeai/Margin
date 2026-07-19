export const runtime = "nodejs";

export async function POST(request: Request) {
  const apiKey = request.headers.get("x-openrouter-key")?.trim();
  if (!apiKey) return Response.json({ error: "Enter an OpenRouter API key." }, { status: 400 });

  try {
    const response = await fetch("https://openrouter.ai/api/v1/auth/key", {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const error = response.status === 401 || response.status === 403
        ? "OpenRouter rejected this API key. Check the key and try again."
        : body?.error?.message || "OpenRouter rejected this API key.";
      return Response.json({ error }, { status: response.status });
    }
    return Response.json({ connected: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "OpenRouter could not be reached." }, { status: 502 });
  }
}
