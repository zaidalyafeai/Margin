import { PDFParse } from "pdf-parse";
import { getData } from "pdf-parse/worker";

PDFParse.setWorker(getData());

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_PDF_BYTES = 30 * 1024 * 1024;
const MAX_EXTRACTED_TEXT_LENGTH = 100_000;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Choose a PDF file." }, { status: 400 });
    if (file.size > MAX_PDF_BYTES) return Response.json({ error: "This PDF is larger than the 30 MB limit." }, { status: 413 });

    const bytes = await file.arrayBuffer();
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
      return Response.json({ error: "The selected file is not a valid PDF." }, { status: 400 });
    }

    const parser = new PDFParse({ data: new Uint8Array(bytes) });
    const parsed = await parser.getText();
    await parser.destroy();
    const pageChunks: string[] = [];
    let textLength = 0;
    for (const page of parsed.pages) {
      const chunk = `--- PDF PAGE ${page.num} ---\n${page.text}`;
      const separatorLength = pageChunks.length ? 2 : 0;
      const remainingLength = MAX_EXTRACTED_TEXT_LENGTH - textLength - separatorLength;
      if (remainingLength <= 0) break;
      pageChunks.push(chunk.slice(0, remainingLength));
      textLength += separatorLength + pageChunks.at(-1)!.length;
      if (chunk.length > remainingLength) break;
    }
    const text = pageChunks.join("\n\n");

    if (!text.trim()) return Response.json({ error: "No readable text was found in this PDF." }, { status: 422 });
    return Response.json({ text, pages: parsed.pages.length }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "The paper text could not be extracted." },
      { status: 500 },
    );
  }
}
