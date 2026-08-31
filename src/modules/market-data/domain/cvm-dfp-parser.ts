import { Decimal } from '@/lib/decimal';
import { cvmSourceReferenceSchema } from './cvm.schema';
import { validateAndNormalizeCnpj, validateAndNormalizeCvmCode } from './cvm-cad-parser';
import {
  CvmCorruptedDataError,
  CvmIncompatibleStreamContextError,
  CvmInvalidContextError,
  CvmInvalidHeaderError,
  CvmInvalidIdentifierError,
  CvmInvalidScaleError,
  type CvmAggregatedStatement,
  type CvmCadCompany,
  type CvmDfpMetrics,
  type CvmParserContext,
  type CvmStatementPhysicalType,
} from './cvm-parser.types';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validação prévia estrita do contexto de execução obrigatório do pacote ZIP DFP.
 * Rejeita inicialização sem fileId (UUID), sourceFileType ('DFP_ZIP'), referenceYear, runId ou parserVersion válidos.
 */
export function validateCvmParserContext(context: CvmParserContext): void {
  if (!context) {
    throw new CvmInvalidContextError('Contexto de execução CVM é obrigatório.');
  }
  if (!context.fileId || !UUID_REGEX.test(context.fileId)) {
    throw new CvmInvalidContextError(
      `fileId inválido no contexto de execução: "${context.fileId}" (deve ser um UUID válido do ZIP pai).`
    );
  }
  if (context.sourceFileType !== 'DFP_ZIP') {
    throw new CvmInvalidContextError(
      `sourceFileType inválido: "${context.sourceFileType}". O parser exige estritamente "DFP_ZIP" representando o pacote anual pai.`
    );
  }
  if (
    typeof context.referenceYear !== 'number' ||
    !Number.isInteger(context.referenceYear) ||
    context.referenceYear < 1900 ||
    context.referenceYear > 2100
  ) {
    throw new CvmInvalidContextError(
      `referenceYear inválido no contexto: "${context.referenceYear}" (deve ser um ano inteiro entre 1900 e 2100).`
    );
  }
  if (!context.runId || !UUID_REGEX.test(context.runId)) {
    throw new CvmInvalidContextError(
      `runId inválido no contexto de execução: "${context.runId}" (deve ser um UUID válido).`
    );
  }
  if (!context.parserVersion || context.parserVersion.trim().length === 0) {
    throw new CvmInvalidContextError('parserVersion é obrigatório e não pode ser vazio.');
  }
}

/**
 * Validação de compatibilidade integral entre o contexto do agregador e o contexto de um stream filho.
 * Rejeita qualquer divergência em fileId, sourceFileType, referenceYear, runId ou parserVersion.
 */
export function assertStreamContextCompatibility(
  parentContext: CvmParserContext,
  streamContext: CvmParserContext
): void {
  validateCvmParserContext(parentContext);
  validateCvmParserContext(streamContext);

  if (parentContext.fileId !== streamContext.fileId) {
    throw new CvmIncompatibleStreamContextError(
      `Incompatibilidade de contexto: fileId do stream ("${streamContext.fileId}") diverge do fileId pai ("${parentContext.fileId}").`
    );
  }
  if (parentContext.sourceFileType !== streamContext.sourceFileType) {
    throw new CvmIncompatibleStreamContextError(
      `Incompatibilidade de contexto: sourceFileType do stream ("${streamContext.sourceFileType}") diverge do pai ("${parentContext.sourceFileType}").`
    );
  }
  if (parentContext.referenceYear !== streamContext.referenceYear) {
    throw new CvmIncompatibleStreamContextError(
      `Incompatibilidade de contexto: referenceYear do stream (${streamContext.referenceYear}) diverge do pai (${parentContext.referenceYear}).`
    );
  }
  if (parentContext.runId !== streamContext.runId) {
    throw new CvmIncompatibleStreamContextError(
      `Incompatibilidade de contexto: runId do stream ("${streamContext.runId}") diverge do runId pai ("${parentContext.runId}").`
    );
  }
  if (parentContext.parserVersion !== streamContext.parserVersion) {
    throw new CvmIncompatibleStreamContextError(
      `Incompatibilidade de contexto: parserVersion do stream ("${streamContext.parserVersion}") diverge do pai ("${parentContext.parserVersion}").`
    );
  }
}

export interface ParsedCvmStatementRow {
  cnpj: string;
  cvmCode: string;
  referenceDate: string; // 'YYYY-MM-DD'
  version: number;
  companyLegalName: string;
  physicalType: CvmStatementPhysicalType;
  accountCode: string;
  accountDescription: string;
  accountValue: Decimal;
}

/**
 * Parser de stream linha a linha para arquivos físicos de demonstrações (BPA_con, BPP_con, DRE_con).
 */
export async function* parseCvmStatementStream(
  lineStream: AsyncIterable<string>,
  physicalType: CvmStatementPhysicalType,
  metrics: CvmDfpMetrics
): AsyncGenerator<ParsedCvmStatementRow, void, unknown> {
  let headerIndices: {
    cnpjIdx: number;
    cvmCodeIdx: number;
    refDateIdx: number;
    versionIdx: number;
    companyNameIdx: number;
    scaleIdx: number;
    orderIdx: number;
    accCodeIdx: number;
    accDescIdx: number;
    accValIdx: number;
  } | null = null;

  for await (const rawLine of lineStream) {
    metrics.totalLinesRead++;
    const line = rawLine.replace(/[\r\n]/g, '').trim();
    if (!line) continue;

    const parts = line.split(';').map((p) => p.trim());

    // 1. Processamento do Cabeçalho
    if (!headerIndices) {
      const upperParts = parts.map((p) => p.toUpperCase());
      const cnpjIdx = upperParts.indexOf('CNPJ_CIA');
      const cvmCodeIdx = upperParts.indexOf('CD_CVM');
      const refDateIdx = upperParts.indexOf('DT_REFER');
      const versionIdx = upperParts.indexOf('VERSAO');
      const companyNameIdx = upperParts.indexOf('DENOM_CIA');
      const scaleIdx = upperParts.indexOf('ESCALA_MOEDA');
      const orderIdx = upperParts.indexOf('ORDEM_EXERC');
      const accCodeIdx = upperParts.indexOf('CD_CONTA');
      const accDescIdx = upperParts.indexOf('DS_CONTA');
      const accValIdx = upperParts.indexOf('VL_CONTA');

      if (
        cnpjIdx === -1 ||
        cvmCodeIdx === -1 ||
        refDateIdx === -1 ||
        versionIdx === -1 ||
        orderIdx === -1 ||
        accCodeIdx === -1 ||
        accValIdx === -1
      ) {
        throw new CvmInvalidHeaderError(
          `Cabeçalho inválido para demonstrativo ${physicalType}: colunas obrigatórias ausentes.`
        );
      }

      headerIndices = {
        cnpjIdx,
        cvmCodeIdx,
        refDateIdx,
        versionIdx,
        companyNameIdx,
        scaleIdx,
        orderIdx,
        accCodeIdx,
        accDescIdx,
        accValIdx,
      };
      continue;
    }

    // 2. Filtro estrito de ORDEM_EXERC = 'ÚLTIMO'
    const orderExerc = parts[headerIndices.orderIdx]?.toUpperCase();
    if (orderExerc !== 'ÚLTIMO') {
      metrics.skippedPenultimoLines++;
      continue;
    }

    // 3. Validação e Normalização de Campos
    try {
      const cnpj = validateAndNormalizeCnpj(parts[headerIndices.cnpjIdx]);
      const cvmCode = validateAndNormalizeCvmCode(parts[headerIndices.cvmCodeIdx]);
      const referenceDate = parts[headerIndices.refDateIdx];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) {
        metrics.corruptedLinesCount++;
        continue;
      }

      const versionRaw = parts[headerIndices.versionIdx];
      const version = parseInt(versionRaw, 10);
      if (Number.isNaN(version) || version < 1) {
        metrics.corruptedLinesCount++;
        continue;
      }

      const companyLegalName =
        headerIndices.companyNameIdx >= 0 ? parts[headerIndices.companyNameIdx] : 'COMPANHIA CVM';
      const accountCode = parts[headerIndices.accCodeIdx];
      const accountDescription =
        headerIndices.accDescIdx >= 0 ? parts[headerIndices.accDescIdx] : '';

      const scale = headerIndices.scaleIdx >= 0 ? parts[headerIndices.scaleIdx]?.toUpperCase() : 'UNIDADE';
      const valRaw = parts[headerIndices.accValIdx];

      if (!valRaw || !/^-?\d+(\.\d+)?$/.test(valRaw)) {
        metrics.corruptedLinesCount++;
        continue;
      }

      // 4. Conversão Numérica Pura com Decimal (sem coerção para number)
      const rawDecimal = new Decimal(valRaw);
      let accountValue: Decimal;

      if (scale === 'MIL') {
        accountValue = rawDecimal.mul(1000);
      } else if (scale === 'UNIDADE') {
        accountValue = rawDecimal;
      } else {
        metrics.invalidScaleLines++;
        continue;
      }

      metrics.relevantLinesProcessed++;

      yield {
        cnpj,
        cvmCode,
        referenceDate,
        version,
        companyLegalName,
        physicalType,
        accountCode,
        accountDescription,
        accountValue,
      };
    } catch {
      metrics.corruptedLinesCount++;
    }
  }
}

/**
 * Agregador contábil em streaming que consolida BPA_con, BPP_con e DRE_con.
 * Aplica chave canônica tripartite (CNPJ + CD_CVM + DT_REFER), precedência determinística de maior VERSAO,
 * detecção de conflitos em duplicidades e rejeita demonstrativos incompletos.
 */
export class CvmDfpAggregator {
  private readonly context: CvmParserContext;
  private readonly eligibleCompanies: Map<string, CvmCadCompany> | null;
  private readonly metrics: CvmDfpMetrics;

  // Rastreia a maior versão conhecida por entidade e período: chave "CNPJ#CD_CVM#DT_REFER" -> maior VERSAO
  private readonly maxVersionByPeriod = new Map<string, number>();

  // Armazena contas em slots fisicamente isolados por arquivo: chave "CNPJ#CD_CVM#DT_REFER#PHYSICAL_TYPE#VERSAO" -> Map<accountCode, Decimal>
  private readonly accountSlots = new Map<string, Map<string, Decimal>>();

  // Rastreia períodos com duplicidades conflitantes para descarte seguro
  private readonly conflictingPeriods = new Set<string>();

  // Armazena Razão Social por CNPJ
  private readonly companyNames = new Map<string, string>();

  // Rastreia conjuntos de períodos contábeis únicos: "CNPJ#CD_CVM#DT_REFER"
  private readonly periodKeys = new Set<string>();

  constructor(
    context: CvmParserContext,
    eligibleCompanies?: Map<string, CvmCadCompany> | null,
    metrics?: CvmDfpMetrics
  ) {
    validateCvmParserContext(context);
    this.context = context;
    this.eligibleCompanies = eligibleCompanies ?? null;
    this.metrics = metrics ?? {
      totalLinesRead: 0,
      relevantLinesProcessed: 0,
      skippedPenultimoLines: 0,
      invalidScaleLines: 0,
      corruptedLinesCount: 0,
      conflictingDuplicateLines: 0,
      conflictingStatementsDiscarded: 0,
      unregisteredCompaniesSkipped: 0,
      unsupportedSectorCompaniesSkipped: 0,
      highestVersionIncompleteDiscarded: 0,
      missingNetIncomeDiscarded: 0,
      completeStatementsEmitted: 0,
    };
  }

  public getMetrics(): CvmDfpMetrics {
    return this.metrics;
  }

  public getContext(): CvmParserContext {
    return this.context;
  }

  /**
   * Registra a ingestão de um stream verificando a compatibilidade estrita de contexto com o ZIP pai.
   */
  public validateStreamContext(streamContext: CvmParserContext): void {
    assertStreamContextCompatibility(this.context, streamContext);
  }

  /**
   * Consome uma linha contábil já parseada e posiciona no slot correto.
   * Detecta e trata duplicidades idênticas (idempotência) e duplicidades conflitantes (descarte por conflito).
   */
  public ingestRow(row: ParsedCvmStatementRow): void {
    // 1. Verificação cadastral e de setor elegível
    if (this.eligibleCompanies) {
      const cad = this.eligibleCompanies.get(row.cnpj);
      if (!cad) {
        // Companhia não consta no cadastro de companhias abertas
        return;
      }
      if (cad.sectorDecision !== 'PROCESSABLE') {
        // Setor não elegível (financeiro, holding pura ou desconhecido)
        return;
      }
    }

    // 2. Chave de período canônica tripartite: CNPJ + CD_CVM + DT_REFER
    const periodKey = `${row.cnpj}#${row.cvmCode}#${row.referenceDate}`;
    this.periodKeys.add(periodKey);
    this.companyNames.set(row.cnpj, row.companyLegalName);

    // 3. Atualiza a maior versão conhecida para este período contábil
    const currentMaxVersion = this.maxVersionByPeriod.get(periodKey) ?? 0;
    if (row.version > currentMaxVersion) {
      this.maxVersionByPeriod.set(periodKey, row.version);
    }

    // 4. Posiciona a conta no slot isolado do demonstrativo físico e versão
    const slotKey = `${row.cnpj}#${row.cvmCode}#${row.referenceDate}#${row.physicalType}#${row.version}`;
    let accountsMap = this.accountSlots.get(slotKey);
    if (!accountsMap) {
      accountsMap = new Map<string, Decimal>();
      this.accountSlots.set(slotKey, accountsMap);
    }

    // 5. Tratamento de Duplicidades
    const existingValue = accountsMap.get(row.accountCode);
    if (existingValue !== undefined) {
      if (existingValue.equals(row.accountValue)) {
        // Duplicidade idêntica: idempotência pura (não altera estado)
      } else {
        // Duplicidade conflitante: marca o período como corrompido para descarte no finalize()
        this.conflictingPeriods.add(periodKey);
        this.metrics.conflictingDuplicateLines++;
      }
    } else {
      accountsMap.set(row.accountCode, row.accountValue);
    }
  }

  /**
   * Finaliza a agregação consolidando as 3 demonstrações obrigatórias para a maior versão de cada período.
   * Descarta períodos com duplicidades conflitantes e versões incompletas.
   */
  public finalize(): CvmAggregatedStatement[] {
    const emittedStatements: CvmAggregatedStatement[] = [];

    for (const periodKey of this.periodKeys) {
      // 1. Se o período foi corrompido por duplicidades conflitantes, descarta imediatamente
      if (this.conflictingPeriods.has(periodKey)) {
        this.metrics.conflictingStatementsDiscarded++;
        continue;
      }

      const [cnpj, cvmCode, referenceDate] = periodKey.split('#');
      const highestVersion = this.maxVersionByPeriod.get(periodKey);

      if (!highestVersion) continue;

      const companyLegalName = this.companyNames.get(cnpj) || 'COMPANHIA CVM';

      // 2. Busca os slots de BPA_con, BPP_con e DRE_con exclusivamente na maior versão
      const bpaSlotKey = `${cnpj}#${cvmCode}#${referenceDate}#BPA_con#${highestVersion}`;
      const bppSlotKey = `${cnpj}#${cvmCode}#${referenceDate}#BPP_con#${highestVersion}`;
      const dreSlotKey = `${cnpj}#${cvmCode}#${referenceDate}#DRE_con#${highestVersion}`;

      const bpaAccounts = this.accountSlots.get(bpaSlotKey);
      const bppAccounts = this.accountSlots.get(bppSlotKey);
      const dreAccounts = this.accountSlots.get(dreSlotKey);

      // 3. Se a maior versão não formar o conjunto completo com BPA, BPP e DRE, descarta!
      if (!bpaAccounts || !bppAccounts || !dreAccounts) {
        this.metrics.highestVersionIncompleteDiscarded++;
        continue; // Proibido fallback para versão anterior!
      }

      // 4. Extração das contas obrigatórias
      const totalAssets = bpaAccounts.get('1');
      const totalEquity = bppAccounts.get('2.03');
      const netRevenue = dreAccounts.get('3.01');

      // Seleção de Lucro Líquido: 3.11 primária, fallback para 3.09 se 3.11 ausente
      const netIncome = dreAccounts.get('3.11') ?? dreAccounts.get('3.09');

      // 5. Se qualquer conta essencial faltar, descarta o documento
      if (!totalAssets || !totalEquity || !netRevenue || !netIncome) {
        if (!netIncome) {
          this.metrics.missingNetIncomeDiscarded++;
        } else {
          this.metrics.highestVersionIncompleteDiscarded++;
        }
        continue;
      }

      // 6. Geração e validação estrita de sourceReference com serialização determinística
      const sourceReferencePayload = {
        source: 'cvm_dfp' as const,
        fileId: this.context.fileId,
        runId: this.context.runId,
        cnpj,
        cvmCode,
        referenceDate,
        periodType: 'annual' as const,
        statementType: 'CONSOLIDATED' as const,
        exerciseOrder: 'ÚLTIMO' as const,
        version: highestVersion,
        parserVersion: this.context.parserVersion,
        entityLevel: 'COMPANY' as const,
        assetBindingPurpose: 'PUBLICATION_ALIAS' as const,
      };

      // Validação Zod estrita
      const validatedSourceRef = cvmSourceReferenceSchema.parse(sourceReferencePayload);
      const sourceReference = JSON.stringify(validatedSourceRef);

      // 7. Montagem do demonstrativo agregado
      const statement: CvmAggregatedStatement = {
        cnpj,
        cvmCode,
        companyLegalName,
        referenceDate,
        periodType: 'annual',
        statementType: 'CONSOLIDATED',
        exerciseOrder: 'ÚLTIMO',
        version: highestVersion,
        netRevenue,
        netIncome,
        totalEquity,
        totalAssets,
        grossDebt: null,
        cashEquivalents: null,
        ebitda: null,
        sharesCount: null,
        dividendsDeclared: null,
        sourceReference,
      };

      emittedStatements.push(statement);
      this.metrics.completeStatementsEmitted++;
    }

    return emittedStatements;
  }
}
