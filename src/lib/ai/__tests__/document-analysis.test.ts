import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  openAiCreate: vi.fn(),
  anthropicCreate: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class OpenAI {
    chat = {
      completions: {
        create: mocks.openAiCreate,
      },
    };
  },
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class Anthropic {
    messages = {
      create: mocks.anthropicCreate,
    };
  },
}));

vi.mock("@/lib/env", () => ({
  env: {
    OPENAI_API_KEY: "openai-test-key",
    OPENAI_MODEL: "gpt-4o-mini",
    OPENAI_MAX_TOKENS: 2000,
    OPENAI_TEMPERATURE: 0.2,
    OPENAI_TIMEOUT_MS: 30000,
    ANTHROPIC_API_KEY: "anthropic-test-key",
    CLAUDE_MODEL: "claude-haiku-4-5",
    CLAUDE_MAX_TOKENS: 2000,
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    insert: mocks.insert,
    select: mocks.select,
    update: mocks.update,
  },
}));

import { analyzeDocument, documentAnalysisSchema } from "../document-analysis";

const validAnalysis = {
  detected_type: "relatorio_fii",
  key_metrics: [
    {
      name: "Dividend yield",
      value: "0,85",
      unit: "%",
      period: "2026-07",
    },
  ],
  summary: "Documento analisado com sucesso.",
  attention_points: ["Verificar evolução da receita."],
  sentiment: "positivo",
  confidence: 0.91,
};

describe("document analysis", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("valida o contrato estruturado da análise", () => {
    expect(documentAnalysisSchema.parse(validAnalysis)).toEqual(validAnalysis);
  });

  it("usa OpenAI como provedor primário", async () => {
    mocks.openAiCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify(validAnalysis),
          },
        },
      ],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
      },
    });

    const result = await analyzeDocument({
      text: "Relatório do fundo.",
      filename: "relatorio.txt",
      documentType: "relatorio_fii",
      ticker: "HGLG11",
    });

    expect(result?.provider).toBe("openai");
    expect(result?.model).toBe("gpt-4o-mini");
    expect(result?.inputTokens).toBe(100);
    expect(result?.outputTokens).toBe(50);
    expect(mocks.openAiCreate).toHaveBeenCalledTimes(1);
    expect(mocks.anthropicCreate).not.toHaveBeenCalled();
  });

  it("usa Anthropic quando OpenAI falha", async () => {
    mocks.openAiCreate.mockRejectedValue(new Error("OpenAI indisponível"));

    mocks.anthropicCreate.mockResolvedValue({
      stop_reason: "end_turn",
      content: [
        {
          type: "text",
          text: JSON.stringify(validAnalysis),
        },
      ],
      usage: {
        input_tokens: 120,
        output_tokens: 60,
      },
    });

    const result = await analyzeDocument({
      text: "Relatório do fundo.",
      filename: "relatorio.txt",
      documentType: "relatorio_fii",
      ticker: "HGLG11",
    });

    expect(result?.provider).toBe("anthropic");
    expect(result?.model).toBe("claude-haiku-4-5");
    expect(result?.inputTokens).toBe(120);
    expect(result?.outputTokens).toBe(60);
    expect(mocks.openAiCreate).toHaveBeenCalledTimes(1);
    expect(mocks.anthropicCreate).toHaveBeenCalledTimes(1);
  });

  it("falha quando os dois provedores falham", async () => {
    mocks.openAiCreate.mockRejectedValue(new Error("OpenAI indisponível"));
    mocks.anthropicCreate.mockRejectedValue(new Error("Anthropic indisponível"));

    await expect(
      analyzeDocument({
        text: "Relatório do fundo.",
        filename: "relatorio.txt",
        documentType: null,
        ticker: null,
      })
    ).rejects.toThrow("Falha nos provedores de IA");
  });
});
