import type {
  EditorialStatus,
  EditorialDocumentType,
  EditorialRegulatoryFlag,
} from './editorial.types';
import {
  InvalidEditorialStateTransitionError,
  SelfReviewNotAllowedError,
} from './errors';

// ─── Matriz de Transição Válida de Estados Editoriais ────────────────────────
// DRAFT -> IN_REVIEW -> CHANGES_REQUESTED -> APPROVED -> PUBLISHED -> ARCHIVED
const VALID_TRANSITIONS: Record<EditorialStatus, EditorialStatus[]> = {
  DRAFT: ['IN_REVIEW', 'ARCHIVED'],
  IN_REVIEW: ['CHANGES_REQUESTED', 'APPROVED', 'ARCHIVED'],
  CHANGES_REQUESTED: ['DRAFT', 'IN_REVIEW', 'ARCHIVED'],
  APPROVED: ['PUBLISHED', 'DRAFT', 'ARCHIVED'],
  PUBLISHED: ['ARCHIVED'],
  ARCHIVED: ['DRAFT'], // Pode ser reaberto como novo rascunho de revisão, mas nunca direto para PUBLISHED
};

export function canTransitionEditorialStatus(
  currentStatus: EditorialStatus,
  targetStatus: EditorialStatus
): boolean {
  if (currentStatus === targetStatus) return true;
  const allowed = VALID_TRANSITIONS[currentStatus] || [];
  return allowed.includes(targetStatus);
}

export interface TransitionValidationContext {
  isAiAction?: boolean;
  isSelfReview?: boolean;
  allowSelfReviewInDev?: boolean;
}

export function assertValidEditorialTransition(
  currentStatus: EditorialStatus,
  targetStatus: EditorialStatus,
  context?: TransitionValidationContext
): void {
  // 1. Proibição absoluta de ações de IA alterarem para APPROVED ou PUBLISHED
  if (context?.isAiAction && (targetStatus === 'APPROVED' || targetStatus === 'PUBLISHED')) {
    throw new InvalidEditorialStateTransitionError(
      currentStatus,
      targetStatus,
      'Ações de Inteligência Artificial nunca podem aprovar ou publicar conteúdos diretamente.'
    );
  }

  // 2. Proibição de publicação sem aprovação prévia
  if (targetStatus === 'PUBLISHED' && currentStatus !== 'APPROVED') {
    throw new InvalidEditorialStateTransitionError(
      currentStatus,
      targetStatus,
      'Documentos só podem ser publicados a partir do estado "APPROVED" com revisão humana prévia.'
    );
  }

  // 3. Proibição de autoaprovação (segregação de funções)
  if (
    targetStatus === 'APPROVED' &&
    context?.isSelfReview &&
    !context?.allowSelfReviewInDev
  ) {
    throw new SelfReviewNotAllowedError();
  }

  // 4. Verificação de transição válida pela máquina de estados
  if (!canTransitionEditorialStatus(currentStatus, targetStatus)) {
    throw new InvalidEditorialStateTransitionError(currentStatus, targetStatus);
  }
}

// ─── Guardrails Regulatórios Determinísticos ─────────────────────────────────

export function evaluateEditorialGuardrails(
  title: string,
  content: string,
  documentType: EditorialDocumentType
): EditorialRegulatoryFlag[] {
  const flags: EditorialRegulatoryFlag[] = [];
  const fullText = `${title} ${content}`.toLowerCase();

  // 1. BLOCKER: Injeção de scripts e tags HTML inseguras
  const scriptRegex = /<script\b[^>]*>|javascript:|onerror\s*=|onload\s*=/i;
  if (scriptRegex.test(title) || scriptRegex.test(content)) {
    flags.push({
      severity: 'BLOCKER',
      code: 'UNSAFE_HTML_SCRIPTS',
      message: 'Tentativa de inserção de scripts ou tags HTML potencialmente inseguras detectada.',
      recommendation: 'Remova tags <script>, atributos onload/onerror ou referências a javascript:.',
    });
  }

  // 2. BLOCKER: Promessa de rentabilidade ou garantia de retorno
  const returnPromiseRegex =
    /\b(lucro\s+garantido|rentabilidade\s+garantida|retorno\s+garantido|rendimento\s+garantido|ganho\s+garantido|ganho\s+certo|sem\s+risco|enriquecimento\s+r[aá]pido)\b/i;
  if (returnPromiseRegex.test(fullText)) {
    flags.push({
      severity: 'BLOCKER',
      code: 'PROMISE_OF_RETURN',
      message: 'Linguagem contendo promessa de retorno, lucro garantido ou ausência de risco detectada.',
      recommendation: 'Remova termos como "lucro garantido", "ganho certo" ou "sem risco". Investimentos possuem risco de perda de capital.',
    });
  }

  // 3. BLOCKER: Recomendação imperativa / personalizada de compra ou venda de ativos
  const recommendationRegex =
    /(?:^|\s|[.,;!?])(compre\s+agora|venda\s+imediatamente|recomendamos\s+a\s+compra|recomendamos\s+a\s+venda|invista\s+j[aá]|compre\s+esta\s+a[cç][aã]o|venda\s+este\s+ativo)(?:$|\s|[.,;!?])/i;
  if (recommendationRegex.test(fullText)) {
    flags.push({
      severity: 'BLOCKER',
      code: 'DIRECT_INVESTMENT_RECOMMENDATION',
      message: 'Recomendação imperativa direta de compra ou venda de ativo detectada.',
      recommendation: 'Altere o tom para caráter estritamente educativo ou informativo. A plataforma não emite recomendações individuais.',
    });
  }

  // 4. BLOCKER: Certeza absoluta sobre movimentos futuros do mercado
  const certaintyRegex =
    /(?:^|\s|[.,;!?])(com\s+certeza\s+vai\s+subir|com\s+certeza\s+vai\s+cair|o\s+ativo\s+vai\s+explodir|imposs[ií]vel\s+cair)(?:$|\s|[.,;!?])/i;
  if (certaintyRegex.test(fullText)) {
    flags.push({
      severity: 'BLOCKER',
      code: 'MARKET_PREDICTION_CERTAINTY',
      message: 'Afirmação de certeza absoluta sobre movimentos futuros do mercado financeiro.',
      recommendation: 'Apresente cenários probabilísticos ou históricos, sem prometer comportamentos futuros.',
    });
  }

  // 5. BLOCKER: Apresentação de instrução tributária como cálculo oficial ou emissão de DARF
  const taxOfficialRegex =
    /(?:^|\s|[.,;!?])(emiss[aã]o\s+de\s+darf\s+oficial|substitui\s+a\s+receita\s+federal|c[aá]lculo\s+oficial\s+de\s+darf)(?:$|\s|[.,;!?])/i;
  if (taxOfficialRegex.test(fullText)) {
    flags.push({
      severity: 'BLOCKER',
      code: 'OFFICIAL_TAX_CLAIM',
      message: 'Alegação de que a plataforma emite DARF oficial ou substitui a Receita Federal.',
      recommendation: 'Esclareça que os relatórios fiscais são meramente auxiliares para a DIRPF e não constituem DARF.',
    });
  }

  // 6. WARNING: Ausência de disclaimer regulatório quando o tipo de conteúdo exige
  if (documentType === 'MARKET_ANALYSIS') {
    const hasDisclaimer =
      fullText.includes('informativ') ||
      fullText.includes('educativ') ||
      fullText.includes('recomend') ||
      fullText.includes('cvm');
    if (!hasDisclaimer) {
      flags.push({
        severity: 'WARNING',
        code: 'MISSING_MARKET_DISCLAIMER',
        message: 'Artigos sobre mercado devem conter menção ao caráter exclusivamente informativo/educacional.',
        recommendation: 'Adicione uma nota declarando que o conteúdo tem finalidade educativa e não constitui recomendação de investimento.',
      });
    }
  }

  if (documentType === 'TAX_GUIDANCE') {
    const hasTaxDisclaimer =
      fullText.includes('auxiliar') ||
      fullText.includes('orienta') ||
      fullText.includes('receita federal') ||
      fullText.includes('contador');
    if (!hasTaxDisclaimer) {
      flags.push({
        severity: 'WARNING',
        code: 'MISSING_TAX_DISCLAIMER',
        message: 'Guias tributários devem conter menção ao caráter auxiliar e não substitutivo de profissional habilitado.',
        recommendation: 'Adicione o aviso de que a plataforma organiza dados e não substitui contadores ou a Receita Federal.',
      });
    }
  }

  if (documentType === 'OPTIONS_DERIVATIVES') {
    const hasOptionsDisclaimer =
      fullText.includes('risco') ||
      fullText.includes('derivativ') ||
      fullText.includes('ordens');
    if (!hasOptionsDisclaimer) {
      flags.push({
        severity: 'WARNING',
        code: 'MISSING_OPTIONS_DISCLAIMER',
        message: 'Conteúdos sobre opções devem advertir sobre os riscos elevados inerentes ao mercado de derivativos.',
        recommendation: 'Inclua aviso sobre a alta volatilidade e o risco de perda patrimonial em operações com opções.',
      });
    }
  }

  // 7. SUGGESTION: Limitações editoriais gerais (tamanho de título e conteúdo)
  if (title.trim().length < 5) {
    flags.push({
      severity: 'SUGGESTION',
      code: 'SHORT_TITLE',
      message: 'O título do documento é muito curto (mínimo recomendado: 5 caracteres).',
    });
  } else if (title.trim().length > 150) {
    flags.push({
      severity: 'SUGGESTION',
      code: 'LONG_TITLE',
      message: 'O título é muito longo (máximo recomendado: 150 caracteres para boa legibilidade).',
    });
  }

  if (content.trim().length < 20) {
    flags.push({
      severity: 'SUGGESTION',
      code: 'SHORT_CONTENT',
      message: 'O conteúdo do documento é muito breve para publicação.',
    });
  }

  return flags;
}
