import {
  CvmIncompatibleShareClassError,
  CvmIneligibleAssetTypeError,
  CvmInsufficientEvidenceError,
  CvmInvalidBindingTransitionError,
  type CvmBindingAuditAction,
  type CvmBindingMatchMethod,
  type CvmBindingStatus,
  type CvmShareClass,
} from './cvm-binding.types';

/**
 * Sinal auxiliar heurístico derivado do sufixo do ticker.
 * ATENÇÃO: Nunca deve ser utilizado como prova única ou definitiva de classe acionária.
 */
export function inferAuxiliaryShareClassFromTicker(ticker: string): CvmShareClass | null {
  if (!ticker || typeof ticker !== 'string') return null;
  const cleanTicker = ticker.trim().toUpperCase();

  const match = cleanTicker.match(/^([A-Z]{4})(3|4|5|6|11)/i);
  if (!match) return null;

  const suffix = match[2];
  if (suffix === '3') return 'ON';
  if (suffix === '4') return 'PN';
  if (suffix === '5') return 'PNA';
  if (suffix === '6') return 'PNB';
  if (suffix === '11') return 'UNT';

  return null;
}

/**
 * Validação rigorosa de compatibilidade entre classe acionária, tipo de ativo e ticker.
 * Rejeita FIIs, BDRs, ETFs e instrumentos incompatíveis com DFP de Companhia Aberta CVM.
 */
export function validateShareClassCompatibility(
  shareClass: CvmShareClass | null | undefined,
  assetType: string,
  ticker: string,
  evidence?: { isUnitDocumented?: boolean }
): void {
  const normalizedType = assetType ? assetType.trim().toUpperCase() : 'UNKNOWN';
  const cleanTicker = ticker ? ticker.trim().toUpperCase() : 'UNKNOWN';

  // 1. Rejeição estrita de instrumentos não corporativos
  const ineligibleTypes = ['FII', 'BDR', 'ETF', 'INDEX', 'BOND', 'CRYPTO', 'OPTION'];
  if (ineligibleTypes.includes(normalizedType)) {
    throw new CvmIneligibleAssetTypeError(
      `Instrumento "${cleanTicker}" do tipo "${assetType}" não é elegível para vinculação com DFP de Companhia Aberta CVM.`
    );
  }

  // 2. Discrepância entre sufixo canônico e classe acionária
  if (shareClass) {
    const canonicalMatch = cleanTicker.match(/^([A-Z]{4})(\d{1,2})/i);
    const suffix = canonicalMatch ? canonicalMatch[2] : null;

    if (suffix) {
      if (suffix === '3' && ['PN', 'PNA', 'PNB'].includes(shareClass)) {
        throw new CvmIncompatibleShareClassError(
          `Discrepância detectada: ticker "${cleanTicker}" (sufixo 3) incompatível com a classe acionária "${shareClass}".`
        );
      }
      if (suffix === '4' && shareClass === 'ON') {
        throw new CvmIncompatibleShareClassError(
          `Discrepância detectada: ticker "${cleanTicker}" (sufixo 4) incompatível com a classe acionária "${shareClass}".`
        );
      }

      // 3. Tickers com final 11 exigem comprovação de Unit quando classificados como UNT
      if (suffix === '11' && shareClass === 'UNT' && evidence?.isUnitDocumented === false) {
        throw new CvmIncompatibleShareClassError(
          `Ticker "${cleanTicker}" com sufixo 11 exige comprovação documental explícita de composição de Unit para vinculação.`
        );
      }
    }
  }
}

/**
 * Validação da evidência documental por método de pareamento.
 */
export function validateBindingProposalEvidence(
  method: CvmBindingMatchMethod,
  justification: string,
  source: string,
  options?: { hasIsin?: boolean; hasCnpjMatch?: boolean }
): void {
  const cleanJustification = justification ? justification.trim() : '';
  const cleanSource = source ? source.trim() : '';

  if (cleanJustification.length < 10) {
    throw new CvmInsufficientEvidenceError(
      'Justificativa documental deve possuir no mínimo 10 caracteres válidos.'
    );
  }

  if (cleanSource.length < 3) {
    throw new CvmInsufficientEvidenceError(
      'Origem do vínculo (source) deve possuir no mínimo 3 caracteres válidos.'
    );
  }

  if (method === 'CURATED_SEED' && options?.hasIsin === false) {
    throw new CvmInsufficientEvidenceError(
      'Método CURATED_SEED exige comprovação por código ISIN oficial B3 e referência ao FCA.'
    );
  }

  if (method === 'CNPJ_EXACT' && options?.hasCnpjMatch === false) {
    throw new CvmInsufficientEvidenceError(
      'Método CNPJ_EXACT exige confirmação de correspondência exata de CNPJ de 14 dígitos entre B3 e CVM.'
    );
  }
}

/**
 * Validação estrita da máquina de estados e determinação da ação auditada.
 */
export function validateBindingTransition(
  currentStatus: CvmBindingStatus,
  targetStatus: CvmBindingStatus
): { action: CvmBindingAuditAction | 'NO_OP' } {
  // 1. Idempotência: repetição do mesmo estado é um no-op
  if (currentStatus === targetStatus) {
    return { action: 'NO_OP' };
  }

  // 2. Homologação: PENDING_REVIEW -> APPROVED
  if (currentStatus === 'PENDING_REVIEW' && targetStatus === 'APPROVED') {
    return { action: 'CVM_BINDING_APPROVED' };
  }

  // 3. Rejeição Inicial: PENDING_REVIEW -> REJECTED
  if (currentStatus === 'PENDING_REVIEW' && targetStatus === 'REJECTED') {
    return { action: 'CVM_BINDING_REJECTED' };
  }

  // 4. Revogação Formal: APPROVED -> REJECTED
  if (currentStatus === 'APPROVED' && targetStatus === 'REJECTED') {
    return { action: 'CVM_BINDING_REVOKED' };
  }

  // 5. Reabertura sob Nova Evidência: REJECTED -> PENDING_REVIEW
  if (currentStatus === 'REJECTED' && targetStatus === 'PENDING_REVIEW') {
    return { action: 'CVM_BINDING_REOPENED' };
  }

  // 6. Transições Proibidas
  if (currentStatus === 'APPROVED' && targetStatus === 'PENDING_REVIEW') {
    throw new CvmInvalidBindingTransitionError(
      'Transição direta de APPROVED para PENDING_REVIEW é proibida. Execute a revogação formal primeiro.'
    );
  }

  if (currentStatus === 'REJECTED' && targetStatus === 'APPROVED') {
    throw new CvmInvalidBindingTransitionError(
      'Transição direta de REJECTED para APPROVED é proibida. O vínculo deve ser reaberto para PENDING_REVIEW primeiro.'
    );
  }

  throw new CvmInvalidBindingTransitionError(
    `Transição de estado inválida: "${currentStatus}" -> "${targetStatus}".`
  );
}
