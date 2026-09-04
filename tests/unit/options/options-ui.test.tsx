import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { OptionsDisclaimerBanner } from '@/modules/options/ui/OptionsDisclaimerBanner';
import { OptionsAlertsBanner } from '@/modules/options/ui/OptionsAlertsBanner';
import { OptionsContractList } from '@/modules/options/ui/OptionsContractList';
import { OptionsGreeksCard } from '@/modules/options/ui/OptionsGreeksCard';
import type {
  SerializedOptionContract,
  SerializedOptionProximityAlert,
  SerializedGreeksResult,
} from '@/modules/options/domain/options.types';

describe('Options UI Components Unit Tests (SSR Render)', () => {
  describe('OptionsDisclaimerBanner', () => {
    it('deve renderizar o aviso regulatório completo com texto de diretrizes CVM', () => {
      const html = renderToString(<OptionsDisclaimerBanner />);
      expect(html).toContain('Aviso Regulatório e Diretrizes Operacionais');
      expect(html).toContain('Finalidade exclusivamente organizacional, descritiva e educacional');
      expect(html).toContain('não recomenda compra, venda ou rolagem');
      expect(html).toContain('Modelagem Matemática Teórica');
    });

    it('deve renderizar aviso compacto quando compact=true', () => {
      const html = renderToString(<OptionsDisclaimerBanner compact />);
      expect(html).toContain('Módulo Informativo:');
      expect(html).toContain('não recomenda estratégias, não executa ordens');
    });
  });

  describe('OptionsAlertsBanner', () => {
    const mockAlerts: SerializedOptionProximityAlert[] = [
      {
        contractId: 'opt-1',
        ticker: 'PETRH380',
        optionType: 'CALL',
        direction: 'BUY',
        strikePrice: '38.00',
        expirationDate: '2026-09-18',
        calendarDaysRemaining: 0,
        businessDaysRemaining: 0,
        status: 'EXPIRING_TODAY',
        alertLevel: 'CRITICAL',
        title: 'PETRH380 — VENCENDO HOJE (D-0)',
        message: 'Atenção: Opção CALL vence na data de hoje.',
      },
      {
        contractId: 'opt-2',
        ticker: 'VALEL800',
        optionType: 'PUT',
        direction: 'SELL',
        strikePrice: '80.00',
        expirationDate: '2026-09-23',
        calendarDaysRemaining: 5,
        businessDaysRemaining: 3,
        status: 'NEAR_EXPIRATION',
        alertLevel: 'WARNING',
        title: 'VALEL800 — Vencimento Próximo (3 DU)',
        message: 'Atenção: Opção vence em 3 dias úteis.',
      },
    ];

    it('não deve renderizar nada se a lista de alertas for vazia', () => {
      const html = renderToString(<OptionsAlertsBanner alerts={[]} />);
      expect(html).toBe('');
    });

    it('deve renderizar alertas com badge CRITICAL e WARNING', () => {
      const html = renderToString(
        <OptionsAlertsBanner alerts={mockAlerts} onSelectOption={() => {}} />
      );

      expect(html).toContain('PETRH380');
      expect(html).toContain('VENCE HOJE (D-0)');
      expect(html).toContain('VALEL800');
      expect(html).toContain('3 DU (D-3)');
      expect(html).toContain('Ver Análise →');
    });
  });

  describe('OptionsContractList', () => {
    const mockContracts: SerializedOptionContract[] = [
      {
        id: 'c-1',
        userId: 'u-1',
        portfolioId: 'p-1',
        underlyingAssetId: 'a-1',
        ticker: 'PETRH380',
        optionType: 'CALL',
        optionStyle: 'AMERICAN',
        direction: 'BUY',
        strikePrice: '38.00',
        premiumPaidReceived: '1.50',
        quantity: '100',
        expirationDate: '2026-10-16',
        status: 'OPEN',
        underlyingAssetTicker: 'PETR4',
      },
      {
        id: 'c-2',
        userId: 'u-1',
        portfolioId: 'p-1',
        underlyingAssetId: 'a-2',
        ticker: 'VALEL800',
        optionType: 'PUT',
        optionStyle: 'AMERICAN',
        direction: 'SELL',
        strikePrice: '80.00',
        premiumPaidReceived: '2.50',
        quantity: '50',
        expirationDate: '2026-10-16',
        status: 'CLOSED',
        underlyingAssetTicker: 'VALE3',
      },
    ];

    it('deve listar os contratos na renderização inicial', () => {
      const html = renderToString(
        <OptionsContractList
          options={mockContracts}
          selectedContractId="c-1"
          onSelectOption={() => {}}
          onOpenNewModal={() => {}}
          onOptionUpdated={() => {}}
        />
      );

      expect(html).toContain('PETRH380');
      expect(html).toContain('VALEL800');
      expect(html).toContain('Contratos de Opções Cadastrados');
      expect(html).toContain('+ Nova Opção');
    });

    it('deve renderizar estado vazio quando não houver contratos', () => {
      const html = renderToString(
        <OptionsContractList
          options={[]}
          selectedContractId={null}
          onSelectOption={() => {}}
          onOpenNewModal={() => {}}
          onOptionUpdated={() => {}}
        />
      );

      expect(html).toContain('Nenhum contrato de opção encontrado');
      expect(html).toContain('+ Cadastrar Opção');
    });
  });

  describe('OptionsGreeksCard', () => {
    const mockContract: SerializedOptionContract = {
      id: 'c-1',
      userId: 'u-1',
      portfolioId: 'p-1',
      underlyingAssetId: 'a-1',
      ticker: 'PETRH380',
      optionType: 'CALL',
      optionStyle: 'AMERICAN',
      direction: 'BUY',
      strikePrice: '38.00',
      premiumPaidReceived: '1.50',
      quantity: '100',
      expirationDate: '2026-10-16',
      status: 'OPEN',
    };

    const mockGreeks: SerializedGreeksResult = {
      theoreticalPrice: '1.70',
      delta: '0.5545',
      gamma: '0.1029',
      theta: '-0.0442',
      vega: '0.0434',
      rho: '0.0161',
      moneyness: 'ATM',
      intrinsicValue: '0.00',
      extrinsicValue: '1.70',
      breakevenPrice: '39.50',
    };

    it('deve renderizar as gregas teóricas e a decomposição de valor', () => {
      const html = renderToString(
        <OptionsGreeksCard
          contract={mockContract}
          initialGreeks={mockGreeks}
          businessDaysRemaining={21}
        />
      );

      expect(html).toContain('Gregas Informativas (Black-Scholes)');
      expect(html).toContain('ATM');
      expect(html).toContain('0.5545'); // Delta
      expect(html).toContain('0.1029'); // Gamma
      expect(html).toContain('-0.0442'); // Theta
      expect(html).toContain('0.0434'); // Vega
      expect(html).toContain('0.0161'); // Rho
      expect(html).toContain('Breakeven: R$ <!-- -->39.50');
    });
  });
});
