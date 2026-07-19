export const runtime = "nodejs";

type OpenRouterModel = {
  id: string;
  name: string;
  description?: string;
  context_length?: number | null;
  pricing?: { prompt?: string; completion?: string };
};

export async function GET(request: Request) {
  const apiKey = request.headers.get("x-openrouter-key")?.trim();
  if (!apiKey) return Response.json({ error: "Connect OpenRouter before searching models." }, { status: 401 });

  const searchParams = new URL(request.url).searchParams;
  const query = searchParams.get("q")?.trim().slice(0, 100) || "";
  const requestedSort = searchParams.get("sort") || "most-popular";
  const priceSorts = ["input-low", "input-high", "output-low", "output-high"];
  const openRouterSorts = ["most-popular", "latency-low-to-high", "throughput-high-to-low"];
  const sort = priceSorts.includes(requestedSort) || openRouterSorts.includes(requestedSort) ? requestedSort : "most-popular";
  const params = new URLSearchParams({
    limit: priceSorts.includes(sort) ? "500" : "50",
    output_modalities: "text",
  });
  if (openRouterSorts.includes(sort)) params.set("sort", sort);
  if (query) params.set("q", query);

  try {
    const response = await fetch(`https://openrouter.ai/api/v1/models?${params}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const error = response.status === 401 || response.status === 403
        ? "The OpenRouter session is no longer valid. Reconnect your API key."
        : body?.error?.message || "Models could not be loaded from OpenRouter.";
      return Response.json({ error }, { status: response.status });
    }

    const models = ((body?.data || []) as OpenRouterModel[]).map((model) => ({
      id: model.id,
      name: model.name,
      description: model.description || "",
      contextLength: model.context_length || 0,
      promptPrice: model.pricing?.prompt || "0",
      completionPrice: model.pricing?.completion || "0",
    }));
    if (priceSorts.includes(sort)) {
      const field = sort.startsWith("input") ? "promptPrice" : "completionPrice";
      const direction = sort.endsWith("high") ? -1 : 1;
      models.sort((left, right) => {
        const leftPrice = Number(left[field]);
        const rightPrice = Number(right[field]);
        const leftValid = Number.isFinite(leftPrice) && leftPrice >= 0;
        const rightValid = Number.isFinite(rightPrice) && rightPrice >= 0;
        if (!leftValid) return 1;
        if (!rightValid) return -1;
        return (leftPrice - rightPrice) * direction;
      });
    }
    return Response.json({ models }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "OpenRouter could not be reached." }, { status: 502 });
  }
}
