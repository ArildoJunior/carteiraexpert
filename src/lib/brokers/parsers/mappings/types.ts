import type { BrokerTransaction, BrokerTransactionSide, ImportWarning } from "../../types";

// Funcao de transformacao que recebe o valor da celula crua e a row inteira,
// e retorna o valor canonico (string, number, null).
// Retornar null significa "campo ausente/invalido" - o caller vai gerar warning.
export type ColumnTransform = (
  value: string,
  row: Record<string, string>
) => string | number | null;

export type ColumnMapping = {
  // O que procurar no header do CSV/XLSX. String exata ou RegExp.
  sourceHeader: string | RegExp;
  // Qual campo do BrokerTransaction popular.
  targetField: keyof BrokerTransaction;
  // Transform opcional. Se ausente, o valor vai como string (trim).
  transform?: ColumnTransform;
  // Se true, ausencia desse campo nao gera warning (campo opcional).
  optional?: boolean;
};

export type BrokerMapping = {
  brokerSlug: string;
  displayName: string;
  fileFormat: "csv" | "xlsx";
  sheetName?: string; // so' XLSX
  delimiter?: string; // so' CSV, default ','
  skipRows?: number; // default 0
  dateFormat: "BR" | "US" | "ISO";
  numberFormat: "BR" | "US";
  defaultCurrency: string;
  columns: ColumnMapping[];
  // Nome da coluna de onde vem o side (ex: 'Tipo', 'Operacao', 'Side').
  // Se ausente, sideDetection deve ser definido.
  sideField?: string;
  // Mapa de valor da coluna -> BrokerTransactionSide canonico.
  sideMap?: Record<string, BrokerTransactionSide>;
  // Alternativa: detectar o side por uma funcao (ex: quando side vem
  // implicito no tipo de movimento).
  sideDetection?: (row: Record<string, string>) => BrokerTransactionSide;
  // Heuristica: dado os headers do arquivo, este mapping serve?
  detect(headers: string[]): boolean;
};

// Tipo utilitario para o que applyMapping retorna. Inclui warnings locais.
export type ApplyMappingResult = {
  transaction: BrokerTransaction | null;
  warning?: ImportWarning;
};
