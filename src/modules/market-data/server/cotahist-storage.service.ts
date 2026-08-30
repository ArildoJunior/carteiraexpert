import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

/**
 * Calcula o hash SHA-256 de um arquivo em streaming sem carregar na memória.
 */
export async function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Retorna o diretório configurado de armazenamento privado para os ZIPs do COTAHIST.
 */
export function getCotahistStorageDirectory(): string {
  const customDir = process.env.COTAHIST_STORAGE_DIR;
  if (customDir && customDir.trim().length > 0) {
    return path.resolve(customDir.trim());
  }
  return path.resolve(process.cwd(), '.local-data', 'cotahist', 'storage');
}

/**
 * Armazena com segurança o ZIP original no diretório privado.
 * Nunca sobrescreve ou apaga o arquivo de origem.
 */
export async function storeZipFile(
  sourceFilePath: string,
  sha256: string
): Promise<{ storagePath: string; fileName: string; fileSize: number }> {
  if (!fs.existsSync(sourceFilePath)) {
    throw new Error(`Arquivo de origem não encontrado: "${sourceFilePath}".`);
  }

  const stat = await fs.promises.stat(sourceFilePath);
  const originalFileName = path.basename(sourceFilePath);
  const storageDir = getCotahistStorageDirectory();

  await fs.promises.mkdir(storageDir, { recursive: true });

  const destinationPath = path.join(storageDir, `${sha256}.zip`);

  // Se o arquivo de destino já existe com o mesmo hash, apenas confirma
  if (!fs.existsSync(destinationPath)) {
    await fs.promises.copyFile(sourceFilePath, destinationPath);
  }

  return {
    storagePath: destinationPath,
    fileName: originalFileName,
    fileSize: stat.size,
  };
}

/**
 * Extrai o TXT de um arquivo ZIP para um diretório temporário isolado.
 * Implementa proteção rigorosa contra ataques de Zip Slip (path traversal).
 */
export async function extractTxtFromZip(zipFilePath: string): Promise<{
  tempTxtPath: string;
  originalTxtName: string;
  cleanup: () => Promise<void>;
}> {
  if (!fs.existsSync(zipFilePath)) {
    throw new Error(`Arquivo ZIP não encontrado: "${zipFilePath}".`);
  }

  const buffer = await fs.promises.readFile(zipFilePath);

  // Localiza o End of Central Directory (EOCD)
  const eocdSig = 0x06054b50;
  let eocdPos = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === eocdSig) {
      eocdPos = i;
      break;
    }
  }

  if (eocdPos === -1) {
    throw new Error('Estrutura de arquivo ZIP inválida ou corrompida (EOCD não localizado).');
  }

  const cdOffset = buffer.readUInt32LE(eocdPos + 16);
  const cdEntries = buffer.readUInt16LE(eocdPos + 10);

  if (cdEntries === 0) {
    throw new Error('Arquivo ZIP vazio (nenhum arquivo interno encontrado).');
  }

  // Itera pelas entradas do Central Directory
  let currentOffset = cdOffset;
  let txtEntry: {
    fileName: string;
    compressionMethod: number;
    compSize: number;
    uncompSize: number;
    localOffset: number;
  } | null = null;

  for (let i = 0; i < cdEntries; i++) {
    if (buffer.readUInt32LE(currentOffset) !== 0x02014b50) {
      break;
    }

    const method = buffer.readUInt16LE(currentOffset + 10);
    const compSize = buffer.readUInt32LE(currentOffset + 20);
    const uncompSize = buffer.readUInt32LE(currentOffset + 24);
    const fnLen = buffer.readUInt16LE(currentOffset + 28);
    const extraLen = buffer.readUInt16LE(currentOffset + 30);
    const commentLen = buffer.readUInt16LE(currentOffset + 32);
    const localOffset = buffer.readUInt32LE(currentOffset + 42);
    const rawName = buffer.slice(currentOffset + 46, currentOffset + 46 + fnLen).toString('utf8');

    // Validação de segurança anti-Zip Slip
    if (rawName.includes('..') || path.isAbsolute(rawName) || rawName.startsWith('/') || rawName.startsWith('\\')) {
      throw new Error(`Tentativa de Zip Slip detectada na entrada "${rawName}".`);
    }

    if (rawName.toUpperCase().endsWith('.TXT')) {
      txtEntry = {
        fileName: path.basename(rawName),
        compressionMethod: method,
        compSize,
        uncompSize,
        localOffset,
      };
      break;
    }

    currentOffset += 46 + fnLen + extraLen + commentLen;
  }

  if (!txtEntry) {
    throw new Error('Nenhum arquivo TXT de cotações encontrado dentro do ZIP.');
  }

  // Extrai o conteúdo compactado da entrada local
  const localFnLen = buffer.readUInt16LE(txtEntry.localOffset + 26);
  const localExtraLen = buffer.readUInt16LE(txtEntry.localOffset + 28);
  const dataStart = txtEntry.localOffset + 30 + localFnLen + localExtraLen;
  const compressedData = buffer.slice(dataStart, dataStart + txtEntry.compSize);

  let decompressedData: Buffer;
  if (txtEntry.compressionMethod === 8) {
    decompressedData = zlib.inflateRawSync(compressedData);
  } else if (txtEntry.compressionMethod === 0) {
    decompressedData = compressedData;
  } else {
    throw new Error(`Método de compressão ZIP não suportado: ${txtEntry.compressionMethod}.`);
  }

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cotahist-'));
  const tempTxtPath = path.join(tempDir, txtEntry.fileName);

  await fs.promises.writeFile(tempTxtPath, decompressedData);

  const cleanup = async () => {
    try {
      if (fs.existsSync(tempDir)) {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      }
    } catch {
      // Falha silenciosa de limpeza de temporários do SO
    }
  };

  return {
    tempTxtPath,
    originalTxtName: txtEntry.fileName,
    cleanup,
  };
}
