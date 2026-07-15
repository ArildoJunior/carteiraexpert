import { type TokenKey, tokens } from "@/lib/theme/tokens";
import { describe, expect, it } from "vitest";

const requiredKeys: TokenKey[] = [
  "background",
  "foreground",
  "card",
  "cardForeground",
  "popover",
  "popoverForeground",
  "primary",
  "primaryForeground",
  "secondary",
  "secondaryForeground",
  "muted",
  "mutedForeground",
  "accent",
  "accentForeground",
  "destructive",
  "destructiveForeground",
  "success",
  "successForeground",
  "warning",
  "warningForeground",
  "info",
  "infoForeground",
  "border",
  "input",
  "ring",
  "radius",
];

describe("tokens tema", () => {
  it("tema light tem todas as chaves obrigatórias", () => {
    for (const key of requiredKeys) {
      expect(tokens.light[key]).toBeDefined();
      expect(tokens.light[key]).not.toBe("");
    }
  });

  it("tema dark tem todas as chaves obrigatórias", () => {
    for (const key of requiredKeys) {
      expect(tokens.dark[key]).toBeDefined();
      expect(tokens.dark[key]).not.toBe("");
    }
  });

  it("tema dark difere do light em background", () => {
    expect(tokens.light.background).not.toBe(tokens.dark.background);
  });

  it("tema dark difere do light em primary", () => {
    expect(tokens.light.primary).not.toBe(tokens.dark.primary);
  });
});
