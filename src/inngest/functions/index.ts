import { extractDocumentFunction } from "./extract-document";
import { importCsvHandler } from "./import-csv";
import { refreshQuotes } from "./refresh-quotes";
import { syncBrokerPositions } from "./sync-broker-positions";

export const inngestFunctions = [
  refreshQuotes,
  importCsvHandler,
  syncBrokerPositions,
  extractDocumentFunction,
];
