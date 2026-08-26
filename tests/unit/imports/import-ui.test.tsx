/**
 * @vitest-environment jsdom
 */
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ImportUploadZone } from '@/modules/imports/ui/ImportUploadZone';
import { ImportBatchReviewView } from '@/modules/imports/ui/ImportBatchReviewView';
import { ImportHistoryView } from '@/modules/imports/ui/ImportHistoryView';
import { DashboardNavbar } from '@/app/(dashboard)/DashboardNavbar';
import { ThemeProvider } from '@/lib/theme/ThemeContext';
import type { SerializedImportBatch, SerializedImportBatchItem } from '@/modules/imports/domain/import.types';
import type { SafeUser } from '@/modules/identity/domain/user.types';

// Mock de next/navigation e next/link
const mockPush = vi.fn();
const mockRefresh = vi.fn();
let currentPathname = '/import';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
  usePathname: () => currentPathname,
}));

vi.mock('next/link', () => ({
  default: ({ children, href, id, className, onClick }: any) => (
    <a href={href} id={id} className={className} onClick={onClick}>
      {children}
    </a>
  ),
}));

// Mock de Server Actions de imports
vi.mock('@/modules/imports/server/import.actions', () => ({
  processImportUploadAction: vi.fn().mockResolvedValue({
    success: true,
    data: { batchId: 'batch-123', validRecords: 5, totalRecords: 5 },
  }),
  toggleImportBatchItemExclusionAction: vi.fn().mockResolvedValue({
    success: true,
    data: { isExcluded: true },
  }),
  updateImportBatchItemAction: vi.fn().mockResolvedValue({
    success: true,
    data: { success: true },
  }),
  resolveUnmappedBatchItemAssetAction: vi.fn().mockResolvedValue({
    success: true,
    data: { success: true },
  }),
  confirmImportBatchAction: vi.fn().mockResolvedValue({
    success: true,
    data: {
      batch: { id: 'batch-123', status: 'confirmed' },
      importedEventsCount: 5,
    },
  }),
  rejectImportBatchAction: vi.fn().mockResolvedValue({
    success: true,
    data: { batch: { id: 'batch-123', status: 'rejected' } },
  }),
}));

describe('Importações — Testes Unitários de Interface (jsdom)', () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  const mockUser: SafeUser = {
    id: 'user-1',
    name: 'Investidor Teste',
    email: 'investidor@teste.com',
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  const mockPortfolios = [
    { id: 'port-1', name: 'Carteira Principal', baseCurrency: 'BRL', status: 'active' as const },
    { id: 'port-2', name: 'Carteira Internacional', baseCurrency: 'USD', status: 'active' as const },
  ];

  const mockBatch: SerializedImportBatch = {
    id: 'batch-1',
    userId: 'user-1',
    portfolioId: 'port-1',
    portfolioName: 'Carteira Principal',
    fileName: 'operacoes_b3_teste.csv',
    fileSize: 1024,
    fileFormat: 'b3_trades_csv',
    status: 'pending_review',
    totalRecords: 3,
    validRecords: 1,
    warningRecords: 1,
    errorRecords: 1,
    rawContentHash: 'hash123',
    errorMessage: null,
    confirmedAt: null,
    createdAt: '2026-01-15T12:00:00.000Z',
    updatedAt: '2026-01-15T12:00:00.000Z',
  };

  const mockItems: SerializedImportBatchItem[] = [
    {
      id: 'item-1',
      batchId: 'batch-1',
      lineNumber: 1,
      rawLine: '...',
      status: 'valid',
      actionType: 'BUY',
      direction: null,
      rawTicker: 'PETR4',
      resolvedAssetId: 'asset-petr4',
      resolvedAssetTicker: 'PETR4',
      resolvedAssetName: 'Petrobras PN',
      tradeDate: '2026-01-10T12:00:00.000Z',
      settlementDate: null,
      quantity: '100',
      unitPrice: '38.50',
      fees: '4.50',
      currency: 'BRL',
      notes: 'Compra normal',
      validationErrors: [],
      isDuplicate: false,
      duplicateReason: null,
      isExcluded: false,
      importedPortfolioEventId: null,
      createdAt: '2026-01-15T12:00:00.000Z',
      updatedAt: '2026-01-15T12:00:00.000Z',
    },
    {
      id: 'item-2',
      batchId: 'batch-1',
      lineNumber: 2,
      rawLine: '...',
      status: 'warning',
      actionType: 'BUY',
      direction: null,
      rawTicker: 'NOVOTICKER3',
      resolvedAssetId: null,
      resolvedAssetTicker: null,
      resolvedAssetName: null,
      tradeDate: '2026-01-11T12:00:00.000Z',
      settlementDate: null,
      quantity: '50',
      unitPrice: '20.00',
      fees: '0',
      currency: 'BRL',
      notes: null,
      validationErrors: ['Ativo não identificado no catálogo.'],
      isDuplicate: false,
      duplicateReason: null,
      isExcluded: false,
      importedPortfolioEventId: null,
      createdAt: '2026-01-15T12:00:00.000Z',
      updatedAt: '2026-01-15T12:00:00.000Z',
    },
    {
      id: 'item-3',
      batchId: 'batch-1',
      lineNumber: 3,
      rawLine: '...',
      status: 'error',
      actionType: 'SELL',
      direction: null,
      rawTicker: 'VALE3',
      resolvedAssetId: 'asset-vale3',
      resolvedAssetTicker: 'VALE3',
      resolvedAssetName: 'Vale ON',
      tradeDate: '2026-01-12T12:00:00.000Z',
      settlementDate: null,
      quantity: '0',
      unitPrice: '-10.00',
      fees: '0',
      currency: 'BRL',
      notes: null,
      validationErrors: ['Quantidade deve ser positiva.', 'Preço não pode ser negativo.'],
      isDuplicate: false,
      duplicateReason: null,
      isExcluded: false,
      importedPortfolioEventId: null,
      createdAt: '2026-01-15T12:00:00.000Z',
      updatedAt: '2026-01-15T12:00:00.000Z',
    },
  ];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (root && container) {
      const curRoot = root;
      act(() => {
        curRoot.unmount();
      });
      container.remove();
    }
    container = null;
    root = null;
  });

  describe('ImportUploadZone', () => {
    it('deve renderizar dropdown de carteiras ativas e formatos suportados', async () => {
      await act(async () => {
        root!.render(<ImportUploadZone portfolios={mockPortfolios} />);
      });

      const selectPort = container!.querySelector('#select-portfolio') as HTMLSelectElement;
      expect(selectPort).not.toBeNull();
      expect(selectPort.options.length).toBe(2);
      expect(selectPort.options[0].text).toContain('Carteira Principal');

      const selectFormat = container!.querySelector('#select-format') as HTMLSelectElement;
      expect(selectFormat).not.toBeNull();
      expect(selectFormat.options.length).toBe(4);

      const dropZone = container!.querySelector('#import-drop-zone');
      expect(dropZone).not.toBeNull();
      expect(dropZone?.getAttribute('role')).toBe('region');
    });

    it('deve rejeitar client-side arquivo não .csv e exibir mensagem de erro clara', async () => {
      await act(async () => {
        root!.render(<ImportUploadZone portfolios={mockPortfolios} />);
      });

      const fileInput = container!.querySelector('#file-input-csv') as HTMLInputElement;
      const invalidFile = new File(['conteudo dummy'], 'extrato.pdf', { type: 'application/pdf' });

      await act(async () => {
        Object.defineProperty(fileInput, 'files', {
          value: [invalidFile],
          writable: false,
        });
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      });

      const errorAlert = container!.querySelector('#import-upload-error');
      expect(errorAlert).not.toBeNull();
      expect(errorAlert?.textContent).toContain('Formato não suportado');
    });

    it('deve rejeitar client-side arquivo vazio (0 bytes)', async () => {
      await act(async () => {
        root!.render(<ImportUploadZone portfolios={mockPortfolios} />);
      });

      const fileInput = container!.querySelector('#file-input-csv') as HTMLInputElement;
      const emptyFile = new File([], 'vazio.csv', { type: 'text/csv' });

      await act(async () => {
        Object.defineProperty(fileInput, 'files', {
          value: [emptyFile],
          writable: false,
        });
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      });

      const errorAlert = container!.querySelector('#import-upload-error');
      expect(errorAlert).not.toBeNull();
      expect(errorAlert?.textContent).toContain('está vazio');
    });

    it('deve rejeitar client-side arquivo que exceda 5 MB', async () => {
      await act(async () => {
        root!.render(<ImportUploadZone portfolios={mockPortfolios} />);
      });

      const fileInput = container!.querySelector('#file-input-csv') as HTMLInputElement;
      // Cria um File mock com tamanho superior a 5 MB
      const largeFile = new File(['dummy'], 'pesado.csv', { type: 'text/csv' });
      Object.defineProperty(largeFile, 'size', {
        value: 5 * 1024 * 1024 + 1,
      });

      await act(async () => {
        Object.defineProperty(fileInput, 'files', {
          value: [largeFile],
          writable: false,
        });
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      });

      const errorAlert = container!.querySelector('#import-upload-error');
      expect(errorAlert).not.toBeNull();
      expect(errorAlert?.textContent).toContain('excede o limite máximo permitido de 5 MB');
    });

    it('deve possuir botão funcional para download do modelo de planilha CSV', async () => {
      await act(async () => {
        root!.render(<ImportUploadZone portfolios={mockPortfolios} />);
      });

      const downloadBtn = container!.querySelector('#btn-download-template') as HTMLButtonElement;
      expect(downloadBtn).not.toBeNull();
      expect(downloadBtn.textContent).toContain('Baixar modelo de planilha');
    });
  });

  describe('ImportBatchReviewView', () => {
    it('deve renderizar KPIs de resumo com total, válidos, alertas e erros', async () => {
      await act(async () => {
        root!.render(<ImportBatchReviewView batch={mockBatch} items={mockItems} />);
      });

      expect(container!.querySelector('#kpi-total-records')?.textContent).toBe('3');
      expect(container!.querySelector('#kpi-valid-records')?.textContent).toBe('1');
      expect(container!.querySelector('#kpi-warning-records')?.textContent).toBe('1');
      expect(container!.querySelector('#kpi-error-records')?.textContent).toBe('1');
      expect(container!.querySelector('#batch-status-badge')?.textContent).toContain('Pendente de Revisão');
    });

    it('deve filtrar itens pelas abas de filtro corretamente', async () => {
      await act(async () => {
        root!.render(<ImportBatchReviewView batch={mockBatch} items={mockItems} />);
      });

      // Aba Todos: 3 itens
      expect(container!.querySelectorAll('tbody tr').length).toBe(3);

      // Clica na aba Válidos
      const validTab = container!.querySelector('#tab-filter-valid') as HTMLButtonElement;
      await act(async () => {
        validTab.click();
      });
      expect(container!.querySelectorAll('tbody tr').length).toBe(1);
      expect(container!.textContent).toContain('PETR4');

      // Clica na aba Erros
      const errorTab = container!.querySelector('#tab-filter-error') as HTMLButtonElement;
      await act(async () => {
        errorTab.click();
      });
      expect(container!.querySelectorAll('tbody tr').length).toBe(1);
      expect(container!.textContent).toContain('VALE3');
    });

    it('deve desabilitar botão de confirmação quando houver erros ou alertas não resolvidos', async () => {
      await act(async () => {
        root!.render(<ImportBatchReviewView batch={mockBatch} items={mockItems} />);
      });

      const confirmBtn = container!.querySelector('#btn-open-confirm-modal') as HTMLButtonElement;
      expect(confirmBtn.disabled).toBe(true);
    });

    it('deve abrir modal de resolução de ativo ao clicar em Resolver Ativo', async () => {
      await act(async () => {
        root!.render(<ImportBatchReviewView batch={mockBatch} items={mockItems} />);
      });

      const resolveBtn = container!.querySelector('#btn-resolve-item-2') as HTMLButtonElement;
      expect(resolveBtn).not.toBeNull();

      await act(async () => {
        resolveBtn.click();
      });

      const modal = container!.querySelector('#resolve-asset-modal');
      expect(modal).not.toBeNull();
      expect(modal?.textContent).toContain('Resolver Ativo Não Identificado');
      expect(modal?.textContent).toContain('NOVOTICKER3');
    });

    it('deve atualizar KPIs ao resolver ativo customizado no modal', async () => {
      await act(async () => {
        root!.render(<ImportBatchReviewView batch={mockBatch} items={mockItems} />);
      });

      expect(container!.querySelector('#kpi-valid-records')?.textContent).toBe('1');
      expect(container!.querySelector('#kpi-warning-records')?.textContent).toBe('1');

      const resolveBtn = container!.querySelector('#btn-resolve-item-2') as HTMLButtonElement;
      await act(async () => {
        resolveBtn.click();
      });

      const customTab = container!.querySelector('#btn-tab-custom-asset') as HTMLButtonElement;
      await act(async () => {
        customTab.click();
      });

      const confirmResolveBtn = container!.querySelector('#btn-confirm-resolve') as HTMLButtonElement;
      await act(async () => {
        confirmResolveBtn.click();
      });

      expect(container!.querySelector('#kpi-valid-records')?.textContent).toBe('2');
      expect(container!.querySelector('#kpi-warning-records')?.textContent).toBe('0');
    });

    it('deve abrir modal de edição ao clicar em Editar', async () => {
      await act(async () => {
        root!.render(<ImportBatchReviewView batch={mockBatch} items={mockItems} />);
      });

      const editBtn = container!.querySelector('#btn-edit-item-1') as HTMLButtonElement;
      expect(editBtn).not.toBeNull();

      await act(async () => {
        editBtn.click();
      });

      const editModal = container!.querySelector('#edit-item-modal');
      expect(editModal).not.toBeNull();
      expect(editModal?.textContent).toContain('Editar Registro de Importação');
    });

    it('não deve exibir botões de edição quando o lote estiver confirmado', async () => {
      const confirmedBatch: SerializedImportBatch = {
        ...mockBatch,
        status: 'confirmed',
        confirmedAt: '2026-01-16T12:00:00.000Z',
      };

      await act(async () => {
        root!.render(<ImportBatchReviewView batch={confirmedBatch} items={mockItems} />);
      });

      expect(container!.querySelector('#btn-open-confirm-modal')).toBeNull();
      expect(container!.querySelector('#btn-edit-item-1')).toBeNull();
      expect(container!.querySelector('#btn-resolve-item-2')).toBeNull();
      expect(container!.querySelector('#btn-view-portfolio-confirmed')).not.toBeNull();
    });
  });

  describe('ImportHistoryView', () => {
    it('deve exibir mensagem de estado vazio quando não houver lotes', async () => {
      await act(async () => {
        root!.render(<ImportHistoryView batches={[]} />);
      });

      expect(container!.textContent).toContain('Nenhum lote de importação encontrado');
    });

    it('deve renderizar tabela de lotes com links de revisão', async () => {
      await act(async () => {
        root!.render(<ImportHistoryView batches={[mockBatch]} />);
      });

      const row = container!.querySelector('#batch-history-row-batch-1');
      expect(row).not.toBeNull();
      expect(row?.textContent).toContain('operacoes_b3_teste.csv');
      expect(row?.textContent).toContain('Carteira Principal');

      const actionLink = container!.querySelector('#btn-open-batch-batch-1') as HTMLAnchorElement;
      expect(actionLink).not.toBeNull();
      expect(actionLink.getAttribute('href')).toBe('/import/batch-1');
    });
  });

  describe('DashboardNavbar — Navegação Integrada de Importações', () => {
    it('deve renderizar link "Importações" na barra desktop e no menu mobile', async () => {
      currentPathname = '/import';

      await act(async () => {
        root!.render(
          <ThemeProvider defaultTheme="light">
            <DashboardNavbar user={mockUser} />
          </ThemeProvider>
        );
      });

      const navLink = container!.querySelector('#nav-link-import') as HTMLAnchorElement;
      expect(navLink).not.toBeNull();
      expect(navLink.getAttribute('href')).toBe('/import');
      expect(navLink.textContent).toBe('Importações');

      // Abre menu mobile
      const mobileToggle = container!.querySelector('#btn-dashboard-mobile-menu-toggle') as HTMLButtonElement;
      await act(async () => {
        mobileToggle.click();
      });

      const mobileNavLink = container!.querySelector('#mobile-nav-link-import') as HTMLAnchorElement;
      expect(mobileNavLink).not.toBeNull();
      expect(mobileNavLink.getAttribute('href')).toBe('/import');
    });
  });
});
