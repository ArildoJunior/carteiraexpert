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

export const metadata: Metadata = {
  title: 'Extrato Geral de Operações — CarteiraExpert',
  description: 'Histórico consolidado, detalhado e paginado de todas as suas operações patrimoniais.',
};

interface HistoryPageProps {
  searchParams: Promise<{
    portfolioId?: string;
    type?: string;
    ticker?: string;
    startDate?: string;
    endDate?: string;
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
  const page = Math.max(1, Number.parseInt(params.page || '1', 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(params.limit || '20', 10) || 20));

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
                <tr className="border-b border-border-theme bg-background/60 text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
                  <th className="px-6 py-3.5">Tipo</th>
                  <th className="px-4 py-3.5">Carteira</th>
                  <th className="px-4 py-3.5">Ativo</th>
                  <th className="px-4 py-3.5">Data Negociação / Corte</th>
                  <th className="px-4 py-3.5 text-right">Quantidade / Fator</th>
                  <th className="px-4 py-3.5 text-right">Preço Unitário</th>
                  <th className="px-4 py-3.5 text-right">Taxas</th>
                  <th className="px-4 py-3.5 text-right">Total da Operação</th>
                  <th className="px-6 py-3.5">Notas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-theme text-text-primary">
                {historyData.items.map((event) => {
                  const isBuy = event.type === 'BUY';
                  const isSell = event.type === 'SELL';
                  const isSplit = event.type === 'SPLIT';
                  const isGrouping = event.type === 'GROUPING';
                  const isBonus = event.type === 'BONUS_SHARE';
                  const isDividend = event.type === 'DIVIDEND';
                  const isJcp = event.type === 'JCP';

                  const tradeDateFormatted = new Date(event.tradeDate).toLocaleDateString(
                    'pt-BR',
                    { timeZone: 'UTC' }
                  );
                  const settlementDateFormatted = event.settlementDate
                    ? new Date(event.settlementDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
                    : null;

                  const decQty = new Decimal(event.quantity || '0');
                  const decPrice = new Decimal(event.unitPrice || '0');
                  const decFees = new Decimal(event.fees || '0');
                  const totalGross = decQty.times(decPrice);
                  const totalNetJcp = totalGross.minus(decFees);
                  const hasFees = decFees.greaterThan(0);

                  return (
                    <tr
                      key={event.id}
                      id={`history-event-row-${event.id}`}
                      className="hover:bg-background/40 transition-colors"
                    >
                      {/* Tipo */}
                      <td className="px-6 py-3.5 whitespace-nowrap">
                        {isBuy && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-positive-text/10 text-positive-text border border-positive-text/30">
                            🟢 Compra
                          </span>
                        )}
                        {isSell && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-action-primary/10 text-action-primary border border-action-primary/30">
                            🔵 Venda
                          </span>
                        )}
                        {isSplit && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30">
                            🔀 Desdobramento
                          </span>
                        )}
                        {isGrouping && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                            🔄 Grupamento
                          </span>
                        )}
                        {isBonus && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/30">
                            🎁 Bonificação
                          </span>
                        )}
                        {isDividend && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-positive-text/10 text-positive-text border border-positive-text/30">
                            💵 Dividendo
                          </span>
                        )}
                        {isJcp && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-500/10 text-teal-600 dark:text-teal-300 border border-teal-500/30">
                            🏛️ JCP
                          </span>
                        )}
                      </td>

                      {/* Carteira */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <Link
                          href={`/portfolios/${event.portfolioId}`}
                          className="font-medium text-action-primary hover:underline transition-colors"
                          id={`history-event-portfolio-${event.id}`}
                        >
                          {event.portfolioName}
                        </Link>
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
