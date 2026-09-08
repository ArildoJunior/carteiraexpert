/**
 * @vitest-environment jsdom
 */
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CspRegulatoryDisclaimer,
  CspCapacityWarning,
  CspParameterForm,
  CspAllocationTable,
  CspExclusionsTable,
  CspExplorer,
} from '@/modules/market-data';
import { CSP_DISCLAIMER } from '@/modules/market-data/domain/csp-engine';
import type { SerializedCspPortfolioResult } from '@/modules/market-data/server/csp.service';

describe('CSP UI Components — Testes Unitários de Interface (jsdom)', () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root && container) {
      act(() => {
        root?.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = null;
    root = null;
  });

  describe('CspRegulatoryDisclaimer', () => {
    it('renderiza o aviso regulatório oficial no modo banner', async () => {
      await act(async () => {
        root?.render(<CspRegulatoryDisclaimer variant="banner" />);
      });

      const text = container?.textContent ?? '';
      expect(text).toContain(CSP_DISCLAIMER);
      expect(text).toContain('Aviso Regulatório — Algoritmo Neutro e Determinístico');
    });

    it('renderiza o aviso regulatório oficial no modo footer', async () => {
      await act(async () => {
        root?.render(<CspRegulatoryDisclaimer variant="footer" />);
      });

      const text = container?.textContent ?? '';
      expect(text).toContain(CSP_DISCLAIMER);
      expect(text).toContain('Aviso Regulatório Obrigatório — Finalidade Informativa e Educacional');
    });
  });

  describe('CspCapacityWarning', () => {
    it('renderiza aviso de inviabilidade com capacidade máxima calculada', async () => {
      await act(async () => {
        root?.render(<CspCapacityWarning maxAchievableCapacity={0.75} />);
      });

      const text = container?.textContent ?? '';
      expect(text).toContain('Inviabilidade de Alocação Plena (100%)');
      expect(text).toContain('75,0%');
      expect(text).toContain('Aumentar o teto de peso máximo por ativo ou setor');
    });

    it('renderiza mensagem de erro customizada se informada', async () => {
      await act(async () => {
        root?.render(<CspCapacityWarning errorMessage="Erro customizado de restrições" />);
      });

      const text = container?.textContent ?? '';
      expect(text).toContain('Erro customizado de restrições');
    });
  });

  describe('CspParameterForm', () => {
    it('renderiza formulário com parâmetros padrão e executa onSubmit ao submeter', async () => {
      const onSubmit = vi.fn();

      await act(async () => {
        root?.render(<CspParameterForm onSubmit={onSubmit} />);
      });

      const text = container?.textContent ?? '';
      expect(text).toContain('Parâmetros da Carteira Sugerida (CSP)');
      expect(text).toContain('Classe de Ativo');
      expect(text).toContain('Método de Ponderação');

      const form = container?.querySelector('form');
      expect(form).not.toBeNull();

      await act(async () => {
        form?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      });

      expect(onSubmit).toHaveBeenCalledTimes(1);
      const submitted = onSubmit.mock.calls[0][0];
      expect(submitted.assetClass).toBe('STOCK');
      expect(submitted.weightingMethod).toBe('MARGEM_SEGURANCA');
      expect(submitted.criteria.minMarginOfSafetyPercent).toBe('0.00');
      expect(submitted.constraints.maxWeightPerSector).toBe('0.40');
    });

    it('restaura valores padrão ao clicar no botão de reset', async () => {
      await act(async () => {
        root?.render(<CspParameterForm onSubmit={vi.fn()} />);
      });

      const resetBtn = container?.querySelector('button[type="button"]') as HTMLButtonElement | null;
      expect(resetBtn?.textContent).toContain('Restaurar Padrões');

      await act(async () => {
        resetBtn?.click();
      });

      const select = container?.querySelector('#csp-asset-class') as HTMLSelectElement | null;
      expect(select?.value).toBe('STOCK');

      const sectorInput = container?.querySelector('#csp-max-weight-sector') as HTMLInputElement | null;
      expect(sectorInput?.value).toBe('0.40');
      expect(container?.textContent).toContain('Padrão: 0.40 (limita cada setor a no máximo 40%).');
    });
  });

  describe('CspAllocationTable', () => {
    const mockAllocations = [
      {
        ticker: 'PETR4',
        sector: 'Petróleo e Gás',
        marketPrice: '30.0000',
        theoreticalPrice: '40.0000',
        marginOfSafetyPercent: '33.33',
        weight: '0.2000',
        contribution: '0.0667',
      },
      {
        ticker: 'VALE3',
        sector: 'Mineração',
        marketPrice: '60.0000',
        theoreticalPrice: '75.0000',
        marginOfSafetyPercent: '25.00',
        weight: '0.2000',
        contribution: '0.0500',
      },
    ];

    it('renderiza linhas de alocação formatadas com métricas', async () => {
      await act(async () => {
        root?.render(<CspAllocationTable allocations={mockAllocations} />);
      });

      const text = container?.textContent ?? '';
      expect(text).toContain('PETR4');
      expect(text).toContain('Petróleo e Gás');
      expect(text).toContain('R$ 30,00');
      expect(text).toContain('R$ 40,00');
      expect(text).toContain('+33,33%');
      expect(text).toContain('20,00%');

      expect(text).toContain('VALE3');
      expect(text).toContain('Mineração');
      expect(text).toContain('+25,00%');
    });

    it('renderiza estado vazio quando não houver alocações', async () => {
      await act(async () => {
        root?.render(<CspAllocationTable allocations={[]} />);
      });

      expect(container?.textContent).toContain('Nenhum ativo alocado pela simulação');
    });
  });

  describe('CspExclusionsTable', () => {
    const mockExclusions = [
      {
        ticker: 'ABEV3',
        reason: 'MARGEM_NEGATIVA' as const,
        detail: 'Margem de segurança teórica não é positiva (-5.00%).',
      },
      {
        ticker: 'CSNA3',
        reason: 'DIVIDA_ACIMA_DO_LIMITE' as const,
        detail: 'Alavancagem de 4.20x excede o teto de 3.50x.',
      },
    ];

    it('renderiza ativos descartados com motivo e nota de auditoria', async () => {
      await act(async () => {
        root?.render(<CspExclusionsTable exclusions={mockExclusions} />);
      });

      const text = container?.textContent ?? '';
      expect(text).toContain('ABEV3');
      expect(text).toContain('Margem Negativa');
      expect(text).toContain('Margem de segurança teórica não é positiva');
      expect(text).toContain('CSNA3');
      expect(text).toContain('Dívida Excessiva');
      expect(text).toContain('Alavancagem de 4.20x excede o teto de 3.50x');
    });

    it('filtra ativos por texto de busca', async () => {
      await act(async () => {
        root?.render(<CspExclusionsTable exclusions={mockExclusions} />);
      });

      const input = container?.querySelector('input[type="text"]') as HTMLInputElement | null;
      expect(input).not.toBeNull();

      await act(async () => {
        input!.value = 'ABEV3';
        input!.dispatchEvent(new Event('input', { bubbles: true }));
        input!.dispatchEvent(new Event('change', { bubbles: true }));
      });

      const text = container?.textContent ?? '';
      expect(text).toContain('ABEV3');
    });
  });

  describe('CspExplorer', () => {
    const mockResult: SerializedCspPortfolioResult = {
      assetClass: 'STOCK',
      weightingMethod: 'MARGEM_SEGURANCA',
      methodologyVersion: '1.0.0',
      dataQualityStatus: 'VALID',
      allocations: [
        {
          ticker: 'PETR4',
          sector: 'Petróleo',
          marketPrice: '30.0000',
          theoreticalPrice: '45.0000',
          marginOfSafetyPercent: '50.00',
          weight: '0.2000',
          contribution: '0.1000',
        },
      ],
      excludedAssets: [
        {
          ticker: 'MGLU3',
          reason: 'MARGEM_NEGATIVA',
          detail: 'Margem negativa.',
        },
      ],
      summary: {
        totalEvaluated: 10,
        totalEligible: 1,
        totalAllocated: 1,
        totalWeightAllocated: '0.2000',
      },
      traceability: {
        methodologyVersion: '1.0.0',
        weightingMethod: 'MARGEM_SEGURANCA',
        criteria: {
          minMarginOfSafetyPercent: '0.00',
          maxNetDebtToEbitda: '3.50',
          maxNetDebtToEquity: '2.00',
          minRoe: '0.05',
          maxStaleDays: 5,
        },
        constraints: {
          maxWeightPerAsset: '0.20',
          maxWeightPerSector: '0.40',
        },
        generatedAt: '2026-09-07T12:00:00.000Z',
        sources: ['cvm', 'cotahist'],
      },
      disclaimer: CSP_DISCLAIMER,
    };

    it('renderiza abas e executa simulação via action mockada', async () => {
      const mockAction = vi.fn().mockResolvedValue({
        success: true,
        data: mockResult,
      });

      await act(async () => {
        root?.render(<CspExplorer initialSimulationAction={mockAction} />);
      });

      const text = container?.textContent ?? '';
      expect(text).toContain('Carteira Sugerida de Preços (CSP)');
      expect(text).toContain('Metodologia v1.0.0');

      // Submete simulação
      const submitBtn = container?.querySelector('button[type="submit"]') as HTMLButtonElement | null;
      expect(submitBtn).not.toBeNull();

      await act(async () => {
        submitBtn?.click();
      });

      expect(mockAction).toHaveBeenCalledTimes(1);

      // Confirma que mudou para a aba de alocação
      const afterSubmitText = container?.textContent ?? '';
      expect(afterSubmitText).toContain('Ativos Alocados na Carteira');
      expect(afterSubmitText).toContain('PETR4');
    });

    it('renderiza aviso de inviabilidade e extrai capacidade máxima quando o erro for INFEASIBLE_CONSTRAINTS', async () => {
      const mockAction = vi.fn().mockResolvedValue({
        success: false,
        error: {
          code: 'INFEASIBLE_CONSTRAINTS',
          message: 'Inviabilidade de restrições: capacidade máxima de 40.0% atingida.',
        },
      });

      await act(async () => {
        root?.render(<CspExplorer initialSimulationAction={mockAction} />);
      });

      const submitBtn = container?.querySelector('button[type="submit"]') as HTMLButtonElement | null;
      await act(async () => {
        submitBtn?.click();
      });

      const text = container?.textContent ?? '';
      expect(text).toContain('Inviabilidade de Alocação Plena');
      expect(text).toContain('40,0%');
    });

    it('extrai capacidade máxima com código INFEASIBLE_CONSTRAINTS no formato formal do motor', async () => {
      const mockAction = vi.fn().mockResolvedValue({
        success: false,
        error: {
          code: 'INFEASIBLE_CONSTRAINTS',
          message:
            'Capacidade máxima combinada dos ativos (35.50%) é inferior a 100,00% sob os limites de concentração.',
        },
      });

      await act(async () => {
        root?.render(<CspExplorer initialSimulationAction={mockAction} />);
      });

      const submitBtn = container?.querySelector('button[type="submit"]') as HTMLButtonElement | null;
      await act(async () => {
        submitBtn?.click();
      });

      const text = container?.textContent ?? '';
      expect(text).toContain('Inviabilidade de Alocação Plena');
      expect(text).toContain('35,5%');
    });

    it('limpa resultado e alocações anteriores quando uma nova simulação falhar com erro', async () => {
      const mockAction = vi
        .fn()
        .mockResolvedValueOnce({
          success: true,
          data: mockResult,
        })
        .mockResolvedValueOnce({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Falha durante o processamento da nova simulação.',
          },
        });

      await act(async () => {
        root?.render(<CspExplorer initialSimulationAction={mockAction} />);
      });

      // 1. Executa primeira simulação bem-sucedida
      const submitBtn = container?.querySelector('button[type="submit"]') as HTMLButtonElement | null;
      await act(async () => {
        submitBtn?.click();
      });

      // Alocações antigas estão visíveis
      expect(container?.textContent).toContain('Ativos Alocados na Carteira');
      expect(container?.textContent).toContain('PETR4');

      // Volta para a aba de simulação
      const simTabBtn = container?.querySelectorAll('button[type="button"]')[0] as HTMLButtonElement;
      await act(async () => {
        simTabBtn.click();
      });

      // 2. Executa segunda simulação com erro
      const secondSubmitBtn = container?.querySelector('button[type="submit"]') as HTMLButtonElement | null;
      await act(async () => {
        secondSubmitBtn?.click();
      });

      const textAfterError = container?.textContent ?? '';
      // As alocações antigas foram limpas e não aparecem mais
      expect(textAfterError).not.toContain('Ativos Alocados na Carteira');
      expect(textAfterError).not.toContain('PETR4');
      // Mensagem de erro é exibida
      expect(textAfterError).toContain('Falha durante o processamento da nova simulação.');
    });
  });
});
