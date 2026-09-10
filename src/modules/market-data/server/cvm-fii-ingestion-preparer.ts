import type { FiiCadastralResolverEngine } from '../domain/cvm-fii-cadastral-resolver';
import type { FiiCadastralResolutionInput } from '../domain/cvm-fii-cadastral-resolver.types';
import { parseCvmFiiMonthlyPackage } from '../domain/cvm-fii-parser';
import type { ParsedFiiMonthlyRecord } from '../domain/cvm-fii-parser.types';
import type {
  FiiCsvEncoding,
  FiiIngestionExecutionMode,
  FiiIngestionPackageInput,
  FiiIngestionPreparationReport,
  PreparedFiiBindingRecord,
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
 * 1. Decodifica os CSVs (suporte a Latin-1 / UTF-8 com remoção de BOM).
 * 2. Executa o parser oficial do domínio (cvm-fii-parser).
 * 3. Separa três coleções puras e desacopladas:
 *    - Entidades CVM (cvm_fii_registry): 100% dos fundos preservados por CNPJ, sem dependência de assetId.
 *    - Fundamentos Mensais (fii_monthly_fundamentals): identificados por entidade CVM (fiiRegistryCnpj), competência e versão.
 *    - Propostas de Vínculo B3 (cvm_fii_bindings): propostas auditáveis com status APPROVED, PENDING_REVIEW ou AMBIGUOUS.
 * 4. Não realiza qualquer escrita ou conexão com o banco de dados (puramente computacional e em memória).
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

  // 4. Execução do Motor de Resolução Cadastral com Detecção de Colisão
  const cadastralReport = resolverEngine.resolveBatch(resolutionInputs);

  // 5. Coleção 1: Entidades Regulatórias CVM (cvm_fii_registry)
  // Preserva 100% dos fundos CVM identificados por CNPJ, com ou sem ativo B3
  const preparedRegistryRecords: PreparedFiiRegistryRecord[] = parsedPackage.registryRecords.map(
    (reg) => ({
      cnpj: reg.cnpj,
      legalName: reg.legalName,
      tradeName: null,
      ticker: reg.ticker ?? null,
      isin: reg.isin ?? null,
      source: 'cvm',
      sourceUpdatedAt: reg.sourceUpdatedAt ?? null,
    })
  );

  // 6. Coleção 2: Fundamentos Mensais CVM (fii_monthly_fundamentals)
  // Identificados unicamente pelo CNPJ do fundo CVM (fiiRegistryCnpj), competência e versão.
  // Nenhum dado contábil é sobrescrito ou misturado entre veículos distintos.
  const preparedMonthlyRecords: PreparedFiiMonthlyRecord[] = parsedPackage.monthlyRecords.map(
    (monthly) => ({
      fiiRegistryCnpj: monthly.cnpj,
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
    })
  );

  // 7. Coleção 3: Propostas de Vínculo com Ativos B3 (cvm_fii_bindings)
  // Inclui APPROVED (máx 1 por ativo), PENDING_REVIEW e AMBIGUOUS para auditoria
  const preparedBindingRecords: PreparedFiiBindingRecord[] = cadastralReport.bindingProposals.map(
    (prop) => ({
      fiiRegistryCnpj: prop.fiiRegistryCnpj,
      assetId: prop.assetId,
      ticker: prop.matchedTicker,
      bindingStatus: prop.bindingStatus,
      bindingMethod: prop.bindingMethod,
      confidenceLevel: prop.confidenceLevel,
      justification: prop.justification,
      source: 'cvm',
    })
  );

  // Identifica demonstrações de fundos não associados a nenhum ativo B3 (para métricas e relatórios)
  const unmatchedMonthlyRecords: ParsedFiiMonthlyRecord[] = [];
  const matchedAssetsSet = new Set<string>();

  for (const monthly of parsedPackage.monthlyRecords) {
    const matched = cadastralReport.matchedMap.get(monthly.cnpj);
    if (!matched || matched.status !== 'MATCHED' || !matched.matchedAssetId) {
      unmatchedMonthlyRecords.push(monthly);
    } else {
      matchedAssetsSet.add(matched.matchedAssetId);
    }
  }

  // 8. Consolidação do Relatório Final de Preparação
  return {
    sourceReference: input.sourceReference,
    executionMode,
    parserMetrics: parsedPackage.metrics,
    cadastralReport,
    preparedRegistryRecords,
    preparedMonthlyRecords,
    preparedBindingRecords,
    unmatchedMonthlyRecords,
    summary: {
      totalMonthlyRecordsParsed: parsedPackage.monthlyRecords.length,
      totalRegistryRecordsPrepared: preparedRegistryRecords.length,
      totalMonthlyRecordsPrepared: preparedMonthlyRecords.length,
      totalBindingProposals: preparedBindingRecords.length,
      approvedBindingsCount: cadastralReport.approvedBindingsCount,
      pendingReviewBindingsCount: cadastralReport.pendingReviewBindingsCount,
      ambiguousBindingsCount: cadastralReport.ambiguousBindingsCount,
      unmatchedFundsCount: cadastralReport.unmatchedCount,
      uniqueAssetsMatched: matchedAssetsSet.size,
      eligibleMonthlyRecordsCount: preparedMonthlyRecords.length - unmatchedMonthlyRecords.length,
      unmatchedMonthlyRecordsCount: unmatchedMonthlyRecords.length,
    },
    // Retrocompatibilidade
    eligibleRegistryRecords: preparedRegistryRecords,
    eligibleMonthlyRecords: preparedMonthlyRecords,
  };
}
