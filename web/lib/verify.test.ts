import { describe, expect, it } from "vitest";
import { highlightRange, missingNumbers, normalize, quoteFound } from "./verify";

describe("quoteFound", () => {
  const text = "**From:** Imogen  \nThe surveyed volume removed is 2,860 m3. This lowers the disposal cost by approximately A$96k.";
  it("matches across whitespace, case and markdown emphasis", () => {
    expect(quoteFound(text, "the surveyed volume removed is 2,860 m3")).toBe(true);
  });
  it("rejects invented text and ellipses", () => {
    expect(quoteFound(text, "the surveyed volume removed is 3,400 m3")).toBe(false);
    expect(quoteFound(text, "the surveyed volume ... 2,860 m3")).toBe(false);
  });
  it("rejects very short quotes", () => {
    expect(quoteFound(text, "m3")).toBe(false);
  });
  it("normalises curly quotes and dashes", () => {
    expect(normalize("it’s – fine")).toBe("it's - fine");
  });
});

describe("missingNumbers", () => {
  it("passes when numbers come from the source", () => {
    expect(missingNumbers("Volume was 2,860 m3.", "surveyed volume 2,860 m3")).toEqual([]);
  });
  it("flags numbers not in the source", () => {
    expect(missingNumbers("Volume was 3,400 m3.", "surveyed volume 2,860 m3")).toEqual(["3400"]);
  });
  it("does not merge neighbouring table cells", () => {
    expect(missingNumbers("Arsenic is 100 mg/kg.", "Arsenic2 100 500 300 3 000")).toEqual([]);
    expect(missingNumbers("Arsenic is 500 mg/kg.", "Arsenic2 100 500 300 3 000")).toEqual([]);
  });
  it("treats spaced thousands as equal", () => {
    expect(missingNumbers("HIL D arsenic is 3000 mg/kg.", "Arsenic2 100 500 300 3 000")).toEqual([]);
  });
});

describe("highlightRange", () => {
  it("finds the quote in the original passage", () => {
    const p = "Intro.\n\n**Result:** the  value is\n 12.4 ug/L at MW04.";
    const r = highlightRange(p, "the value is 12.4 ug/L");
    expect(r).not.toBeNull();
    expect(p.slice(r![0], r![1])).toContain("12.4 ug/L");
  });
});
