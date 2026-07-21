import assert from "node:assert/strict";
import test from "node:test";
import { buildPaperContext, parsePaperPages } from "../lib/paper-context.ts";

const paper = [
  "--- PDF PAGE 1 ---\nAbstract and introduction.",
  "--- PDF PAGE 2 ---\nBackground material.",
  "--- PDF PAGE 3 ---\nThe evaluation uses a benchmark and accuracy metrics.",
  "--- PDF PAGE 4 ---\nUnrelated implementation details.",
  "--- PDF PAGE 5 ---\n5 Conclusion\nThe benchmark evaluation is successful.",
].join("\n\n");

test("parses current and legacy page markers", () => {
  assert.deepEqual(
    parsePaperPages("--- PAGE 1 ---\nOld\n\n--- PDF PAGE 2 ---\nNew").map((page) => page.number),
    [1, 2],
  );
});

test("keeps opening, concluding, and question-relevant pages", () => {
  const context = buildPaperContext(paper, "How is evaluation accuracy measured?", 260);
  assert.deepEqual(context.pageNumbers, [1, 2, 3, 5]);
  assert.ok(context.text.length <= 260);
  assert.match(context.text, /PDF PAGE 3/);
});

test("limits context while retaining complete page markers", () => {
  const context = buildPaperContext(paper, "implementation", 70);
  assert.ok(context.text.length <= 70);
  assert.deepEqual(context.pageNumbers, [1, 4]);
  assert.deepEqual(parsePaperPages(context.text).map((page) => page.number), [1, 4]);
});

test("reserves room for structural context when a relevant page is oversized", () => {
  const oversized = [
    "--- PDF PAGE 1 ---\nAbstract.",
    `--- PDF PAGE 2 ---\n${"benchmark ".repeat(100)}`,
    "--- PDF PAGE 3 ---\n3 Conclusion\nSummary.",
  ].join("\n\n");
  const context = buildPaperContext(oversized, "benchmark", 200);
  assert.ok(context.pageNumbers.includes(2));
  assert.ok(context.pageNumbers.includes(1) || context.pageNumbers.includes(3));
  assert.ok(context.text.length <= 200);
});
