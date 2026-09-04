import { describe, it, expect } from 'vitest';
import { evaluateEditorialGuardrails } from '../../../src/modules/editorial/domain/editorial.rules';

describe('Editorial Guardrails Deterministic Rules Unit Tests', () => {
  it('detecta tentativa de injeção de script HTML como BLOCKER', () => {
    const flags = evaluateEditorialGuardrails(
      'Título Normal',
      'Texto com <script>alert("hack")</script> perigoso',
      'EDUCATIONAL_ARTICLE'
    );
    expect(flags.some((f) => f.code === 'UNSAFE_HTML_SCRIPTS' && f.severity === 'BLOCKER')).toBe(true);
  });

  it('detecta atributo onload/onerror e javascript: como BLOCKER', () => {
    const flags = evaluateEditorialGuardrails(
      'Título',
      'Clique aqui: <a href="javascript:void(0)">link</a>',
      'EDUCATIONAL_ARTICLE'
    );
    expect(flags.some((f) => f.code === 'UNSAFE_HTML_SCRIPTS' && f.severity === 'BLOCKER')).toBe(true);
  });

  it('detecta promessa de rentabilidade ou retorno garantido como BLOCKER', () => {
    const prohibitedPhrases = [
      'Nossa estratégia oferece lucro garantido em ações',
      'Rentabilidade garantida com baixo risco',
      'Retorno garantido de 20% ao mês',
      'Este método traz ganho certo para qualquer investidor',
      'Um investimento seguro e totalmente sem risco',
      'Oportunidade de enriquecimento rápido na bolsa',
    ];

    for (const phrase of prohibitedPhrases) {
      const flags = evaluateEditorialGuardrails('Título', phrase, 'EDUCATIONAL_ARTICLE');
      expect(
        flags.some((f) => f.code === 'PROMISE_OF_RETURN' && f.severity === 'BLOCKER'),
        `Deveria bloquear: "${phrase}"`
      ).toBe(true);
    }
  });

  it('detecta recomendação imperativa direta de compra/venda como BLOCKER', () => {
    const prohibitedRecommendations = [
      'Compre agora as ações da Petrobras antes do anúncio',
      'Venda imediatamente suas cotas deste FII',
      'Recomendamos a compra do ETF BOVA11 hoje',
      'Recomendamos a venda de todos os seus ativos em bolsa',
      'Invista já nesta empresa promissora',
    ];

    for (const rec of prohibitedRecommendations) {
      const flags = evaluateEditorialGuardrails('Análise', rec, 'MARKET_ANALYSIS');
      expect(
        flags.some(
          (f) => f.code === 'DIRECT_INVESTMENT_RECOMMENDATION' && f.severity === 'BLOCKER'
        ),
        `Deveria bloquear: "${rec}"`
      ).toBe(true);
    }
  });

  it('detecta certeza absoluta sobre movimentos futuros do mercado como BLOCKER', () => {
    const certainties = [
      'O Ibovespa com certeza vai subir no próximo semestre',
      'O dólar com certeza vai cair nos próximos dias',
      'O ativo vai explodir após a divulgação dos resultados',
      'É impossível cair mais do que o patamar atual',
    ];

    for (const c of certainties) {
      const flags = evaluateEditorialGuardrails('Visão Futura', c, 'MARKET_ANALYSIS');
      expect(
        flags.some(
          (f) => f.code === 'MARKET_PREDICTION_CERTAINTY' && f.severity === 'BLOCKER'
        ),
        `Deveria bloquear: "${c}"`
      ).toBe(true);
    }
  });

  it('detecta alegação de emissão de DARF oficial como BLOCKER', () => {
    const flags = evaluateEditorialGuardrails(
      'Guia Fiscal',
      'A plataforma realiza a emissão de darf oficial para pagamento imediato.',
      'TAX_GUIDANCE'
    );
    expect(flags.some((f) => f.code === 'OFFICIAL_TAX_CLAIM' && f.severity === 'BLOCKER')).toBe(true);
  });

  it('adiciona WARNING quando artigo sobre mercado não inclui menção ao caráter educativo/informativo', () => {
    const flags = evaluateEditorialGuardrails(
      'Análise do Setor Elétrico',
      'O setor elétrico brasileiro apresentou crescimento de receita e estabilidade de fluxo de caixa no trimestre.',
      'MARKET_ANALYSIS'
    );
    expect(flags.some((f) => f.code === 'MISSING_MARKET_DISCLAIMER' && f.severity === 'WARNING')).toBe(true);
  });

  it('não adiciona WARNING quando o artigo sobre mercado possui disclaimer adequado', () => {
    const flags = evaluateEditorialGuardrails(
      'Análise do Setor Elétrico',
      'O setor elétrico brasileiro apresentou estabilidade. Este material tem caráter informativo e educativo, não constituindo recomendação segundo as diretrizes da CVM.',
      'MARKET_ANALYSIS'
    );
    expect(flags.some((f) => f.code === 'MISSING_MARKET_DISCLAIMER')).toBe(false);
  });

  it('adiciona WARNING quando guia fiscal não possui menção ao caráter auxiliar', () => {
    const flags = evaluateEditorialGuardrails(
      'Apuração de Ações',
      'Veja como apurar o imposto sobre vendas no mercado à vista.',
      'TAX_GUIDANCE'
    );
    expect(flags.some((f) => f.code === 'MISSING_TAX_DISCLAIMER' && f.severity === 'WARNING')).toBe(true);
  });

  it('emite SUGGESTION para títulos muito curtos', () => {
    const flags = evaluateEditorialGuardrails('Oi', 'Conteúdo extenso e bem estruturado com mais de vinte caracteres.', 'EDUCATIONAL_ARTICLE');
    expect(flags.some((f) => f.code === 'SHORT_TITLE' && f.severity === 'SUGGESTION')).toBe(true);
  });
});
