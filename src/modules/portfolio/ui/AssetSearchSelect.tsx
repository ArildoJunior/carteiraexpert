'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { searchAssetsAction } from '../server/portfolio.actions';
import type { Asset } from '../domain/asset.types';

interface AssetSearchSelectProps {
  selectedAsset: Asset | null;
  onSelectAsset: (asset: Asset | null) => void;
  onRequestCreateCustomAsset?: (query: string) => void;
  error?: string;
}

export function AssetSearchSelect({
  selectedAsset,
  onSelectAsset,
  onRequestCreateCustomAsset,
  error,
}: AssetSearchSelectProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);

  // Executa busca com controle de concorrência / stale responses
  const performSearch = useCallback(async (searchQuery: string) => {
    const currentRequestId = ++requestIdRef.current;
    setLoading(true);

    try {
      const res = await searchAssetsAction(searchQuery, undefined, 10);
      // Descarta resposta se uma busca mais recente já foi disparada
      if (currentRequestId === requestIdRef.current) {
        if (res.success && res.data) {
          setResults(res.data);
        } else {
          setResults([]);
        }
      }
    } catch {
      if (currentRequestId === requestIdRef.current) {
        setResults([]);
      }
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // Debounced search effect
  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);

    const timer = setTimeout(() => {
      performSearch(query);
    }, 150);

    return () => {
      clearTimeout(timer);
    };
  }, [query, isOpen, performSearch]);

  // Fecha dropdown ao clicar fora do container
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="space-y-1.5" ref={containerRef}>
      <label
        htmlFor="asset-search-input"
        className="block text-sm font-medium text-text-secondary"
      >
        Ativo <span className="text-negative-text">*</span>
      </label>

      {/* Card de Ativo Selecionado ou Campo de Busca */}
      {selectedAsset ? (
        <div
          id="selected-asset-card"
          className="flex items-center justify-between bg-background border border-action-primary/70 rounded-lg px-3.5 py-2.5"
        >
          <div className="flex items-center gap-3">
            <span
              id="selected-asset-ticker"
              className="font-bold text-action-primary text-sm tracking-wide bg-action-primary/10 px-2 py-0.5 rounded border border-action-primary/30"
            >
              {selectedAsset.ticker}
            </span>
            <span
              id="selected-asset-name"
              className="text-text-primary text-sm truncate max-w-[200px]"
            >
              {selectedAsset.name}
            </span>
          </div>
          <button
            id="btn-clear-asset"
            type="button"
            onClick={() => {
              onSelectAsset(null);
              setQuery('');
              setResults([]);
            }}
            className="text-xs text-text-secondary hover:text-negative-text transition-colors p-1"
          >
            Trocar
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            id="asset-search-input"
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => {
              setIsOpen(true);
              if (results.length === 0) {
                performSearch(query);
              }
            }}
            placeholder="Buscar por código ou nome (ex: PETR4, VALE3, BTC)..."
            aria-describedby={error ? 'asset-select-error' : undefined}
            aria-expanded={isOpen}
            aria-autocomplete="list"
            className="w-full bg-background border border-border-theme rounded-lg px-3.5 py-2.5 text-text-primary placeholder:text-text-secondary/60 text-sm focus:outline-none focus:ring-2 focus:ring-action-primary focus:border-transparent transition-all"
            autoComplete="off"
          />

          {/* Dropdown de Resultados */}
          {isOpen && (
            <div
              id="asset-search-dropdown"
              role="listbox"
              aria-busy={loading}
              className="absolute z-20 top-full left-0 right-0 mt-1 bg-surface-elevated border border-border-theme rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto divide-y divide-border-theme"
            >
              {loading ? (
                <div
                  id="asset-search-loading"
                  role="status"
                  aria-live="polite"
                  className="p-4 text-center text-text-secondary text-sm flex items-center justify-center gap-2"
                >
                  <span className="inline-block w-3.5 h-3.5 border-2 border-action-primary border-t-transparent rounded-full animate-spin" />
                  Buscando ativos...
                </div>
              ) : results.length > 0 ? (
                results.map((asset) => (
                  <button
                    key={asset.id}
                    id={`asset-option-${asset.ticker}`}
                    role="option"
                    aria-selected="false"
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onSelectAsset(asset);
                      setIsOpen(false);
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-surface transition-colors flex items-center justify-between group"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-text-primary text-sm group-hover:text-action-primary">
                          {asset.ticker}
                        </span>
                        {asset.isCustom && (
                          <span className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.2 rounded">
                            Customizado
                          </span>
                        )}
                        <span className="text-xs text-text-secondary font-mono">
                          {asset.market}
                        </span>
                      </div>
                      <p className="text-xs text-text-secondary truncate max-w-[280px]">
                        {asset.name}
                      </p>
                    </div>
                    <span className="text-xs text-text-secondary">{asset.currency}</span>
                  </button>
                ))
              ) : (
                <div
                  id="asset-search-empty"
                  className="p-4 text-center space-y-2"
                >
                  <p className="text-sm text-text-secondary">
                    {query.trim()
                      ? `Nenhum ativo encontrado para "${query}".`
                      : 'Nenhum ativo disponível no momento.'}
                  </p>
                  {onRequestCreateCustomAsset && query.trim() && (
                    <button
                      id="btn-create-custom-asset"
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        const trimmed = query.trim().toUpperCase();
                        setIsOpen(false);
                        onRequestCreateCustomAsset(trimmed);
                      }}
                      className="inline-flex items-center text-xs font-semibold text-action-primary hover:underline"
                    >
                      + Cadastrar ativo customizado com este código
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <p id="asset-select-error" className="text-negative-text text-xs mt-1">
          {error}
        </p>
      )}

      {/* Hidden input to supply assetId to FormData */}
      <input
        type="hidden"
        name="assetId"
        id="hidden-asset-id"
        value={selectedAsset?.id || ''}
      />
    </div>
  );
}
