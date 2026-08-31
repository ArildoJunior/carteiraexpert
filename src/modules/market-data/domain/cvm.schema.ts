import { z } from 'zod';
import type { CvmSectorClassification, CvmSectorDecision, CvmSectorRule } from './cvm.types';

// ─── CVM Source Reference Contract ──────────────────────────────────────────
export const cvmSourceReferenceSchema = z.object({
  source: z.literal('cvm_dfp'),
  fileId: z.string().uuid(),
  runId: z.string().uuid(),
  cnpj: z.string().regex(/^\d{14}$/, 'CNPJ deve conter exatamente 14 dígitos numéricos'),
  cvmCode: z.string().regex(/^\d{6}$/, 'Código CVM deve conter exatamente 6 dígitos numéricos'),
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data-base deve estar no formato YYYY-MM-DD'),
  periodType: z.enum(['annual', 'quarterly', 'ttm']),
  statementType: z.enum(['CONSOLIDATED', 'INDIVIDUAL']),
  exerciseOrder: z.literal('ÚLTIMO'),
  version: z.number().int().min(1),
  parserVersion: z.string().min(1),
  entityLevel: z.literal('COMPANY'),
  assetBindingPurpose: z.literal('PUBLICATION_ALIAS'),
});

export const cvmCompanyStatusSchema = z.enum(['ATIVO', 'CANCELADA', 'SUSPENSO(A) - DECISÃO ADM']);
export const cvmDocumentTypeSchema = z.enum(['CAD', 'DFP', 'ITR', 'FCA', 'META']);
export const cvmSourceFileStatusSchema = z.enum(['DOWNLOADED', 'AVAILABLE', 'INVALID']);
export const cvmIngestionRunStatusSchema = z.enum([
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'ABANDONED',
  'CANCELLED',
  'DRY_RUN_SUCCESS',
  'DRY_RUN_FAILED',
]);
export const cvmExecutionModeSchema = z.enum(['CLI_MANUAL', 'CLI_SCHEDULED', 'DRY_RUN']);
export const cvmCompanyAssetStatusSchema = z.enum(['APPROVED', 'PENDING_REVIEW', 'REJECTED']);
export const cvmMatchMethodSchema = z.enum(['CURATED_SEED', 'CNPJ_EXACT', 'MANUAL', 'HEURISTIC']);

// ─── Dicionário Canônico dos 70 Setores da CVM ──────────────────────────────
export const CVM_SECTORS_CATALOG: Record<string, { classification: CvmSectorClassification; decision: CvmSectorDecision; justification: string }> = {
  'AGRICULTURA (AÇÚCAR, ÁLCOOL E CANA)': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Setor agroindustrial com DRE padrão' },
  'ALIMENTOS': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Indústria de alimentos com DRE padrão' },
  'ARRENDAMENTO MERCANTIL': { classification: 'FINANCIAL_COSIF', decision: 'SKIPPED', justification: 'Instituição financeira regulada (COSIF)' },
  'BANCOS': { classification: 'FINANCIAL_COSIF', decision: 'SKIPPED', justification: 'Instituição financeira bancária (COSIF)' },
  'BEBIDAS E FUMO': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Indústria comercial com DRE padrão' },
  'BOLSAS DE VALORES/MERCADORIAS E FUTUROS': { classification: 'FINANCIAL_COSIF', decision: 'SKIPPED', justification: 'Infraestrutura de mercado financeiro' },
  'BRINQUEDOS E LAZER': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Indústria e comércio com DRE padrão' },
  'COMUNICAÇÃO E INFORMÁTICA': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Setor de tecnologia/serviços com DRE padrão' },
  'COMÉRCIO (ATACADO E VAREJO)': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Setor varejista/atacadista com DRE padrão' },
  'COMÉRCIO EXTERIOR': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Setor comercial com DRE padrão' },
  'CONSTRUÇÃO CIVIL, MAT. CONSTR. E DECORAÇÃO': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Setor industrial/construção com DRE padrão' },
  'CRÉDITO IMOBILIÁRIO': { classification: 'FINANCIAL_COSIF', decision: 'SKIPPED', justification: 'Sociedade de crédito financeiro' },
  'EDUCAÇÃO': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Setor de serviços educacionais' },
  'EMBALAGENS': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Indústria de embalagens com DRE padrão' },
  'EMP. ADM. PART. - AGRICULTURA (AÇÚCAR, ÁLCOOL E CANA)': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Holding operacional agroindustrial' },
  'EMP. ADM. PART. - ALIMENTOS': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Holding operacional do setor de alimentos' },
  'EMP. ADM. PART. - ARRENDAMENTO MERCANTIL': { classification: 'FINANCIAL_COSIF', decision: 'SKIPPED', justification: 'Holding de arrendamento financeiro' },
  'EMP. ADM. PART. - BANCOS': { classification: 'FINANCIAL_COSIF', decision: 'SKIPPED', justification: 'Holding bancária financeira' },
  'EMP. ADM. PART. - BRINQUEDOS E LAZER': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Holding operacional comercial' },
  'EMP. ADM. PART. - COMUNICAÇÃO E INFORMÁTICA': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Holding operacional de tecnologia' },
  'EMP. ADM. PART. - COMÉRCIO (ATACADO E VAREJO)': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Holding operacional do comércio' },
  'EMP. ADM. PART. - CONST. CIVIL, MAT. CONST. E DECORAÇÃO': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Holding operacional de construção' },
  'EMP. ADM. PART. - CRÉDITO IMOBILIÁRIO': { classification: 'FINANCIAL_COSIF', decision: 'SKIPPED', justification: 'Holding de crédito financeiro' },
  'EMP. ADM. PART. - EDUCAÇÃO': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Holding operacional de educação' },
  'EMP. ADM. PART. - EMBALAGENS': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Holding operacional de embalagens' },
  'EMP. ADM. PART. - ENERGIA ELÉTRICA': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Holding operacional de energia elétrica' },
  'EMP. ADM. PART. - EXTRAÇÃO MINERAL': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Holding operacional de mineração' },
  'EMP. ADM. PART. - FARMACÊUTICO E HIGIENE': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Holding operacional farmacêutica' },
  'EMP. ADM. PART. - GRÁFICAS E EDITORAS': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Holding operacional gráfica' },
  'EMP. ADM. PART. - HOSPEDAGEM E TURISMO': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Holding operacional de turismo' },
  'EMP. ADM. PART. - INTERMEDIAÇÃO FINANCEIRA': { classification: 'FINANCIAL_COSIF', decision: 'SKIPPED', justification: 'Holding financeira' },
  'EMP. ADM. PART. - METALURGIA E SIDERURGIA': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Holding operacional de siderurgia' },
  'EMP. ADM. PART. - MÁQS., EQUIP., VEÍC. E PEÇAS': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Holding operacional de máquinas' },
  'EMP. ADM. PART. - PAPEL E CELULOSE': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Holding operacional de papel e celulose' },
  'EMP. ADM. PART. - PETROQUÍMICOS E BORRACHA': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Holding operacional petroquímica' },
  'EMP. ADM. PART. - PETRÓLEO E GÁS': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Holding operacional de petróleo' },
  'EMP. ADM. PART. - SANEAMENTO, SERV. ÁGUA E GÁS': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Holding operacional de saneamento' },
  'EMP. ADM. PART. - SECURITIZAÇÃO DE RECEBÍVEIS': { classification: 'FINANCIAL_COSIF', decision: 'SKIPPED', justification: 'Holding de securitização financeira' },
  'EMP. ADM. PART. - SEGURADORAS E CORRETORAS': { classification: 'FINANCIAL_COSIF', decision: 'SKIPPED', justification: 'Holding de seguros/previdência' },
  'EMP. ADM. PART. - SEM SETOR PRINCIPAL': { classification: 'HOLDING_PURE', decision: 'SKIPPED', justification: 'Holding sem setor definido no cadastro' },
  'EMP. ADM. PART. - SERVIÇOS TRANSPORTE E LOGÍSTICA': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Holding operacional de transportes' },
  'EMP. ADM. PART. - SERVIÇOS MÉDICOS': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Holding operacional de saúde' },
  'EMP. ADM. PART. - TELECOMUNICAÇÕES': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Holding operacional de telecom' },
  'EMP. ADM. PART. - TÊXTIL E VESTUÁRIO': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Holding operacional têxtil' },
  'EMP. ADM. PART.-BOLSAS DE VALORES/MERCADORIAS E FUTUROS': { classification: 'FINANCIAL_COSIF', decision: 'SKIPPED', justification: 'Holding financeira de bolsas' },
  'EMP. ADM. PARTICIPAÇÕES': { classification: 'HOLDING_PURE', decision: 'SKIPPED', justification: 'Holding pura sem segmento discriminado' },
  'ENERGIA ELÉTRICA': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Setor de energia elétrica com DRE padrão' },
  'EXTRAÇÃO MINERAL': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Setor de mineração com DRE padrão' },
  'FACTORING': { classification: 'FINANCIAL_COSIF', decision: 'SKIPPED', justification: 'Sociedade de fomento mercantil financeiro' },
  'FARMACÊUTICO E HIGIENE': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Indústria farmacêutica com DRE padrão' },
  'GRÁFICAS E EDITORAS': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Indústria gráfica com DRE padrão' },
  'HOSPEDAGEM E TURISMO': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Setor hoteleiro com DRE padrão' },
  'INTERMEDIAÇÃO FINANCEIRA': { classification: 'FINANCIAL_COSIF', decision: 'SKIPPED', justification: 'Instituição financeira regulada (COSIF)' },
  'METALURGIA E SIDERURGIA': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Indústria siderúrgica com DRE padrão' },
  'MÁQUINAS, EQUIPAMENTOS, VEÍCULOS E PEÇAS': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Indústria mecânica/automotiva com DRE padrão' },
  'OUTRAS ATIVIDADES INDUSTRIAIS': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Atividades industriais diversas' },
  'PAPEL E CELULOSE': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Indústria de papel/celulose com DRE padrão' },
  'PESCA': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Setor de pesca/aquicultura com DRE padrão' },
  'PETROQUÍMICOS E BORRACHA': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Indústria petroquímica com DRE padrão' },
  'PETRÓLEO E GÁS': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Setor de óleo e gás com DRE padrão' },
  'REFLORESTAMENTO': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Silvicultura com DRE padrão' },
  'SANEAMENTO, SERV. ÁGUA E GÁS': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Setor de saneamento e utilidades' },
  'SECURITIZAÇÃO DE RECEBÍVEIS': { classification: 'FINANCIAL_COSIF', decision: 'SKIPPED', justification: 'Securitizadora financeira' },
  'SEGURADORAS E CORRETORAS': { classification: 'FINANCIAL_COSIF', decision: 'SKIPPED', justification: 'Seguradora regulada por SUSEP/COSIF' },
  'SERVIÇOS DIVERSOS': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Setor de serviços gerais com DRE padrão' },
  'SERVIÇOS MÉDICOS': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Setor hospitalar/saúde com DRE padrão' },
  'SERVIÇOS TRANSPORTE E LOGÍSTICA': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Setor logístico com DRE padrão' },
  'SERVIÇOS EM GERAL': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Setor de serviços com DRE padrão' },
  'TELECOMUNICAÇÕES': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Setor de telecomunicações com DRE padrão' },
  'TÊXTIL E VESTUÁRIO': { classification: 'ELIGIBLE_COMMERCIAL_INDUSTRIAL', decision: 'PROCESSABLE', justification: 'Indústria têxtil com DRE padrão' },
};

/**
 * Classifica e valida o setor de atividade da CVM de acordo com a política de negócio.
 * Qualquer setor desconhecido ou não homologado é categorizado como UNKNOWN e SKIPPED.
 */
export function classifyCvmSector(rawSector: string | null | undefined): CvmSectorRule {
  if (!rawSector) {
    return {
      original: '',
      normalized: '',
      classification: 'UNKNOWN',
      decision: 'SKIPPED',
      justification: 'Setor não informado no cadastro CVM',
    };
  }

  const normalized = rawSector.trim().toUpperCase();
  const rule = CVM_SECTORS_CATALOG[normalized];

  if (rule) {
    return {
      original: rawSector,
      normalized,
      classification: rule.classification,
      decision: rule.decision,
      justification: rule.justification,
    };
  }

  return {
    original: rawSector,
    normalized,
    classification: 'UNKNOWN',
    decision: 'SKIPPED',
    justification: 'Setor não homologado ou não catalogado no MVP',
  };
}
