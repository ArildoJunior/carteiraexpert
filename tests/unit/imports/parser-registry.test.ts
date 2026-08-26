import { describe, it, expect } from 'vitest';
import {
  ImportParserRegistry,
  defaultImportParserRegistry,
} from '@/modules/imports/domain/parsers/parser-registry';
import type { ImportParseContext } from '@/modules/imports/domain/import.types';

describe('ImportParserRegistry — Testes Unitários de Detecção e Execução', () => {
  const registry = new ImportParserRegistry();
  const context: ImportParseContext = {
    fileName: 'arquivo.csv',
    fileSize: 1024,
  };

  it('deve registrar os adaptadores padrão no construtor', () => {
    const parsers = registry.getAllParsers();
    expect(parsers.length).toBe(3);
    expect(registry.getParser('carteiraexpert_csv')).toBeDefined();
    expect(registry.getParser('b3_trades_csv')).toBeDefined();
    expect(registry.getParser('b3_movements_csv')).toBeDefined();
  });

  it('deve detectar e parsear automaticamente o CSV padrão CarteiraExpert', async () => {
    const csvContent = 'Data;Tipo;Ticker;Quantidade;Preco\n10/01/2026;C;PETR4;100;38,50';
    const result = await registry.parse(csvContent, context);

    expect(result.formatId).toBe('carteiraexpert_csv');
    expect(result.validRows).toBe(1);
  });

  it('deve detectar e parsear automaticamente o Extrato de Negociação B3', async () => {
    const b3TradesCsv =
      'Data do Negócio;Tipo de Movimentação;Mercado;Prazo/Vencimento;Instituição;Código de Negociação;Quantidade;Preço (R$);Valor Total (R$)\n10/01/2026;Compra;Mercado à Vista;;XP;PETR4;100;38,50;3.850,00';
    const result = await registry.parse(b3TradesCsv, context);

    expect(result.formatId).toBe('b3_trades_csv');
    expect(result.validRows).toBe(1);
  });

  it('deve permitir seleção explícita de formato através de preferredFormatId', async () => {
    const csvContent = 'Data;Tipo;Ticker;Quantidade;Preco\n10/01/2026;C;PETR4;100;38,50';
    const result = await registry.parse(csvContent, context, 'carteiraexpert_csv');

    expect(result.formatId).toBe('carteiraexpert_csv');
  });

  it('deve lançar erro se o formato preferido for inexistente', async () => {
    const csvContent = 'Data;Tipo;Ticker;Quantidade;Preco\n10/01/2026;C;PETR4;100;38,50';
    // @ts-expect-error testando formato inválido em runtime
    await expect(registry.parse(csvContent, context, 'formato_inexistente')).rejects.toThrow(
      'não suportado'
    );
  });

  it('deve lançar erro se o conteúdo não corresponder a nenhum layout suportado', async () => {
    const unknownCsv = 'Nome;Cargo;Salario\nMaria;Engenheira;15000';
    await expect(registry.parse(unknownCsv, context)).rejects.toThrow(
      'Layout de arquivo não reconhecido'
    );
  });

  it('deve disponibilizar singleton defaultImportParserRegistry funcional', () => {
    expect(defaultImportParserRegistry.getAllParsers().length).toBe(3);
  });
});
