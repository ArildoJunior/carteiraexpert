import type {
  ImportFormatId,
  ImportParseContext,
  ParsedImportBatch,
} from '../import.types';

export interface ImportParserAdapter {
  readonly formatId: ImportFormatId;
  readonly name: string;
  readonly description: string;

  /**
   * Avalia se este adaptador é capaz de parsear o conteúdo do arquivo
   * inspecionando os cabeçalhos ou padrões de linha.
   */
  canParse(rawContent: string, fileName: string): boolean;

  /**
   * Executa o parsing determinístico do arquivo, gerando as linhas candidatas
   * com detalhamento de erros por linha.
   */
  parse(
    rawContent: string,
    context: ImportParseContext
  ): Promise<ParsedImportBatch>;
}
