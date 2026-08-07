import { documentTypeEnum } from "@/lib/db/enums";

export type SupportedDocumentExtension =
  | ".pdf"
  | ".png"
  | ".jpg"
  | ".jpeg"
  | ".csv"
  | ".xlsx"
  | ".xls"
  | ".txt";

export type ValidatedDocumentFile = {
  extension: SupportedDocumentExtension;
  mimeType: string;
};

type FileRule = {
  mimeTypes: readonly string[];
  detect: (buffer: Buffer) => boolean;
};

const FILE_RULES: Record<SupportedDocumentExtension, FileRule> = {
  ".pdf": {
    mimeTypes: ["application/pdf"],
    detect: (buffer) => buffer.subarray(0, 5).toString("ascii") === "%PDF-",
  },
  ".png": {
    mimeTypes: ["image/png"],
    detect: (buffer) =>
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  ".jpg": {
    mimeTypes: ["image/jpeg"],
    detect: (buffer) =>
      buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  },
  ".jpeg": {
    mimeTypes: ["image/jpeg"],
    detect: (buffer) =>
      buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  },
  ".csv": {
    mimeTypes: ["text/csv", "application/csv", "text/plain"],
    detect: (buffer) => !looksLikeBinary(buffer),
  },
  ".xlsx": {
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/zip",
      "application/octet-stream",
    ],
    detect: isZipFile,
  },
  ".xls": {
    mimeTypes: ["application/vnd.ms-excel", "application/octet-stream"],
    detect: (buffer) =>
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])),
  },
  ".txt": {
    mimeTypes: ["text/plain"],
    detect: (buffer) => !looksLikeBinary(buffer),
  },
};

function isZipFile(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;

  return (
    buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) ||
    buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x05, 0x06])) ||
    buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x07, 0x08]))
  );
}

function looksLikeBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));

  if (sample.includes(0)) return true;

  let suspicious = 0;

  for (const byte of sample) {
    const allowed =
      byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126) || byte >= 128;

    if (!allowed) suspicious++;
  }

  return sample.length > 0 && suspicious / sample.length > 0.05;
}

function getExtension(filename: string): SupportedDocumentExtension | null {
  const lower = filename.toLowerCase();
  const extension = lower.slice(lower.lastIndexOf("."));

  if (
    extension === ".pdf" ||
    extension === ".png" ||
    extension === ".jpg" ||
    extension === ".jpeg" ||
    extension === ".csv" ||
    extension === ".xlsx" ||
    extension === ".xls" ||
    extension === ".txt"
  ) {
    return extension;
  }

  return null;
}

export function validateDocumentType(value: string | null): string | null {
  if (!value) return null;

  if (!(documentTypeEnum as readonly string[]).includes(value)) {
    throw new Error(`documentType inválido. Valores aceitos: ${documentTypeEnum.join(", ")}`);
  }

  return value;
}

export function validateDocumentFile(
  filename: string,
  declaredMimeType: string,
  buffer: Buffer
): ValidatedDocumentFile {
  if (buffer.length === 0) {
    throw new Error("O arquivo está vazio.");
  }

  const extension = getExtension(filename);

  if (!extension) {
    throw new Error("Extensão não suportada.");
  }

  const rule = FILE_RULES[extension];
  const normalizedMime = declaredMimeType.trim().toLowerCase();

  if (normalizedMime && normalizedMime !== "application/octet-stream") {
    if (!rule.mimeTypes.includes(normalizedMime)) {
      throw new Error(`O MIME type não corresponde à extensão ${extension}.`);
    }
  }

  if (!rule.detect(buffer)) {
    throw new Error(`A assinatura binária do arquivo não corresponde ao formato ${extension}.`);
  }

  const canonicalMime =
    extension === ".jpg" || extension === ".jpeg"
      ? "image/jpeg"
      : extension === ".xlsx"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : extension === ".xls"
          ? "application/vnd.ms-excel"
          : extension === ".csv"
            ? "text/csv"
            : extension === ".txt"
              ? "text/plain"
              : (rule.mimeTypes[0] ?? "application/octet-stream");

  return {
    extension,
    mimeType: canonicalMime,
  };
}
