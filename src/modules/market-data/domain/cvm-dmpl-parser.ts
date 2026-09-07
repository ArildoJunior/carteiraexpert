import { Decimal } from '@/lib/decimal';
import { validateAndNormalizeCnpj, validateAndNormalizeCvmCode } from './cvm-cad-parser';
import {
  CvmInvalidHeaderError,
  isValidCalendarDate,
  parseStrictPositiveInteger,
  type CvmDfpMetrics,
} from './cvm-parser.types';

export interface ParsedCvmDmplRow {
  cnpj: string;
  cvmCode: string;
  referenceDate: string; // 'YYYY-MM-DD'
  version: number;
  companyLegalName: string;
  statementOrigin: 'DMPL_con' | 'DMPL_ind';
  column: string; // 'Patrimônio Líquido' ou 'Patrimônio Líquido Consolidado'
  accountCode: string; // '5.04.06' ou '5.04.06.xx'
  accountDescription: string; // 'Dividendos'
  accountValue: Decimal;
}

/**
 * Colunas expressamente rejeitadas na DMPL por representarem participações de terceiros
 * ou frações atribuíveis exclusivamente a não controladores de subsidiárias.
 */
export const DMPL_REJECTED_COLUMNS = new Set([
  'participacao dos nao controladores',
  'participacao de nao controladores',
  'nao controladores',
  'participacao dos acionistas nao controladores',
  'participacao de terceiros',
]);

/**
 * Parser streaming do arquivo oficial de DMPL da CVM (dfp_cia_aberta_DMPL_con_YYYY.csv / DMPL_ind).
 *
 * Regras Contábeis e de Governança:
 * 1. Filtra estritamente ORDEM_EXERC = 'ÚLTIMO' (exercício social corrente);
 * 2. Seleciona a coluna de forma determinística:
 *    - DMPL_con: aceita 'Patrimônio Líquido' (controladores) e 'Patrimônio Líquido Consolidado';
 *    - DMPL_ind: aceita exclusivamente 'Patrimônio Líquido';
 *    - Rejeita sempre 'Participação dos Não Controladores' e equivalentes de terceiros;
 * 3. Captura apenas contas de dividendos (5.04.06 e subcontas 5.04.06.*);
 * 4. Rejeita DFC (dividendos pagos), DRE (lucro líquido), JCP (5.04.07) e contas genéricas;
 * 5. Converte escala monetária oficial (MIL -> x1000, UNIDADE -> x1) preservando precisão Decimal;
 * 6. Validação estrita de CNPJ, CD_CVM, DT_REFER e VERSAO.
 */
export async function* parseCvmDmplStream(
  lineStream: AsyncIterable<string>,
  statementOrigin: 'DMPL_con' | 'DMPL_ind',
  metrics?: CvmDfpMetrics
): AsyncGenerator<ParsedCvmDmplRow, void, unknown> {
  if (!statementOrigin || (statementOrigin !== 'DMPL_con' && statementOrigin !== 'DMPL_ind')) {
    throw new Error(
      `statementOrigin é obrigatório no parser DMPL e deve ser 'DMPL_con' ou 'DMPL_ind'. Recebido: ${statementOrigin}`
    );
  }

  let headerIndices: {
    cnpjIdx: number;
    cvmCodeIdx: number;
    refDateIdx: number;
    versionIdx: number;
    companyNameIdx: number;
    scaleIdx: number;
    orderIdx: number;
    colunaDfIdx: number;
    accCodeIdx: number;
    accDescIdx: number;
    accValIdx: number;
  } | null = null;

  for await (const rawLine of lineStream) {
    if (metrics) metrics.totalLinesRead++;
    const line = rawLine.replace(/[\r\n]/g, '').trim();
    if (!line) continue;

    const parts = line.split(';').map((p) => p.trim());

    // 1. Processamento e validação do cabeçalho
    if (!headerIndices) {
      const upperParts = parts.map((p) => p.toUpperCase());
      const cnpjIdx = upperParts.indexOf('CNPJ_CIA');
      const cvmCodeIdx = upperParts.indexOf('CD_CVM');
      const refDateIdx = upperParts.indexOf('DT_REFER');
      const versionIdx = upperParts.indexOf('VERSAO');
      const companyNameIdx = upperParts.indexOf('DENOM_CIA');
      const scaleIdx = upperParts.indexOf('ESCALA_MOEDA');
      const orderIdx = upperParts.indexOf('ORDEM_EXERC');
      const colunaDfIdx = upperParts.indexOf('COLUNA_DF');
      const accCodeIdx = upperParts.indexOf('CD_CONTA');
      const accDescIdx = upperParts.indexOf('DS_CONTA');
      const accValIdx = upperParts.indexOf('VL_CONTA');

      if (
        cnpjIdx === -1 ||
        cvmCodeIdx === -1 ||
        refDateIdx === -1 ||
        versionIdx === -1 ||
        orderIdx === -1 ||
        colunaDfIdx === -1 ||
        accCodeIdx === -1 ||
        accValIdx === -1
      ) {
        throw new CvmInvalidHeaderError(
          'Cabeçalho inválido para demonstrativo DMPL: colunas obrigatórias ausentes.'
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
        colunaDfIdx,
        accCodeIdx,
        accDescIdx,
        accValIdx,
      };
      continue;
    }

    // 2. Filtro estrito de ORDEM_EXERC = 'ÚLTIMO'
    const orderExerc = parts[headerIndices.orderIdx]?.toUpperCase();
    if (orderExerc !== 'ÚLTIMO') {
      if (metrics) metrics.skippedPenultimoLines++;
      continue;
    }

    // 3. Filtro e Seleção Determinística da COLUNA_DF
    const column = parts[headerIndices.colunaDfIdx];
    if (!column) continue;

    const normColumn = column
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

    // Rejeição incondicional de participação de não controladores e terceiros
    if (DMPL_REJECTED_COLUMNS.has(normColumn)) {
      continue;
    }

    // Filtro positivo por tipo de demonstrativo oficial
    if (statementOrigin === 'DMPL_con') {
      if (column !== 'Patrimônio Líquido' && column !== 'Patrimônio Líquido Consolidado') {
        continue;
      }
    } else if (statementOrigin === 'DMPL_ind') {
      if (column !== 'Patrimônio Líquido') {
        continue;
      }
    } else {
      continue;
    }

    // 4. Filtro preliminar de código de conta: apenas 5.04.06 ou subcontas 5.04.06.*
    const accountCode = parts[headerIndices.accCodeIdx];
    if (accountCode !== '5.04.06' && !/^5\.04\.06\.\d+$/.test(accountCode)) {
      continue;
    }

    // 5. Validação e normalização de campos
    try {
      const cnpj = validateAndNormalizeCnpj(parts[headerIndices.cnpjIdx]);
      const cvmCode = validateAndNormalizeCvmCode(parts[headerIndices.cvmCodeIdx]);
      const referenceDate = parts[headerIndices.refDateIdx];
      if (!isValidCalendarDate(referenceDate)) {
        if (metrics) metrics.corruptedLinesCount++;
        continue;
      }

      const versionRaw = parts[headerIndices.versionIdx];
      const version = parseStrictPositiveInteger(versionRaw);
      if (version === null) {
        if (metrics) metrics.corruptedLinesCount++;
        continue;
      }

      const companyLegalName =
        headerIndices.companyNameIdx >= 0 ? parts[headerIndices.companyNameIdx] : 'COMPANHIA CVM';
      const accountDescription =
        headerIndices.accDescIdx >= 0 ? parts[headerIndices.accDescIdx] : '';

      const scale = headerIndices.scaleIdx >= 0 ? parts[headerIndices.scaleIdx]?.toUpperCase() : 'UNIDADE';
      const valRaw = parts[headerIndices.accValIdx];

      if (!valRaw || !/^-?\d+(\.\d+)?$/.test(valRaw)) {
        if (metrics) metrics.corruptedLinesCount++;
        continue;
      }

      // 6. Conversão Numérica com Decimal e Escala
      const rawDecimal = new Decimal(valRaw);
      let accountValue: Decimal;

      if (scale === 'MIL') {
        accountValue = rawDecimal.mul(1000);
      } else if (scale === 'UNIDADE') {
        accountValue = rawDecimal;
      } else {
        if (metrics) metrics.invalidScaleLines++;
        continue;
      }

      if (metrics) metrics.relevantLinesProcessed++;

      yield {
        cnpj,
        cvmCode,
        referenceDate,
        version,
        companyLegalName,
        statementOrigin,
        column,
        accountCode,
        accountDescription,
        accountValue,
      };
    } catch {
      if (metrics) metrics.corruptedLinesCount++;
    }
  }
}
