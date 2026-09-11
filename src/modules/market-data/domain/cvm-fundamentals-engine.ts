import { Decimal } from '@/lib/decimal';
import type { CvmAggregatedStatement } from './cvm-parser.types';
import {
  CvmFinancialSanityError,
  CvmIncompleteStatementError,
  type ConvertedFundamentals,
  type CvmPeriodType,
  type CvmRawStatementData,
} from './cvm-fundamentals.types';
import { rawStatementDataSchema } from './cvm-fundamentals.schema';
import {
  resolveSharesCountByClass,
  type CvmCapitalCompositionData,
  type CvmStatementCompositionContext,
} from './cvm-capital-composition-parser';
import type { CvmShareClass } from './cvm-binding.types';
import { DMPL_REJECTED_COLUMNS } from './cvm-dmpl-parser';

export { resolveSharesCountByClass, type CvmCapitalCompositionData, type CvmStatementCompositionContext };

export interface ConvertStatementOptions {
  shareClass?: CvmShareClass | null;
}

/**
 * Converte a data de referência 'YYYY-MM-DD' para o identificador canônico de período 'YYYY-FY'.
 */
export function formatReferencePeriod(referenceDate: string, periodType: CvmPeriodType = 'annual'): string {
  const year = referenceDate.slice(0, 4);
  if (!/^\d{4}$/.test(year)) {
    throw new CvmFinancialSanityError(
      `Data de referência inválida para formatação de período: "${referenceDate}".`,
      'INVALID_REFERENCE_DATE',
      { referenceDate }
    );
  }
  if (periodType === 'annual') {
    return `${year}-FY`;
  }
  return `${year}-${periodType.toUpperCase()}`;
}

/**
 * Executa verificações de sanidade matemática e contábil sobre os fatos convertidos.
 * Lança CvmFinancialSanityError com motivo específico em caso de anomalia.
 */
export function validateFinancialSanity(fundamentals: ConvertedFundamentals): void {
  // 1. Ativo Total deve ser estritamente positivo
  if (!fundamentals.totalAssets.isPositive() || fundamentals.totalAssets.isZero()) {
    throw new CvmFinancialSanityError(
      `Sanity check violado: Ativo Total deve ser maior que zero (valor: ${fundamentals.totalAssets.toString()}).`,
      'TOTAL_ASSETS_NON_POSITIVE',
      { totalAssets: fundamentals.totalAssets.toString() }
    );
  }

  // 2. Patrimônio Líquido não pode ser nulo ou indefinido (pode ser negativo em caso de passivo a descoberto)
  if (!fundamentals.totalEquity || !(fundamentals.totalEquity instanceof Decimal)) {
    throw new CvmFinancialSanityError(
      'Sanity check violado: Patrimônio Líquido ausente ou formato inválido.',
      'TOTAL_EQUITY_MISSING'
    );
  }

  // 3. Lucro Líquido não pode ser nulo (pode ser positivo, zero ou negativo para prejuízo)
  if (!fundamentals.netIncome || !(fundamentals.netIncome instanceof Decimal)) {
    throw new CvmFinancialSanityError(
      'Sanity check violado: Lucro Líquido ausente ou formato inválido.',
      'NET_INCOME_MISSING'
    );
  }

  // 4. Receita Líquida não pode ser nula
  if (!fundamentals.netRevenue || !(fundamentals.netRevenue instanceof Decimal)) {
    throw new CvmFinancialSanityError(
      'Sanity check violado: Receita Líquida ausente ou formato inválido.',
      'NET_REVENUE_MISSING'
    );
  }

  // 5. Dívida Bruta não pode ser negativa
  if (fundamentals.grossDebt?.isNegative()) {
    throw new CvmFinancialSanityError(
      `Sanity check violado: Dívida Bruta não pode ser negativa (valor: ${fundamentals.grossDebt.toString()}).`,
      'GROSS_DEBT_NEGATIVE',
      { grossDebt: fundamentals.grossDebt.toString() }
    );
  }

  // 6. Caixa e Equivalentes não pode ser negativo
  if (fundamentals.cashEquivalents?.isNegative()) {
    throw new CvmFinancialSanityError(
      `Sanity check violado: Caixa e Equivalentes não pode ser negativo (valor: ${fundamentals.cashEquivalents.toString()}).`,
      'CASH_EQUIVALENTS_NEGATIVE',
      { cashEquivalents: fundamentals.cashEquivalents.toString() }
    );
  }

  // 7. Consistência de Versão
  if (fundamentals.version < 1 || !Number.isInteger(fundamentals.version)) {
    throw new CvmFinancialSanityError(
      `Sanity check violado: Versão do balanço deve ser um inteiro >= 1 (versão: ${fundamentals.version}).`,
      'INVALID_VERSION',
      { version: fundamentals.version }
    );
  }

  // 8. Quantidade de Ações não pode ser negativa
  if (fundamentals.sharesCount?.isNegative()) {
    throw new CvmFinancialSanityError(
      `Sanity check violado: Quantidade de ações não pode ser negativa (valor: ${fundamentals.sharesCount.toString()}).`,
      'SHARES_COUNT_NEGATIVE',
      { sharesCount: fundamentals.sharesCount.toString() }
    );
  }

  // 9. EBITDA, quando presente, deve ser uma instância válida de Decimal
  if (fundamentals.ebitda !== null && !(fundamentals.ebitda instanceof Decimal)) {
    throw new CvmFinancialSanityError(
      'Sanity check violado: EBITDA possui formato inválido.',
      'EBITDA_INVALID_FORMAT'
    );
  }

  // 10. Dividendos Declarados, quando presente, deve ser uma instância válida de Decimal e não negativo
  if (fundamentals.dividendsDeclared !== null) {
    if (!(fundamentals.dividendsDeclared instanceof Decimal)) {
      throw new CvmFinancialSanityError(
        'Sanity check violado: Dividendos Declarados possui formato inválido.',
        'DIVIDENDS_DECLARED_INVALID_FORMAT'
      );
    }
    if (fundamentals.dividendsDeclared.isNegative()) {
      throw new CvmFinancialSanityError(
        `Sanity check violado: Dividendos Declarados não pode ser negativo (valor: ${fundamentals.dividendsDeclared.toString()}).`,
        'DIVIDENDS_DECLARED_NEGATIVE',
        { dividendsDeclared: fundamentals.dividendsDeclared.toString() }
      );
    }
  }
}

/**
 * Validação semântica e contábil estrita de uma conta de DFC para Depreciação e Amortização Operacional.
 * Aceita exclusivamente subcontas do grupo operacional de conciliação da DFC indireta (6.01.01.\d+).
 * Exige obrigatoriamente descrição presente, não ambígua e com termos operacionais comprovados.
 * Rejeita explicitamente contas financeiras, tributárias, de captação, dívida, despesas antecipadas e instrumentos financeiros.
 */
export function isOperatingDepreciationAmortization(
  accountCode: string,
  accountDescription?: string | null
): boolean {
  if (!accountCode || !/^6\.01\.01\.\d+$/.test(accountCode)) { return false; }
  if (!accountDescription || typeof accountDescription !== 'string') { return false; }

  const norm = accountDescription
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  // Rejeita descrições muito curtas ou puramente genéricas/ambíguas
  if (norm.length < 5) { return false; }

  const genericDescriptions = new Set([
    'outros',
    'outras',
    'ajustes',
    'outros ajustes',
    'ajuste ao lucro',
    'ajustes ao lucro ou prejuizo',
    'conciliacao',
    'outras conciliacoes',
    'diversos',
    'outras despesas',
    'outras receitas',
  ]);
  if (genericDescriptions.has(norm)) { return false; }

  // Regra positiva estrita: requer radical comprovado de depreciação, amortização, exaustão ou depleção
  const hasPositiveKeyword =
    norm.includes('depreciac') ||
    norm.includes('amortizac') ||
    norm.includes('exaust') ||
    norm.includes('deplec');

  if (!hasPositiveKeyword) { return false; }

  // Exclusões estritas de amortizações financeiras, dívidas, custos de transação/captação, fiscais ou capital de giro
  const exclusions = [
    'ativo financeiro',
    'ativos financeiros',
    'instrumento financeiro',
    'instrumentos financeiros',
    'instrumento',
    'valor justo',
    'custo amortizado',
    'aplicacao financeira',
    'aplicacoes financeiras',
    'aplicacao',
    'financeir',
    'investimento',
    'equivalente',
    'cambial',
    'variacao cambial',
    'monetari',
    'emprestimo',
    'financiamento',
    'debenture',
    'captacao',
    'transacao',
    'emissao',
    'antecipada',
    'encargo',
    'pis',
    'cofins',
    'linearizacao',
    'receita',
    'diferido',
    'fiscal',
    'tribut',
    'hedge',
    'derivativo',
    'mutuo',
    'arrendamento pago',
    'pagamento de arrendamento',
    'juros',
    'comissao',
    'agio',
    'desagio',
    'perda',
    'estoque',
    'provisao',
    'cliente',
    'fornecedor',
    'titul',
    'renda fixa',
    'credito',
  ];

  for (const ex of exclusions) {
    if (norm.includes(ex)) { return false; }
  }

  return true;
}

/**
 * Extrai e consolida a parcela de Depreciação e Amortização da DFC em Decimal.
 * Suporta segregação em múltiplas subcontas legítimas de 6.01.01 (ex: Imobilizado + Direito de Uso).
 * Diferencia estritamente: conta ausente -> null; conta presente com valor zero -> Decimal(0).
 */
export function extractDfcDepreciationAmortization(
  accounts?: Map<string, Decimal> | null,
  descriptions?: Map<string, string> | null
): Decimal | null {
  if (!accounts || accounts.size === 0) { return null; }

  let total: Decimal | null = null;

  for (const [code, value] of accounts.entries()) {
    const desc = descriptions?.get(code);
    if (isOperatingDepreciationAmortization(code, desc)) {
      if (total === null) {
        total = value;
      } else {
        total = total.add(value);
      }
    }
  }

  return total;
}

/**
 * Validação semântica e contábil estrita de uma conta de DMPL para Dividendos Declarados.
 * Aceita a conta padrão 5.04.06 e subcontas legítimas 5.04.06.\d+.
 * Exige descrição presente, não ambígua e contendo o radical 'divid'.
 * Rejeita explicitamente:
 * - Juros sobre Capital Próprio (5.04.07, 'juros', 'jcp', 'capital proprio');
 * - Dividendos pagos da DFC ('pago', 'pagamento');
 * - Reversões, cancelamentos e prescrições ('revers', 'cancelad', 'prescrit', 'nao reclamad');
 * - Participações de não controladores ('nao controlador');
 * - Tributos e retenções ('tribut', 'imposto', 'retencao').
 */
export function isDeclaredDividendsAccount(
  accountCode: string,
  accountDescription?: string | null
): boolean {
  if (!accountCode) { return false; }
  if (accountCode !== '5.04.06' && !/^5\.04\.06\.\d+$/.test(accountCode)) {
    return false;
  }
  if (!accountDescription || typeof accountDescription !== 'string') {
    return false;
  }

  const norm = accountDescription
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  if (norm.length < 5) { return false; }

  const genericDescriptions = new Set([
    'outros',
    'outras',
    'outras transacoes',
    'ajustes',
    'diversos',
    'outras despesas',
    'outras receitas',
  ]);
  if (genericDescriptions.has(norm)) { return false; }

  // Radical afirmativo obrigatório
  if (!norm.includes('divid')) { return false; }

  // Exclusões estritas
  const exclusions = [
    'juros',
    'jcp',
    'capital proprio',
    'prescrit',
    'revers',
    'cancel',
    'nao reclamad',
    'nao controlador',
    'pago',
    'pagamento',
    'tribut',
    'imposto',
    'retencao',
    'propost',
    'reserva',
  ];

  for (const ex of exclusions) {
    if (norm.includes(ex)) { return false; }
  }

  return true;
}

/**
 * Extrai e consolida a parcela de Dividendos Declarados da DMPL em Decimal.
 * Prioriza a conta sintética oficial padrão 5.04.06.
 * Suporta segregação em múltiplas subcontas 5.04.06.* exclusivamente quando a conta sintética estiver ausente.
 * Converte saídas patrimoniais (negativas na DMPL) em magnitude positiva econômica (val.abs()).
 * Diferencia estritamente: conta ausente -> null; conta presente com valor zero -> Decimal(0).
 */
export function extractDmplDividendsDeclared(
  accounts?: Map<string, Decimal> | null,
  descriptions?: Map<string, string> | null
): Decimal | null {
  if (!accounts || accounts.size === 0) { return null; }

  // 1. Prioridade absoluta para a conta sintética padrão 5.04.06
  if (accounts.has('5.04.06')) {
    const desc = descriptions?.get('5.04.06');
    if (isDeclaredDividendsAccount('5.04.06', desc)) {
      const val = accounts.get('5.04.06');
      if (val) {
        return val.abs();
      }
    }
    return null;
  }

  // 2. Agregação de subcontas 5.04.06.* somente quando a sintética estiver ausente
  let subSum: Decimal | null = null;
  for (const [code, val] of accounts.entries()) {
    if (/^5\.04\.06\.\d+$/.test(code)) {
      const desc = descriptions?.get(code);
      if (isDeclaredDividendsAccount(code, desc)) {
        const absVal = val.abs();
        subSum = subSum === null ? absVal : subSum.add(absVal);
      }
    }
  }

  return subSum;
}

/**
 * Converte um balanço contábil bruto CVM para a estrutura normalizada de fundamentos.
 * Aplica regras estritas para contas obrigatórias, subcontas de Dívida Bruta, Dívida Líquida e
 * resolução determinística de shares_count por classe do ativo.
 */
export function convertStatementToFundamentals(
  statement: CvmRawStatementData,
  options?: ConvertStatementOptions
): ConvertedFundamentals {
  rawStatementDataSchema.parse(statement);

  const accounts = statement.accounts;

  // 1. Contas Contábeis Obrigatórias
  const totalAssets = accounts.get('1');
  if (!totalAssets) {
    throw new CvmIncompleteStatementError('1', 'Conta 1 (Ativo Total) ausente no demonstrativo.');
  }

  const totalEquity = accounts.get('2.03');
  if (!totalEquity) {
    throw new CvmIncompleteStatementError('2.03', 'Conta 2.03 (Patrimônio Líquido) ausente no demonstrativo.');
  }

  const netRevenue = accounts.get('3.01');
  if (!netRevenue) {
    throw new CvmIncompleteStatementError('3.01', 'Conta 3.01 (Receita Líquida) ausente no demonstrativo.');
  }

  // Lucro Líquido: conta primária 3.11 (Consolidado) com fallback para 3.09 (Líquido)
  const netIncome = accounts.get('3.11') ?? accounts.get('3.09');
  if (!netIncome) {
    throw new CvmIncompleteStatementError(
      '3.11 / 3.09',
      'Conta 3.11/3.09 (Lucro Líquido do Período) ausente no demonstrativo.'
    );
  }

  // 2. Caixa e Equivalentes de Caixa (BPA 1.01.01)
  // Diferenciação estrita: conta ausente -> null; conta presente com valor zero -> Decimal(0)
  const cashEquivalents = accounts.get('1.01.01') ?? null;

  // 3. Regra Estrita de Dívida Bruta (grossDebt):
  // Exige explicitamente ambas as subcontas: 2.01.04 (CP) E 2.02.01 (LP). Se faltar qualquer uma, grossDebt = null.
  const shortTermDebt = accounts.get('2.01.04');
  const longTermDebt = accounts.get('2.02.01');

  let grossDebt: Decimal | null = null;
  if (shortTermDebt && longTermDebt) {
    grossDebt = shortTermDebt.add(longTermDebt);
  }

  // 4. Regra Estrita de Dívida Líquida (netDebt):
  // Calculável exclusivamente quando grossDebt E cashEquivalents forem conhecidos; caso contrário, null.
  let netDebt: Decimal | null = null;
  if (grossDebt !== null && cashEquivalents !== null) {
    netDebt = grossDebt.sub(cashEquivalents);
  }

  // 5. EBITDA baseado na DFC (Etapa 3)
  // Requer obrigatoriamente:
  // - EBIT (DRE conta 3.05 - "Resultado Antes do Resultado Financeiro e dos Tributos")
  // - D&A (DFC 6.01.01.* - Depreciação e Amortização Operacional com descrição comprovada)
  // Se qualquer componente faltar, ebitda = null. Proibido o uso da conta 3.99 ou qualquer bypass/fallback não documentado.
  const ebit = accounts.get('3.05') ?? null;

  // D&A deve ser comprovado a partir de subcontas 6.01.01.* com descrições operacionais válidas
  const extractedDA = extractDfcDepreciationAmortization(
    accounts,
    statement.accountDescriptions
  );

  // dfcDepreciationAmortization NÃO pode agir como bypass sem contas DFC oficiais comprovadas
  let depreciationAmortization: Decimal | null = null;
  if (extractedDA !== null) {
    if (
      statement.dfcDepreciationAmortization !== undefined &&
      statement.dfcDepreciationAmortization !== null &&
      !statement.dfcDepreciationAmortization.equals(extractedDA)
    ) {
      // Discrepância não comprovada pela DFC: rejeita
      depreciationAmortization = null;
    } else {
      depreciationAmortization = extractedDA;
    }
  }

  let ebitda: Decimal | null = null;
  if (ebit !== null && depreciationAmortization !== null) {
    ebitda = ebit.add(depreciationAmortization);
  }

  // Extrai LPA Oficial da DRE se disponível (3.99.01.01 primária para ON, 3.99.01 ou 3.99)
  const officialLpa =
    accounts.get('3.99.01.01') ??
    accounts.get('3.99.01') ??
    accounts.get('3.99') ??
    statement.officialLpa ??
    null;

  // Etapa 2: sharesCount resolvido deterministicamente a partir de capitalComposition pela classe homologada do ativo
  const sharesCount = options?.shareClass
    ? resolveSharesCountByClass(statement.capitalComposition, options.shareClass, {
        cnpj: statement.cnpj,
        referenceDate: statement.referenceDate,
        version: statement.version,
        netIncome,
        officialLpa,
        totalEquity,
      })
    : null;

  // 6. Dividendos Declarados baseados na DMPL (Etapa 4)
  // Requer obrigatoriamente evidência explícita de origem DMPL validada (dmplOrigin).
  // Os mapas `accounts` e `accountDescriptions` ou o campo `dmplDividendsDeclared`, isoladamente,
  // NÃO são prova suficiente de origem e são terminantemente rejeitados para impedir injeção artificial.
  let dividendsDeclared: Decimal | null = null;

  if (statement.dmplOrigin) {
    const origin = statement.dmplOrigin;

    // a) Validações de integridade e identidade contábil com o demonstrativo pai
    const isIdentityValid =
      origin.cnpj === statement.cnpj &&
      origin.cvmCode === statement.cvmCode &&
      origin.referenceDate === statement.referenceDate &&
      origin.version === statement.version &&
      origin.statementType === statement.statementType &&
      origin.exerciseOrder === 'ÚLTIMO';

    // b) Compatibilidade estrita entre statementOrigin e statementType:
    // CONSOLIDATED exige DMPL_con; INDIVIDUAL exige DMPL_ind
    const isOriginTypeCompatible =
      (statement.statementType === 'CONSOLIDATED' && origin.statementOrigin === 'DMPL_con') ||
      (statement.statementType === 'INDIVIDUAL' && origin.statementOrigin === 'DMPL_ind');

    // c) Validação de coluna permitida e rejeição de colunas ilegítimas
    const normCol = origin.selectedColumn
      ?.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

    const isColumnNotRejected = normCol ? !DMPL_REJECTED_COLUMNS.has(normCol) : false;
    const isColumnAllowed =
      statement.statementType === 'CONSOLIDATED'
        ? origin.selectedColumn === 'Patrimônio Líquido' || origin.selectedColumn === 'Patrimônio Líquido Consolidado'
        : origin.selectedColumn === 'Patrimônio Líquido';

    // d) Validação de conta e descrição oficial
    const codes = origin.accountCode.split('+');
    const isAccountValid =
      codes.length > 0 &&
      codes.every((c) => isDeclaredDividendsAccount(c, origin.validatedDescription));

    // e) Validação de valor: não negativo e Decimal válido
    const isValueValid =
      origin.declaredAmount instanceof Decimal &&
      !origin.declaredAmount.isNegative();

    // f) Consistência com dmplDividendsDeclared se informado
    const isTransportConsistent =
      statement.dmplDividendsDeclared === undefined ||
      statement.dmplDividendsDeclared === null ||
      statement.dmplDividendsDeclared.equals(origin.declaredAmount);

    // g) Verificação cruzada com o mapa accounts (se a conta estiver no mapa, o abs() deve coincidir)
    let isAccountsMapConsistent = true;
    if (codes.length === 1) {
      const accVal = accounts.get(codes[0]);
      if (accVal && !accVal.abs().equals(origin.declaredAmount)) {
        isAccountsMapConsistent = false;
      }
    }

    if (
      isIdentityValid &&
      isOriginTypeCompatible &&
      isColumnNotRejected &&
      isColumnAllowed &&
      isAccountValid &&
      isValueValid &&
      isTransportConsistent &&
      isAccountsMapConsistent
    ) {
      dividendsDeclared = origin.declaredAmount;
    } else {
      dividendsDeclared = null;
    }
  } else {
    dividendsDeclared = null;
  }

  const referencePeriod = formatReferencePeriod(statement.referenceDate, statement.periodType);
  const referenceDateObj = new Date(`${statement.referenceDate}T00:00:00Z`);
  const filingDateObj = statement.filingDate ? new Date(statement.filingDate) : null;

  const result: ConvertedFundamentals = {
    referencePeriod,
    periodType: statement.periodType,
    statementType: statement.statementType,
    referenceDate: referenceDateObj,
    filingDate: filingDateObj,
    source: 'cvm',
    sourceReference: statement.sourceReference,
    version: statement.version,
    isRestated: statement.version > 1,
    currency: 'BRL',
    netRevenue,
    netIncome,
    totalEquity,
    totalAssets,
    depreciationAmortization,
    ebitda,
    grossDebt,
    cashEquivalents,
    netDebt,
    sharesCount,
    dividendsDeclared,
    notes: null,
    capitalComposition: statement.capitalComposition ?? null,
    officialLpa,
  };

  validateFinancialSanity(result);

  return result;
}

/**
 * Seleciona deterministamente as demonstrações vencedoras para publicação por período e companhia.
 * Aplica a regra de precedência:
 * 1. Agrupa por companhia e período contábil (CNPJ + referenceDate);
 * 2. Prioridade absoluta para CONSOLIDATED com maior VERSAO;
 * 3. Fallback para INDIVIDUAL somente quando não houver CONSOLIDATED válida;
 * 4. Validação de sanidade financeira.
 */
export function selectStatementsForPublication(
  statements: CvmRawStatementData[]
): Map<string, ConvertedFundamentals> {
  const grouped = new Map<string, CvmRawStatementData[]>();

  for (const stmt of statements) {
    const key = `${stmt.cnpj}#${stmt.cvmCode}#${stmt.referenceDate}`;
    const list = grouped.get(key) || [];
    list.push(stmt);
    grouped.set(key, list);
  }

  const selectedResults = new Map<string, ConvertedFundamentals>();

  for (const [periodKey, list] of grouped.entries()) {
    // 1. Separa por tipo de demonstrativo
    const consolidatedList = list.filter((s) => s.statementType === 'CONSOLIDATED');
    const individualList = list.filter((s) => s.statementType === 'INDIVIDUAL');

    let chosenConverted: ConvertedFundamentals | null = null;

    // 2. Avalia CONSOLIDATED primeiro (prioridade obrigatória)
    if (consolidatedList.length > 0) {
      // Ordena por maior versão decrescente
      consolidatedList.sort((a, b) => b.version - a.version);
      const topConsolidated = consolidatedList[0];

      try {
        chosenConverted = convertStatementToFundamentals(topConsolidated);
      } catch {
        // Se a maior versão consolidada falhar na validação, não há fallback automático para versões inferiores
        chosenConverted = null;
      }
    }

    // 3. Fallback para INDIVIDUAL somente se não houver CONSOLIDATED válida
    if (!chosenConverted && individualList.length > 0) {
      individualList.sort((a, b) => b.version - a.version);
      const topIndividual = individualList[0];

      try {
        chosenConverted = convertStatementToFundamentals(topIndividual);
      } catch {
        chosenConverted = null;
      }
    }

    if (chosenConverted) {
      selectedResults.set(periodKey, chosenConverted);
    }
  }

  return selectedResults;
}

/**
 * Adapta uma declaração agregada produzida pelo parser DFP (Etapa 2) para a estrutura
 * de entrada do motor de fundamentos (CvmRawStatementData).
 */
export function adaptAggregatedStatementToRawStatement(
  statement: CvmAggregatedStatement
): CvmRawStatementData {
  const accounts = new Map<string, Decimal>();
  const accountDescriptions = new Map<string, string>();
  accounts.set('1', statement.totalAssets);
  accounts.set('2.03', statement.totalEquity);
  accounts.set('3.01', statement.netRevenue);
  accounts.set('3.11', statement.netIncome);

  if (statement.cashEquivalents !== null) {
    accounts.set('1.01.01', statement.cashEquivalents);
  }
  if (statement.shortTermDebt !== null && statement.shortTermDebt !== undefined) {
    accounts.set('2.01.04', statement.shortTermDebt);
  }
  if (statement.longTermDebt !== null && statement.longTermDebt !== undefined) {
    accounts.set('2.02.01', statement.longTermDebt);
  }
  if (statement.ebit !== null && statement.ebit !== undefined) {
    accounts.set('3.05', statement.ebit);
  }
  if (statement.depreciationAmortization !== null && statement.depreciationAmortization !== undefined) {
    accounts.set('6.01.01.01', statement.depreciationAmortization);
    accountDescriptions.set('6.01.01.01', 'Depreciação e Amortização');
  }
  if (statement.dividendsDeclared !== null && statement.dividendsDeclared !== undefined) {
    const code = statement.dmplOrigin?.accountCode || '5.04.06';
    const desc = statement.dmplOrigin?.validatedDescription || 'Dividendos';
    accounts.set(code, statement.dividendsDeclared);
    accountDescriptions.set(code, desc);
  }
  if (statement.officialLpa !== null && statement.officialLpa !== undefined) {
    accounts.set('3.99.01.01', statement.officialLpa);
  }

  return {
    cnpj: statement.cnpj,
    cvmCode: statement.cvmCode,
    companyLegalName: statement.companyLegalName,
    referenceDate: statement.referenceDate,
    periodType: statement.periodType,
    statementType: statement.statementType,
    exerciseOrder: statement.exerciseOrder,
    version: statement.version,
    accounts,
    accountDescriptions,
    capitalComposition: statement.capitalComposition ?? null,
    dfcDepreciationAmortization: statement.depreciationAmortization ?? null,
    dmplDividendsDeclared: statement.dividendsDeclared ?? null,
    dmplOrigin: statement.dmplOrigin ?? null,
    officialLpa: statement.officialLpa ?? null,
    sourceReference: statement.sourceReference,
  };
}
