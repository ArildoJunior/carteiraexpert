import { describe, it, expect } from 'vitest';
import { MockEditorialAiProvider } from '../../../src/modules/editorial/server/editorial-ai.provider';
import { AiProviderExecutionError } from '../../../src/modules/editorial/domain/errors';

describe('MockEditorialAiProvider Unit Tests', () => {
  const provider = new MockEditorialAiProvider();

  it('gera rascunho com aviso regulatório adequado para MARKET_ANALYSIS', async () => {
    const output = await provider.generateDraft({
      briefing: 'Análise do setor bancário brasileiro e índices de inadimplência',
      documentType: 'MARKET_ANALYSIS',
    });

    expect(output.origin).toBe('AI_DRAFT');
    expect(output.suggestedTitle).toContain('Visão de Mercado e Análise Setorial');
    expect(output.suggestedContent).toContain('CVM');
    expect(output.suggestedContent).toContain('Não constitui recomendação');
    expect(output.modelUsed).toBe('mock-editorial-v1');
  });

  it('gera rascunho com aviso regulatório adequado para TAX_GUIDANCE', async () => {
    const output = await provider.generateDraft({
      briefing: 'Como declarar ações e rendimentos isentos no IRPF',
      documentType: 'TAX_GUIDANCE',
    });

    expect(output.suggestedContent).toContain('DIRPF');
    expect(output.suggestedContent).toContain('não emite DARF');
  });

  it('gera rascunho com aviso regulatório adequado para OPTIONS_DERIVATIVES', async () => {
    const output = await provider.generateDraft({
      briefing: 'Conceito de Opções de Compra (Call) e de Venda (Put)',
      documentType: 'OPTIONS_DERIVATIVES',
    });

    expect(output.suggestedContent).toContain('riscos elevados');
    expect(output.suggestedContent).toContain('não executa ordens');
  });

  it('sugere títulos baseados no conteúdo', async () => {
    const output = await provider.suggestTitle({
      content: 'A importância da diversificação internacional para redução de risco cambial',
      documentType: 'EDUCATIONAL_ARTICLE',
    });

    expect(output.suggestedTitles.length).toBeGreaterThan(0);
    expect(output.suggestedTitles[0]).toContain('Como entender:');
  });

  it('resume conteúdo de forma estruturada', async () => {
    const output = await provider.summarize({
      content:
        'Primeiro parágrafo do artigo sobre planejamento financeiro.\n\nSegundo parágrafo detalhando aportes mensais e juros compostos.',
    });

    expect(output.summary).toContain('Primeiro parágrafo');
    expect(output.bulletPoints.length).toBe(3);
  });

  it('bloqueia envio de prompts com CPFs ou credenciais confidenciais', async () => {
    await expect(
      provider.generateDraft({
        briefing: 'Meu CPF é 123.456.789-00 e quero ajuda para declarar',
        documentType: 'TAX_GUIDANCE',
      })
    ).rejects.toThrow(AiProviderExecutionError);

    await expect(
      provider.generateDraft({
        briefing: 'Aqui está minha senha secreta password123',
        documentType: 'EDUCATIONAL_ARTICLE',
      })
    ).rejects.toThrow(AiProviderExecutionError);
  });

  it('rejeita briefings vazios ou excessivamente longos', async () => {
    await expect(
      provider.generateDraft({
        briefing: '',
        documentType: 'EDUCATIONAL_ARTICLE',
      })
    ).rejects.toThrow(AiProviderExecutionError);

    await expect(
      provider.generateDraft({
        briefing: 'a'.repeat(16000),
        documentType: 'EDUCATIONAL_ARTICLE',
      })
    ).rejects.toThrow(AiProviderExecutionError);
  });
});
