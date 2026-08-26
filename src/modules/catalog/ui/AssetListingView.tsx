'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import type {
  CatalogAssetCategory,
  PaginatedCatalogResult,
  PublicAssetSummary,
} from '../domain/catalog.types';
import {
  getAssetDetailRoute,
  getCategoryLabel,
} from '../domain/catalog-utils';
import { QuoteFreshnessBadge } from './QuoteFreshnessBadge';

interface AssetListingViewProps {
  initialResult: PaginatedCatalogResult;
  selectedCategory?: CatalogAssetCategory;
  pageTitle: string;
  pageDescription: string;
}

export function AssetListingView({
  initialResult,
  selectedCategory,
  pageTitle,
  pageDescription,
}: AssetListingViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [searchQuery, setSearchQuery] = useState(searchParams.get('query') || '');
  const [isPending, startTransition] = useTransition();

  const currentSortBy = searchParams.get('sortBy') || 'ticker';
  const currentSortOrder = searchParams.get('sortOrder') || 'asc';
  const currentPage = Number(searchParams.get('page') || '1');

  function updateFilters(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === '') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  function handleSearchSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const formQuery = formData.get('query') as string | null;
    const finalQuery = (formQuery !== null && formQuery !== undefined ? formQuery : searchQuery).trim();
    updateFilters({ query: finalQuery.length > 0 ? finalQuery : null, page: '1' });
  }

  const categoryTabs = [
    { label: 'Todos', href: '/ativos', key: undefined },
    { label: 'Ações', href: '/acoes', key: 'stock' },
    { label: 'FIIs', href: '/fiis', key: 'fii' },
    { label: 'ETFs', href: '/etfs', key: 'etf' },
    { label: 'BDRs', href: '/bdrs', key: 'bdr' },
  ];

  return (
    <div className="space-y-6">
      {/* Header da Página */}
      <div className="border-b border-border-theme pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          {pageTitle}
        </h1>
        <p className="text-sm text-text-secondary mt-1 max-w-3xl">
          {pageDescription}
        </p>

        {/* Abas de Categorias */}
        <div className="flex items-center gap-2 mt-5 overflow-x-auto pb-1">
          {categoryTabs.map((tab) => {
            const isSelected = selectedCategory === tab.key;
            return (
              <Link
                key={tab.label}
                id={`tab-category-${tab.key ?? 'all'}`}
                href={tab.href}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  isSelected
                    ? 'bg-action-primary text-action-primary-text shadow-xs'
                    : 'bg-surface-elevated text-text-secondary hover:text-text-primary hover:bg-surface border border-border-theme'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Formulário de Busca */}
        <form onSubmit={handleSearchSubmit} className="flex-1 max-w-md">
          <div className="relative">
            <input
              id="input-catalog-search"
              name="query"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por ticker ou nome da empresa..."
              className="w-full pl-9 pr-20 py-2 rounded-lg border border-border-theme bg-surface text-text-primary text-xs placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-action-primary/30"
            />
            <svg
              className="w-4 h-4 text-text-muted absolute left-3 top-2.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <button
              id="btn-catalog-search-submit"
              type="submit"
              disabled={isPending}
              className="absolute right-1 top-1 bottom-1 px-3 bg-surface-elevated border border-border-theme rounded-md text-xs font-medium text-text-primary hover:bg-surface transition-colors"
            >
              Buscar
            </button>
          </div>
        </form>

        {/* Seletor de Ordenação */}
        <div className="flex items-center gap-2 self-end sm:self-auto text-xs text-text-muted">
          <span>Ordenar:</span>
          <select
            id="select-catalog-sort"
            value={`${currentSortBy}-${currentSortOrder}`}
            onChange={(e) => {
              const [sortBy, sortOrder] = e.target.value.split('-');
              updateFilters({ sortBy, sortOrder, page: '1' });
            }}
            className="px-2.5 py-1.5 rounded-lg border border-border-theme bg-surface text-text-primary text-xs focus:outline-none"
          >
            <option value="ticker-asc">Ticker (A &rarr; Z)</option>
            <option value="ticker-desc">Ticker (Z &rarr; A)</option>
            <option value="name-asc">Nome (A &rarr; Z)</option>
            <option value="price-desc">Maior Preço</option>
            <option value="price-asc">Menor Preço</option>
            <option value="variation-desc">Maior Alta</option>
            <option value="variation-asc">Maior Baixa</option>
          </select>
        </div>
      </div>

      {/* Listagem de Ativos (Tabela / Grid Responsivo) */}
      {initialResult.items.length === 0 ? (
        <div
          id="catalog-empty-state"
          className="rounded-xl border border-border-theme bg-surface p-12 text-center text-text-muted"
        >
          <div className="w-12 h-12 rounded-full bg-surface-elevated mx-auto flex items-center justify-center mb-3">
            <svg
              className="w-6 h-6 text-text-muted"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-text-primary">
            Nenhum ativo encontrado
          </h3>
          <p className="text-xs text-text-muted mt-1 max-w-sm mx-auto">
            {searchQuery
              ? `Não foram encontrados registros para o termo "${searchQuery}".`
              : selectedCategory === 'bdr'
              ? 'Nenhum BDR cadastrado no catálogo interno no momento.'
              : 'Nenhum ativo cadastrado nesta categoria.'}
          </p>
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                updateFilters({ query: null, page: '1' });
              }}
              className="mt-4 px-3 py-1.5 rounded-lg text-xs bg-surface-elevated border border-border-theme text-action-primary hover:bg-surface font-medium"
            >
              Limpar busca
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border-theme bg-surface overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border-theme bg-surface-elevated/50 text-text-muted uppercase text-[10px] tracking-wider font-semibold">
                  <th className="py-3 px-4">Ativo</th>
                  <th className="py-3 px-4">Categoria</th>
                  <th className="py-3 px-4 text-right">Última Cotação</th>
                  <th className="py-3 px-4 text-right">Variação Diária</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-theme">
                {initialResult.items.map((asset) => {
                  const detailRoute = getAssetDetailRoute(asset.assetType, asset.ticker);
                  const isPositive = asset.dailyVariation && Number(asset.dailyVariation) > 0;
                  const isNegative = asset.dailyVariation && Number(asset.dailyVariation) < 0;

                  return (
                    <tr
                      key={asset.id}
                      id={`row-asset-${asset.ticker}`}
                      className="hover:bg-surface-elevated/40 transition-colors"
                    >
                      {/* Ativo */}
                      <td className="py-3 px-4">
                        <Link
                          href={detailRoute}
                          className="font-bold text-text-primary hover:text-action-primary transition-colors text-sm"
                        >
                          {asset.ticker}
                        </Link>
                        <div className="text-text-muted text-[11px] truncate max-w-xs">
                          {asset.name}
                        </div>
                      </td>

                      {/* Categoria */}
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-md bg-surface-elevated border border-border-theme text-[11px] font-medium text-text-secondary">
                          {getCategoryLabel(asset.assetType)}
                        </span>
                      </td>

                      {/* Última Cotação */}
                      <td className="py-3 px-4 text-right font-medium text-text-primary">
                        {asset.latestPrice ? (
                          <span>
                            {asset.currency === 'BRL' ? 'R$ ' : '$ '}
                            {Number(asset.latestPrice).toLocaleString('pt-BR', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        ) : (
                          <span className="text-text-muted">Indisponível</span>
                        )}
                      </td>

                      {/* Variação Diária */}
                      <td className="py-3 px-4 text-right font-medium">
                        {asset.variationStatus === 'available' && asset.dailyVariation ? (
                          <span
                            className={
                              isPositive
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : isNegative
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-text-muted'
                            }
                          >
                            {isPositive ? '+' : ''}
                            {asset.dailyVariation}%
                          </span>
                        ) : (
                          <span className="text-text-muted text-[11px]">
                            {asset.variationStatus === 'insufficient_history'
                              ? 'Histórico insuficiente'
                              : 'Indisponível'}
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center">
                        <QuoteFreshnessBadge
                          status={asset.freshnessStatus}
                          quoteDate={asset.quoteDate}
                        />
                      </td>

                      {/* Ação */}
                      <td className="py-3 px-4 text-right">
                        <Link
                          id={`link-view-${asset.ticker}`}
                          href={detailRoute}
                          className="inline-flex items-center gap-1 text-xs font-medium text-action-primary hover:underline"
                        >
                          <span>Ver Detalhes</span>
                          <span>&rarr;</span>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {initialResult.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border-theme bg-surface-elevated/30 text-xs text-text-secondary">
              <div>
                Página <span className="font-semibold text-text-primary">{currentPage}</span> de{' '}
                <span className="font-semibold text-text-primary">{initialResult.totalPages}</span> ({initialResult.total} ativos)
              </div>

              <div className="flex items-center gap-2">
                <button
                  id="btn-pagination-prev"
                  type="button"
                  disabled={currentPage <= 1 || isPending}
                  onClick={() => updateFilters({ page: String(currentPage - 1) })}
                  className="px-3 py-1.5 rounded-lg border border-border-theme bg-surface text-text-primary disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-elevated transition-colors"
                >
                  &larr; Anterior
                </button>
                <button
                  id="btn-pagination-next"
                  type="button"
                  disabled={currentPage >= initialResult.totalPages || isPending}
                  onClick={() => updateFilters({ page: String(currentPage + 1) })}
                  className="px-3 py-1.5 rounded-lg border border-border-theme bg-surface text-text-primary disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-elevated transition-colors"
                >
                  Próxima &rarr;
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
