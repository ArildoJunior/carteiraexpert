import { aiCosts, documentAnalyses, documents } from "@/db/schema";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import Anthropic from "@anthropic-ai/sdk";
import { desc, eq, sql } from "drizzle-orm";
import OpenAI from "openai";
import { z } from "zod";

export const documentAnalysisSchema = z.object({
  detected_type: z.enum([
    "informe_rendimento",
    "relatorio_fii",
    "fato_relevante",
    "dre",
    "balanco",
    "prospecto",
    "release_resultados",
    "outros",
  ]),
  key_metrics: z.array(
    z.object({
      name: z.string(),
      value: z.string(),
      unit: z.string().nullable(),
      period: z.string().nullable(),
    })
  ),
  summary: z.string(),
  attention_points: z.array(z.string()),
  sentiment: z.enum(["positivo", "neutro", "negativo"]),
  confidence: z.number().min(0).max(1),
});

export type DocumentAnalysisPayload = z.infer<typeof documentAnalysisSchema>;

export type AiProviderResult = {
  provider: "openai" | "anthropic";
  model: string;
  result: DocumentAnalysisPayload;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

const OPENAI_INPUT_COST_USD_PER_MILLION = 0.15;
const OPENAI_OUTPUT_COST_USD_PER_MILLION = 0.6;

const ANTHROPIC_INPUT_COST_USD_PER_MILLION = 1.0;
const ANTHROPIC_OUTPUT_COST_USD_PER_MILLION = 5.0;

const analysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    detected_type: {
      type: "string",
      enum: [
        "informe_rendimento",
        "relatorio_fii",
        "fato_relevante",
        "dre",
        "balanco",
        "prospecto",
        "release_resultados",
        "outros",
      ],
    },
    key_metrics: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          value: { type: "string" },
          unit: { type: ["string", "null"] },
          period: { type: ["string", "null"] },
        },
        required: ["name", "value", "unit", "period"],
      },
    },
    summary: { type: "string" },
    attention_points: {
      type: "array",
      items: { type: "string" },
    },
    sentiment: {
      type: "string",
      enum: ["positivo", "neutro", "negativo"],
    },
    confidence: { type: "number" },
  },
  required: [
    "detected_type",
    "key_metrics",
    "summary",
    "attention_points",
    "sentiment",
    "confidence",
  ],
} as const;

function buildPrompt(
  text: string,
  filename: string,
  documentType: string | null,
  ticker: string | null
) {
  const maxCharacters = 120_000;
  const content = text.length > maxCharacters ? text.slice(0, maxCharacters) : text;

  return `
Analise o documento financeiro abaixo.

Regras:
- Responda exclusivamente com JSON válido.
- Não invente valores.
- Quando uma informação não existir, use lista vazia, null ou "outros".
- A confiança deve ser um número entre 0 e 1.
- Os pontos de atenção devem ser objetivos.
- key_metrics deve conter somente métricas identificadas no texto.
- O resumo deve ser escrito em português do Brasil.

Metadados:
- Arquivo: ${filename}
- Tipo informado: ${documentType ?? "não informado"}
- Ticker: ${ticker ?? "não informado"}

Documento:
${content}
`.trim();
}

function calculateCost(
  provider: "openai" | "anthropic",
  inputTokens: number,
  outputTokens: number
): number {
  const inputRate =
    provider === "openai"
      ? OPENAI_INPUT_COST_USD_PER_MILLION
      : ANTHROPIC_INPUT_COST_USD_PER_MILLION;

  const outputRate =
    provider === "openai"
      ? OPENAI_OUTPUT_COST_USD_PER_MILLION
      : ANTHROPIC_OUTPUT_COST_USD_PER_MILLION;

  return Number(
    ((inputTokens / 1_000_000) * inputRate + (outputTokens / 1_000_000) * outputRate).toFixed(6)
  );
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }

    throw new Error("A resposta da IA não contém JSON válido.");
  }
}

async function analyzeWithOpenAI(params: {
  prompt: string;
}): Promise<AiProviderResult> {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY não configurada.");
  }

  const client = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    timeout: env.OPENAI_TIMEOUT_MS,
  });

  const response = await client.chat.completions.create({
    model: env.OPENAI_MODEL,
    temperature: env.OPENAI_TEMPERATURE,
    max_tokens: env.OPENAI_MAX_TOKENS,
    messages: [
      {
        role: "system",
        content:
          "Você é um analista financeiro especializado em documentos brasileiros. Responda apenas com o JSON solicitado.",
      },
      {
        role: "user",
        content: params.prompt,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "document_analysis",
        strict: true,
        schema: analysisJsonSchema,
      },
    },
  });

  const content = response.choices[0]?.message?.content;

  if (!content) {
    throw new Error("OpenAI retornou uma resposta vazia.");
  }

  const parsed = documentAnalysisSchema.parse(extractJson(content));
  const inputTokens = response.usage?.prompt_tokens ?? 0;
  const outputTokens = response.usage?.completion_tokens ?? 0;

  return {
    provider: "openai",
    model: env.OPENAI_MODEL,
    result: parsed,
    inputTokens,
    outputTokens,
    costUsd: calculateCost("openai", inputTokens, outputTokens),
  };
}

async function analyzeWithAnthropic(params: {
  prompt: string;
}): Promise<AiProviderResult> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY não configurada.");
  }

  const client = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
  });

  const response = await client.messages.create({
    model: env.CLAUDE_MODEL,
    max_tokens: env.CLAUDE_MAX_TOKENS,
    system:
      "Você é um analista financeiro especializado em documentos brasileiros. Responda exclusivamente com JSON válido, sem markdown.",
    messages: [
      {
        role: "user",
        content: params.prompt,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Claude recusou a análise do documento.");
  }

  const textBlock = response.content.find((block) => block.type === "text");

  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude retornou uma resposta sem texto.");
  }

  const parsed = documentAnalysisSchema.parse(extractJson(textBlock.text));
  const inputTokens = response.usage.input_tokens ?? 0;
  const outputTokens = response.usage.output_tokens ?? 0;

  return {
    provider: "anthropic",
    model: env.CLAUDE_MODEL,
    result: parsed,
    inputTokens,
    outputTokens,
    costUsd: calculateCost("anthropic", inputTokens, outputTokens),
  };
}

export async function analyzeDocument(params: {
  text: string;
  filename: string;
  documentType: string | null;
  ticker: string | null;
}): Promise<AiProviderResult | null> {
  if (!env.OPENAI_API_KEY && !env.ANTHROPIC_API_KEY) {
    return null;
  }

  const prompt = buildPrompt(params.text, params.filename, params.documentType, params.ticker);

  let openAiError: unknown;

  if (env.OPENAI_API_KEY) {
    try {
      return await analyzeWithOpenAI({ prompt });
    } catch (error) {
      openAiError = error;
      console.error("[document-analysis] OpenAI falhou; tentando Anthropic.", error);
    }
  }

  if (env.ANTHROPIC_API_KEY) {
    try {
      return await analyzeWithAnthropic({ prompt });
    } catch (anthropicError) {
      const openAiMessage =
        openAiError instanceof Error ? openAiError.message : "erro desconhecido";
      const anthropicMessage =
        anthropicError instanceof Error ? anthropicError.message : "erro desconhecido";

      throw new Error(
        `Falha nos provedores de IA. OpenAI: ${openAiMessage}. Anthropic: ${anthropicMessage}.`
      );
    }
  }

  throw new Error("Nenhum provedor de IA disponível.");
}

export async function persistDocumentAnalysis(params: {
  documentId: string;
  userId: string;
  analysis: AiProviderResult;
}): Promise<{ analysisId: string; version: number }> {
  const [latest] = await db
    .select({
      version: documentAnalyses.version,
    })
    .from(documentAnalyses)
    .where(eq(documentAnalyses.documentId, params.documentId))
    .orderBy(desc(documentAnalyses.version))
    .limit(1);

  const version = (latest?.version ?? 0) + 1;
  const payload = params.analysis.result;

  const [created] = await db
    .insert(documentAnalyses)
    .values({
      documentId: params.documentId,
      version,
      detectedType: payload.detected_type,
      keyMetrics: payload.key_metrics,
      summary: payload.summary,
      attentionPoints: payload.attention_points,
      sentiment: payload.sentiment,
      confidence: payload.confidence.toFixed(3),
      provider: params.analysis.provider,
      model: params.analysis.model,
      inputTokens: params.analysis.inputTokens,
      outputTokens: params.analysis.outputTokens,
      costUsd: params.analysis.costUsd.toFixed(6),
      editorialStatus: "draft",
      errorMessage: null,
      updatedAt: new Date(),
    })
    .returning({
      id: documentAnalyses.id,
      version: documentAnalyses.version,
    });

  if (!created) {
    throw new Error("Não foi possível persistir a análise documental.");
  }

  const yearMonth = new Date().toISOString().slice(0, 7);

  await db
    .insert(aiCosts)
    .values({
      userId: params.userId,
      yearMonth,
      provider: params.analysis.provider,
      model: params.analysis.model,
      inputTokens: params.analysis.inputTokens,
      outputTokens: params.analysis.outputTokens,
      costUsd: params.analysis.costUsd.toFixed(6),
      documentsCount: 1,
      providerBreakdown: {
        [params.analysis.provider]: {
          inputTokens: params.analysis.inputTokens,
          outputTokens: params.analysis.outputTokens,
          costUsd: params.analysis.costUsd,
        },
      },
    })
    .onConflictDoUpdate({
      target: [aiCosts.userId, aiCosts.yearMonth, aiCosts.provider, aiCosts.model],
      set: {
        inputTokens: sql`${aiCosts.inputTokens} + ${params.analysis.inputTokens}`,
        outputTokens: sql`${aiCosts.outputTokens} + ${params.analysis.outputTokens}`,
        costUsd: sql`${aiCosts.costUsd} + ${params.analysis.costUsd.toFixed(6)}`,
        documentsCount: sql`${aiCosts.documentsCount} + 1`,
        updatedAt: new Date(),
      },
    });

  await db
    .update(documents)
    .set({
      status: "analyzed",
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, params.documentId));

  return {
    analysisId: created.id,
    version: created.version,
  };
}
