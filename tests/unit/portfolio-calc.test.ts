import {
  PortfolioCalculationError,
  applyBonus,
  applySplit,
  calculateAverageCost,
  calculatePosition,
  calculateRealizedPnL,
} from "@/lib/portfolio/calc";
import type { TransactionInput } from "@/lib/portfolio/types";
import { describe, expect, it } from "vitest";

const date = (d: string) => new Date(d);

const buy = (overrides: Partial<TransactionInput> = {}): TransactionInput => ({
  id: "1",
  assetId: "PETR4",
  accountId: "XP",
  type: "buy",
  transactionDate: date("2026-01-01"),
  quantity: 100,
  unitPrice: 38,
  totalAmount: 3800,
  ...overrides,
});

describe("calculateAverageCost", () => {
  it("calcula media ponderada simples", () => {
    const result = calculateAverageCost(100, 38, 50, 40);
    expect(result).toBeCloseTo(38.67, 2);
  });

  it("retorna preco quando qtd atual e 0", () => {
    const result = calculateAverageCost(0, 0, 100, 50);
    expect(result).toBe(50);
  });

  it("retorna custo atual quando qtd adicionada e 0", () => {
    const result = calculateAverageCost(100, 38, 0, 0);
    expect(result).toBe(38);
  });

  it("lanca erro com qtd negativa", () => {
    expect(() => calculateAverageCost(-1, 38, 50, 40)).toThrow(PortfolioCalculationError);
  });

  it("lanca erro com preco negativo", () => {
    expect(() => calculateAverageCost(100, 38, 50, -1)).toThrow(PortfolioCalculationError);
  });
});

describe("calculateRealizedPnL", () => {
  it("calcula lucro positivo", () => {
    const pnl = calculateRealizedPnL(30, 38, 42);
    expect(pnl).toBe(120);
  });

  it("calcula prejuizo negativo", () => {
    const pnl = calculateRealizedPnL(30, 38, 35);
    expect(pnl).toBe(-90);
  });

  it("retorna 0 em break-even", () => {
    const pnl = calculateRealizedPnL(30, 38, 38);
    expect(pnl).toBe(0);
  });
});

describe("applyBonus", () => {
  it("preserva valor investido", () => {
    const result = applyBonus(100, 38, 10);
    expect(result.quantity).toBe(110);
    expect(result.averageCost).toBeCloseTo(34.55, 2);
  });

  it("lanca erro com bonificacao negativa", () => {
    expect(() => applyBonus(100, 38, -10)).toThrow(PortfolioCalculationError);
  });
});

describe("applySplit", () => {
  it("split 1:10 (ratio=10) - aumenta qtd, divide custo", () => {
    const result = applySplit(100, 38, 10);
    expect(result.quantity).toBe(1000);
    expect(result.averageCost).toBe(3.8);
  });

  it("split 3:1 (ratio=3) - triplica qtd, divide custo por 3", () => {
    const result = applySplit(100, 38, 3);
    expect(result.quantity).toBe(300);
    expect(result.averageCost).toBeCloseTo(12.67, 1);
  });

  it("inplit 1:10 (ratio=0.1) - divide qtd, multiplica custo", () => {
    const result = applySplit(100, 38, 0.1);
    expect(result.quantity).toBe(10);
    expect(result.averageCost).toBe(380);
  });

  it("lanca erro com ratio zero ou negativo", () => {
    expect(() => applySplit(100, 38, 0)).toThrow(PortfolioCalculationError);
    expect(() => applySplit(100, 38, -1)).toThrow(PortfolioCalculationError);
  });
});

describe("calculatePosition", () => {
  it("compra simples - custo medio igual ao preco", () => {
    const r = calculatePosition([buy()]);
    expect(r.quantity).toBe(100);
    expect(r.averageCost).toBe(38);
    expect(r.isOpen).toBe(true);
  });

  it("duas compras - media ponderada", () => {
    const r = calculatePosition([
      buy({ id: "1", quantity: 100, unitPrice: 38, transactionDate: date("2026-01-01") }),
      buy({ id: "2", quantity: 50, unitPrice: 40, transactionDate: date("2026-02-01") }),
    ]);
    expect(r.quantity).toBe(150);
    expect(r.averageCost).toBeCloseTo(38.67, 2);
  });

  it("venda parcial - custo medio preservado, lucro realizado", () => {
    const r = calculatePosition([
      buy({ id: "1", quantity: 100, unitPrice: 38 }),
      buy({ id: "2", type: "sell", quantity: 30, unitPrice: 42, totalAmount: 1260 }),
    ]);
    expect(r.quantity).toBe(70);
    expect(r.averageCost).toBe(38);
    expect(r.realizedPnL).toBe(120);
    expect(r.isOpen).toBe(true);
  });

  it("venda que zera posicao - fechada com lucro total, custo medio zerado", () => {
    const r = calculatePosition([
      buy({ id: "1", quantity: 100, unitPrice: 38 }),
      buy({ id: "2", type: "sell", quantity: 100, unitPrice: 45, totalAmount: 4500 }),
    ]);
    expect(r.quantity).toBe(0);
    expect(r.averageCost).toBe(0); // FIX: zerado junto com a posicao
    expect(r.realizedPnL).toBe(700);
    expect(r.isOpen).toBe(false);
  });

  it("bonificacao - custo medio recalculado, valor preservado", () => {
    const r = calculatePosition([
      buy({ id: "1", quantity: 100, unitPrice: 38 }),
      buy({ id: "2", type: "bonus", quantity: 10, unitPrice: 0, totalAmount: 0 }),
    ]);
    expect(r.quantity).toBe(110);
    expect(r.averageCost).toBeCloseTo(34.55, 2);
  });

  it("split 1:10 - qtd multiplicada, custo dividido", () => {
    const r = calculatePosition([
      buy({ id: "1", quantity: 100, unitPrice: 38 }),
      buy({ id: "2", type: "split", quantity: 0, unitPrice: 0, totalAmount: 0, splitRatio: 10 }),
    ]);
    expect(r.quantity).toBe(1000);
    expect(r.averageCost).toBeCloseTo(3.8, 2);
  });

  it("dividendo nao altera posicao", () => {
    const r = calculatePosition([
      buy({ id: "1", quantity: 100, unitPrice: 38 }),
      buy({ id: "2", type: "dividend", quantity: 100, unitPrice: 0.5, totalAmount: 50 }),
    ]);
    expect(r.quantity).toBe(100);
    expect(r.averageCost).toBe(38);
  });

  it("cupom de renda fixa NAO altera custo medio (renda recebida)", () => {
    // FIX: sobrescreve totalAmount da compra 1 (senao usa default 3800)
    const r = calculatePosition([
      buy({ id: "1", quantity: 1, unitPrice: 1000, totalAmount: 1000 }),
      buy({ id: "2", type: "fixedIncomeCoupon", quantity: 0, unitPrice: 50, totalAmount: 50 }),
    ]);
    expect(r.quantity).toBe(1);
    expect(r.averageCost).toBe(1000);
    expect(r.totalInvested).toBe(1050);
  });

  it("movimentacoes fora de ordem cronologica sao reordenadas", () => {
    const r = calculatePosition([
      buy({ id: "1", quantity: 50, unitPrice: 40, transactionDate: date("2026-02-01") }),
      buy({ id: "2", quantity: 100, unitPrice: 38, transactionDate: date("2026-01-01") }),
    ]);
    expect(r.quantity).toBe(150);
    expect(r.averageCost).toBeCloseTo(38.67, 2);
  });

  it("rejeita movimentacoes de ativos diferentes", () => {
    expect(() =>
      calculatePosition([buy({ assetId: "PETR4" }), buy({ id: "2", assetId: "VALE3" })])
    ).toThrow(PortfolioCalculationError);
  });

  it("rejeita lista vazia", () => {
    expect(() => calculatePosition([])).toThrow(PortfolioCalculationError);
  });

  it("venda acima da quantidade disponivel lanca erro", () => {
    expect(() =>
      calculatePosition([
        buy({ id: "1", quantity: 100, unitPrice: 38 }),
        buy({ id: "2", type: "sell", quantity: 200, unitPrice: 40, totalAmount: 8000 }),
      ])
    ).toThrow(PortfolioCalculationError);
  });
});
