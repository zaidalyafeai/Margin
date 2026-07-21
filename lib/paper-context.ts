const PAGE_MARKER_PATTERN = /^--- (?:PDF )?PAGE (\d+) ---$/gm;
const STOP_WORDS = new Set([
  "about", "after", "again", "also", "among", "because", "before", "being", "between", "could", "does", "from",
  "have", "into", "paper", "that", "their", "there", "these", "they", "this", "those", "through", "under", "using",
  "what", "when", "where", "which", "with", "would", "your",
]);

type PaperPage = {
  number: number;
  chunk: string;
  content: string;
};

export type PaperContext = {
  text: string;
  pageNumbers: number[];
  sourcePageCount: number;
};

export function parsePaperPages(text: string) {
  const markers = [...text.matchAll(PAGE_MARKER_PATTERN)];
  return markers.map<PaperPage>((marker, index) => {
    const start = marker.index!;
    const end = markers[index + 1]?.index ?? text.length;
    const chunk = text.slice(start, end).trim();
    return {
      number: Number(marker[1]),
      chunk,
      content: chunk.slice(marker[0].length).trim(),
    };
  });
}

function queryTerms(question: string) {
  return [...new Set(
    (question.toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g) ?? [])
      .filter((term) => !STOP_WORDS.has(term)),
  )];
}

function pageScore(page: PaperPage, terms: string[]) {
  const content = page.content.toLowerCase();
  const opening = content.slice(0, 800);
  return terms.reduce((score, term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const occurrences = content.match(new RegExp(`\\b${escaped}\\b`, "g"))?.length ?? 0;
    return score + Math.min(occurrences, 8) + (opening.includes(term) ? 2 : 0);
  }, 0);
}

function structuralPages(pages: PaperPage[]) {
  const selected = pages.slice(0, 2);
  const concludingPage = pages.findLast((page) => /(?:^|\n)\s*(?:\d+(?:\.\d+)*\s+)?(?:conclusion|conclusions|discussion|limitations)\b/im.test(page.content));
  if (concludingPage && !selected.includes(concludingPage)) selected.push(concludingPage);
  return selected;
}

export function buildPaperContext(text: string, question: string, maxCharacters = 40_000): PaperContext {
  const pages = parsePaperPages(text);
  if (!pages.length || maxCharacters <= 0) return { text: "", pageNumbers: [], sourcePageCount: pages.length };

  const terms = queryTerms(question);
  const required = structuralPages(pages);
  const requiredNumbers = new Set(required.map((page) => page.number));
  const scored = pages
    .map((page) => ({ page, score: pageScore(page, terms) }))
    .sort((left, right) => right.score - left.score || left.page.number - right.page.number);
  const priorityPages = scored.filter(({ score }) => score > 0).slice(0, 3).map(({ page }) => page);
  const priorityNumbers = new Set(priorityPages.map((page) => page.number));
  const remainingPages = scored.filter(({ page }) => !priorityNumbers.has(page.number)).map(({ page }) => page);

  const selected: PaperPage[] = [];
  let usedCharacters = 0;
  let hasStructuralPage = false;
  for (const page of [...priorityPages, ...required, ...remainingPages]) {
    if (selected.some((selectedPage) => selectedPage.number === page.number)) continue;
    const separatorLength = selected.length ? 2 : 0;
    const remaining = maxCharacters - usedCharacters - separatorLength;
    if (remaining <= 0) break;
    const isStructuralPage = requiredNumbers.has(page.number);
    const pageLimit = !selected.length && priorityNumbers.has(page.number)
      ? Math.min(remaining, Math.max(1, Math.floor(maxCharacters * 0.6)))
      : remaining;
    if (page.chunk.length > pageLimit && selected.length && (!isStructuralPage || hasStructuralPage)) continue;
    selected.push({ ...page, chunk: page.chunk.slice(0, pageLimit) });
    usedCharacters += separatorLength + Math.min(page.chunk.length, pageLimit);
    if (isStructuralPage) hasStructuralPage = true;
  }

  selected.sort((left, right) => left.number - right.number);
  return {
    text: selected.map((page) => page.chunk).join("\n\n"),
    pageNumbers: selected.map((page) => page.number),
    sourcePageCount: pages.length,
  };
}
