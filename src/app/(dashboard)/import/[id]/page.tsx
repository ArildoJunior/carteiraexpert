import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/modules/identity/server/current-user';
import { hasAcceptedCurrentTerms } from '@/modules/identity/server/consent-service';
import { getImportBatchById } from '@/modules/imports/server/import.service';
import {
  serializeImportBatch,
  serializeImportBatchItem,
} from '@/modules/imports/domain/import-utils';
import { ImportBatchReviewView } from '@/modules/imports/ui/ImportBatchReviewView';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ImportBatchDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: ImportBatchDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) {
    return { title: 'Lote de Importação — CarteiraExpert' };
  }

  const user = await getCurrentUser();
  if (!user) return { title: 'Importações — CarteiraExpert' };

  try {
    const { batch } = await getImportBatchById(id, user);
    return {
      title: `Revisão: ${batch.fileName} — CarteiraExpert`,
      description: `Revisão e confirmação do lote de importação ${batch.fileName}.`,
    };
  } catch {
    return { title: 'Lote de Importação — CarteiraExpert' };
  }
}

export default async function ImportBatchDetailPage({
  params,
}: ImportBatchDetailPageProps) {
  const { id } = await params;

  if (!id || !UUID_REGEX.test(id)) {
    notFound();
  }

  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const hasConsent = await hasAcceptedCurrentTerms(user.id);
  if (!hasConsent) redirect('/terms-acceptance');

  let batchData;
  try {
    batchData = await getImportBatchById(id, user);
  } catch {
    notFound();
  }

  const serializedBatch = serializeImportBatch(batchData.batch);
  const serializedItems = batchData.items.map((item) =>
    serializeImportBatchItem(item)
  );

  return (
    <ImportBatchReviewView
      key={`${serializedBatch.id}-${serializedBatch.validRecords}-${serializedBatch.warningRecords}-${serializedBatch.status}-${serializedBatch.updatedAt}`}
      batch={serializedBatch}
      items={serializedItems}
    />
  );
}
