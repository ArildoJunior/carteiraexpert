import type {
  PublicAssetDetail,
  PublicQuoteHistoryPoint,
} from '../domain/catalog.types';
import { getCategoryLabel, getCategoryRoute } from '../domain/catalog-utils';
import { QuoteFreshnessBadge } from './QuoteFreshnessBadge';
import { Breadcrumbs } from './Breadcrumbs';
import { AssetPriceHistoryChart } from './AssetPriceHistoryChart';
import {
  LaunchOperationDialog,
  type UserPortfolioItem,
} from './LaunchOperationDialog';
import {
  B3HistoricalQuotesExplorer,
  type B3HistoricalQuotesResult,
  type AssetFundamentalsViewData,
  type SerializedTheoreticalValuationResultSet,
} from '@/modules/market-data';
import { AssetFundamentalsCard } from './AssetFundamentalsCard';
import { TheoreticalValuationCard } from './TheoreticalValuationCard';

import type { CatalogHistoryPeriod } from '../domain/catalog.schema';

interface AssetDetailViewProps {
  asset: PublicAssetDetail;
  history: PublicQuoteHistoryPoint[];
  initialPeriod?: CatalogHistoryPeriod;
  b3HistoricalResult?: B3HistoricalQuotesResult;
  fundamentalsData?: AssetFundamentalsViewData | null;
  valuationData?: SerializedTheoreticalValuationResultSet | null;
  userPortfolios: UserPortfolioItem[];
  isAuthenticated: boolean;
  currentUrl: string;
}

export function AssetDetailView({
  asset,
  history,
  initialPeriod = '1M',
  b3HistoricalResult,
  fundamentalsData,
  valuationData,
  userPortfolios,
  isAuthenticated,
  currentUrl,
}: AssetDetailViewProps) {

  const categoryLabel = getCategoryLabel(asset.assetType);
  const categoryRoute = getCategoryRoute(asset.assetType);

  const breadcrumbs = [
    { label: categoryLabel, href: categoryRoute },
    { label: asset.ticker },
  ];

  const isPositive = asset.dailyVariation && Number(asset.dailyVariation) > 0;
  const isNegative = asset.dailyVariation && Number(asset.dailyVariation) < 0;

  return (
    <div className="space-y-8">
      {/* Breadcrumbs */}
      <Breadcrumbs items={breadcrumbs} />

      {/* Header Principal do Ativo */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 pb-6 border-b border-border-theme">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1
              id="asset-detail-ticker"
              className="text-3xl sm:text-4xl font-extrabold tracking-tight text-text-primary"
            >
              {asset.ticker}
            </h1>
            <span className="px-2.5 py-1 rounded-md bg-surface-elevated border border-border-theme text-xs font-semibold text-text-secondary">
              {categoryLabel}
            </span>
            <span className="px-2.5 py-1 rounded-md bg-surface-elevated border border-border-theme text-xs font-medium text-text-muted">
              {asset.market}
            </span>
            <QuoteFreshnessBadge
              status={asset.freshnessStatus}
              quoteDate={asset.quoteDate}
            />
          </div>
          <p
            id="asset-detail-name"
            className="text-base text-text-secondary font-medium"
          >
            {asset.name}
          </p>
        </div>

        {/* CTA Lançar em Carteira */}
        <div className="self-start md:self-center">
          <LaunchOperationDialog
            asset={asset}
            userPortfolios={userPortfolios}
            isAuthenticated={isAuthenticated}
            callbackUrl={currentUrl}
          />
        </div>
      </div>

      {/* Grid de Métricas Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Última Cotação */}
        <div className="rounded-xl border border-border-theme bg-surface p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
              Última Cotação
            </span>
            <span className="text-[10px] font-semibold text-text-secondary bg-surface-elevated border border-border-theme px-1.5 py-0.5 rounded">
              COTAHIST B3
            </span>
          </div>
          <div
            id="metric-latest-price"
            className="text-2xl font-bold text-text-primary mt-1"
          >
            {asset.latestPrice ? (
              <span>
                {asset.currency === 'BRL' ? 'R$ ' : '$ '}
                {Number(asset.latestPrice).toLocaleString('pt-BR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            ) : (
              <span className="text-text-muted text-lg">Cotação Indisponível</span>
            )}
          </div>
          <div className="text-[11px] text-text-muted mt-1 space-y-0.5">
            <div>
              {asset.quoteDate
                ? `Pregão: ${new Date(asset.quoteDate).toLocaleDateString('pt-BR', {
                    timeZone: 'America/Sao_Paulo',
                  })}`
                : 'Sem registro de pregão'}
            </div>
            <div className="text-[10px] text-text-secondary font-medium">
              Usando último fechamento oficial disponível
            </div>
          </div>
        </div>

        {/* Card 2: Variação Diária */}
        <div className="rounded-xl border border-border-theme bg-surface p-4 shadow-xs">
          <div className="text-xs font-medium text-text-muted uppercase tracking-wider">
            Variação no Pregão
          </div>
          <div
            id="metric-daily-variation"
            className={`text-2xl font-bold mt-1 ${
              asset.variationStatus === 'available' && isPositive
                ? 'text-emerald-600 dark:text-emerald-400'
                : asset.variationStatus === 'available' && isNegative
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-text-muted'
            }`}
          >
            {asset.variationStatus === 'available' && asset.dailyVariation ? (
              <span>
                {isPositive ? '+' : ''}
                {asset.dailyVariation}%
              </span>
            ) : (
              <span className="text-xs font-medium text-text-muted">
                Variação indisponível para este período
              </span>
            )}
          </div>
          <div className="text-[11px] text-text-muted mt-1">
            Comparação com pregão anterior
          </div>
        </div>

        {/* Card 3: Fechamento Anterior */}
        <div className="rounded-xl border border-border-theme bg-surface p-4 shadow-xs">
          <div className="text-xs font-medium text-text-muted uppercase tracking-wider">
            Fechamento Anterior
          </div>
          <div
            id="metric-previous-close"
            className="text-2xl font-bold text-text-primary mt-1"
          >
            {asset.previousClosePrice ? (
              <span>
                {asset.currency === 'BRL' ? 'R$ ' : '$ '}
                {Number(asset.previousClosePrice).toLocaleString('pt-BR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            ) : (
              <span className="text-text-muted text-sm font-medium">Sem referência</span>
            )}
          </div>
          <div className="text-[11px] text-text-muted mt-1">
            {asset.previousCloseDate
              ? `Em ${new Date(asset.previousCloseDate).toLocaleDateString('pt-BR', {
                  timeZone: 'America/Sao_Paulo',
                })}`
              : 'Base de pregão inicial'}
          </div>
        </div>

        {/* Card 4: Mercado e Moeda */}
        <div className="rounded-xl border border-border-theme bg-surface p-4 shadow-xs">
          <div className="text-xs font-medium text-text-muted uppercase tracking-wider">
            Mercado de Negociação
          </div>
          <div className="text-2xl font-bold text-text-primary mt-1">
            {asset.market}
          </div>
          <div className="text-[11px] text-text-muted mt-1">
            Moeda base: {asset.currency}
          </div>
        </div>
      </div>

      {/* Gráfico Histórico */}
      <AssetPriceHistoryChart
        assetId={asset.id}
        ticker={asset.ticker}
        initialHistory={history}
        initialPeriod={initialPeriod}
        currency={asset.currency}
      />

      {/* Informações Cadastrais */}
      <div className="rounded-xl border border-border-theme bg-surface p-6 shadow-xs space-y-4">
        <h3 className="text-base font-semibold text-text-primary">
          Informações Cadastrais do Ativo
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-6 text-xs">
          <div>
            <span className="text-text-muted block">Ticker Oficial:</span>
            <span className="font-semibold text-text-primary text-sm">
              {asset.ticker}
            </span>
          </div>
          <div>
            <span className="text-text-muted block">Razão Social / Nome:</span>
            <span className="font-medium text-text-primary">{asset.name}</span>
          </div>
          <div>
            <span className="text-text-muted block">Classe de Ativo:</span>
            <span className="font-medium text-text-primary">{categoryLabel}</span>
          </div>
          <div>
            <span className="text-text-muted block">Bolsa / Mercado:</span>
            <span className="font-medium text-text-primary">{asset.market}</span>
          </div>
          <div>
            <span className="text-text-muted block">Moeda de Liquidação:</span>
            <span className="font-medium text-text-primary">{asset.currency}</span>
          </div>
          <div>
            <span className="text-text-muted block">Tipo de Registro:</span>
            <span className="font-medium text-text-primary">Catálogo Oficial Global</span>
          </div>
        </div>
      </div>

      {/* Cotações Históricas Oficiais B3 (COTAHIST) */}
      {b3HistoricalResult && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-text-primary">
              Cotações Oficiais de Fechamento B3
            </h3>
            <span className="text-xs text-text-muted">
              Fonte oficial: B3 COTAHIST
            </span>
          </div>
          <B3HistoricalQuotesExplorer
            initialResult={b3HistoricalResult}
            basePath={currentUrl}
            hideSearchHeader
          />
        </div>
      )}

      {/* Modelos Teóricos de Valuation (Bazin, Graham e DCF) */}
      <TheoreticalValuationCard valuationData={valuationData ?? null} />

      {/* Fundamentos e Indicadores Contábeis Oficiais */}
      <AssetFundamentalsCard fundamentals={fundamentalsData ?? null} />
    </div>
  );
}
