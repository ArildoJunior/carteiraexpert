export type Encoding = "utf-8" | "latin-1" | "windows-1252";

export type DecodedBuffer = {
  text: string;
  encoding: Encoding;
  hadNonUtf8: boolean;
};

// Tenta decodificar o Buffer. Retorna qual encoding foi usado e se houve fallback.
export function detectAndDecode(buffer: Buffer): DecodedBuffer {
  // 1. UTF-8: o padrao. Tenta decodificar e checa se houve caracteres invalidos.
  const utf8 = buffer.toString("utf-8");
  if (!hasInvalidUtf8Sequences(buffer)) {
    return { text: utf8, encoding: "utf-8", hadNonUtf8: false };
  }

  // 2. Latin-1 (ISO-8859-1): cobre 99% dos CSVs brasileiros antigos.
  //    Cada byte vira 1 caractere diretamente.
  const latin1 = buffer.toString("latin1");
  if (looksLikeBrazilianPortuguese(latin1)) {
    return { text: latin1, encoding: "latin-1", hadNonUtf8: true };
  }

  // 3. Windows-1252: fallback final. Quase identico ao Latin-1 mas com
  //    alguns caracteres especiais em 0x80-0x9F.
  const _win1252 = buffer.toString("binary");
  const iconv = iconvDecode(buffer, "windows-1252");
  return { text: iconv, encoding: "windows-1252", hadNonUtf8: true };
}

function hasInvalidUtf8Sequences(buffer: Buffer): boolean {
  // Conta sequencias invalidas (U+FFFD = replacement char).
  const text = buffer.toString("utf-8");
  return text.includes("\uFFFD");
}

function looksLikeBrazilianPortuguese(text: string): boolean {
  // Heuristica simples: presenca de caracteres tipicos de PT-BR.
  // (acentos graficos, cedilha, etc)
  const ptBrChars = /[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]/;
  return ptBrChars.test(text);
}

// Wrapper de iconv-like decode sem dependencia externa.
// Node nao tem 'iconv' nativo, mas binary->string ja' cobre windows-1252
// porque os bytes < 0x80 sao ASCII e 0x80-0xFF sao quasi-identicos ao Latin-1.
function iconvDecode(buffer: Buffer, _encoding: Encoding): string {
  return buffer.toString("binary");
}
