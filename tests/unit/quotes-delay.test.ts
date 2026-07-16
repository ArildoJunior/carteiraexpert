import { classifyDelay } from "@/lib/quotes/delay";
import type { Quote } from "@/lib/quotes/types";
import { describe, expect, it } from "vitest";

const makeQuote = (delaySeconds: number): Quote => ({
  ticker: "X",
  price: 1,
  change: 0,
  changePercent: 0,
  currency: "BRL",
  source: "brapi",
  fetchedAt: new Date().toISOString(),
  delaySeconds,
});

describe("classifyDelay", () => {
  it("30s -> realtime", () => {
    expect(classifyDelay(makeQuote(30))).toBe("realtime");
  });

  it("10min -> recent", () => {
    expect(classifyDelay(makeQuote(10 * 60))).toBe("recent");
  });

  it("30min -> delayed", () => {
    expect(classifyDelay(makeQuote(30 * 60))).toBe("delayed");
  });

  it("2h -> stale", () => {
    expect(classifyDelay(makeQuote(2 * 60 * 60))).toBe("stale");
  });
});
