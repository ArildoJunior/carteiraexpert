import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyCard } from "../empty-card";

describe("EmptyCard", () => {
  it("renderiza titulo e mensagem customizada", () => {
    render(<EmptyCard title="Teste" message="Nenhum item" />);
    expect(screen.getByText("Teste")).toBeInTheDocument();
    expect(screen.getByText("Nenhum item")).toBeInTheDocument();
  });

  it("usa mensagem padrao quando nao informada", () => {
    render(<EmptyCard title="Teste" />);
    expect(screen.getByText(/sem dados dispon/i)).toBeInTheDocument();
  });
});
