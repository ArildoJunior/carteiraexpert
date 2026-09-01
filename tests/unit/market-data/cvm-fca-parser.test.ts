import { describe, it, expect } from 'vitest';
import { parseCvmFcaStream } from '@/modules/market-data/domain/cvm-fca-parser';
import { CvmInvalidHeaderError } from '@/modules/market-data/domain/cvm-parser.types';

async function* stringToStream(text: string): AsyncIterable<string> {
  const lines = text.split('\n');
  for (const line of lines) {
    yield line;
  }
}

describe('CvmFcaParser — Parser de Valores Mobiliários da CVM (FCA)', () => {
  it('deve interpretar corretamente arquivo FCA válido com colunas oficiais', async () => {
    const csvContent = `CNPJ_CIA;CD_CVM;DENOM_SOCIAL;COD_NEGOCIACAO;DS_CLASSE_VALOR_MOBILIARIO;COD_ISIN;TP_VALOR_MOBILIARIO
84.429.695/0001-11;005410;WEG S.A.;WEGE3;ON;BRWEGEACNOR0;AÇÕES
33.000.167/0001-01;009512;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;PETR4;PN;BRPETRACNPR6;AÇÕES
33.000.167/0001-01;009512;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;PETR3;ON;BRPETRACNOR9;AÇÕES`;

    const { mappings, metrics } = await parseCvmFcaStream(stringToStream(csvContent));

    expect(metrics.totalLinesRead).toBe(4);
    expect(metrics.validSecuritiesCount).toBe(3);
    expect(metrics.distinctTickersCount).toBe(3);
    expect(mappings).toHaveLength(3);

    expect(mappings[0]).toEqual({
      cvmCode: '005410',
      cnpj: '84429695000111',
      ticker: 'WEGE3',
      shareClass: 'ON',
      isin: 'BRWEGEACNOR0',
      securityType: 'AÇÕES',
      rawValorMobiliario: 'AÇÕES',
    });
  });

  it('deve aceitar variações de cabeçalhos oficiais da CVM (SIGLA, TICKER, CLASSE, etc.)', async () => {
    const csvContent = `CD_CVM;CNPJ_CIA;SIGLA;CLASSE;ISIN
5410;84429695000111;WEGE3;ON;BRWEGEACNOR0`;

    const { mappings, metrics } = await parseCvmFcaStream(stringToStream(csvContent));

    expect(metrics.validSecuritiesCount).toBe(1);
    expect(mappings[0].ticker).toBe('WEGE3');
    expect(mappings[0].cvmCode).toBe('005410');
  });

  it('deve lançar CvmInvalidHeaderError quando colunas essenciais estiverem ausentes', async () => {
    const invalidCsv = `COLUNA_A;COLUNA_B;COLUNA_C\n1;2;3`;
    await expect(parseCvmFcaStream(stringToStream(invalidCsv))).rejects.toThrow(
      CvmInvalidHeaderError
    );
  });

  it('deve ignorar linhas com ticker vazio ou corrompido', async () => {
    const csvWithEmpty = `CD_CVM;CNPJ_CIA;COD_NEGOCIACAO;CLASSE
5410;84429695000111;;ON
9512;33000167000101;PETR4;PN`;

    const { mappings, metrics } = await parseCvmFcaStream(stringToStream(csvWithEmpty));

    expect(metrics.validSecuritiesCount).toBe(1);
    expect(mappings[0].ticker).toBe('PETR4');
  });

  it('deve tolerar linhas corrompidas com CNPJ inválido sem quebrar o stream', async () => {
    const csvWithBadCnpj = `CD_CVM;CNPJ_CIA;COD_NEGOCIACAO;CLASSE
5410;CNPJ_INVALIDO_XYZ;WEGE3;ON
9512;33000167000101;PETR4;PN`;

    const { mappings, metrics } = await parseCvmFcaStream(stringToStream(csvWithBadCnpj));

    expect(metrics.corruptedLinesCount).toBe(1);
    expect(metrics.validSecuritiesCount).toBe(1);
    expect(mappings[0].ticker).toBe('PETR4');
  });
});
