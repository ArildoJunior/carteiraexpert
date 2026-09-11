import { Decimal } from '@/lib/decimal';
import {
  CvmFiiCorruptedDataError,
  CvmFiiInvalidHeaderError,
  CvmFiiInvalidIdentifierError,
  type CvmFiiMonthlyPackageInput,
  type CvmFiiMonthlyPackageResult,
  type CvmFiiParserMetrics,
  type ParsedCvmFiiRegistryRecord,
  type ParsedFiiMonthlyRecord,
} from './cvm-fii-parser.types';
import { isValidCalendarDate, parseStrictPositiveInteger } from './cvm-parser.types';

// ─── Normalizações Puras: Números, Datas, CNPJ, ISIN e Versão ────────────────

/**
 * Normaliza e valida um CNPJ:
 * Remove caracteres não numéricos e exige exatamente 14 dígitos não zerados.
 */
export function validateAndNormalizeCnpj(raw: string | null | undefined): string {
  if (!raw) {
    throw new CvmFiiInvalidIdentifierError('CNPJ não fornecido ou vazio.');
  }
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 14 || digits === '00000000000000') {
    throw new CvmFiiInvalidIdentifierError(
      `CNPJ inválido: "${raw}" (deve possuir exatamente 14 dígitos numéricos não nulos).`
    );
  }
  return digits;
}

/**
 * Tenta normalizar CNPJ sem lançar erro, retornando null se inválido.
 */
export function safeNormalizeCnpj(raw: string | null | undefined): string | null {
  if (!raw) { return null; }
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 14 || digits === '00000000000000') {
    return null;
  }
  return digits;
}

/**
 * Normaliza código ISIN:
 * Padrão internacional de 12 caracteres (2 letras de país + 9 alfanuméricos + 1 dígito de controle).
 * Exemplo: 'BRHGLGCTF004'.
 */
export function normalizeIsin(raw: string | null | undefined): string | null {
  if (!raw) { return null; }
  const trimmed = raw.trim().toUpperCase();
  if (/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

/**
 * Normaliza valores numéricos de relatórios da CVM para Decimal:
 * Suporta formatos:
 * - PT-BR: "1.234.567,89" ou "1234,56"
 * - EN-US: "1234567.89" ou "1,234,567.89"
 * - Notação científica: "2.5E-05" ou "1.2e+4"
 * - Parênteses contábeis (negativos): "(1.234,56)" -> -1234.56
 * - Nulos ou vazios: "", "-", "N/A", "NULL" -> null
 */
export function parseCvmDecimal(raw: string | null | undefined): Decimal | null {
  if (raw === null || raw === undefined) { return null; }
  const trimmed = raw.trim();
  if (
    trimmed === '' ||
    trimmed === '-' ||
    trimmed === 'N/A' ||
    trimmed === 'NA' ||
    trimmed === 'null' ||
    trimmed === 'NULL'
  ) {
    return null;
  }

  let cleaned = trimmed;
  let isNegative = false;

  // Trata parênteses contábeis
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    isNegative = true;
    cleaned = cleaned.slice(1, -1).trim();
  }

  // Verifica se é notação científica padrão (ex: 2.5E-05)
  const isScientific = /[eE][+-]?\d+$/.test(cleaned);

  if (!isScientific) {
    const hasComma = cleaned.includes(',');
    const hasDot = cleaned.includes('.');

    if (hasComma && hasDot) {
      const lastComma = cleaned.lastIndexOf(',');
      const lastDot = cleaned.lastIndexOf('.');
      if (lastComma > lastDot) {
        // Formato PT-BR: "1.234.567,89" -> remover pontos, trocar vírgula por ponto
        cleaned = cleaned.replace(/\./g, '').replace(',', '.');
      } else {
        // Formato EN: "1,234,567.89" -> remover vírgulas
        cleaned = cleaned.replace(/,/g, '');
      }
    } else if (hasComma) {
      // Apenas vírgula decimal: "1234,56" -> "1234.56"
      cleaned = cleaned.replace(',', '.');
    }
  }

  if (isNegative && !cleaned.startsWith('-')) {
    cleaned = `-${cleaned}`;
  }

  try {
    const d = new Decimal(cleaned);
    if (d.isNaN() || !d.isFinite()) {
      return null;
    }
    return d;
  } catch {
    return null;
  }
}

/**
 * Converte valores inteiros (ex: total de cotistas).
 * Remove pontuação de milhar se presente.
 */
export function parseCvmInteger(raw: string | null | undefined): number | null {
  if (!raw) { return null; }
  const trimmed = raw.trim();
  if (
    trimmed === '' ||
    trimmed === '-' ||
    trimmed === 'N/A' ||
    trimmed === 'null' ||
    trimmed === 'NULL'
  ) {
    return null;
  }

  const cleaned = trimmed.replace(/\./g, '').replace(/,/g, '');
  if (!/^-?\d+$/.test(cleaned)) {
    return null;
  }

  const num = Number(cleaned);
  return Number.isSafeInteger(num) ? num : null;
}

/**
 * Normaliza e valida data em formato 'YYYY-MM-DD'.
 */
export function parseCvmDateString(raw: string | null | undefined): string | null {
  if (!raw) { return null; }
  const trimmed = raw.trim();
  const dateMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!dateMatch) { return null; }
  const candidate = dateMatch[1];
  return isValidCalendarDate(candidate) ? candidate : null;
}

/**
 * Converte data ou timestamp CVM para Date UTC.
 */
export function parseCvmTimestamp(raw: string | null | undefined): Date | null {
  if (!raw) { return null; }
  const trimmed = raw.trim();
  if (!trimmed) { return null; }

  // Suporta 'YYYY-MM-DD' ou 'YYYY-MM-DD HH:mm:ss'
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/);
  if (!match) { return null; }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = match[4] ? Number(match[4]) : 0;
  const minute = match[5] ? Number(match[5]) : 0;
  const second = match[6] ? Number(match[6]) : 0;

  if (!isValidCalendarDate(`${match[1]}-${match[2]}-${match[3]}`)) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second, 0));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Normaliza a versão do informe (inteiro >= 1).
 * Na CVM, valores inválidos recebem fallback 1.
 */
export function parseCvmFiiVersion(raw: string | null | undefined): number {
  const parsed = parseStrictPositiveInteger(raw);
  return parsed !== null && parsed >= 1 ? parsed : 1;
}

// ─── Utilitários Internos de Leitura de CSV e Streaming ───────────────────────

/**
 * Converte string com quebras de linha ou AsyncIterable em um AsyncIterable de linhas.
 */
export async function* toLineIterable(
  input: string | AsyncIterable<string>
): AsyncIterable<string> {
  if (typeof input === 'string') {
    const lines = input.split(/\r?\n/);
    for (const line of lines) {
      yield line;
    }
  } else {
    for await (const chunk of input) {
      yield chunk;
    }
  }
}

/**
 * Divide uma linha CSV pelo caractere ';' respeitando aspas se presentes.
 */
export function splitCsvLine(line: string): string[] {
  if (!line.includes('"')) {
    return line.split(';').map((p) => p.trim());
  }

  const result: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ';' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += char;
    }
  }
  result.push(cur.trim());
  return result;
}

/**
 * Localiza o índice de uma coluna a partir de uma lista de aliases possíveis (case-insensitive).
 */
function findColumnIndex(headers: string[], aliases: string[]): number {
  const normalizedHeaders = headers.map((h) => h.toUpperCase().replace(/\s+/g, '_'));
  for (const alias of aliases) {
    const normalizedAlias = alias.toUpperCase().replace(/\s+/g, '_');
    const idx = normalizedHeaders.indexOf(normalizedAlias);
    if (idx !== -1) { return idx; }
  }
  return -1;
}

// ─── Interfaces Internas para Resolução por Chave Composta ────────────────────

interface GeralIntermediateData {
  cnpj: string;
  legalName: string;
  isin: string | null;
  referenceDate: string;
  filingDate: Date | null;
  version: number;
  issuedQuotasFromGeral: Decimal | null;
}

interface ComplementoIntermediateData {
  cnpj: string;
  referenceDate: string;
  version: number;
  netAssetValue: Decimal | null;
  quotaEquityValue: Decimal | null;
  issuedQuotas: Decimal | null;
  totalAssets: Decimal | null;
  dividendDeclaredPerQuota: Decimal | null;
  investorsCount: number | null;
  individualInvestorsCount: number | null;
}

interface AtivoPassivoIntermediateData {
  cnpj: string;
  referenceDate: string;
  version: number;
  totalLiabilities: Decimal | null;
  cashEquivalents: Decimal | null;
}

// ─── Parsers Específicos por Arquivo da CVM ───────────────────────────────────

/**
 * Parser para inf_mensal_fii_geral_YYYY.csv
 */
export async function parseCvmFiiGeralLines(
  lines: AsyncIterable<string>,
  options?: { strict?: boolean }
): Promise<{
  geralMap: Map<string, GeralIntermediateData>;
  registryMap: Map<string, ParsedCvmFiiRegistryRecord>;
  totalLines: number;
  skippedCorrupted: number;
}> {
  const geralMap = new Map<string, GeralIntermediateData>();
  const registryMap = new Map<string, ParsedCvmFiiRegistryRecord>();

  let headerIndices: {
    cnpjIdx: number;
    legalNameIdx: number;
    isinIdx: number;
    refDateIdx: number;
    filingDateIdx: number;
    versionIdx: number;
    issuedQuotasIdx: number;
  } | null = null;

  let totalLines = 0;
  let skippedCorrupted = 0;

  for await (const rawLine of lines) {
    totalLines++;
    const line = rawLine.replace(/[\r\n]/g, '').trim();
    if (!line) { continue; }

    const parts = splitCsvLine(line);

    if (!headerIndices) {
      const cnpjIdx = findColumnIndex(parts, [
        'CNPJ_Fundo_Classe',
        'CNPJ_Fundo',
        'CNPJ_CLASSE',
        'CNPJ_FUNDO',
      ]);
      const legalNameIdx = findColumnIndex(parts, [
        'Nome_Fundo_Classe',
        'Nome_Fundo',
        'DENOM_SOCIAL',
        'Nome_Administrador',
      ]);
      const isinIdx = findColumnIndex(parts, ['Codigo_ISIN', 'CD_ISIN', 'ISIN']);
      const refDateIdx = findColumnIndex(parts, ['Data_Referencia', 'DT_COMPTC']);
      const filingDateIdx = findColumnIndex(parts, ['Data_Entrega', 'DT_RECEB']);
      const versionIdx = findColumnIndex(parts, ['Versao', 'VERSAO']);
      const issuedQuotasIdx = findColumnIndex(parts, [
        'Quantidade_Cotas_Emitidas',
        'Cotas_Emitidas',
        'QT_COTAS_EMITIDAS',
      ]);

      if (cnpjIdx === -1 || refDateIdx === -1) {
        throw new CvmFiiInvalidHeaderError(
          'Cabeçalho de inf_mensal_fii_geral inválido: colunas essenciais de CNPJ e Data_Referencia não foram encontradas.'
        );
      }

      headerIndices = {
        cnpjIdx,
        legalNameIdx,
        isinIdx,
        refDateIdx,
        filingDateIdx,
        versionIdx,
        issuedQuotasIdx,
      };
      continue;
    }

    const rawCnpj = parts[headerIndices.cnpjIdx];
    const cnpj = safeNormalizeCnpj(rawCnpj);
    const refDate = parseCvmDateString(parts[headerIndices.refDateIdx]);

    if (!cnpj || !refDate) {
      skippedCorrupted++;
      if (options?.strict) {
        throw new CvmFiiCorruptedDataError(
          `Linha corrompida em geral: CNPJ "${rawCnpj}" ou Data Referência "${parts[headerIndices.refDateIdx]}" inválidos.`
        );
      }
      continue;
    }

    const version =
      headerIndices.versionIdx !== -1
        ? parseCvmFiiVersion(parts[headerIndices.versionIdx])
        : 1;

    const legalName =
      headerIndices.legalNameIdx !== -1 && parts[headerIndices.legalNameIdx]
        ? parts[headerIndices.legalNameIdx]
        : `Fundo Imobiliário CNPJ ${cnpj}`;

    const isin =
      headerIndices.isinIdx !== -1 ? normalizeIsin(parts[headerIndices.isinIdx]) : null;

    const filingDate =
      headerIndices.filingDateIdx !== -1
        ? parseCvmTimestamp(parts[headerIndices.filingDateIdx])
        : null;

    const issuedQuotasFromGeral =
      headerIndices.issuedQuotasIdx !== -1
        ? parseCvmDecimal(parts[headerIndices.issuedQuotasIdx])
        : null;

    const key = `${cnpj}|${refDate}|${version}`;
    geralMap.set(key, {
      cnpj,
      legalName,
      isin,
      referenceDate: refDate,
      filingDate,
      version,
      issuedQuotasFromGeral,
    });

    // Atualiza cadastro CVM mantendo o registro com a data de entrega ou competência mais recente
    const existingRegistry = registryMap.get(cnpj);
    if (
      !existingRegistry ||
      (filingDate &&
        (!existingRegistry.sourceUpdatedAt ||
          filingDate.getTime() > existingRegistry.sourceUpdatedAt.getTime()))
    ) {
      registryMap.set(cnpj, {
        cnpj,
        legalName,
        ticker: null,
        isin: isin ?? existingRegistry?.isin ?? null,
        source: 'cvm',
        sourceUpdatedAt: filingDate,
      });
    }
  }

  return {
    geralMap,
    registryMap,
    totalLines,
    skippedCorrupted,
  };
}

/**
 * Parser para inf_mensal_fii_complemento_YYYY.csv
 */
export async function parseCvmFiiComplementoLines(
  lines: AsyncIterable<string>,
  options?: { strict?: boolean }
): Promise<{
  complementoMap: Map<string, ComplementoIntermediateData>;
  totalLines: number;
  skippedCorrupted: number;
}> {
  const complementoMap = new Map<string, ComplementoIntermediateData>();

  let headerIndices: {
    cnpjIdx: number;
    refDateIdx: number;
    versionIdx: number;
    navIdx: number;
    qevIdx: number;
    issuedQuotasIdx: number;
    totalAssetsIdx: number;
    dividendIdx: number;
    investorsIdx: number;
    individualInvestorsIdx: number;
  } | null = null;

  let totalLines = 0;
  let skippedCorrupted = 0;

  for await (const rawLine of lines) {
    totalLines++;
    const line = rawLine.replace(/[\r\n]/g, '').trim();
    if (!line) { continue; }

    const parts = splitCsvLine(line);

    if (!headerIndices) {
      const cnpjIdx = findColumnIndex(parts, [
        'CNPJ_Fundo_Classe',
        'CNPJ_Fundo',
        'CNPJ_CLASSE',
        'CNPJ_FUNDO',
      ]);
      const refDateIdx = findColumnIndex(parts, ['Data_Referencia', 'DT_COMPTC']);
      const versionIdx = findColumnIndex(parts, ['Versao', 'VERSAO']);
      const navIdx = findColumnIndex(parts, ['Patrimonio_Liquido', 'VL_PATRIM_LIQ']);
      const qevIdx = findColumnIndex(parts, ['Valor_Patrimonial_Cotas', 'VL_PATRIM_COTA']);
      const issuedQuotasIdx = findColumnIndex(parts, [
        'Cotas_Emitidas',
        'Quantidade_Cotas_Emitidas',
        'QT_COTAS_EMITIDAS',
      ]);
      const totalAssetsIdx = findColumnIndex(parts, [
        'Valor_Ativo',
        'VL_TOTAL_ATIVO',
        'Total_Ativo',
      ]);
      const dividendIdx = findColumnIndex(parts, [
        'Rendimento_Distribuido_Mes',
        'Rendimento_Por_Cota',
        'Dividend_Yield_Mes',
      ]);
      const investorsIdx = findColumnIndex(parts, [
        'Total_Numero_Cotistas',
        'Total_Cotistas',
        'QT_COTISTAS',
      ]);
      const individualInvestorsIdx = findColumnIndex(parts, [
        'Numero_Cotistas_Pessoa_Fisica',
        'Cotistas_PF',
        'QT_COTISTAS_PF',
      ]);

      if (cnpjIdx === -1 || refDateIdx === -1) {
        throw new CvmFiiInvalidHeaderError(
          'Cabeçalho de inf_mensal_fii_complemento inválido: colunas essenciais de CNPJ e Data_Referencia não foram encontradas.'
        );
      }

      headerIndices = {
        cnpjIdx,
        refDateIdx,
        versionIdx,
        navIdx,
        qevIdx,
        issuedQuotasIdx,
        totalAssetsIdx,
        dividendIdx,
        investorsIdx,
        individualInvestorsIdx,
      };
      continue;
    }

    const rawCnpj = parts[headerIndices.cnpjIdx];
    const cnpj = safeNormalizeCnpj(rawCnpj);
    const refDate = parseCvmDateString(parts[headerIndices.refDateIdx]);

    if (!cnpj || !refDate) {
      skippedCorrupted++;
      if (options?.strict) {
        throw new CvmFiiCorruptedDataError(
          `Linha corrompida em complemento: CNPJ "${rawCnpj}" ou Data Referência "${parts[headerIndices.refDateIdx]}" inválidos.`
        );
      }
      continue;
    }

    const version =
      headerIndices.versionIdx !== -1
        ? parseCvmFiiVersion(parts[headerIndices.versionIdx])
        : 1;

    const netAssetValue =
      headerIndices.navIdx !== -1 ? parseCvmDecimal(parts[headerIndices.navIdx]) : null;

    const quotaEquityValue =
      headerIndices.qevIdx !== -1 ? parseCvmDecimal(parts[headerIndices.qevIdx]) : null;

    const issuedQuotas =
      headerIndices.issuedQuotasIdx !== -1
        ? parseCvmDecimal(parts[headerIndices.issuedQuotasIdx])
        : null;

    const totalAssets =
      headerIndices.totalAssetsIdx !== -1
        ? parseCvmDecimal(parts[headerIndices.totalAssetsIdx])
        : null;

    const dividendDeclaredPerQuota =
      headerIndices.dividendIdx !== -1
        ? parseCvmDecimal(parts[headerIndices.dividendIdx])
        : null;

    const investorsCount =
      headerIndices.investorsIdx !== -1
        ? parseCvmInteger(parts[headerIndices.investorsIdx])
        : null;

    const individualInvestorsCount =
      headerIndices.individualInvestorsIdx !== -1
        ? parseCvmInteger(parts[headerIndices.individualInvestorsIdx])
        : null;

    const key = `${cnpj}|${refDate}|${version}`;
    complementoMap.set(key, {
      cnpj,
      referenceDate: refDate,
      version,
      netAssetValue,
      quotaEquityValue,
      issuedQuotas,
      totalAssets,
      dividendDeclaredPerQuota,
      investorsCount,
      individualInvestorsCount,
    });
  }

  return {
    complementoMap,
    totalLines,
    skippedCorrupted,
  };
}

/**
 * Parser para inf_mensal_fii_ativo_passivo_YYYY.csv
 */
export async function parseCvmFiiAtivoPassivoLines(
  lines: AsyncIterable<string>,
  options?: { strict?: boolean }
): Promise<{
  ativoPassivoMap: Map<string, AtivoPassivoIntermediateData>;
  totalLines: number;
  skippedCorrupted: number;
}> {
  const ativoPassivoMap = new Map<string, AtivoPassivoIntermediateData>();

  let headerIndices: {
    cnpjIdx: number;
    refDateIdx: number;
    versionIdx: number;
    totalLiabilitiesIdx: number;
    cashEquivalentsIdx: number;
  } | null = null;

  let totalLines = 0;
  let skippedCorrupted = 0;

  for await (const rawLine of lines) {
    totalLines++;
    const line = rawLine.replace(/[\r\n]/g, '').trim();
    if (!line) { continue; }

    const parts = splitCsvLine(line);

    if (!headerIndices) {
      const cnpjIdx = findColumnIndex(parts, [
        'CNPJ_Fundo_Classe',
        'CNPJ_Fundo',
        'CNPJ_CLASSE',
        'CNPJ_FUNDO',
      ]);
      const refDateIdx = findColumnIndex(parts, ['Data_Referencia', 'DT_COMPTC']);
      const versionIdx = findColumnIndex(parts, ['Versao', 'VERSAO']);
      const totalLiabilitiesIdx = findColumnIndex(parts, [
        'Total_Passivo',
        'VL_TOTAL_PASSIVO',
        'Passivo_Total',
      ]);
      const cashEquivalentsIdx = findColumnIndex(parts, [
        'Disponibilidades',
        'Total_Necessidades_Liquidez',
        'VL_DISPONIBILIDADES',
        'Disponibilidade_Financeira',
      ]);

      if (cnpjIdx === -1 || refDateIdx === -1) {
        throw new CvmFiiInvalidHeaderError(
          'Cabeçalho de inf_mensal_fii_ativo_passivo inválido: colunas essenciais de CNPJ e Data_Referencia não foram encontradas.'
        );
      }

      headerIndices = {
        cnpjIdx,
        refDateIdx,
        versionIdx,
        totalLiabilitiesIdx,
        cashEquivalentsIdx,
      };
      continue;
    }

    const rawCnpj = parts[headerIndices.cnpjIdx];
    const cnpj = safeNormalizeCnpj(rawCnpj);
    const refDate = parseCvmDateString(parts[headerIndices.refDateIdx]);

    if (!cnpj || !refDate) {
      skippedCorrupted++;
      if (options?.strict) {
        throw new CvmFiiCorruptedDataError(
          `Linha corrompida em ativo_passivo: CNPJ "${rawCnpj}" ou Data Referência "${parts[headerIndices.refDateIdx]}" inválidos.`
        );
      }
      continue;
    }

    const version =
      headerIndices.versionIdx !== -1
        ? parseCvmFiiVersion(parts[headerIndices.versionIdx])
        : 1;

    const totalLiabilities =
      headerIndices.totalLiabilitiesIdx !== -1
        ? parseCvmDecimal(parts[headerIndices.totalLiabilitiesIdx])
        : null;

    const cashEquivalents =
      headerIndices.cashEquivalentsIdx !== -1
        ? parseCvmDecimal(parts[headerIndices.cashEquivalentsIdx])
        : null;

    const key = `${cnpj}|${refDate}|${version}`;
    ativoPassivoMap.set(key, {
      cnpj,
      referenceDate: refDate,
      version,
      totalLiabilities,
      cashEquivalents,
    });
  }

  return {
    ativoPassivoMap,
    totalLines,
    skippedCorrupted,
  };
}

// ─── Orquestrador do Pacote de Informes Mensais ───────────────────────────────

/**
 * Parser principal do pacote mensal de informes da CVM.
 * Combina `inf_mensal_fii_geral`, `inf_mensal_fii_complemento` e `inf_mensal_fii_ativo_passivo`
 * pela chave natural unívoca (CNPJ, Data_Referencia, Versao).
 *
 * Garante idempotência, determinismo de ordenação e isolamento total de banco.
 */
export async function parseCvmFiiMonthlyPackage(
  input: CvmFiiMonthlyPackageInput
): Promise<CvmFiiMonthlyPackageResult> {
  const strict = input.strict ?? false;

  // 1. Processa geral (obrigatório)
  const geralLines = toLineIterable(input.geralCsv);
  const geralResult = await parseCvmFiiGeralLines(geralLines, { strict });

  // 2. Processa complemento (se fornecido)
  let complementoResult: {
    complementoMap: Map<string, ComplementoIntermediateData>;
    totalLines: number;
    skippedCorrupted: number;
  } = {
    complementoMap: new Map(),
    totalLines: 0,
    skippedCorrupted: 0,
  };

  if (input.complementoCsv) {
    const complementoLines = toLineIterable(input.complementoCsv);
    complementoResult = await parseCvmFiiComplementoLines(complementoLines, { strict });
  }

  // 3. Processa ativo/passivo (se fornecido)
  let ativoPassivoResult: {
    ativoPassivoMap: Map<string, AtivoPassivoIntermediateData>;
    totalLines: number;
    skippedCorrupted: number;
  } = {
    ativoPassivoMap: new Map(),
    totalLines: 0,
    skippedCorrupted: 0,
  };

  if (input.ativoPassivoCsv) {
    const ativoPassivoLines = toLineIterable(input.ativoPassivoCsv);
    ativoPassivoResult = await parseCvmFiiAtivoPassivoLines(ativoPassivoLines, { strict });
  }

  // 4. Junção por Chave Composta: Todas as chaves presentes em geral e complemento
  const allKeys = new Set<string>([
    ...geralResult.geralMap.keys(),
    ...complementoResult.complementoMap.keys(),
    ...ativoPassivoResult.ativoPassivoMap.keys(),
  ]);

  const monthlyRecords: ParsedFiiMonthlyRecord[] = [];
  const uniqueFunds = new Set<string>();
  const uniqueCompetencies = new Set<string>();

  for (const key of allKeys) {
    const geral = geralResult.geralMap.get(key);
    const complemento = complementoResult.complementoMap.get(key);
    const ativoPassivo = ativoPassivoResult.ativoPassivoMap.get(key);

    const [cnpj, referenceDate, rawVersion] = key.split('|');
    const version = Number(rawVersion);

    uniqueFunds.add(cnpj);
    uniqueCompetencies.add(referenceDate);

    // Prioridade de cotas emitidas: complemento > geral
    const issuedQuotas = complemento?.issuedQuotas ?? geral?.issuedQuotasFromGeral ?? null;

    monthlyRecords.push({
      cnpj,
      referenceDate,
      filingDate: geral?.filingDate ?? null,
      version,
      source: 'cvm_inf_mensal',
      sourceReference: input.sourceReference ?? null,
      netAssetValue: complemento?.netAssetValue ?? null,
      quotaEquityValue: complemento?.quotaEquityValue ?? null,
      issuedQuotas,
      totalAssets: complemento?.totalAssets ?? null,
      totalLiabilities: ativoPassivo?.totalLiabilities ?? null,
      cashEquivalents: ativoPassivo?.cashEquivalents ?? null,
      dividendDeclaredPerQuota: complemento?.dividendDeclaredPerQuota ?? null,
      investorsCount: complemento?.investorsCount ?? null,
      individualInvestorsCount: complemento?.individualInvestorsCount ?? null,
    });
  }

  // 5. Ordenação canônica determinística: CNPJ ASC, Data Referência ASC, Versão ASC
  monthlyRecords.sort((a, b) => {
    if (a.cnpj !== b.cnpj) { return a.cnpj.localeCompare(b.cnpj); }
    if (a.referenceDate !== b.referenceDate) {
      return a.referenceDate.localeCompare(b.referenceDate);
    }
    return a.version - b.version;
  });

  const registryRecords = Array.from(geralResult.registryMap.values()).sort((a, b) =>
    a.cnpj.localeCompare(b.cnpj)
  );

  const metrics: CvmFiiParserMetrics = {
    totalGeralLines: geralResult.totalLines,
    totalComplementoLines: complementoResult.totalLines,
    totalAtivoPassivoLines: ativoPassivoResult.totalLines,
    parsedRegistryRecords: registryRecords.length,
    parsedMonthlyRecords: monthlyRecords.length,
    skippedCorruptedLines:
      geralResult.skippedCorrupted +
      complementoResult.skippedCorrupted +
      ativoPassivoResult.skippedCorrupted,
    uniqueFundsCount: uniqueFunds.size,
    uniqueCompetenciesCount: uniqueCompetencies.size,
  };

  return {
    registryRecords,
    monthlyRecords,
    metrics,
  };
}
