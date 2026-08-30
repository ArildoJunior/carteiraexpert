import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/modules/identity/server/current-user';
import { listPortfolios } from '@/modules/portfolio/server/portfolio.service';
import { getSerializedUserHistoryData } from '@/modules/portfolio/server/dashboard.service';
import { HistoryFilterBar } from '@/modules/portfolio/ui/HistoryFilterBar';
import { Decimal } from '@/lib/decimal';
import type { PortfolioEventType } from '@/modules/portfolio/domain/portfolio-event.types';
import { PORTFOLIO_EVENT_TYPES } from '@/modules/portfolio/domain/portfolio-event.schema';
import {
  getB3HistoricalQuotes,
  getPopularB3Tickers,
  B3HistoricalQuotesExplorer,
} from '@/modules/market-data';

export const metadata: Metadata = {
  title: 'Extrato Geral e Cotações B3 — CarteiraExpert',
  description: 'Histórico consolidado de operações patrimoniais e consulta de séries históricas oficiais da B3 (COTAHIST).',
};

interface HistoryPageProps {
  searchParams: Promise<{
    tab?: string;
    portfolioId?: string;
    type?: string;
    ticker?: string;
    startDate?: string;
    endDate?: string;
    order?: 'asc' | 'desc';
    page?: string;
    limit?: string;
  }>;
}

function formatMoney(value: string | Decimal, currency = 'BRL'): string {
  try {
    const dec = value instanceof Decimal ? value : new Decimal(value || '0');
    const [intPart, fracPart = '00'] = dec.toFixed(2).split('.');
    const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : 'R$';
    return `${symbol} ${formattedInt},${fracPart}`;
  } catch {
    return 'R$ 0,00';
  }
}

function formatQuantity(quantity: string | Decimal): string {
  try {
    const dec = quantity instanceof Decimal ? quantity : new Decimal(quantity || '0');
    const str = dec.toString();
    if (!str.includes('.')) {
      return str.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }
    const [intPart, fracPart] = str.split('.');
    const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${formattedInt},${fracPart}`;
  } catch {
    return '0';
  }
}

export default async function HistoryPage({ searchParams }: HistoryPageProps) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const params = await searchParams;
  const activeTab = params.tab === 'cotahist' ? 'cotahist' : 'operations';
  const page = Math.max(1, Number.parseInt(params.page || '1', 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(params.limit || '20', 10) || 20));

  if (activeTab === 'cotahist') {
    const [b3Result, popularTickers] = await Promise.all([
      getB3HistoricalQuotes({
        ticker: params.ticker ? params.ticker.trim().toUpperCase() : 'PETR4',
        startDate: params.startDate,
        endDate: params.endDate,
        order: params.order,
        page,
        limit,
      }),
      getPopularB3Tickers(),
    ]);

    return (
      <div className="space-y-6 text-text-primary" id="history-page-container">
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">
              Séries Históricas Oficiais B3 (COTAHIST)
            </h1>
            <p className="text-text-secondary text-sm mt-1">
              Consulte cotações diárias, preços de abertura, máxima, mínima, fechamento, quantidade e volume oficial da B3.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              id="history-back-to-dashboard-btn"
              href="/dashboard"
              className="text-xs font-semibold text-text-primary hover:text-action-primary bg-surface hover:bg-background border border-border-theme px-3.5 py-2 rounded-xl transition-colors"
            >
              ← Voltar ao Dashboard
            </Link>
            <Link
              id="history-portfolios-btn"
              href="/portfolios"
              className="text-xs font-semibold text-action-primary-text bg-action-primary hover:opacity-90 px-3.5 py-2 rounded-xl transition-colors shadow-sm"
            >
              💼 Carteiras
            </Link>
          </div>
        </div>

        {/* Seletor de Abas */}
        <div className="flex items-center gap-2 border-b border-border-theme pb-2" id="history-tabs-container">
          <Link
            id="tab-user-operations"
            href="/history"
            className="px-4 py-2 rounded-xl text-xs font-semibold transition-colors bg-surface hover:bg-surface-elevated text-text-secondary"
          >
            📋 Extrato de Minhas Carteiras
          </Link>
          <Link
            id="tab-b3-cotahist"
            href="/history?tab=cotahist"
            className="px-4 py-2 rounded-xl text-xs font-semibold transition-colors bg-action-primary text-action-primary-text shadow-xs"
          >
            🏛️ Cotações Oficiais B3 (COTAHIST)
          </Link>
        </div>

        {/* Visualizador de Séries Históricas B3 */}
        <B3HistoricalQuotesExplorer
          initialResult={b3Result}
          popularTickers={popularTickers}
          basePath="/history"
        />
      </div>
    );
  }

  // Aba Padrão: Extrato de Operações do Usuário
  const rawType = params.type;
  const validatedType: PortfolioEventType | undefined =
    rawType && (PORTFOLIO_EVENT_TYPES as readonly string[]).includes(rawType)
      ? (rawType as PortfolioEventType)
      : undefined;

  const filterOptions = {
    portfolioId: params.portfolioId || undefined,
    type: validatedType,
    ticker: params.ticker ? params.ticker.trim().toUpperCase() : undefined,
    startDate: params.startDate ? new Date(`${params.startDate}T00:00:00.000Z`) : undefined,
    endDate: params.endDate ? new Date(`${params.endDate}T23:59:59.999Z`) : undefined,
    page,
    limit,
  };

  const [historyData, portfolios] = await Promise.all([
    getSerializedUserHistoryData(user, filterOptions),
    listPortfolios(user),
  ]);

  // Função auxiliar para construir links de paginação preservando filtros
  function buildPageUrl(targetPage: number): string {
    const q = new URLSearchParams();
    if (params.portfolioId) q.set('portfolioId', params.portfolioId);
    if (params.type) q.set('type', params.type);
    if (params.ticker) q.set('ticker', params.ticker);
    if (params.startDate) q.set('startDate', params.startDate);
    if (params.endDate) q.set('endDate', params.endDate);
    if (targetPage > 1) q.set('page', String(targetPage));
    if (limit !== 20) q.set('limit', String(limit));
    const qs = q.toString();
    return qs ? `/history?${qs}` : '/history';
  }

  const startItem = historyData.totalCount === 0 ? 0 : (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, historyData.totalCount);

  return (
    <div className="space-y-6 text-text-primary" id="history-page-container">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            Extrato de Operações
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            Histórico cronológico, detalhado e auditável de todas as suas compras, vendas e eventos corporativos.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            id="history-back-to-dashboard-btn"
            href="/dashboard"
            className="text-xs font-semibold text-text-primary hover:text-action-primary bg-surface hover:bg-background border border-border-theme px-3.5 py-2 rounded-xl transition-colors"
          >
            ← Voltar ao Dashboard
          </Link>
          <Link
            id="history-portfolios-btn"
            href="/portfolios"
            className="text-xs font-semibold text-action-primary-text bg-action-primary hover:opacity-90 px-3.5 py-2 rounded-xl transition-colors shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-action-primary"
          >
            💼 Carteiras
          </Link>
        </div>
      </div>

      {/* Seletor de Abas */}
      <div className="flex items-center gap-2 border-b border-border-theme pb-2" id="history-tabs-container">
        <Link
          id="tab-user-operations"
          href="/history"
          className="px-4 py-2 rounded-xl text-xs font-semibold transition-colors bg-action-primary text-action-primary-text shadow-xs"
        >
          📋 Extrato de Minhas Carteiras
        </Link>
        <Link
          id="tab-b3-cotahist"
          href="/history?tab=cotahist"
          className="px-4 py-2 rounded-xl text-xs font-semibold transition-colors bg-surface hover:bg-surface-elevated text-text-secondary"
        >
          🏛️ Cotações Oficiais B3 (COTAHIST)
        </Link>
      </div>

      {/* Barra de Filtros Combinados */}
      <HistoryFilterBar
        portfolios={portfolios}
        selectedPortfolioId={params.portfolioId}
        selectedType={params.type}
        selectedTicker={params.ticker}
        selectedStartDate={params.startDate}
        selectedEndDate={params.endDate}
      />

      {/* Tabela de Histórico de Operações */}
      <div
        id="history-table-container"
        className="bg-surface border border-border-theme rounded-2xl overflow-hidden shadow-sm"
      >
        <div className="px-6 py-4 border-b border-border-theme flex items-center justify-between">
          <h2 className="text-base font-bold text-text-primary flex items-center gap-2.5">
            <span>Operações Realizadas</span>
            <span
              id="history-total-count-badge"
              className="text-xs font-normal bg-background text-text-secondary border border-border-theme px-2 py-0.5 rounded-full tabular-nums"
            >
              {historyData.totalCount}{' '}
              {historyData.totalCount === 1 ? 'operação' : 'operações'}
            </span>
          </h2>

          {historyData.totalCount > 0 && (
            <p className="text-xs text-text-secondary">
              Exibindo <span className="font-mono tabular-nums text-text-primary font-semibold">{startItem}</span> a{' '}
              <span className="font-mono tabular-nums text-text-primary font-semibold">{endItem}</span> de{' '}
              <span className="font-mono tabular-nums text-text-primary font-semibold">{historyData.totalCount}</span>
            </p>
          )}
        </div>

        {historyData.items.length === 0 ? (
          <div
            id="empty-history-state"
            className="p-16 text-center space-y-3"
          >
            <div className="w-12 h-12 rounded-full bg-background border border-border-theme flex items-center justify-center text-text-secondary text-xl font-bold mx-auto">
              📜
            </div>
            <p className="text-sm font-medium text-text-primary">
              Nenhuma operação encontrada com os filtros selecionados.
            </p>
            <p className="text-xs text-text-secondary max-w-sm mx-auto">
              Tente ajustar os critérios de filtro ou cadastre novas transações manuais em suas carteiras.
            </p>
            {(params.portfolioId || params.type || params.ticker || params.startDate || params.endDate) && (
              <div className="pt-2">
                <Link
                  id="btn-empty-clear-filters"
                  href="/history"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-action-primary hover:underline"
                >
                  Limpar todos os filtros →
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table
              id="history-table"
              className="w-full text-left border-collapse text-sm"
            >
              <thead>
                <tr className="border-b border-border-theme bg-surface-elevated text-text-secondary font-semibold text-xs uppercase tracking-wider">
                  <th className="py-3 px-6">Carteira</th>
                  <th className="py-3 px-4">Tipo</th>
                  <th className="py-3 px-4">Ativo</th>
                  <th className="py-3 px-4">Data</th>
                  <th className="py-3 px-4 text-right">Qtd / Fator</th>
                  <th className="py-3 px-4 text-right">Preço Unitário</th>
                  <th className="py-3 px-4 text-right">Taxas</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-6">Notas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-theme">
                {historyData.items.map((event) => {
                  const isBuy = event.type === 'BUY';
                  const isSell = event.type === 'SELL';
                  const isDividend = event.type === 'DIVIDEND';
                  const isJcp = event.type === 'JCP';
                  const isSplit = event.type === 'SPLIT';
                  const isGrouping = event.type === 'GROUPING';
                  const isBonus = event.type === 'BONUS_SHARE';

                  const typeLabel =
                    event.type === 'BUY'
                      ? 'Compra'
                      : event.type === 'SELL'
                      ? 'Venda'
                      : event.type === 'DIVIDEND'
                      ? 'Dividendo'
                      : event.type === 'JCP'
                      ? 'JCP'
                      : event.type === 'SPLIT'
                      ? 'Desdobramento'
                      : event.type === 'GROUPING'
                      ? 'Grupamento'
                      : event.type === 'BONUS_SHARE'
                      ? 'Bonificação'
                      : event.type;

                  const typeColor = isBuy
                    ? 'bg-status-success/10 text-status-success border-status-success/20'
                    : isSell
                    ? 'bg-status-danger/10 text-status-danger border-status-danger/20'
                    : isDividend || isJcp
                    ? 'bg-action-primary/10 text-action-primary border-action-primary/20'
                    : 'bg-surface-elevated text-text-secondary border-border-theme';

                  const decPrice = new Decimal(event.unitPrice || '0');
                  const decQty = new Decimal(event.quantity || '0');
                  const decFees = new Decimal(event.fees || '0');
                  const totalGross = decPrice.times(decQty);
                  const totalNetJcp = totalGross.minus(decFees);
                  const hasFees = decFees.greaterThan(0);

                  const tradeDateFormatted = new Date(event.tradeDate).toLocaleDateString('pt-BR', {
                    timeZone: 'UTC',
                  });
                  const settlementDateFormatted = event.settlementDate
                    ? new Date(event.settlementDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
                    : null;

                  return (
                    <tr
                      key={event.id}
                      className="hover:bg-surface-elevated/40 transition-colors"
                      id={`history-row-${event.id}`}
                    >
                      {/* Carteira */}
                      <td className="px-6 py-3.5 font-medium text-text-primary">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-action-primary" />
                          <span className="truncate max-w-[140px]">{event.portfolioName}</span>
                        </div>
                      </td>

                      {/* Tipo */}
                      <td className="px-4 py-3.5">
                        <span
                          id={`history-event-type-${event.id}`}
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${typeColor}`}
                        >
                          {typeLabel}
                        </span>
                      </td>

                      {/* Ativo */}
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col">
                          <span
                            id={`history-event-ticker-${event.id}`}
                            className="font-bold text-text-primary tracking-wide"
                          >
                            {event.assetTicker}
                          </span>
                          <span className="text-xs text-text-secondary truncate max-w-[160px]">
                            {event.assetName}
                          </span>
                        </div>
                      </td>

                      {/* Data */}
                      <td className="px-4 py-3.5 font-mono tabular-nums text-xs text-text-secondary whitespace-nowrap">
                        <div>{tradeDateFormatted}</div>
                        {settlementDateFormatted && (
                          <div className="text-[10px] text-text-secondary/70">
                            Pagto: {settlementDateFormatted}
                          </div>
                        )}
                      </td>

                      {/* Quantidade / Fator */}
                      <td className="px-4 py-3.5 text-right font-mono tabular-nums font-medium text-text-primary whitespace-nowrap">
                        {isSplit && `Fator 1:${formatQuantity(event.quantity)}`}
                        {isGrouping && `Fator ${formatQuantity(event.quantity)}:1`}
                        {isBonus && `+${formatQuantity(event.quantity)}`}
                        {(isDividend || isJcp) && `${formatQuantity(event.quantity)} ações`}
                        {!isSplit && !isGrouping && !isBonus && !isDividend && !isJcp && formatQuantity(event.quantity)}
                      </td>

                      {/* Preço Unitário */}
                      <td className="px-4 py-3.5 text-right font-mono tabular-nums font-medium text-text-primary whitespace-nowrap">
                        {isSplit || isGrouping ? (
                          '—'
                        ) : isBonus ? (
                          decPrice.greaterThan(0) ? formatMoney(event.unitPrice, event.currency) : 'R$ 0,00'
                        ) : (
                          formatMoney(event.unitPrice, event.currency)
                        )}
                      </td>

                      {/* Taxas */}
                      <td className="px-4 py-3.5 text-right font-mono tabular-nums text-xs text-text-secondary whitespace-nowrap">
                        {isJcp
                          ? `IRRF ${formatMoney(event.fees, event.currency)}`
                          : isSplit || isGrouping || isBonus
                          ? '—'
                          : hasFees
                          ? formatMoney(event.fees, event.currency)
                          : '—'}
                      </td>

                      {/* Total da Operação */}
                      <td className="px-4 py-3.5 text-right font-mono tabular-nums font-semibold whitespace-nowrap">
                        {isSplit || isGrouping ? (
                          <span className="text-text-secondary">—</span>
                        ) : isBonus ? (
                          <span className="text-text-primary">
                            {decPrice.greaterThan(0) ? `+${formatMoney(totalGross, event.currency)}` : 'R$ 0,00'}
                          </span>
                        ) : isDividend ? (
                          <span className="text-positive-text">+{formatMoney(totalGross, event.currency)}</span>
                        ) : isJcp ? (
                          <span className="text-positive-text">+{formatMoney(totalNetJcp, event.currency)}</span>
                        ) : (
                          <span className="text-text-primary">{formatMoney(totalGross, event.currency)}</span>
                        )}
                      </td>

                      {/* Notas / Observações */}
                      <td className="px-6 py-3.5 text-xs text-text-secondary max-w-[200px]">
                        {event.notes ? (
                          <span
                            title={event.notes}
                            className="text-text-primary bg-background px-2 py-1 rounded-md border border-border-theme block truncate"
                          >
                            {event.notes}
                          </span>
                        ) : (
                          <span className="text-text-secondary/50">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Controles de Paginação */}
        {historyData.totalPages > 1 && (
          <div
            id="history-pagination-controls"
            className="px-6 py-4 border-t border-border-theme flex items-center justify-between bg-background/60 text-xs"
          >
            <div className="text-text-secondary">
              Página <span className="font-bold text-text-primary tabular-nums">{historyData.page}</span> de{' '}
              <span className="font-bold text-text-primary tabular-nums">{historyData.totalPages}</span>
            </div>

            <div className="flex items-center gap-2">
              {page > 1 ? (
                <Link
                  id="btn-history-prev-page"
                  href={buildPageUrl(page - 1)}
                  className="px-3 py-1.5 rounded-lg bg-surface hover:bg-background border border-border-theme text-text-primary font-semibold transition-colors"
                >
                  ← Anterior
                </Link>
              ) : (
                <span className="px-3 py-1.5 rounded-lg bg-surface/50 border border-border-theme/40 text-text-secondary/50 cursor-not-allowed font-semibold">
                  ← Anterior
                </span>
              )}

              {page < historyData.totalPages ? (
                <Link
                  id="btn-history-next-page"
                  href={buildPageUrl(page + 1)}
                  className="px-3 py-1.5 rounded-lg bg-surface hover:bg-background border border-border-theme text-text-primary font-semibold transition-colors"
                >
                  Próxima →
                </Link>
              ) : (
                <span className="px-3 py-1.5 rounded-lg bg-surface/50 border border-border-theme/40 text-text-secondary/50 cursor-not-allowed font-semibold">
                  Próxima →
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
