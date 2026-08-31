import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { describe, expect, it } from 'vitest';
import {
  parseCvmCadStream,
  validateAndNormalizeCnpj,
  validateAndNormalizeCvmCode,
} from '@/modules/market-data/domain/cvm-cad-parser';
import {
  CvmInvalidHeaderError,
  CvmInvalidIdentifierError,
} from '@/modules/market-data/domain/cvm-parser.types';

describe('CVM Cad Parser (Unit & Stream)', () => {
  describe('Validação de Identificadores (CNPJ e CD_CVM)', () => {
    it('deve validar e normalizar CNPJs válidos com e sem pontuação', () => {
      expect(validateAndNormalizeCnpj('33.000.167/0001-01')).toBe('33000167000101');
      expect(validateAndNormalizeCnpj('33000167000101')).toBe('33000167000101');
      expect(validateAndNormalizeCnpj('33.592.510/0001-54')).toBe('33592510000154');
    });

    it('deve rejeitar CNPJs vazios, zerados ou com quantidade incorreta de dígitos', () => {
      expect(() => validateAndNormalizeCnpj('')).toThrow(CvmInvalidIdentifierError);
      expect(() => validateAndNormalizeCnpj(null)).toThrow(CvmInvalidIdentifierError);
      expect(() => validateAndNormalizeCnpj('00.000.000/0000-00')).toThrow(CvmInvalidIdentifierError);
      expect(() => validateAndNormalizeCnpj('00000000000000')).toThrow(CvmInvalidIdentifierError);
      expect(() => validateAndNormalizeCnpj('1234567890123')).toThrow(CvmInvalidIdentifierError); // 13 dígitos
      expect(() => validateAndNormalizeCnpj('123456789012345')).toThrow(CvmInvalidIdentifierError); // 15 dígitos
    });

    it('deve validar e aplicar padStart(6, "0") em códigos CVM válidos', () => {
      expect(validateAndNormalizeCvmCode('9512')).toBe('009512');
      expect(validateAndNormalizeCvmCode('4170')).toBe('004170');
      expect(validateAndNormalizeCvmCode('009512')).toBe('009512');
      expect(validateAndNormalizeCvmCode('1')).toBe('000001');
    });

    it('deve rejeitar códigos CVM vazios, zerados ou com mais de 6 dígitos', () => {
      expect(() => validateAndNormalizeCvmCode('')).toThrow(CvmInvalidIdentifierError);
      expect(() => validateAndNormalizeCvmCode(null)).toThrow(CvmInvalidIdentifierError);
      expect(() => validateAndNormalizeCvmCode('0')).toThrow(CvmInvalidIdentifierError);
      expect(() => validateAndNormalizeCvmCode('000000')).toThrow(CvmInvalidIdentifierError);
      expect(() => validateAndNormalizeCvmCode('1234567')).toThrow(CvmInvalidIdentifierError);
    });
  });

  describe('Parsing em Memória via AsyncIterable', () => {
    it('deve processar stream de linhas e classificar setores corretamente', async () => {
      async function* mockStream() {
        yield 'CNPJ_CIA;DENOM_SOCIAL;DENOM_COMERC;DT_REG;DT_CONST;DT_CANCEL;MOTIVO_CANCEL;SIT;DT_INI_SIT;CD_CVM;SETOR_ATIV;TP_MERC';
        yield '33.000.167/0001-01;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;PETROBRAS;1977-07-20;1953-10-03;;;ATIVO;1977-07-20;9512;Petróleo e Gás;BOLSA';
        yield '60.701.190/0001-04;ITAU UNIBANCO HOLDING S.A.;ITAU;1944-01-01;1944-01-01;;;ATIVO;1944-01-01;19348;Bancos;BOLSA';
        yield '11.111.111/0001-11;EMPRESA CANCELADA S.A.;CANCELADA;1990-01-01;1990-01-01;2020-01-01;ENCERRAMENTO;CANCELADA;2020-01-01;1111;Energia Elétrica;BOLSA';
      }

      const { companies, metrics } = await parseCvmCadStream(mockStream());

      expect(companies.size).toBe(3);
      expect(metrics.totalLinesRead).toBe(4);
      expect(metrics.companiesProcessed).toBe(3);
      expect(metrics.activeCompanies).toBe(2);
      expect(metrics.canceledCompanies).toBe(1);
      expect(metrics.eligibleSectorsCount).toBe(2); // Petrobras e Empresa Cancelada (Energia Elétrica)
      expect(metrics.skippedUnsupportedSectors).toBe(1); // Itaú (Bancos)

      const petr = companies.get('33000167000101')!;
      expect(petr).toBeDefined();
      expect(petr.cvmCode).toBe('009512');
      expect(petr.legalName).toBe('PETRÓLEO BRASILEIRO S.A. - PETROBRAS');
      expect(petr.status).toBe('ATIVO');
      expect(petr.sectorClassification).toBe('ELIGIBLE_COMMERCIAL_INDUSTRIAL');
      expect(petr.sectorDecision).toBe('PROCESSABLE');

      const itau = companies.get('60701190000104')!;
      expect(itau).toBeDefined();
      expect(itau.sectorClassification).toBe('FINANCIAL_COSIF');
      expect(itau.sectorDecision).toBe('SKIPPED');
    });

    it('deve lançar CvmInvalidHeaderError se o cabeçalho for inválido', async () => {
      async function* invalidHeaderStream() {
        yield 'COLUNA_A;COLUNA_B;COLUNA_C';
        yield '1;2;3';
      }

      await expect(parseCvmCadStream(invalidHeaderStream())).rejects.toThrow(
        CvmInvalidHeaderError
      );
    });
  });

  describe('Streaming Real com Leitura Física (latin1, \\r\\n e \\n)', () => {
    it('deve ler e parsear a fixture física tests/fixtures/cvm/cad_sample.csv', async () => {
      const fixturePath = path.resolve(process.cwd(), 'tests/fixtures/cvm/cad_sample.csv');
      const fileStream = fs.createReadStream(fixturePath, { encoding: 'latin1' });
      const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

      const { companies, metrics } = await parseCvmCadStream(rl);

      expect(companies.size).toBe(6);
      expect(metrics.companiesProcessed).toBe(6);
      expect(metrics.activeCompanies).toBe(5);
      expect(metrics.canceledCompanies).toBe(1);
      expect(metrics.eligibleSectorsCount).toBe(3); // Petrobras, Vale, Empresa Cancelada
      expect(metrics.skippedUnsupportedSectors).toBe(3); // Itaú (Bancos), Holding Pura, Setor Desconhecido

      // Verifica normalização e acentuação em latin1
      const petr = companies.get('33000167000101')!;
      expect(petr.legalName).toBe('PETRÓLEO BRASILEIRO S.A. - PETROBRAS');
      expect(petr.industrySector).toBe('Petróleo e Gás');

      const vale = companies.get('33592510000154')!;
      expect(vale.legalName).toBe('VALE S.A.');
      expect(vale.industrySector).toBe('Extração Mineral');
      expect(vale.cvmCode).toBe('004170');
    });
  });
});
