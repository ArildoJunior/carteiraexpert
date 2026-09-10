import { Decimal } from '@/lib/decimal';
import { describe, expect, it } from 'vitest';
import {
  normalizeIsin,
  parseCvmDateString,
  parseCvmDecimal,
  parseCvmFiiMonthlyPackage,
  parseCvmFiiVersion,
  parseCvmInteger,
  parseCvmTimestamp,
  safeNormalizeCnpj,
  splitCsvLine,
  validateAndNormalizeCnpj,
} from '@/modules/market-data/domain/cvm-fii-parser';
import {
  CvmFiiCorruptedDataError,
  CvmFiiInvalidHeaderError,
  CvmFiiInvalidIdentifierError,
} from '@/modules/market-data/domain/cvm-fii-parser.types';

describe('CVM FII Parser (Unit Suite)', () => {
  describe('1. Normalização Numérica Pura (parseCvmDecimal & parseCvmInteger)', () => {
    it('deve processar números no formato brasileiro com ponto de milhar e vírgula decimal', () => {
      const result = parseCvmDecimal('1.234.567,89');
      expect(result).toBeInstanceOf(Decimal);
      expect(result?.toString()).toBe('1234567.89');

      const simpleComma = parseCvmDecimal('1234,56');
      expect(simpleComma?.toString()).toBe('1234.56');

      const largeBr = parseCvmDecimal('4.562.706.957,83');
      expect(largeBr?.toString()).toBe('4562706957.83');
    });

    it('deve processar números no formato internacional/padrão CVM com ponto decimal', () => {
      const result = parseCvmDecimal('462706957.83');
      expect(result).toBeInstanceOf(Decimal);
      expect(result?.toString()).toBe('462706957.83');

      const commaThousands = parseCvmDecimal('1,234,567.89');
      expect(commaThousands?.toString()).toBe('1234567.89');
    });

    it('deve suportar notação científica preservando a precisão do Decimal', () => {
      const sci1 = parseCvmDecimal('2.5E-05');
      expect(sci1).toBeInstanceOf(Decimal);
      expect(sci1?.toString()).toBe('0.000025');

      const sci2 = parseCvmDecimal('1.2e+4');
      expect(sci2?.toString()).toBe('12000');
    });

    it('deve processar números negativos com sinal negativo e com parênteses contábeis', () => {
      const neg1 = parseCvmDecimal('-0.015778');
      expect(neg1?.toString()).toBe('-0.015778');

      const negParentheses = parseCvmDecimal('(1.234,56)');
      expect(negParentheses?.toString()).toBe('-1234.56');

      const negParenthesesUs = parseCvmDecimal('(500.25)');
      expect(negParenthesesUs?.toString()).toBe('-500.25');
    });

    it('deve retornar null para valores vazios, traços, nulos e strings não numéricas', () => {
      expect(parseCvmDecimal(null)).toBeNull();
      expect(parseCvmDecimal(undefined)).toBeNull();
      expect(parseCvmDecimal('')).toBeNull();
      expect(parseCvmDecimal('   ')).toBeNull();
      expect(parseCvmDecimal('-')).toBeNull();
      expect(parseCvmDecimal('N/A')).toBeNull();
      expect(parseCvmDecimal('NA')).toBeNull();
      expect(parseCvmDecimal('null')).toBeNull();
      expect(parseCvmDecimal('NULL')).toBeNull();
      expect(parseCvmDecimal('texto_invalido')).toBeNull();
    });

    it('deve processar inteiros de cotistas com parseCvmInteger', () => {
      expect(parseCvmInteger('1250')).toBe(1250);
      expect(parseCvmInteger('1.250')).toBe(1250);
      expect(parseCvmInteger('1,250')).toBe(1250);
      expect(parseCvmInteger('0')).toBe(0);
      expect(parseCvmInteger('')).toBeNull();
      expect(parseCvmInteger(null)).toBeNull();
      expect(parseCvmInteger('N/A')).toBeNull();
    });
  });

  describe('2. Normalização de Identificadores (CNPJ, ISIN, Datas, Versão)', () => {
    it('deve validar e normalizar CNPJs válidos', () => {
      expect(validateAndNormalizeCnpj('11.728.688/0001-47')).toBe('11728688000147');
      expect(validateAndNormalizeCnpj('11728688000147')).toBe('11728688000147');
      expect(safeNormalizeCnpj('11.728.688/0001-47')).toBe('11728688000147');
    });

    it('deve rejeitar CNPJs inválidos ou zerados', () => {
      expect(() => validateAndNormalizeCnpj('')).toThrow(CvmFiiInvalidIdentifierError);
      expect(() => validateAndNormalizeCnpj(null)).toThrow(CvmFiiInvalidIdentifierError);
      expect(() => validateAndNormalizeCnpj('00.000.000/0000-00')).toThrow(
        CvmFiiInvalidIdentifierError
      );
      expect(() => validateAndNormalizeCnpj('1234567890123')).toThrow(
        CvmFiiInvalidIdentifierError
      ); // 13 dígitos
      expect(safeNormalizeCnpj('123')).toBeNull();
      expect(safeNormalizeCnpj('00000000000000')).toBeNull();
    });

    it('deve normalizar códigos ISIN válidos e rejeitar inválidos', () => {
      expect(normalizeIsin('BRHGLGCTF004')).toBe('BRHGLGCTF004');
      expect(normalizeIsin('  brhglgctf004  ')).toBe('BRHGLGCTF004');
      expect(normalizeIsin('BR123')).toBeNull();
      expect(normalizeIsin('')).toBeNull();
      expect(normalizeIsin(null)).toBeNull();
    });

    it('deve validar datas contábeis no formato YYYY-MM-DD com verificação de calendário', () => {
      expect(parseCvmDateString('2026-07-31')).toBe('2026-07-31');
      expect(parseCvmDateString('2024-02-29')).toBe('2024-02-29'); // Ano bissexto válido
      expect(parseCvmDateString('2023-02-29')).toBeNull(); // Não bissexto
      expect(parseCvmDateString('2026-02-31')).toBeNull(); // Dia inexistente
      expect(parseCvmDateString('2026-13-10')).toBeNull(); // Mês inexistente
      expect(parseCvmDateString('')).toBeNull();
      expect(parseCvmDateString(null)).toBeNull();
    });

    it('deve extrair data/hora de entrega (timestamp) da CVM', () => {
      const ts = parseCvmTimestamp('2026-08-15 14:30:00');
      expect(ts).toBeInstanceOf(Date);
      expect(ts?.toISOString()).toBe('2026-08-15T14:30:00.000Z');

      const dateOnly = parseCvmTimestamp('2026-08-15');
      expect(dateOnly).toBeInstanceOf(Date);
      expect(dateOnly?.toISOString()).toBe('2026-08-15T00:00:00.000Z');

      expect(parseCvmTimestamp('')).toBeNull();
    });

    it('deve validar e normalizar a versão do informe', () => {
      expect(parseCvmFiiVersion('1')).toBe(1);
      expect(parseCvmFiiVersion('3')).toBe(3);
      expect(parseCvmFiiVersion('0')).toBe(1);
      expect(parseCvmFiiVersion('-1')).toBe(1);
      expect(parseCvmFiiVersion(null)).toBe(1);
      expect(parseCvmFiiVersion('')).toBe(1);
    });
  });

  describe('3. Utilitário de Quebra CSV com Aspas (splitCsvLine)', () => {
    it('deve dividir colunas por ponto e vírgula mantendo campos vazios e ignorando ponto e vírgula dentro de aspas', () => {
      const line = '11728688000147;"FUNDO IMOBILIÁRIO; CLASSE A";2026-07-31;;100.50';
      const parts = splitCsvLine(line);
      expect(parts).toEqual([
        '11728688000147',
        'FUNDO IMOBILIÁRIO; CLASSE A',
        '2026-07-31',
        '',
        '100.50',
      ]);
    });
  });

  describe('4. Parser de Pacote Mensal de FII (parseCvmFiiMonthlyPackage)', () => {
    const sampleGeralModern = `CNPJ_Fundo_Classe;Nome_Fundo_Classe;Codigo_ISIN;Data_Referencia;Data_Entrega;Versao;Quantidade_Cotas_Emitidas
11.728.688/0001-47;CSHG LOGISTICA FDO INV IMOB - FII;BRHGLGCTF004;2026-07-31;2026-08-12 18:00:00;1;33787584
28.737.771/0001-85;XP MALLS FDO INV IMOB - FII;BRXPMLCTF005;2026-07-31;2026-08-14 11:20:00;1;41250000`;

    const sampleComplementoModern = `CNPJ_Fundo_Classe;Data_Referencia;Versao;Patrimonio_Liquido;Valor_Patrimonial_Cotas;Cotas_Emitidas;Valor_Ativo;Rendimento_Distribuido_Mes;Total_Numero_Cotistas;Numero_Cotistas_Pessoa_Fisica
11.728.688/0001-47;2026-07-31;1;5237075583.45;155.00000000;33787584;5890000000.00;1.10000000;375420;371200
28.737.771/0001-85;2026-07-31;1;4350120980.12;105.45747830;41250000;4800000000.00;0.92000000;420100;415000`;

    const sampleAtivoPassivoModern = `CNPJ_Fundo_Classe;Data_Referencia;Versao;Total_Passivo;Disponibilidades
11.728.688/0001-47;2026-07-31;1;652924416.55;125430900.00
28.737.771/0001-85;2026-07-31;1;449879019.88;89500120.50`;

    it('deve processar o pacote moderno (pós-Resolução CVM 175) integrando os 3 arquivos', async () => {
      const result = await parseCvmFiiMonthlyPackage({
        geralCsv: sampleGeralModern,
        complementoCsv: sampleComplementoModern,
        ativoPassivoCsv: sampleAtivoPassivoModern,
        sourceReference: 'inf_mensal_fii_2026.zip',
      });

      expect(result.metrics.parsedMonthlyRecords).toBe(2);
      expect(result.metrics.parsedRegistryRecords).toBe(2);
      expect(result.metrics.uniqueFundsCount).toBe(2);
      expect(result.metrics.uniqueCompetenciesCount).toBe(1);
      expect(result.metrics.skippedCorruptedLines).toBe(0);

      // Validação do Registro Cadastral
      const hglgRegistry = result.registryRecords.find((r) => r.cnpj === '11728688000147');
      expect(hglgRegistry).toBeDefined();
      expect(hglgRegistry?.legalName).toBe('CSHG LOGISTICA FDO INV IMOB - FII');
      expect(hglgRegistry?.isin).toBe('BRHGLGCTF004');
      expect(hglgRegistry?.source).toBe('cvm');

      // Validação do Registro Contábil e Patrimonial
      const hglgMonthly = result.monthlyRecords.find((r) => r.cnpj === '11728688000147');
      expect(hglgMonthly).toBeDefined();
      expect(hglgMonthly?.referenceDate).toBe('2026-07-31');
      expect(hglgMonthly?.version).toBe(1);
      expect(hglgMonthly?.source).toBe('cvm_inf_mensal');
      expect(hglgMonthly?.sourceReference).toBe('inf_mensal_fii_2026.zip');

      // Fatos Contábeis em Decimal
      expect(hglgMonthly?.netAssetValue).toBeInstanceOf(Decimal);
      expect(hglgMonthly?.netAssetValue?.toString()).toBe('5237075583.45');

      expect(hglgMonthly?.quotaEquityValue).toBeInstanceOf(Decimal);
      expect(hglgMonthly?.quotaEquityValue?.toString()).toBe('155');

      expect(hglgMonthly?.issuedQuotas).toBeInstanceOf(Decimal);
      expect(hglgMonthly?.issuedQuotas?.toString()).toBe('33787584');

      expect(hglgMonthly?.totalAssets?.toString()).toBe('5890000000');
      expect(hglgMonthly?.totalLiabilities?.toString()).toBe('652924416.55');
      expect(hglgMonthly?.cashEquivalents?.toString()).toBe('125430900');
      expect(hglgMonthly?.dividendDeclaredPerQuota?.toString()).toBe('1.1');

      // Cotistas
      expect(hglgMonthly?.investorsCount).toBe(375420);
      expect(hglgMonthly?.individualInvestorsCount).toBe(371200);
    });

    it('deve processar o pacote legado (pré-Resolução CVM 175) com CNPJ_Fundo e Nome_Fundo', async () => {
      const sampleGeralLegacy = `CNPJ_Fundo;Nome_Fundo;Codigo_ISIN;Data_Referencia;Data_Entrega;Versao;Quantidade_Cotas_Emitidas
11.728.688/0001-47;CSHG LOGISTICA FDO INV IMOB - FII;BRHGLGCTF004;2016-12-31;2017-01-15 10:00:00;1;1500000`;

      const sampleComplementoLegacy = `CNPJ_Fundo;Data_Referencia;Versao;Patrimonio_Liquido;Valor_Patrimonial_Cotas;Cotas_Emitidas;Valor_Ativo;Total_Numero_Cotistas;Numero_Cotistas_Pessoa_Fisica
11.728.688/0001-47;2016-12-31;1;180000000.00;120.00000000;1500000;200000000.00;5000;4800`;

      const result = await parseCvmFiiMonthlyPackage({
        geralCsv: sampleGeralLegacy,
        complementoCsv: sampleComplementoLegacy,
      });

      expect(result.metrics.parsedMonthlyRecords).toBe(1);
      const record = result.monthlyRecords[0];
      expect(record.cnpj).toBe('11728688000147');
      expect(record.referenceDate).toBe('2016-12-31');
      expect(record.netAssetValue?.toString()).toBe('180000000');
      expect(record.quotaEquityValue?.toString()).toBe('120');
      expect(record.investorsCount).toBe(5000);
    });

    it('deve tratar reapresentações e versões com a mesma competência de forma correta e ordenada', async () => {
      const sampleGeralReissue = `CNPJ_Fundo_Classe;Nome_Fundo_Classe;Codigo_ISIN;Data_Referencia;Data_Entrega;Versao;Quantidade_Cotas_Emitidas
11.728.688/0001-47;CSHG LOGISTICA FDO INV IMOB;BRHGLGCTF004;2026-07-31;2026-08-10 10:00:00;1;33787584
11.728.688/0001-47;CSHG LOGISTICA FDO INV IMOB;BRHGLGCTF004;2026-07-31;2026-08-20 15:30:00;2;33787584`;

      const sampleComplementoReissue = `CNPJ_Fundo_Classe;Data_Referencia;Versao;Patrimonio_Liquido;Valor_Patrimonial_Cotas;Cotas_Emitidas
11.728.688/0001-47;2026-07-31;1;5200000000.00;153.90000000;33787584
11.728.688/0001-47;2026-07-31;2;5237075583.45;155.00000000;33787584`;

      const result = await parseCvmFiiMonthlyPackage({
        geralCsv: sampleGeralReissue,
        complementoCsv: sampleComplementoReissue,
      });

      expect(result.monthlyRecords.length).toBe(2);
      expect(result.monthlyRecords[0].version).toBe(1);
      expect(result.monthlyRecords[0].netAssetValue?.toString()).toBe('5200000000');

      expect(result.monthlyRecords[1].version).toBe(2);
      expect(result.monthlyRecords[1].netAssetValue?.toString()).toBe('5237075583.45');

      // O cadastro do fundo guarda a data mais recente da versão 2
      const reg = result.registryRecords[0];
      expect(reg.sourceUpdatedAt?.toISOString()).toBe('2026-08-20T15:30:00.000Z');
    });

    it('deve ignorar linhas corrompidas sem quebrar o lote no modo padrão', async () => {
      const corruptedGeral = `CNPJ_Fundo_Classe;Nome_Fundo_Classe;Codigo_ISIN;Data_Referencia;Data_Entrega;Versao;Quantidade_Cotas_Emitidas
INVALID_CNPJ;Fundo Teste;;2026-07-31;2026-08-10;1;1000
11.728.688/0001-47;CSHG LOGISTICA;BRHGLGCTF004;DATA_INVALIDA;2026-08-10;1;1000
28.737.771/0001-85;XP MALLS;BRXPMLCTF005;2026-07-31;2026-08-10;1;2000`;

      const result = await parseCvmFiiMonthlyPackage({
        geralCsv: corruptedGeral,
      });

      expect(result.metrics.parsedMonthlyRecords).toBe(1);
      expect(result.metrics.skippedCorruptedLines).toBe(2);
      expect(result.monthlyRecords[0].cnpj).toBe('28737771000185');
    });

    it('deve lançar CvmFiiCorruptedDataError no modo estrito se houver linha inválida', async () => {
      const corruptedGeral = `CNPJ_Fundo_Classe;Nome_Fundo_Classe;Codigo_ISIN;Data_Referencia;Data_Entrega;Versao;Quantidade_Cotas_Emitidas
INVALID_CNPJ;Fundo Teste;;2026-07-31;2026-08-10;1;1000`;

      await expect(
        parseCvmFiiMonthlyPackage({
          geralCsv: corruptedGeral,
          strict: true,
        })
      ).rejects.toThrow(CvmFiiCorruptedDataError);
    });

    it('deve lançar CvmFiiInvalidHeaderError se colunas essenciais estiverem ausentes', async () => {
      const invalidHeaderCsv = `Coluna1;Coluna2;Coluna3
1;2;3`;

      await expect(
        parseCvmFiiMonthlyPackage({
          geralCsv: invalidHeaderCsv,
        })
      ).rejects.toThrow(CvmFiiInvalidHeaderError);
    });
  });
});
