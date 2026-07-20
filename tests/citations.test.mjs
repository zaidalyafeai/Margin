import assert from "node:assert/strict";
import test from "node:test";
import { formatPageNumbers, getAvailablePageNumbers, linkifyCitations } from "../lib/citations.ts";

test("reads current and legacy physical page markers", () => {
  const text = "--- PAGE 1 ---\nOld\n\n--- PDF PAGE 2 ---\nNew";
  assert.deepEqual(getAvailablePageNumbers(text), [1, 2]);
});

test("summarizes available physical pages", () => {
  assert.equal(formatPageNumbers([1, 2, 3, 7, 9, 10]), "1-3, 7, 9-10");
});

test("marks the reported nonexistent page ranges as invalid", () => {
  assert.equal(
    linkifyCitations("Claim [p. 101–102, p. 152–153]", [1, 2, 3]),
    "Claim [[p. 101–102](#invalid-paper-page-101), [p. 152–153](#invalid-paper-page-152)]",
  );
});

test("links valid citations and rejects ranges containing unavailable pages", () => {
  assert.equal(
    linkifyCitations("Claim [pp. 2-3; p. 5]", [1, 2, 3, 5]),
    "Claim [[pp. 2-3](#paper-page-2); [p. 5](#paper-page-5)]",
  );
  assert.equal(
    linkifyCitations("Claim [pp. 2-5]", [1, 2, 3, 5]),
    "Claim [pp. 2-5](#invalid-paper-page-2)",
  );
});
