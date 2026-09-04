/**
 * @vitest-environment jsdom
 */
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CompoundInterestSimulator } from '@/modules/projections/ui/CompoundInterestSimulator';

// Mock do Recharts para evitar avisos no JSDOM
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div className="responsive-container">{children}</div>,
  AreaChart: ({ children }: any) => <svg data-testid="area-chart">{children}</svg>,
  Area: () => <g />,
  LineChart: ({ children }: any) => <svg data-testid="line-chart">{children}</svg>,
  Line: () => <g />,
  XAxis: () => <g />,
  YAxis: () => <g />,
  Tooltip: () => <g />,
  CartesianGrid: () => <g />,
  Legend: () => <g />,
}));

describe('CompoundInterestSimulator — Testes Unitários de UI (jsdom)', () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root && container) {
      const currentRoot = root;
      act(() => {
        currentRoot.unmount();
      });
      container.remove();
      container = null;
      root = null;
    }
  });

  it('renderiza os valores default e cabeçalho corretamente', () => {
    act(() => {
      root!.render(<CompoundInterestSimulator />);
    });

    expect(container?.textContent).toContain('Simulador de Juros Compostos e Aportes');
    expect(container?.textContent).toContain('Motor 100% Determinístico em Decimal');
    expect(container?.textContent).toContain('Patrimônio Final (Nominal)');
    expect(container?.textContent).toContain('Patrimônio Final (Poder de Compra Real)');
    expect(container?.textContent).toContain('Total Efetivamente Aportado');
    expect(container?.textContent).toContain('Total em Juros Acumulados');

    // Verifica se os inputs possuem os valores iniciais
    const initialCapitalInput = container?.querySelector('#sim-initial-capital') as HTMLInputElement;
    const monthlyContributionInput = container?.querySelector('#sim-monthly-contribution') as HTMLInputElement;
    const annualRateInput = container?.querySelector('#sim-annual-rate') as HTMLInputElement;

    expect(initialCapitalInput?.value).toBe('10000');
    expect(monthlyContributionInput?.value).toBe('1000');
    expect(annualRateInput?.value).toBe('10.0');
  });

  it('exibe o aviso regulatório da CVM de forma proeminente', () => {
    act(() => {
      root!.render(<CompoundInterestSimulator />);
    });

    expect(container?.textContent).toContain('Aviso Regulatório e Educacional (CVM)');
    expect(container?.textContent).toContain('finalidade exclusivamente educacional');
    expect(container?.textContent).toContain('nem recomendação de investimento');
  });

  it('permite alternar entre visão anual e mensal da tabela', () => {
    act(() => {
      root!.render(<CompoundInterestSimulator />);
    });

    const btnMonthly = container?.querySelector('#btn-table-monthly') as HTMLButtonElement;
    expect(btnMonthly).toBeTruthy();

    act(() => {
      btnMonthly.click();
    });

    // Na visão mensal, deve haver linhas com Mês 1, Mês 2, etc.
    const table = container?.querySelector('#table-projections');
    expect(table?.textContent).toContain('Mês 1');
    expect(table?.textContent).toContain('Mês 2');

    const btnAnnual = container?.querySelector('#btn-table-annual') as HTMLButtonElement;
    expect(btnAnnual).toBeTruthy();

    act(() => {
      btnAnnual.click();
    });

    // Na visão anual, apenas marcos anuais aparecem
    expect(table?.textContent).toContain('Mês 12');
    expect(table?.textContent).toContain('Ano 1');
  });

  it('atualiza dinamicamente os cálculos quando o usuário altera um input', () => {
    act(() => {
      root!.render(<CompoundInterestSimulator />);
    });

    const monthlyContributionInput = container?.querySelector('#sim-monthly-contribution') as HTMLInputElement;

    // Altera aporte mensal para 5000
    act(() => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      nativeInputValueSetter?.call(monthlyContributionInput, '5000');
      monthlyContributionInput.dispatchEvent(new Event('input', { bubbles: true }));
      monthlyContributionInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Verifica que o novo valor foi computado
    expect(monthlyContributionInput.value).toBe('5000');
    // Em 10 anos (120 meses), 5000/mês + 10000 inicial = total aportado de 610.000
    expect(container?.textContent).toContain('610.000,00');
  });

  it('exibe mensagem de validação sem quebrar a interface se ambos os aportes forem zero', () => {
    act(() => {
      root!.render(<CompoundInterestSimulator />);
    });

    const initialCapitalInput = container?.querySelector('#sim-initial-capital') as HTMLInputElement;
    const monthlyContributionInput = container?.querySelector('#sim-monthly-contribution') as HTMLInputElement;

    act(() => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      nativeInputValueSetter?.call(initialCapitalInput, '0');
      initialCapitalInput.dispatchEvent(new Event('input', { bubbles: true }));
      nativeInputValueSetter?.call(monthlyContributionInput, '0');
      monthlyContributionInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(container?.textContent).toContain('maior que zero');
  });
});
