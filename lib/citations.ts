const PAGE_MARKER_PATTERN = /^--- (?:PDF )?PAGE (\d+) ---$/gm;
const CITATION_ITEM_PATTERN = /pp?\.\s*\d+(?:\s*[-–—]\s*\d+)?|\d+(?:\s*[-–—]\s*\d+)?/gi;

export function getAvailablePageNumbers(text: string) {
  const pages = new Set<number>();
  for (const match of text.matchAll(PAGE_MARKER_PATTERN)) pages.add(Number(match[1]));
  return [...pages].sort((a, b) => a - b);
}

export function formatPageNumbers(pages: number[]) {
  if (!pages.length) return "none";
  const ranges: string[] = [];
  let start = pages[0];
  let end = start;

  for (const page of pages.slice(1)) {
    if (page === end + 1) {
      end = page;
      continue;
    }
    ranges.push(start === end ? String(start) : `${start}-${end}`);
    start = page;
    end = page;
  }
  ranges.push(start === end ? String(start) : `${start}-${end}`);
  return ranges.join(", ");
}

function includesRange(label: string, pages: Set<number>) {
  const numbers = [...label.matchAll(/\d+/g)].map((match) => Number(match[0]));
  const start = numbers[0];
  const end = numbers[1] ?? start;
  const rangeLength = end - start + 1;
  let includesEveryPage = Number.isSafeInteger(start) && Number.isSafeInteger(end) && rangeLength > 0 && rangeLength <= pages.size;

  for (let page = start; includesEveryPage && page <= end; page += 1) {
    if (!pages.has(page)) includesEveryPage = false;
  }
  return { includesEveryPage, start };
}

function citationTarget(label: string, availablePages: Set<number>, groundedPages: Set<number>) {
  const available = includesRange(label, availablePages);
  if (!available.includesEveryPage) return `#invalid-paper-page-${available.start}`;
  return includesRange(label, groundedPages).includesEveryPage
    ? `#paper-page-${available.start}`
    : `#unverified-paper-page-${available.start}`;
}

export function linkifyCitations(text: string, availablePageNumbers: number[], groundedPageNumbers = availablePageNumbers) {
  const availablePages = new Set(availablePageNumbers);
  const groundedPages = new Set(groundedPageNumbers);
  return text.replace(/\[([^\]\n]+)\](?!\()/g, (group, inner: string) => {
    if (!/pp?\./i.test(inner)) return group;
    const itemPattern = new RegExp(CITATION_ITEM_PATTERN.source, CITATION_ITEM_PATTERN.flags);
    if (inner.replace(itemPattern, "").replace(/[,;\s]/g, "") !== "") return group;
    const items = inner.match(itemPattern) ?? [];
    if (!items.length) return group;
    const links = items.map((item) => {
      const label = item.trim();
      return `[${label}](${citationTarget(label, availablePages, groundedPages)})`;
    });
    if (links.length === 1) return links[0];
    let cursor = 0;
    let result = "[";
    items.forEach((item, index) => {
      const position = inner.indexOf(item, cursor);
      result += inner.slice(cursor, position) + links[index];
      cursor = position + item.length;
    });
    return result + inner.slice(cursor) + "]";
  });
}
