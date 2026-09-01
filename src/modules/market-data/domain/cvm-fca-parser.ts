import {
  validateAndNormalizeCnpj,
  validateAndNormalizeCvmCode,
} from './cvm-cad-parser';
import { CvmInvalidHeaderError } from './cvm-parser.types';
import type { CvmSecurityMappingInput } from './cvm-matching.types';

export interface CvmFcaMetrics {
  totalLinesRead: number;
  validSecuritiesCount: number;
  corruptedLinesCount: number;
  distinctTickersCount: number;
}

/**
 * Normaliza o tipo de valor mobiliário e classe a partir dos campos oficiais do FCA.
 */
export function extractFcaShareClass(
  valorMobiliario?: string | null,
  siglaClassePref?: string | null,
  classeDireta?: string | null
): string | null {
  if (classeDireta && classeDireta.trim().length > 0) {
    return classeDireta.trim();
  }
  if (!valorMobiliario) return null;

  const vmUpper = valorMobiliario.toUpperCase();
  if (vmUpper.includes('ORDIN') || vmUpper.includes('ORD')) {
    return 'ON';
  }
  if (vmUpper.includes('PREFEREN')) {
    if (siglaClassePref) {
      const prefSigla = siglaClassePref.trim().toUpperCase();
      if (prefSigla === 'A') return 'PNA';
      if (prefSigla === 'B') return 'PNB';
    }
    return 'PN';
  }
  if (vmUpper.includes('UNIT') || vmUpper.includes('CERTIFICADO DE DEP')) {
    return 'UNT';
  }
  return null;
}

/**
 * Parser em streaming para o arquivo oficial fca_cia_aberta_valor_mobiliario_YYYY.csv da CVM.
 * Extrai mapeamento oficial Ticker ↔ Código CVM / CNPJ ↔ Classe ↔ ISIN.
 */
export async function parseCvmFcaStream(
  lineStream: AsyncIterable<string>
): Promise<{ mappings: CvmSecurityMappingInput[]; metrics: CvmFcaMetrics }> {
  const mappings: CvmSecurityMappingInput[] = [];
  const distinctTickers = new Set<string>();

  const metrics: CvmFcaMetrics = {
    totalLinesRead: 0,
    validSecuritiesCount: 0,
    corruptedLinesCount: 0,
    distinctTickersCount: 0,
  };

  let headerIndices: {
    cnpjIdx: number;
    cvmCodeIdx: number;
    tickerIdx: number;
    classIdx: number;
    prefClassSiglaIdx: number;
    isinIdx: number;
    secTypeIdx: number;
  } | null = null;

  for await (const rawLine of lineStream) {
    metrics.totalLinesRead++;
    const line = rawLine.replace(/[\r\n]/g, '').trim();
    if (!line) continue;

    const parts = line.split(';').map((p) => p.trim());

    // 1. Processamento do Cabeçalho
    if (!headerIndices) {
      const upperParts = parts.map((p) => p.toUpperCase());
      
      let cnpjIdx = upperParts.indexOf('CNPJ_COMPANHIA');
      if (cnpjIdx === -1) cnpjIdx = upperParts.indexOf('CNPJ_CIA');
      if (cnpjIdx === -1) cnpjIdx = upperParts.indexOf('CNPJ');

      let cvmCodeIdx = upperParts.indexOf('CD_CVM');
      if (cvmCodeIdx === -1) cvmCodeIdx = upperParts.indexOf('COD_CVM');
      if (cvmCodeIdx === -1) cvmCodeIdx = upperParts.indexOf('CODIGO_CVM');

      let tickerIdx = upperParts.indexOf('CODIGO_NEGOCIACAO');
      if (tickerIdx === -1) tickerIdx = upperParts.indexOf('COD_NEGOCIACAO');
      if (tickerIdx === -1) tickerIdx = upperParts.indexOf('SIGLA');
      if (tickerIdx === -1) tickerIdx = upperParts.indexOf('TICKER');

      let classIdx = upperParts.indexOf('CLASSE_ACAO');
      if (classIdx === -1) classIdx = upperParts.indexOf('DS_CLASSE_VALOR_MOBILIARIO');
      if (classIdx === -1) classIdx = upperParts.indexOf('CLASSE');

      let prefClassSiglaIdx = upperParts.indexOf('SIGLA_CLASSE_ACAO_PREFERENCIAL');

      let isinIdx = upperParts.indexOf('CODIGO_ISIN');
      if (isinIdx === -1) isinIdx = upperParts.indexOf('COD_ISIN');
      if (isinIdx === -1) isinIdx = upperParts.indexOf('ISIN');

      let secTypeIdx = upperParts.indexOf('VALOR_MOBILIARIO');
      if (secTypeIdx === -1) secTypeIdx = upperParts.indexOf('TP_VALOR_MOBILIARIO');
      if (secTypeIdx === -1) secTypeIdx = upperParts.indexOf('TIPO_VALOR_MOBILIARIO');

      if ((cvmCodeIdx === -1 && cnpjIdx === -1) || tickerIdx === -1) {
        throw new CvmInvalidHeaderError(
          'Cabeçalho do fca_cia_aberta_valor_mobiliario.csv inválido: colunas essenciais ausentes (CNPJ_Companhia/CD_CVM ou Codigo_Negociacao).'
        );
      }

      headerIndices = {
        cnpjIdx,
        cvmCodeIdx,
        tickerIdx,
        classIdx,
        prefClassSiglaIdx,
        isinIdx,
        secTypeIdx,
      };
      continue;
    }

    // 2. Extração e Validação dos Campos
    try {
      const rawTicker = parts[headerIndices.tickerIdx];
      if (!rawTicker || rawTicker.trim().length === 0) {
        continue;
      }

      const ticker = rawTicker.trim().toUpperCase();
      
      const cvmCode = headerIndices.cvmCodeIdx >= 0 && parts[headerIndices.cvmCodeIdx]
        ? validateAndNormalizeCvmCode(parts[headerIndices.cvmCodeIdx])
        : null;

      const cnpj = headerIndices.cnpjIdx >= 0 && parts[headerIndices.cnpjIdx]
        ? validateAndNormalizeCnpj(parts[headerIndices.cnpjIdx])
        : null;

      if (!cvmCode && !cnpj) {
        metrics.corruptedLinesCount++;
        continue;
      }

      const rawClass = headerIndices.classIdx >= 0 ? parts[headerIndices.classIdx] || null : null;
      const rawPrefSigla = headerIndices.prefClassSiglaIdx >= 0 ? parts[headerIndices.prefClassSiglaIdx] || null : null;
      const securityType = headerIndices.secTypeIdx >= 0 ? parts[headerIndices.secTypeIdx] || null : null;
      const shareClass = extractFcaShareClass(securityType, rawPrefSigla, rawClass);
      const isin = headerIndices.isinIdx >= 0 ? parts[headerIndices.isinIdx] || null : null;

      mappings.push({
        cvmCode,
        cnpj,
        ticker,
        shareClass,
        isin,
        securityType,
        rawValorMobiliario: securityType,
      });

      distinctTickers.add(ticker);
      metrics.validSecuritiesCount++;
    } catch {
      metrics.corruptedLinesCount++;
    }
  }

  metrics.distinctTickersCount = distinctTickers.size;
  return { mappings, metrics };
}
