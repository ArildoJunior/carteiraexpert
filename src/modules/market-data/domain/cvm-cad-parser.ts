import { classifyCvmSector } from './cvm.schema';
import type { CvmCompanyStatus } from './cvm.types';
import {
  CvmCorruptedDataError,
  CvmInvalidHeaderError,
  CvmInvalidIdentifierError,
  type CvmCadCompany,
  type CvmCadMetrics,
} from './cvm-parser.types';

/**
 * Validação rigorosa de CNPJ: deve conter exatamente 14 dígitos numéricos válidos.
 * Rejeita valores nulos, vazios ou formados exclusivamente por zeros.
 */
export function validateAndNormalizeCnpj(raw: string | null | undefined): string {
  if (!raw) {
    throw new CvmInvalidIdentifierError('CNPJ não fornecido ou vazio.');
  }
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 14 || digits === '00000000000000') {
    throw new CvmInvalidIdentifierError(
      `CNPJ inválido: "${raw}" (deve possuir exatamente 14 dígitos numéricos não nulos).`
    );
  }
  return digits;
}

/**
 * Validação rigorosa de Código CVM: deve ser numérico positivo entre 1 e 6 dígitos.
 * Aplica padStart(6, '0') exclusivamente após a validação do valor.
 */
export function validateAndNormalizeCvmCode(raw: string | null | undefined): string {
  if (!raw) {
    throw new CvmInvalidIdentifierError('Código CVM não fornecido ou vazio.');
  }
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 0 || digits.length > 6 || parseInt(digits, 10) === 0) {
    throw new CvmInvalidIdentifierError(
      `Código CVM inválido: "${raw}" (deve ser numérico entre 1 e 6 dígitos positivos).`
    );
  }
  return digits.padStart(6, '0');
}

/**
 * Converte string YYYY-MM-DD em Date UTC à meia-noite.
 */
export function parseCvmDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const [year, month, day] = trimmed.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Parser em streaming linha a linha para o arquivo oficial cad_cia_aberta.csv.
 */
export async function parseCvmCadStream(
  lineStream: AsyncIterable<string>
): Promise<{ companies: Map<string, CvmCadCompany>; metrics: CvmCadMetrics }> {
  const companies = new Map<string, CvmCadCompany>();
  const metrics: CvmCadMetrics = {
    totalLinesRead: 0,
    companiesProcessed: 0,
    activeCompanies: 0,
    canceledCompanies: 0,
    suspendedCompanies: 0,
    eligibleSectorsCount: 0,
    skippedUnsupportedSectors: 0,
    corruptedLinesCount: 0,
  };

  let headerIndices: {
    cnpjIdx: number;
    cvmCodeIdx: number;
    legalNameIdx: number;
    tradeNameIdx: number;
    sectorIdx: number;
    marketTypeIdx: number;
    statusIdx: number;
    regDateIdx: number;
    cancelDateIdx: number;
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
      const legalNameIdx = upperParts.indexOf('DENOM_SOCIAL');
      const tradeNameIdx = upperParts.indexOf('DENOM_COMERC');
      const sectorIdx = upperParts.indexOf('SETOR_ATIV');
      const marketTypeIdx = upperParts.indexOf('TP_MERC');
      const statusIdx = upperParts.indexOf('SIT');
      const regDateIdx = upperParts.indexOf('DT_REG');
      const cancelDateIdx = upperParts.indexOf('DT_CANCEL');

      if (cnpjIdx === -1 || cvmCodeIdx === -1 || legalNameIdx === -1 || statusIdx === -1) {
        throw new CvmInvalidHeaderError(
          'Cabeçalho do cad_cia_aberta.csv inválido: colunas essenciais ausentes.'
        );
      }

      headerIndices = {
        cnpjIdx,
        cvmCodeIdx,
        legalNameIdx,
        tradeNameIdx,
        sectorIdx,
        marketTypeIdx,
        statusIdx,
        regDateIdx,
        cancelDateIdx,
      };
      continue;
    }

    // 2. Extração e Validação dos Campos da Linha
    try {
      const cnpj = validateAndNormalizeCnpj(parts[headerIndices.cnpjIdx]);
      const cvmCode = validateAndNormalizeCvmCode(parts[headerIndices.cvmCodeIdx]);
      const legalName = parts[headerIndices.legalNameIdx];

      if (!legalName) {
        metrics.corruptedLinesCount++;
        continue;
      }

      const tradeName = headerIndices.tradeNameIdx >= 0 ? parts[headerIndices.tradeNameIdx] || null : null;
      const rawSector = headerIndices.sectorIdx >= 0 ? parts[headerIndices.sectorIdx] || null : null;
      const marketType = headerIndices.marketTypeIdx >= 0 ? parts[headerIndices.marketTypeIdx] || null : null;
      const rawStatus = parts[headerIndices.statusIdx] || 'ATIVO';

      let status: CvmCompanyStatus = 'ATIVO';
      if (rawStatus.toUpperCase().includes('CANCELADA')) {
        status = 'CANCELADA';
      } else if (rawStatus.toUpperCase().includes('SUSPENSO')) {
        status = 'SUSPENSO(A) - DECISÃO ADM';
      }

      const sectorRule = classifyCvmSector(rawSector);
      const registrationDate = headerIndices.regDateIdx >= 0 ? parseCvmDate(parts[headerIndices.regDateIdx]) : null;
      const cancellationDate = headerIndices.cancelDateIdx >= 0 ? parseCvmDate(parts[headerIndices.cancelDateIdx]) : null;

      const company: CvmCadCompany = {
        cvmCode,
        cnpj,
        legalName,
        tradeName,
        industrySector: rawSector,
        marketType,
        status,
        sectorClassification: sectorRule.classification,
        sectorDecision: sectorRule.decision,
        registrationDate,
        cancellationDate,
      };

      // Se a companhia ainda não foi contabilizada no mapa, atualiza métricas de setor
      if (!companies.has(cnpj)) {
        metrics.companiesProcessed++;
        if (status === 'ATIVO') metrics.activeCompanies++;
        else if (status === 'CANCELADA') metrics.canceledCompanies++;
        else metrics.suspendedCompanies++;

        if (sectorRule.decision === 'PROCESSABLE') {
          metrics.eligibleSectorsCount++;
        } else {
          metrics.skippedUnsupportedSectors++;
        }
      }

      // Em caso de duplicidade de registro (ex: companhia com registros em bolsa e balcão), preserva o mais abrangente
      companies.set(cnpj, company);
    } catch (err: any) {
      if (err instanceof CvmInvalidIdentifierError || err instanceof CvmCorruptedDataError) {
        metrics.corruptedLinesCount++;
      } else {
        metrics.corruptedLinesCount++;
      }
    }
  }

  return { companies, metrics };
}
