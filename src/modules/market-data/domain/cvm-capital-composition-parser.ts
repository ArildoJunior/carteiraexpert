import { Decimal } from '@/lib/decimal';
import { validateAndNormalizeCnpj } from './cvm-cad-parser';
import {
  type CvmShareClass,
  isCvmShareClass,
} from './cvm-binding.types';
import {
  CvmInvalidHeaderError,
  isValidCalendarDate,
  parseStrictPositiveInteger,
  type CvmCapitalCompositionData,
} from './cvm-parser.types';

export type { CvmCapitalCompositionData };

/**
 * Contexto mínimo de validação entre o demonstrativo contábil e a composição acionária.
 */
export interface CvmStatementCompositionContext {
  cnpj: string;
  referenceDate: string;
  version: number;
  netIncome?: Decimal | null;
  officialLpa?: Decimal | null;
  totalEquity?: Decimal | null;
}

/**
 * Parser streaming do arquivo oficial de composição do capital social da CVM (dfp_cia_aberta_composicao_capital_YYYY.csv).
 * Não aplica fatores arbitrários de conversão nem heurísticas de escala monetária.
 */
export async function* parseCvmCapitalCompositionStream(
  lineStream: AsyncIterable<string>
): AsyncGenerator<CvmCapitalCompositionData, void, unknown> {
  let headerIndices: {
    cnpjIdx: number;
    refDateIdx: number;
    versionIdx: number;
    companyNameIdx: number;
    ordinIdx: number;
    prefIdx: number;
    totalIdx: number;
  } | null = null;

  for await (const rawLine of lineStream) {
    const line = rawLine.replace(/[\r\n]/g, '').trim();
    if (!line) { continue; }

    const parts = line.split(';').map((p) => p.trim());

    // 1. Validação e Mapeamento de Índices do Cabeçalho
    if (!headerIndices) {
      const upperParts = parts.map((p) => p.toUpperCase());
      const cnpjIdx = upperParts.indexOf('CNPJ_CIA');
      const refDateIdx = upperParts.indexOf('DT_REFER');
      const versionIdx = upperParts.indexOf('VERSAO');
      const companyNameIdx = upperParts.indexOf('DENOM_CIA');
      const ordinIdx = upperParts.indexOf('QT_ACAO_ORDIN_CAP_INTEGR');
      const prefIdx = upperParts.indexOf('QT_ACAO_PREF_CAP_INTEGR');
      const totalIdx = upperParts.indexOf('QT_ACAO_TOTAL_CAP_INTEGR');

      if (
        cnpjIdx === -1 ||
        refDateIdx === -1 ||
        versionIdx === -1 ||
        ordinIdx === -1 ||
        prefIdx === -1 ||
        totalIdx === -1
      ) {
        throw new CvmInvalidHeaderError(
          'Cabeçalho inválido para composição de capital CVM: colunas obrigatórias ausentes.'
        );
      }

      headerIndices = {
        cnpjIdx,
        refDateIdx,
        versionIdx,
        companyNameIdx,
        ordinIdx,
        prefIdx,
        totalIdx,
      };
      continue;
    }

    // 2. Validação e Normalização de Identificadores e Metadados
    try {
      const cnpj = validateAndNormalizeCnpj(parts[headerIndices.cnpjIdx]);
      const referenceDate = parts[headerIndices.refDateIdx];
      if (!isValidCalendarDate(referenceDate)) {
        continue;
      }

      const versionRaw = parts[headerIndices.versionIdx];
      const version = parseStrictPositiveInteger(versionRaw);
      if (version === null) {
        continue;
      }

      const companyLegalName =
        headerIndices.companyNameIdx >= 0 ? parts[headerIndices.companyNameIdx] : undefined;

      // 3. Extração estrita de quantidades de ações
      // Diferenciação: se contiver apenas dígitos -> Decimal(val) (incluindo 0); se vazio -> null; se corrompido -> descarta linha
      const parseShareQuantity = (rawVal?: string): { value: Decimal | null; isCorrupted: boolean } => {
        if (!rawVal || rawVal.trim() === '') { return { value: null, isCorrupted: false }; }
        const trimmed = rawVal.trim();
        if (!/^\d+$/.test(trimmed)) { return { value: null, isCorrupted: true }; }
        return { value: new Decimal(trimmed), isCorrupted: false };
      };

      const parsedOrdin = parseShareQuantity(parts[headerIndices.ordinIdx]);
      const parsedPref = parseShareQuantity(parts[headerIndices.prefIdx]);
      const parsedTotal = parseShareQuantity(parts[headerIndices.totalIdx]);

      if (parsedOrdin.isCorrupted || parsedPref.isCorrupted || parsedTotal.isCorrupted) {
        continue;
      }

      yield {
        cnpj,
        referenceDate,
        version,
        companyLegalName,
        ordinaryShares: parsedOrdin.value,
        preferredShares: parsedPref.value,
        totalShares: parsedTotal.value,
      };
    } catch {
      // Descarta linhas individuais corrompidas preservando o processamento das demais
    }
  }
}

/**
 * Resolve determinística e estritamente a quantidade de ações emitida (shares_count)
 * com base na classe homologada do ativo (share_class), validando compatibilidade
 * de companhia, período e versão quando o contexto do demonstrativo for fornecido.
 *
 * Regras:
 * - ON -> quantidade ordinária integralizada (QT_ACAO_ORDIN_CAP_INTEGR)
 * - PN, PNA ou PNB -> quantidade preferencial integralizada (QT_ACAO_PREF_CAP_INTEGR)
 * - UNT -> quantidade total integralizada (QT_ACAO_TOTAL_CAP_INTEGR)
 * - Classe ausente, desconhecida ou ambígua -> null (sem fallback silencioso)
 * - Incompatibilidade de companhia, data ou versão -> null
 * - Quantidade declarada como zero -> Decimal(0)
 * - Quantidade ausente ou não numérica -> null
 */
export function resolveSharesCountByClass(
  composition: CvmCapitalCompositionData | null | undefined,
  shareClass?: CvmShareClass | string | null,
  statementContext?: CvmStatementCompositionContext
): Decimal | null {
  if (!composition) { return null; }
  if (!shareClass || !isCvmShareClass(shareClass)) { return null; }

  // Validação de compatibilidade estrita com o contexto contábil
  if (statementContext) {
    const compCnpj = composition.cnpj.replace(/\D/g, '');
    const ctxCnpj = statementContext.cnpj.replace(/\D/g, '');
    if (compCnpj !== ctxCnpj) { return null; }
    if (composition.referenceDate !== statementContext.referenceDate) { return null; }
    if (composition.version !== statementContext.version) { return null; }
  }

  let rawCount: Decimal | null = null;
  switch (shareClass) {
    case 'ON':
      rawCount = composition.ordinaryShares;
      break;
    case 'PN':
    case 'PNA':
    case 'PNB':
      rawCount = composition.preferredShares;
      break;
    case 'UNT':
      rawCount = composition.totalShares;
      break;
    default:
      return null;
  }

  if (rawCount === null) {
    return null;
  }

  // Calibração determinística de escala da CVM:
  // A CVM não declara a escala no arquivo dfp_cia_aberta_composicao_capital.
  // Determinadas companhias (ex: Ambev, Vale, Itaú) informam quantidades em milhares de ações,
  // enquanto outras (ex: Petrobras, Magazine Luiza, WEG) informam em unidades.
  let scaleMultiplier = 1;

  if (statementContext && rawCount.gt(0)) {
    const { netIncome, officialLpa, totalEquity } = statementContext;

    // 1. Calibração primária: confronto estrito entre (Lucro Líquido / rawCount) e LPA Oficial da DRE (conta 3.99)
    if (officialLpa?.gt(0) && netIncome && !netIncome.isZero()) {
      const impliedLpaRaw = netIncome.abs().dividedBy(rawCount);
      const ratio = impliedLpaRaw.dividedBy(officialLpa);
      // Se a razão estiver na faixa de 400x a 2.500x (~1.000x), a escala reportada é em milhares
      if (ratio.gte(400) && ratio.lte(2500)) {
        scaleMultiplier = 1000;
      } else if (ratio.gte(0.4) && ratio.lte(2.5)) {
        scaleMultiplier = 1;
      }
    }

    // 2. Calibração secundária: sanidade de VPA caso LPA oficial não esteja disponível ou seja inconclusivo
    if (scaleMultiplier === 1 && totalEquity && totalEquity.gt(0)) {
      const vpaRaw = totalEquity.dividedBy(rawCount);
      // No mercado brasileiro de capitais abertos, um VPA cru > R$ 1.000/ação indica escala em milhares
      if (vpaRaw.gt(1000)) {
        scaleMultiplier = 1000;
      }
    }
  }

  return scaleMultiplier === 1000 ? rawCount.mul(1000) : rawCount;
}

