import { Decimal } from '@/lib/decimal';
import { cvmSourceReferenceSchema } from './cvm.schema';
import { validateAndNormalizeCnpj, validateAndNormalizeCvmCode } from './cvm-cad-parser';
import {
  CvmIncompatibleStreamContextError,
  CvmInvalidContextError,
  CvmInvalidHeaderError,
  isValidCalendarDate,
  parseStrictPositiveInteger,
  type CvmAggregatedStatement,
  type CvmCadCompany,
  type CvmCapitalCompositionData,
  type CvmDfpMetrics,
  type CvmDmplOriginEvidence,
  type CvmParserContext,
  type CvmStatementPhysicalType,
} from './cvm-parser.types';
import {
  extractDfcDepreciationAmortization,
  isDeclaredDividendsAccount,
} from './cvm-fundamentals-engine';
import {
  DMPL_REJECTED_COLUMNS,
  type ParsedCvmDmplRow,
} from './cvm-dmpl-parser';

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
    if (!line) { continue; }

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
      if (!isValidCalendarDate(referenceDate)) {
        metrics.corruptedLinesCount++;
        continue;
      }

      const versionRaw = parts[headerIndices.versionIdx];
      const version = parseStrictPositiveInteger(versionRaw);
      if (version === null) {
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

      if (accountCode.startsWith('3.99')) {
        // Contas de Lucro por Ação (3.99, 3.99.01, 3.99.01.01 etc.) são SEMPRE em Reais/ação (unidade),
        // conforme CPC 41 / IAS 33, independentemente de ESCALA_MOEDA no cabeçalho geral da DRE ser MIL.
        accountValue = rawDecimal;
      } else if (scale === 'MIL') {
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
  private readonly statementType: 'CONSOLIDATED' | 'INDIVIDUAL';
  private readonly eligibleCompanies: Map<string, CvmCadCompany> | null;
  private readonly metrics: CvmDfpMetrics;

  // Rastreia a maior versão conhecida por entidade e período: chave "CNPJ#CD_CVM#DT_REFER" -> maior VERSAO
  private readonly maxVersionByPeriod = new Map<string, number>();

  // Armazena contas em slots fisicamente isolados por arquivo: chave "CNPJ#CD_CVM#DT_REFER#PHYSICAL_TYPE#VERSAO" -> Map<accountCode, Decimal>
  private readonly accountSlots = new Map<string, Map<string, Decimal>>();

  // Armazena descrições de contas por slot: chave "CNPJ#CD_CVM#DT_REFER#PHYSICAL_TYPE#VERSAO" -> Map<accountCode, string>
  private readonly accountDescriptions = new Map<string, Map<string, string>>();

  // Rastreia períodos com duplicidades conflitantes para descarte seguro
  private readonly conflictingPeriods = new Set<string>();

  // Armazena Razão Social por CNPJ
  private readonly companyNames = new Map<string, string>();

  // Armazena Composição de Capital por chave: `${cnpj}#${referenceDate}#${version}` (Etapa 2)
  private readonly capitalCompositionSlots = new Map<string, CvmCapitalCompositionData>();

  // Armazena contas da DMPL segregadas por slot e por coluna (Etapa 4):
  // chave: `${cnpj}#${cvmCode}#${referenceDate}#${version}` -> Map<coluna, { accounts: Map<accountCode, Decimal>, descriptions: Map<accountCode, string> }>
  private readonly dmplSlots = new Map<
    string,
    Map<string, { accounts: Map<string, Decimal>; descriptions: Map<string, string> }>
  >();

  // Rastreia conjuntos de períodos contábeis únicos: "CNPJ#CD_CVM#DT_REFER"
  private readonly periodKeys = new Set<string>();

  constructor(
    context: CvmParserContext,
    statementTypeOrEligibleCompanies?: 'CONSOLIDATED' | 'INDIVIDUAL' | Map<string, CvmCadCompany> | null,
    eligibleCompaniesOrMetrics?: Map<string, CvmCadCompany> | CvmDfpMetrics | null,
    maybeMetrics?: CvmDfpMetrics
  ) {
    validateCvmParserContext(context);
    this.context = context;

    if (
      statementTypeOrEligibleCompanies === 'INDIVIDUAL' ||
      statementTypeOrEligibleCompanies === 'CONSOLIDATED'
    ) {
      this.statementType = statementTypeOrEligibleCompanies;
      this.eligibleCompanies =
        (eligibleCompaniesOrMetrics as Map<string, CvmCadCompany> | null) ?? null;
      this.metrics = maybeMetrics ?? {
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
    } else {
      this.statementType = 'CONSOLIDATED';
      this.eligibleCompanies =
        (statementTypeOrEligibleCompanies as Map<string, CvmCadCompany> | null) ?? null;
      this.metrics = (eligibleCompaniesOrMetrics as CvmDfpMetrics) ?? {
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
    let descriptionsMap = this.accountDescriptions.get(slotKey);
    if (!descriptionsMap) {
      descriptionsMap = new Map<string, string>();
      this.accountDescriptions.set(slotKey, descriptionsMap);
    }
    descriptionsMap.set(row.accountCode, row.accountDescription);

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
   * Consome uma linha de composição de capital social (Etapa 2).
   * Mapeia para a chave tripartite de resolução: `${cnpj}#${referenceDate}#${version}`
   */
  public ingestCapitalCompositionRow(row: CvmCapitalCompositionData): void {
    const slotKey = `${row.cnpj}#${row.referenceDate}#${row.version}`;
    this.capitalCompositionSlots.set(slotKey, row);
  }

  /**
   * Consome uma linha da DMPL (Demonstração das Mutações do Patrimônio Líquido) - Etapa 4.
   * Aplica isolamento estrito:
   * 1. Rejeita contaminação entre DMPL_con e DMPL_ind conforme statementType;
   * 2. Rejeita sempre colunas de não controladores e terceiros;
   * 3. Isola contas em mapas separados por coluna para impedir combinação indevida;
   * 4. Trata duplicidades idênticas com idempotência e duplicidades conflitantes com descarte.
   */
  public ingestDmplRow(row: ParsedCvmDmplRow): void {
    if (this.eligibleCompanies) {
      const cad = this.eligibleCompanies.get(row.cnpj);
      if (cad?.sectorDecision !== 'PROCESSABLE') {
        return;
      }
    }

    // 1. Bloqueio estrito de contaminação cruzada:
    // Se este agregador for CONSOLIDATED, rejeita categoricamente linhas de DMPL_ind;
    // Se este agregador for INDIVIDUAL, rejeita categoricamente linhas de DMPL_con;
    if (this.statementType === 'CONSOLIDATED' && row.statementOrigin !== 'DMPL_con') {
      return;
    }
    if (this.statementType === 'INDIVIDUAL' && row.statementOrigin !== 'DMPL_ind') {
      return;
    }

    // 2. Rejeição incondicional de participação de não controladores e terceiros
    const normCol = row.column
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
    if (DMPL_REJECTED_COLUMNS.has(normCol)) {
      return;
    }

    const periodKey = `${row.cnpj}#${row.cvmCode}#${row.referenceDate}`;
    this.periodKeys.add(periodKey);

    const slotKey = `${row.cnpj}#${row.cvmCode}#${row.referenceDate}#${row.version}`;
    let columnsMap = this.dmplSlots.get(slotKey);
    if (!columnsMap) {
      columnsMap = new Map();
      this.dmplSlots.set(slotKey, columnsMap);
    }

    let colData = columnsMap.get(row.column);
    if (!colData) {
      colData = {
        accounts: new Map<string, Decimal>(),
        descriptions: new Map<string, string>(),
      };
      columnsMap.set(row.column, colData);
    }

    colData.descriptions.set(row.accountCode, row.accountDescription);

    const existingValue = colData.accounts.get(row.accountCode);
    if (existingValue !== undefined) {
      if (existingValue.equals(row.accountValue)) {
        // Idempotência
      } else {
        // Conflito
        this.conflictingPeriods.add(periodKey);
        this.metrics.conflictingDuplicateLines++;
      }
    } else {
      colData.accounts.set(row.accountCode, row.accountValue);
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

      if (!highestVersion) { continue; }

      const companyLegalName = this.companyNames.get(cnpj) || 'COMPANHIA CVM';

      // 2. Busca os slots de BPA, BPP e DRE exclusivamente na maior versão
      const bpaType = this.statementType === 'CONSOLIDATED' ? 'BPA_con' : 'BPA_ind';
      const bppType = this.statementType === 'CONSOLIDATED' ? 'BPP_con' : 'BPP_ind';
      const dreType = this.statementType === 'CONSOLIDATED' ? 'DRE_con' : 'DRE_ind';

      let bpaAccounts = this.accountSlots.get(
        `${cnpj}#${cvmCode}#${referenceDate}#${bpaType}#${highestVersion}`
      );
      let bppAccounts = this.accountSlots.get(
        `${cnpj}#${cvmCode}#${referenceDate}#${bppType}#${highestVersion}`
      );
      let dreAccounts = this.accountSlots.get(
        `${cnpj}#${cvmCode}#${referenceDate}#${dreType}#${highestVersion}`
      );

      // Compatibilidade defensiva para demonstrativos individuais inseridos como _con
      if (!bpaAccounts && this.statementType === 'INDIVIDUAL') {
        bpaAccounts = this.accountSlots.get(
          `${cnpj}#${cvmCode}#${referenceDate}#BPA_con#${highestVersion}`
        );
      }
      if (!bppAccounts && this.statementType === 'INDIVIDUAL') {
        bppAccounts = this.accountSlots.get(
          `${cnpj}#${cvmCode}#${referenceDate}#BPP_con#${highestVersion}`
        );
      }
      if (!dreAccounts && this.statementType === 'INDIVIDUAL') {
        dreAccounts = this.accountSlots.get(
          `${cnpj}#${cvmCode}#${referenceDate}#DRE_con#${highestVersion}`
        );
      }

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

      // 6. Extração de contas opcionais de balanço (BPA e BPP) - Etapa 1
      // Diferenciação estrita: conta ausente -> null; conta presente com valor zero -> Decimal(0)
      const cashEquivalents = bpaAccounts.get('1.01.01') ?? null;
      const shortTermDebt = bppAccounts.get('2.01.04') ?? null;
      const longTermDebt = bppAccounts.get('2.02.01') ?? null;

      // Regra estrita: Dívida Bruta calculada somente quando as duas parcelas forem conhecidas
      const grossDebt =
        shortTermDebt !== null && longTermDebt !== null
          ? shortTermDebt.add(longTermDebt)
          : null;

      // 7. Geração e validação estrita de sourceReference com serialização determinística
      const sourceReferencePayload = {
        source: 'cvm_dfp' as const,
        fileId: this.context.fileId,
        runId: this.context.runId,
        cnpj,
        cvmCode,
        referenceDate,
        periodType: 'annual' as const,
        statementType: this.statementType,
        exerciseOrder: 'ÚLTIMO' as const,
        version: highestVersion,
        parserVersion: this.context.parserVersion,
        entityLevel: 'COMPANY' as const,
        assetBindingPurpose: 'PUBLICATION_ALIAS' as const,
      };

      // Validação Zod estrita
      const validatedSourceRef = cvmSourceReferenceSchema.parse(sourceReferencePayload);
      const sourceReference = JSON.stringify(validatedSourceRef);

      // 8. Resolução de Composição de Capital Social (Etapa 2)
      const capKey = `${cnpj}#${referenceDate}#${highestVersion}`;
      const capitalComposition = this.capitalCompositionSlots.get(capKey) ?? null;

      // 9. Extração de contas opcionais de DRE e DFC para EBITDA (Etapa 3)
      // EBIT proveniente da conta DRE 3.05
      const ebit = dreAccounts.get('3.05') ?? null;

      // Busca slot de DFC Método Indireto estritamente no mesmo contexto
      const dfcType = this.statementType === 'CONSOLIDATED' ? 'DFC_MI_con' : 'DFC_MI_ind';
      let dfcSlotKey = `${cnpj}#${cvmCode}#${referenceDate}#${dfcType}#${highestVersion}`;
      let dfcAccounts = this.accountSlots.get(dfcSlotKey);
      let dfcDescs = this.accountDescriptions.get(dfcSlotKey);
      if (!dfcAccounts && this.statementType === 'INDIVIDUAL') {
        dfcSlotKey = `${cnpj}#${cvmCode}#${referenceDate}#DFC_MI_con#${highestVersion}`;
        dfcAccounts = this.accountSlots.get(dfcSlotKey);
        dfcDescs = this.accountDescriptions.get(dfcSlotKey);
      }

      // Resolução de Depreciação e Amortização da DFC (Etapa 3)
      const depreciationAmortization = extractDfcDepreciationAmortization(dfcAccounts, dfcDescs);

      // Cálculo determinístico de EBITDA = EBIT (3.05) + D&A (DFC)
      // Exige estritamente a presença de ambos os componentes; caso contrário, ebitda = null
      let ebitda: Decimal | null = null;
      if (ebit !== null && depreciationAmortization !== null) {
        ebitda = ebit.add(depreciationAmortization);
      }

      // Extração de Lucro Básico por Ação (LPA) oficial da DRE (3.99.01.01 primária para ON, 3.99.01 ou 3.99)
      const officialLpa =
        dreAccounts.get('3.99.01.01') ??
        dreAccounts.get('3.99.01') ??
        dreAccounts.get('3.99') ??
        null;

      // 10. Extração de Dividendos Declarados da DMPL com Origem Auditável (Etapa 4)
      const dmplSlotKey = `${cnpj}#${cvmCode}#${referenceDate}#${highestVersion}`;
      const columnsMap = this.dmplSlots.get(dmplSlotKey);

      let selectedColumn: string | null = null;
      let dmplAccounts: Map<string, Decimal> | null = null;
      let dmplDescs: Map<string, string> | null = null;

      if (columnsMap) {
        if (this.statementType === 'CONSOLIDATED') {
          // Precedência determinística para CONSOLIDATED:
          // 1. Prioridade absoluta para 'Patrimônio Líquido' (controladores)
          // 2. Fallback secundário para 'Patrimônio Líquido Consolidado' exclusivamente quando 'Patrimônio Líquido' não existir
          const plCol = columnsMap.get('Patrimônio Líquido');
          const plcCol = columnsMap.get('Patrimônio Líquido Consolidado');
          if (plCol) {
            selectedColumn = 'Patrimônio Líquido';
            dmplAccounts = plCol.accounts;
            dmplDescs = plCol.descriptions;
          } else if (plcCol) {
            selectedColumn = 'Patrimônio Líquido Consolidado';
            dmplAccounts = plcCol.accounts;
            dmplDescs = plcCol.descriptions;
          }
        } else {
          // Para INDIVIDUAL: aceita exclusivamente 'Patrimônio Líquido'
          const plCol = columnsMap.get('Patrimônio Líquido');
          if (plCol) {
            selectedColumn = 'Patrimônio Líquido';
            dmplAccounts = plCol.accounts;
            dmplDescs = plCol.descriptions;
          }
        }
      }

      let dividendsDeclared: Decimal | null = null;
      let dmplOrigin: CvmDmplOriginEvidence | null = null;

      if (selectedColumn && dmplAccounts) {
        // 1. Prioridade absoluta para a conta sintética padrão 5.04.06
        if (dmplAccounts.has('5.04.06')) {
          const desc = dmplDescs?.get('5.04.06') || '';
          const rawVal = dmplAccounts.get('5.04.06');
          if (isDeclaredDividendsAccount('5.04.06', desc) && rawVal) {
            dividendsDeclared = rawVal.abs();
            dmplOrigin = {
              statementOrigin: this.statementType === 'CONSOLIDATED' ? 'DMPL_con' : 'DMPL_ind',
              statementType: this.statementType,
              selectedColumn,
              cnpj,
              cvmCode,
              referenceDate,
              version: highestVersion,
              accountCode: '5.04.06',
              validatedDescription: desc,
              declaredAmount: dividendsDeclared,
              exerciseOrder: 'ÚLTIMO',
            };
          }
        } else {
          // 2. Agregação de subcontas 5.04.06.* exclusivamente quando a sintética estiver ausente
          const validSubaccounts: Array<{ code: string; desc: string; val: Decimal }> = [];
          for (const [code, val] of dmplAccounts.entries()) {
            if (/^5\.04\.06\.\d+$/.test(code)) {
              const desc = dmplDescs?.get(code) || '';
              if (isDeclaredDividendsAccount(code, desc)) {
                validSubaccounts.push({ code, desc, val: val.abs() });
              }
            }
          }

          if (validSubaccounts.length > 0) {
            validSubaccounts.sort((a, b) => a.code.localeCompare(b.code));
            let subSum = new Decimal(0);
            const codes: string[] = [];
            const descs: string[] = [];
            for (const sub of validSubaccounts) {
              subSum = subSum.add(sub.val);
              codes.push(sub.code);
              descs.push(sub.desc);
            }
            dividendsDeclared = subSum;
            dmplOrigin = {
              statementOrigin: this.statementType === 'CONSOLIDATED' ? 'DMPL_con' : 'DMPL_ind',
              statementType: this.statementType,
              selectedColumn,
              cnpj,
              cvmCode,
              referenceDate,
              version: highestVersion,
              accountCode: codes.join('+'),
              validatedDescription: descs.join('; '),
              declaredAmount: dividendsDeclared,
              exerciseOrder: 'ÚLTIMO',
            };
          }
        }
      }

      // 11. Montagem do demonstrativo agregado
      const statement: CvmAggregatedStatement = {
        cnpj,
        cvmCode,
        companyLegalName,
        referenceDate,
        periodType: 'annual',
        statementType: this.statementType,
        exerciseOrder: 'ÚLTIMO',
        version: highestVersion,
        netRevenue,
        netIncome,
        totalEquity,
        totalAssets,
        grossDebt,
        cashEquivalents,
        shortTermDebt,
        longTermDebt,
        capitalComposition,
        sharesCount: null,
        ebit,
        depreciationAmortization,
        ebitda,
        dividendsDeclared,
        dmplOrigin,
        officialLpa,
        sourceReference,
      };

      emittedStatements.push(statement);
      this.metrics.completeStatementsEmitted++;
    }

    return emittedStatements;
  }
}
