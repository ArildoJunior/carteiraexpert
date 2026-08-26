import type { ImportParserAdapter } from './import-parser.interface';
import { StandardCsvParserAdapter } from './standard-csv.parser';
import { B3TradesCsvParserAdapter } from './b3-trades-csv.parser';
import { B3MovementsCsvParserAdapter } from './b3-movements-csv.parser';
import type {
  ImportFormatId,
  ImportParseContext,
  ParsedImportBatch,
} from '../import.types';

export class ImportParserRegistry {
  private readonly parsers: Map<ImportFormatId, ImportParserAdapter> = new Map();

  constructor() {
    this.register(new StandardCsvParserAdapter());
    this.register(new B3TradesCsvParserAdapter());
    this.register(new B3MovementsCsvParserAdapter());
  }

  register(parser: ImportParserAdapter): void {
    this.parsers.set(parser.formatId, parser);
  }

  getParser(formatId: ImportFormatId): ImportParserAdapter | undefined {
    return this.parsers.get(formatId);
  }

  getAllParsers(): ImportParserAdapter[] {
    return Array.from(this.parsers.values());
  }

  /**
   * Detecta automaticamente o parser adequado inspecionando o arquivo.
   */
  detectParser(rawContent: string, fileName: string): ImportParserAdapter | undefined {
    for (const parser of this.parsers.values()) {
      if (parser.canParse(rawContent, fileName)) {
        return parser;
      }
    }
    return undefined;
  }

  /**
   * Processa o conteúdo utilizando o parser indicado ou detectado automaticamente.
   */
  async parse(
    rawContent: string,
    context: ImportParseContext,
    preferredFormatId?: ImportFormatId
  ): Promise<ParsedImportBatch> {
    if (!rawContent || rawContent.trim().length === 0) {
      throw new Error('O arquivo de importação está vazio.');
    }

    let parser: ImportParserAdapter | undefined;

    if (preferredFormatId) {
      parser = this.getParser(preferredFormatId);
      if (!parser) {
        throw new Error(`Formato de importação solicitado não suportado: "${preferredFormatId}".`);
      }
    } else {
      parser = this.detectParser(rawContent, context.fileName);
    }

    if (!parser) {
      throw new Error(
        'Layout de arquivo não reconhecido. Formatos suportados: CSV Padrão CarteiraExpert, Extrato de Negociação B3 e Extrato de Movimentação B3.'
      );
    }

    return await parser.parse(rawContent, context);
  }
}

// Singleton padrão do registry para uso conveniente em toda a aplicação
export const defaultImportParserRegistry = new ImportParserRegistry();
