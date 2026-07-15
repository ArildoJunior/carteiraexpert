import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Mock do next-themes ANTES de importar o componente.
vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "light",
    setTheme: vi.fn(),
  }),
}));

import { ThemeToggle } from "@/components/layout/theme-toggle";

describe("ThemeToggle", () => {
  it("renderiza botão com aria-label correto", () => {
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: /alternar tema/i })).toBeInTheDocument();
  });
});
