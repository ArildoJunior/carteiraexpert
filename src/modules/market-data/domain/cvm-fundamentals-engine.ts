import { Decimal } from '@/lib/decimal';
import type { CvmAggregatedStatement } from './cvm-parser.types';
import {
  CvmFinancialSanityError,
  CvmIncompleteStatementError,
  type ConvertedFundamentals,
  type CvmPeriodType,
  type CvmRawStatementData,
  type CvmStatementType,
} from './cvm-fundamentals.types';
import { rawStatementDataSchema } from './cvm-fundamentals.schema';

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
  if (fundamentals.grossDebt && fundamentals.grossDebt.isNegative()) {
    throw new CvmFinancialSanityError(
      `Sanity check violado: Dívida Bruta não pode ser negativa (valor: ${fundamentals.grossDebt.toString()}).`,
      'GROSS_DEBT_NEGATIVE',
      { grossDebt: fundamentals.grossDebt.toString() }
    );
  }

  // 6. Caixa e Equivalentes não pode ser negativo
  if (fundamentals.cashEquivalents && fundamentals.cashEquivalents.isNegative()) {
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
}

/**
 * Converte um balanço contábil bruto CVM para a estrutura normalizada de fundamentos.
 * Aplica regras estritas para contas obrigatórias, subcontas de Dívida Bruta e Dívida Líquida.
 */
export function convertStatementToFundamentals(statement: CvmRawStatementData): ConvertedFundamentals {
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

  // 2. Contas Opcionais
  const ebitda = accounts.get('3.03') ?? accounts.get('3.05') ?? null;
  const cashEquivalents = accounts.get('1.01.01') ?? accounts.get('1.01.02') ?? null;

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

  // 5. Demais proventos/ações
  const sharesCount = accounts.get('3.99') ?? null;
  const dividendsDeclared = null;

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
    ebitda,
    grossDebt,
    cashEquivalents,
    netDebt,
    sharesCount,
    dividendsDeclared,
    notes: null,
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
  accounts.set('1', statement.totalAssets);
  accounts.set('2.03', statement.totalEquity);
  accounts.set('3.01', statement.netRevenue);
  accounts.set('3.11', statement.netIncome);

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
    sourceReference: statement.sourceReference,
  };
}
