import type {
  EditorialDocumentType,
  EditorialRegulatoryFlag,
} from '../domain/editorial.types';
import { evaluateEditorialGuardrails } from '../domain/editorial.rules';
import { AiProviderExecutionError } from '../domain/errors';

export interface GenerateDraftInput {
  briefing: string;
  documentType: EditorialDocumentType;
  maxWords?: number;
}

export interface GenerateDraftOutput {
  suggestedTitle: string;
  suggestedContent: string;
  origin: 'AI_DRAFT';
  regulatoryFlags: EditorialRegulatoryFlag[];
  modelUsed: string;
}

export interface SuggestTitleInput {
  content: string;
  documentType: EditorialDocumentType;
}

export interface SuggestTitleOutput {
  suggestedTitles: string[];
  modelUsed: string;
}

export interface SummarizeInput {
  content: string;
  maxParagraphs?: number;
}

export interface SummarizeOutput {
  summary: string;
  bulletPoints: string[];
  modelUsed: string;
}

export interface SuggestImprovementsInput {
  title: string;
  content: string;
  documentType: EditorialDocumentType;
}

export interface SuggestImprovementsOutput {
  suggestions: string[];
  regulatoryFlags: EditorialRegulatoryFlag[];
  modelUsed: string;
}

export interface EditorialAiProvider {
  generateDraft(input: GenerateDraftInput): Promise<GenerateDraftOutput>;
  suggestTitle(input: SuggestTitleInput): Promise<SuggestTitleOutput>;
  summarize(input: SummarizeInput): Promise<SummarizeOutput>;
  suggestImprovements(
    input: SuggestImprovementsInput
  ): Promise<SuggestImprovementsOutput>;
}

// ─── Provedor Mock Desacoplado de IA Editorial ──────────────────────────────
// Executa exclusivamente no servidor, garantindo isolamento total, determinismo
// para testes, sanitização e ausência de dependências de chaves externas em ambiente local.
export class MockEditorialAiProvider implements EditorialAiProvider {
  private readonly modelName: string;

  constructor(modelName = 'mock-editorial-v1') {
    this.modelName = modelName;
  }

  private sanitizeInput(text: string): string {
    if (!text || typeof text !== 'string') {
      throw new AiProviderExecutionError('Texto de entrada inválido ou vazio.');
    }
    if (text.length > 15000) {
      throw new AiProviderExecutionError(
        'Limite máximo de caracteres excedido (máximo permitido: 15.000).'
      );
    }

    // Bloqueio de dados altamente confidenciais
    const sensitiveRegex =
      /\b(\d{3}\.\d{3}\.\d{3}-\d{2}|senha|password|bearer|secret|api_key)\b/i;
    if (sensitiveRegex.test(text)) {
      throw new AiProviderExecutionError(
        'Detecção de dado pessoal ou confidencial sensível no prompt. Envio bloqueado por segurança.'
      );
    }

    return text.trim();
  }

  async generateDraft(input: GenerateDraftInput): Promise<GenerateDraftOutput> {
    const cleanBriefing = this.sanitizeInput(input.briefing);

    let titlePrefix = 'Guia Educacional:';
    let defaultBodyIntro = 'Este artigo tem como objetivo apresentar conceitos fundamentais de forma didática.';
    let disclaimerText = '';

    switch (input.documentType) {
      case 'MARKET_ANALYSIS':
        titlePrefix = 'Visão de Mercado e Análise Setorial:';
        defaultBodyIntro =
          'Acompanhar a dinâmica macroeconômica e a estrutura de mercado permite compreender o contexto de alocação de ativos.';
        disclaimerText =
          '\n\n> **Aviso Regulatório:** Este conteúdo possui finalidade exclusivamente informativa e educacional, em conformidade com as diretrizes da CVM. Não constitui recomendação de investimento ou compra/venda de ativos.';
        break;
      case 'TAX_GUIDANCE':
        titlePrefix = 'Orientações Tributárias Auxiliares:';
        defaultBodyIntro =
          'A apuração contínua de operações financeiras auxilia no correto preenchimento da Declaração de Ajuste Anual.';
        disclaimerText =
          '\n\n> **Aviso Regulatório:** As informações apresentadas são de caráter auxiliar para a DIRPF. A plataforma não emite DARF nem substitui a assessoria contábil habilitada.';
        break;
      case 'OPTIONS_DERIVATIVES':
        titlePrefix = 'Fundamentos e Conceitos de Opções:';
        defaultBodyIntro =
          'Contratos de derivativos exigem atenção rigorosa a prazos de vencimento, gregas e valor temporal.';
        disclaimerText =
          '\n\n> **Aviso Regulatório:** Operações com derivativos envolvem riscos elevados de perda patrimonial. A plataforma organiza informações e não executa ordens nem envia comandos a corretoras.';
        break;
      case 'GLOSSARY':
        titlePrefix = 'Glossário Financeiro:';
        defaultBodyIntro =
          'Definições canônicas de termos técnicos para facilitar o entendimento do investidor.';
        break;
      case 'INSTITUTIONAL_NOTE':
        titlePrefix = 'Comunicado Institucional:';
        defaultBodyIntro =
          'Atualização sobre as diretrizes operacionais, governança e melhorias da plataforma CarteiraExpert.';
        break;
      default:
        titlePrefix = 'Artigo Educacional:';
        defaultBodyIntro =
          'Explorando conceitos essenciais de finanças pessoais, disciplina e planejamento de longo prazo.';
        break;
    }

    const suggestedTitle = `${titlePrefix} ${cleanBriefing.slice(0, 60)}`;
    const suggestedContent = `## Introdução\n\n${defaultBodyIntro}\n\n### Desenvolvimento\n\n${cleanBriefing}\n\nO planejamento patrimonial consistente se apoia no entendimento das características dos instrumentos financeiros, sem atalhos ou promessas de ganhos fáceis.${disclaimerText}`;

    const regulatoryFlags = evaluateEditorialGuardrails(
      suggestedTitle,
      suggestedContent,
      input.documentType
    );

    return {
      suggestedTitle,
      suggestedContent,
      origin: 'AI_DRAFT',
      regulatoryFlags,
      modelUsed: this.modelName,
    };
  }

  async suggestTitle(input: SuggestTitleInput): Promise<SuggestTitleOutput> {
    const cleanContent = this.sanitizeInput(input.content);
    const words = cleanContent.split(/\s+/).slice(0, 8).join(' ');

    return {
      suggestedTitles: [
        `Como entender: ${words}...`,
        `Guia Prático: ${words}...`,
        `Panorama Analítico: ${words}...`,
      ],
      modelUsed: this.modelName,
    };
  }

  async summarize(input: SummarizeInput): Promise<SummarizeOutput> {
    const cleanContent = this.sanitizeInput(input.content);
    const paragraphs = cleanContent
      .split('\n\n')
      .filter((p) => p.trim().length > 0);

    const summary = paragraphs[0] || cleanContent.slice(0, 200);
    const bulletPoints = [
      'Visão geral e objetivos principais do tema abordado;',
      'Principais pontos conceituais a serem observados pelo leitor;',
      'Preservação do alinhamento às boas práticas de governança e educação financeira.',
    ];

    return {
      summary,
      bulletPoints,
      modelUsed: this.modelName,
    };
  }

  async suggestImprovements(
    input: SuggestImprovementsInput
  ): Promise<SuggestImprovementsOutput> {
    const cleanTitle = this.sanitizeInput(input.title);
    const cleanContent = this.sanitizeInput(input.content);

    const regulatoryFlags = evaluateEditorialGuardrails(
      cleanTitle,
      cleanContent,
      input.documentType
    );

    const suggestions: string[] = [
      'Assegure que os termos técnicos estejam acompanhados de breves explicações didáticas.',
      'Verifique a clareza da estrutura de subtítulos (H2 e H3) para facilitar a leitura.',
    ];

    if (regulatoryFlags.some((f) => f.severity === 'WARNING')) {
      suggestions.push(
        'Atenção às advertências regulatórias detectadas: adicione notas explícitas de isenção de responsabilidade.'
      );
    }

    return {
      suggestions,
      regulatoryFlags,
      modelUsed: this.modelName,
    };
  }
}
