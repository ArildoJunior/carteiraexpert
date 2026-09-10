import type { FiiCadastralResolverEngine } from '../domain/cvm-fii-cadastral-resolver';
import type { FiiCadastralResolutionInput } from '../domain/cvm-fii-cadastral-resolver.types';
import { parseCvmFiiMonthlyPackage } from '../domain/cvm-fii-parser';
import type { ParsedFiiMonthlyRecord } from '../domain/cvm-fii-parser.types';
import type {
  FiiCsvEncoding,
  FiiIngestionExecutionMode,
  FiiIngestionPackageInput,
  FiiIngestionPreparationReport,
  PreparedFiiMonthlyRecord,
  PreparedFiiRegistryRecord,
} from './cvm-fii-ingestion.types';

/**
 * Decodifica conteúdo bruto em Buffer ou string com suporte a Latin-1 e UTF-8.
 */
export function decodeCsvContent(
  content: string | Buffer | null | undefined,
  encoding: FiiCsvEncoding = 'latin1'
): string | null {
  if (content === null || content === undefined) return null;
  const raw =
    typeof content === 'string'
      ? content
      : content.toString(encoding === 'latin1' ? 'latin1' : 'utf-8');
  return raw.replace(/^\uFEFF/, '');
}

export interface PrepareFiiMonthlyPackageOptions {
  input: FiiIngestionPackageInput;
  resolverEngine: FiiCadastralResolverEngine;
  executionMode?: FiiIngestionExecutionMode;
}

/**
 * Prepara e orquestra deterministicamente o lote de informes mensais de FII da CVM:
 * 1. Decodifica os CSVs (suporte a Latin-1 / UTF-8).
 * 2. Executa o parser oficial do domínio (cvm-fii-parser).
 * 3. Resolve cadastralmente os CNPJs para os ativos locais correspondentes (assets.id / assets.ticker).
 * 4. Separa os registros contábeis elegíveis dos não correspondidos.
 * 5. Não realiza qualquer escrita ou conexão com o banco de dados (puramente computacional).
 */
export async function prepareFiiMonthlyPackage(
  options: PrepareFiiMonthlyPackageOptions
): Promise<FiiIngestionPreparationReport> {
  const { input, resolverEngine, executionMode = 'PREPARE_ONLY' } = options;
  const encoding = input.encoding ?? 'latin1';

  // 1. Decodificação dos conteúdos de entrada
  const decodedGeral = decodeCsvContent(input.geralContent, encoding);
  if (!decodedGeral) {
    throw new Error('O conteúdo de inf_mensal_fii_geral é obrigatório para a ingestão.');
  }

  const decodedComplemento = decodeCsvContent(input.complementoContent, encoding);
  const decodedAtivoPassivo = decodeCsvContent(input.ativoPassivoContent, encoding);

  // 2. Execução do Parser Puro do Domínio
  const parsedPackage = await parseCvmFiiMonthlyPackage({
    geralCsv: decodedGeral,
    complementoCsv: decodedComplemento,
    ativoPassivoCsv: decodedAtivoPassivo,
    sourceReference: input.sourceReference,
  });

  // 3. Montagem dos insumos para resolução cadastral
  const resolutionInputs: FiiCadastralResolutionInput[] = parsedPackage.registryRecords.map(
    (r) => ({
      cnpj: r.cnpj,
      legalName: r.legalName,
      isin: r.isin,
    })
  );

  // 4. Execução do Motor de Resolução Cadastral
  const cadastralReport = resolverEngine.resolveBatch(resolutionInputs);

  // 5. Mapeamento dos Registros Cadastrais Elegíveis (para cvm_fii_registry)
  const registryByCnpj = new Map(parsedPackage.registryRecords.map((r) => [r.cnpj, r]));
  const eligibleRegistryRecords: PreparedFiiRegistryRecord[] = [];

  for (const matched of cadastralReport.results) {
    if (matched.status === 'MATCHED' && matched.matchedAssetId && matched.matchedTicker) {
      const originalRegistry = registryByCnpj.get(matched.cnpj);
      eligibleRegistryRecords.push({
        assetId: matched.matchedAssetId,
        cnpj: matched.cnpj,
        legalName: matched.legalName,
        ticker: matched.matchedTicker,
        isin: matched.isin,
        source: 'cvm',
        sourceUpdatedAt: originalRegistry?.sourceUpdatedAt ?? null,
      });
    }
  }

  // 6. Mapeamento dos Registros Contábeis Elegíveis e Não Correspondidos
  const eligibleMonthlyRecords: PreparedFiiMonthlyRecord[] = [];
  const unmatchedMonthlyRecords: ParsedFiiMonthlyRecord[] = [];
  const uniqueAssetsMatched = new Set<string>();

  for (const monthly of parsedPackage.monthlyRecords) {
    const matched = cadastralReport.matchedMap.get(monthly.cnpj);

    if (matched && matched.status === 'MATCHED' && matched.matchedAssetId) {
      uniqueAssetsMatched.add(matched.matchedAssetId);
      eligibleMonthlyRecords.push({
        assetId: matched.matchedAssetId,
        referenceDate: monthly.referenceDate,
        filingDate: monthly.filingDate,
        version: monthly.version,
        source: monthly.source,
        sourceReference: monthly.sourceReference,
        netAssetValue: monthly.netAssetValue,
        quotaEquityValue: monthly.quotaEquityValue,
        issuedQuotas: monthly.issuedQuotas,
        totalAssets: monthly.totalAssets,
        totalLiabilities: monthly.totalLiabilities,
        cashEquivalents: monthly.cashEquivalents,
        dividendDeclaredPerQuota: monthly.dividendDeclaredPerQuota,
        investorsCount: monthly.investorsCount,
        individualInvestorsCount: monthly.individualInvestorsCount,
      });
    } else {
      unmatchedMonthlyRecords.push(monthly);
    }
  }

  // 7. Consolidação do Relatório Final de Preparação
  return {
    sourceReference: input.sourceReference,
    executionMode,
    parserMetrics: parsedPackage.metrics,
    cadastralReport,
    eligibleRegistryRecords,
    eligibleMonthlyRecords,
    unmatchedMonthlyRecords,
    summary: {
      totalMonthlyRecordsParsed: parsedPackage.monthlyRecords.length,
      eligibleMonthlyRecordsCount: eligibleMonthlyRecords.length,
      unmatchedMonthlyRecordsCount: unmatchedMonthlyRecords.length,
      uniqueAssetsMatched: uniqueAssetsMatched.size,
    },
  };
}
