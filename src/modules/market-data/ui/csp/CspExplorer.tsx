'use client';

import { useState } from 'react';
import { CspRegulatoryDisclaimer } from './CspRegulatoryDisclaimer';
import { CspParameterForm } from './CspParameterForm';
import { CspCapacityWarning } from './CspCapacityWarning';
import { CspAllocationCharts } from './CspAllocationCharts';
import { CspAllocationTable } from './CspAllocationTable';
import { CspExclusionsTable } from './CspExclusionsTable';
import { runCspSimulationAction } from '@/modules/market-data/server/csp.actions';
import type {
  SerializedCspPortfolioResult,
  CspSimulationResponse,
} from '@/modules/market-data/server/csp.service';
import type { CspSimulationInput } from '@/modules/market-data/domain/csp.schema';

export interface CspExplorerProps {
  initialSimulationAction?: (rawInput: unknown) => Promise<CspSimulationResponse>;
  className?: string;
}

type TabType = 'simulation' | 'allocation' | 'exclusions' | 'methodology';

export function CspExplorer({
  initialSimulationAction = runCspSimulationAction,
  className = '',
}: CspExplorerProps) {
  const [activeTab, setActiveTab] = useState<TabType>('simulation');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<SerializedCspPortfolioResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [maxAchievableCapacity, setMaxAchievableCapacity] = useState<number | null>(null);

  const handleRunSimulation = async (input: CspSimulationInput) => {
    setIsLoading(true);
    setResult(null);
    setErrorMessage(null);
    setMaxAchievableCapacity(null);

    try {
      const response = await initialSimulationAction(input);

      if (!response.success) {
        setErrorMessage(response.error.message);
        if (response.error.code === 'INFEASIBLE_CONSTRAINTS') {
          // Extrai capacidade máxima se reportada na mensagem (ex: "capacidade máxima de 40.0%" ou "combinada dos ativos (40.00%)")
          const capMatch =
            response.error.message.match(
              /(?:capacidade m[áa]xima[^0-9]*|combinada dos ativos \()(\d+(?:[.,]\d+)?)%/i
            ) || response.error.message.match(/(\d+(?:[.,]\d+)?)%/);
          if (capMatch) {
            const parsedNum = Number.parseFloat(capMatch[1].replace(',', '.'));
            if (!Number.isNaN(parsedNum)) {
              setMaxAchievableCapacity(parsedNum / 100);
            }
          }
        }
        setActiveTab((current) =>
          current === 'allocation' || current === 'exclusions' ? 'simulation' : current
        );
        return;
      }

      setResult(response.data);
      // Ao obter resultado com sucesso, navega para a aba de alocação se houver ativos alocados
      if (response.data.allocations.length > 0) {
        setActiveTab('allocation');
      } else {
        setActiveTab('exclusions');
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Ocorreu um erro inesperado durante o processamento da simulação CSP.'
      );
      setActiveTab((current) =>
        current === 'allocation' || current === 'exclusions' ? 'simulation' : current
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* 1. Aviso Regulatório Obrigatório Permanente no Topo */}
      <CspRegulatoryDisclaimer variant="banner" />

      {/* 2. Cabeçalho Principal */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border-theme">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-xl font-black text-text-primary tracking-tight">
              Carteira Sugerida de Preços (CSP)
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-brand/10 text-brand border border-brand/20">
              Metodologia v1.0.0
            </span>
          </div>
          <p className="text-xs text-text-muted mt-1 max-w-2xl leading-relaxed">
            Mecanismo algorítmico e determinístico para filtragem contábil, triagem por margem de segurança teórica e otimização sob restrições de concentração.
          </p>
        </div>

        {/* Resumo Rápido da Simulação Ativa */}
        {result && (
          <div className="flex items-center gap-3 bg-surface-elevated p-2.5 rounded-xl border border-border-theme text-xs">
            <div className="text-center px-2">
              <div className="text-[10px] text-text-muted">Avaliados</div>
              <div className="font-bold text-text-primary">{result.summary.totalEvaluated}</div>
            </div>
            <div className="w-px h-6 bg-border-theme" />
            <div className="text-center px-2">
              <div className="text-[10px] text-text-muted">Elegíveis</div>
              <div className="font-bold text-emerald-600 dark:text-emerald-400">
                {result.summary.totalEligible}
              </div>
            </div>
            <div className="w-px h-6 bg-border-theme" />
            <div className="text-center px-2">
              <div className="text-[10px] text-text-muted">Alocados</div>
              <div className="font-bold text-brand">{result.summary.totalAllocated}</div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Navegação por Abas */}
      <div className="flex items-center gap-2 border-b border-border-theme overflow-x-auto text-xs font-semibold">
        <button
          type="button"
          onClick={() => setActiveTab('simulation')}
          className={`pb-3 px-3 transition-colors border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'simulation'
              ? 'border-brand text-brand'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <span>⚙️</span>
          <span>Configurar e Simular</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('allocation')}
          disabled={!result}
          className={`pb-3 px-3 transition-colors border-b-2 flex items-center gap-1.5 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${
            activeTab === 'allocation'
              ? 'border-brand text-brand'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <span>📊</span>
          <span>Alocação da Carteira</span>
          {result && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-brand/10 text-brand">
              {result.allocations.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('exclusions')}
          disabled={!result}
          className={`pb-3 px-3 transition-colors border-b-2 flex items-center gap-1.5 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${
            activeTab === 'exclusions'
              ? 'border-brand text-brand'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <span>🔍</span>
          <span>Ativos Descartados</span>
          {result && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-surface-elevated text-text-muted border border-border-theme">
              {result.excludedAssets.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('methodology')}
          className={`pb-3 px-3 transition-colors border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'methodology'
              ? 'border-brand text-brand'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <span>📖</span>
          <span>Metodologia e Governança</span>
        </button>
      </div>

      {/* 4. Alerta de Inviabilidade ou Erro */}
      {errorMessage && (
        <CspCapacityWarning
          errorMessage={errorMessage}
          maxAchievableCapacity={maxAchievableCapacity}
        />
      )}

      {/* 5. Conteúdo da Aba Ativa */}
      {activeTab === 'simulation' && (
        <div className="space-y-6">
          <CspParameterForm onSubmit={handleRunSimulation} isLoading={isLoading} />
        </div>
      )}

      {activeTab === 'allocation' && result && (
        <div className="space-y-6">
          <CspAllocationCharts allocations={result.allocations} />
          <CspAllocationTable allocations={result.allocations} />
        </div>
      )}

      {activeTab === 'exclusions' && result && (
        <div className="space-y-6">
          <CspExclusionsTable exclusions={result.excludedAssets} />
        </div>
      )}

      {activeTab === 'methodology' && (
        <div className="rounded-xl border border-border-theme bg-surface p-6 shadow-xs space-y-5 text-xs text-text-secondary leading-relaxed">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-text-primary">
              Metodologia de Formação da Carteira Sugerida (CSP)
            </h3>
            <p className="text-text-muted">
              Documentação dos fundamentos algorítmicos e etapas determinísticas da CSP v1.0.0.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-xl bg-surface-elevated border border-border-theme space-y-2">
              <h4 className="font-bold text-text-primary text-sm flex items-center gap-2">
                <span>1.</span>
                <span>Homogeneidade do Universo</span>
              </h4>
              <p>
                O algoritmo exige universo 100% homogêneo. Ações, FIIs e ETFs não são misturados em uma mesma simulação para preservar a comparabilidade dos múltiplos contábeis.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-surface-elevated border border-border-theme space-y-2">
              <h4 className="font-bold text-text-primary text-sm flex items-center gap-2">
                <span>2.</span>
                <span>Filtros Objetivos de Elegibilidade</span>
              </h4>
              <p>
                Ativos são desqualificados se possuírem cotação defasada acima do teto de dias, endividamento excessivo (Dív. Líq./EBITDA ou Dív. Líq./PL), ROE abaixo do mínimo ou margem de segurança teórica não positiva.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-surface-elevated border border-border-theme space-y-2">
              <h4 className="font-bold text-text-primary text-sm flex items-center gap-2">
                <span>3.</span>
                <span>Consenso de Precificação Teórica</span>
              </h4>
              <p>
                O preço teórico é derivado exclusivamente do Consenso Teórico de Valuation (média ponderada dos modelos aplicáveis: Décio Bazin, Benjamin Graham, DCF 2 Estágios e Múltiplos).
              </p>
            </div>

            <div className="p-4 rounded-xl bg-surface-elevated border border-border-theme space-y-2">
              <h4 className="font-bold text-text-primary text-sm flex items-center gap-2">
                <span>4.</span>
                <span>Otimização com Limite de Concentração</span>
              </h4>
              <p>
                A alocação distribui o capital respeitando rigidamente os tetos por ativo e por setor. O algoritmo redistribui o excedente proporcionalmente entre os demais ativos elegíveis.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 6. Aviso Regulatório Obrigatório no Rodapé */}
      <CspRegulatoryDisclaimer variant="footer" />
    </div>
  );
}
