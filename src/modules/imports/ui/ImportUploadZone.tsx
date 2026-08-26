'use client';

import { useState, useRef, useTransition, type DragEvent, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { processImportUploadAction } from '../server/import.actions';
import type { ImportFormatId } from '../domain/import.types';
import { MAX_IMPORT_FILE_SIZE } from '../domain/import.schema';

export interface PortfolioOption {
  id: string;
  name: string;
  baseCurrency: string;
  status: 'active' | 'frozen' | 'archived';
}

interface ImportUploadZoneProps {
  portfolios: PortfolioOption[];
  defaultPortfolioId?: string;
}

export function ImportUploadZone({
  portfolios,
  defaultPortfolioId,
}: ImportUploadZoneProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const activePortfolios = portfolios.filter((p) => p.status === 'active');
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>(
    defaultPortfolioId || activePortfolios[0]?.id || ''
  );
  const [selectedFormat, setSelectedFormat] = useState<ImportFormatId | 'auto'>('auto');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  function validateFile(file: File): string | null {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      return 'Formato não suportado. O arquivo deve ter extensão .csv.';
    }
    if (file.size === 0) {
      return 'O arquivo selecionado está vazio (0 bytes).';
    }
    if (file.size > MAX_IMPORT_FILE_SIZE) {
      return 'O arquivo excede o limite máximo permitido de 5 MB.';
    }
    return null;
  }

  function handleFileSelect(file: File) {
    setErrorMessage(null);
    setSuccessMessage(null);

    const validationError = validateFile(file);
    if (validationError) {
      setErrorMessage(validationError);
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      handleFileSelect(file);
    }
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      handleFileSelect(file);
    }
  }

  async function handleUpload() {
    if (!selectedFile) {
      setErrorMessage('Selecione um arquivo CSV para continuar.');
      return;
    }
    if (!selectedPortfolioId) {
      setErrorMessage('Selecione uma carteira de destino para os registros.');
      return;
    }

    const validationError = validateFile(selectedFile);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);

    startTransition(async () => {
      try {
        const fileContent = await selectedFile.text();

        const result = await processImportUploadAction({
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          fileContent,
          portfolioId: selectedPortfolioId,
          formatId: selectedFormat === 'auto' ? undefined : selectedFormat,
        });

        if (!result.success || !result.data) {
          setErrorMessage(result.error || 'Erro ao processar arquivo no servidor.');
          return;
        }

        setSuccessMessage(
          `Lote processado com sucesso (${result.data.validRecords} de ${result.data.totalRecords} registros válidos). Redirecionando para revisão...`
        );

        router.push(`/import/${result.data.batchId}`);
      } catch (err) {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'Ocorreu um erro inesperado na leitura ou envio do arquivo.'
        );
      }
    });
  }

  function downloadStandardTemplate() {
    const header = 'Data;Tipo;Ticker;Quantidade;Preço;Taxas;Notas\n';
    const example1 = '15/01/2026;COMPRA;PETR4;100;38,50;4,50;Compra mercado à vista\n';
    const example2 = '20/01/2026;COMPRA;VALE3;50;62,00;0;Compra ordinária\n';
    const blob = new Blob([header + example1 + example2], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'modelo_importacao_carteiraexpert.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="bg-surface border border-border-theme rounded-xl p-6 shadow-sm space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">
          Importação de Operações e Movimentações
        </h2>
        <p className="text-sm text-text-secondary mt-1">
          Envie seu extrato ou arquivo de negociações em formato CSV para consolidação automática e revisão segura.
        </p>
      </div>

      {/* Configurações de Carteira e Formato */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="select-portfolio"
            className="block text-xs font-semibold uppercase tracking-wider text-text-secondary mb-1.5"
          >
            Carteira de Destino <span className="text-accent-danger">*</span>
          </label>
          {activePortfolios.length > 0 ? (
            <select
              id="select-portfolio"
              value={selectedPortfolioId}
              onChange={(e) => setSelectedPortfolioId(e.target.value)}
              disabled={isPending}
              className="w-full bg-background border border-border-theme rounded-lg px-3.5 py-2.5 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-action-primary focus:border-transparent disabled:opacity-50"
            >
              {activePortfolios.map((port) => (
                <option key={port.id} value={port.id}>
                  {port.name} ({port.baseCurrency})
                </option>
              ))}
            </select>
          ) : (
            <div className="text-sm text-accent-danger bg-accent-danger/10 border border-accent-danger/30 rounded-lg p-2.5">
              Nenhuma carteira ativa disponível. Crie ou descongele uma carteira antes de importar.
            </div>
          )}
        </div>

        <div>
          <label
            htmlFor="select-format"
            className="block text-xs font-semibold uppercase tracking-wider text-text-secondary mb-1.5"
          >
            Formato do Arquivo
          </label>
          <select
            id="select-format"
            value={selectedFormat}
            onChange={(e) => setSelectedFormat(e.target.value as any)}
            disabled={isPending}
            className="w-full bg-background border border-border-theme rounded-lg px-3.5 py-2.5 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-action-primary focus:border-transparent disabled:opacity-50"
          >
            <option value="auto">Detecção Automática (Recomendado)</option>
            <option value="carteiraexpert_csv">Padrão CarteiraExpert (CSV delimitado por ; ou ,)</option>
            <option value="b3_trades_csv">B3 — Negociação de Ativos (Extrato Oficial B3)</option>
            <option value="b3_movements_csv">B3 — Movimentação Financeira (Extrato de Custódia)</option>
          </select>
        </div>
      </div>

      {/* Zona de Drop e Seleção de Arquivo */}
      <div
        id="import-drop-zone"
        role="region"
        aria-label="Área de envio de arquivo CSV"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-150 flex flex-col items-center justify-center ${
          isDragging
            ? 'border-action-primary bg-action-primary/5 scale-[1.01]'
            : selectedFile
            ? 'border-accent-success/60 bg-accent-success/5'
            : 'border-border-theme hover:border-action-primary/60 hover:bg-surface-elevated'
        }`}
      >
        <input
          ref={fileInputRef}
          id="file-input-csv"
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={handleInputChange}
          className="hidden"
          aria-label="Selecionar arquivo CSV"
        />

        <div className="w-12 h-12 rounded-full bg-surface-elevated border border-border-theme flex items-center justify-center mb-3">
          {selectedFile ? (
            <svg className="w-6 h-6 text-accent-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className="w-6 h-6 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          )}
        </div>

        {selectedFile ? (
          <div>
            <p className="text-sm font-semibold text-text-primary flex items-center justify-center gap-2">
              <span>{selectedFile.name}</span>
              <span className="text-xs font-mono text-text-muted">
                ({(selectedFile.size / 1024).toFixed(1)} KB)
              </span>
            </p>
            <p className="text-xs text-text-muted mt-1">
              Clique ou arraste outro arquivo para substituir
            </p>
          </div>
        ) : (
          <div>
            <p className="text-sm font-medium text-text-primary">
              Arraste e solte seu arquivo CSV aqui, ou <span className="text-action-primary underline">clique para selecionar</span>
            </p>
            <p className="text-xs text-text-muted mt-1">
              Arquivos .csv até 5 MB • Codificação UTF-8 ou Latin-1
            </p>
          </div>
        )}
      </div>

      {/* Alertas e Mensagens de Feedback */}
      {errorMessage && (
        <div
          id="import-upload-error"
          role="alert"
          className="flex items-start gap-2.5 text-sm text-accent-danger bg-accent-danger/10 border border-accent-danger/30 rounded-lg p-3"
        >
          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>{errorMessage}</div>
        </div>
      )}

      {successMessage && (
        <div
          id="import-upload-success"
          role="status"
          className="flex items-start gap-2.5 text-sm text-accent-success bg-accent-success/10 border border-accent-success/30 rounded-lg p-3"
        >
          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
          <div>{successMessage}</div>
        </div>
      )}

      {/* Ações Inferiores */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-border-theme">
        <button
          id="btn-download-template"
          type="button"
          onClick={downloadStandardTemplate}
          className="text-xs text-text-secondary hover:text-action-primary transition-colors flex items-center gap-1.5 py-1"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Baixar modelo de planilha (.csv)
        </button>

        <button
          id="btn-submit-upload"
          type="button"
          onClick={handleUpload}
          disabled={!selectedFile || isPending || activePortfolios.length === 0}
          className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-action-primary text-action-primary-text font-medium text-sm hover:opacity-95 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isPending ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Analisando arquivo...</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
              <span>Processar e Revisar Lote</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
