import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/modules/identity/server/current-user';
import { hasAcceptedCurrentTerms } from '@/modules/identity/server/consent-service';
import { listPortfolios } from '@/modules/portfolio/server/portfolio.service';
import { listImportBatches } from '@/modules/imports/server/import.service';
import { serializeImportBatch } from '@/modules/imports/domain/import-utils';
import { ImportUploadZone, type PortfolioOption } from '@/modules/imports/ui/ImportUploadZone';
import { ImportHistoryView } from '@/modules/imports/ui/ImportHistoryView';

export const metadata: Metadata = {
  title: 'Importações de Operações — CarteiraExpert',
  description: 'Importe operações e movimentações a partir de planilhas CSV e extratos da B3.',
};

export default async function ImportPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const hasConsent = await hasAcceptedCurrentTerms(user.id);
  if (!hasConsent) redirect('/terms-acceptance');

  const [rawPortfolios, rawBatches] = await Promise.all([
    listPortfolios(user),
    listImportBatches(user),
  ]);

  const portfolios: PortfolioOption[] = rawPortfolios.map((p) => ({
    id: p.id,
    name: p.name,
    baseCurrency: p.baseCurrency,
    status: p.status as 'active' | 'frozen' | 'archived',
  }));

  const serializedBatches = rawBatches.map((b) => serializeImportBatch(b));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Importação de Operações
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Envie seus extratos de negociações ou movimentações da B3 e planilhas CSV com revisão segura antes da confirmação patrimonial.
        </p>
      </div>

      <ImportUploadZone portfolios={portfolios} />

      <ImportHistoryView batches={serializedBatches} />
    </div>
  );
}
