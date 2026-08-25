'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import type { SaveChartPreferenceInput } from '../domain/chart-preferences.schema';
import { saveChartPreferenceAction } from '../server/portfolio.actions';

export type SyncStatus = 'idle' | 'saving' | 'error';

export type SavePreferenceFn = (
  input: SaveChartPreferenceInput
) => Promise<{ success: boolean; error?: string }>;

/**
 * Fila de sincronização e coalescência atômica por área de gráfico.
 *
 * Garante que:
 * 1. Múltiplas alterações rápidas e concorrentes na mesma área nunca salvem dados fora de ordem;
 * 2. Enquanto uma gravação estiver em voo, alterações seguintes coalesçam no snapshot mais recente;
 * 3. A última intenção do usuário seja necessária e deterministicamente a última gravada;
 * 4. Falhas transitórias assíncronas não quebrem o processamento nem revertam o estado local.
 */
export class ChartPreferenceSyncQueue {
  private saveFn: SavePreferenceFn;
  private onStatusChange?: (status: SyncStatus) => void;
  private latestSnapshot: SaveChartPreferenceInput | null = null;
  private pendingSnapshot: SaveChartPreferenceInput | null = null;
  private isSaving = false;
  private status: SyncStatus = 'idle';
  private currentLoopPromise: Promise<void> | null = null;

  constructor(
    saveFn: SavePreferenceFn,
    onStatusChange?: (status: SyncStatus) => void
  ) {
    this.saveFn = saveFn;
    this.onStatusChange = onStatusChange;
  }

  public getStatus(): SyncStatus {
    return this.status;
  }

  public getLatestSnapshot(): SaveChartPreferenceInput | null {
    return this.latestSnapshot;
  }

  public getPendingSnapshot(): SaveChartPreferenceInput | null {
    return this.pendingSnapshot;
  }

  public isBusy(): boolean {
    return this.isSaving;
  }

  private setStatus(newStatus: SyncStatus) {
    this.status = newStatus;
    this.onStatusChange?.(newStatus);
  }

  public async sync(snapshot: SaveChartPreferenceInput): Promise<void> {
    this.latestSnapshot = snapshot;
    this.pendingSnapshot = snapshot;

    if (!this.isSaving) {
      this.currentLoopPromise = this.runLoop();
    }
    await this.currentLoopPromise;
  }

  private async runLoop(): Promise<void> {
    this.isSaving = true;
    this.setStatus('saving');

    try {
      while (this.pendingSnapshot !== null) {
        const toSave = this.pendingSnapshot;
        this.pendingSnapshot = null;

        try {
          await this.saveFn(toSave);
        } catch {
          // Falha assíncrona não impede o loop de continuar com a intenção mais recente
        }
      }
    } finally {
      this.isSaving = false;
      this.currentLoopPromise = null;
      this.setStatus('idle');
    }
  }
}

export interface UseChartPreferenceSyncOptions {
  onSave?: SavePreferenceFn;
}

export function useChartPreferenceSync(options?: UseChartPreferenceSyncOptions) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const isMountedRef = useRef(true);
  const queueRef = useRef<ChartPreferenceSyncQueue | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  if (!queueRef.current) {
    queueRef.current = new ChartPreferenceSyncQueue(
      options?.onSave ?? saveChartPreferenceAction,
      (status) => {
        if (isMountedRef.current) {
          setSyncStatus(status);
        }
      }
    );
  }

  const syncPreference = useCallback((snapshot: SaveChartPreferenceInput): Promise<void> => {
    return queueRef.current?.sync(snapshot) ?? Promise.resolve();
  }, []);

  return {
    syncPreference,
    syncStatus,
  };
}
