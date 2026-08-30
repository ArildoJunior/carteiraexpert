import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  computeFileSha256,
  storeZipFile,
  extractTxtFromZip,
  getCotahistStorageDirectory,
} from '@/modules/market-data/server/cotahist-storage.service';

describe('COTAHIST Storage Service (Integração)', () => {
  const sampleZipPath = path.resolve(
    process.cwd(),
    '.local-data',
    'cotahist',
    'incoming',
    'COTAHIST_D26082026.ZIP'
  );

  it('deve calcular o hash SHA-256 do arquivo ZIP de forma determinística', async () => {
    if (!fs.existsSync(sampleZipPath)) {
      console.warn('Arquivo COTAHIST_D26082026.ZIP não encontrado para teste de integração de storage.');
      return;
    }

    const sha1 = await computeFileSha256(sampleZipPath);
    const sha2 = await computeFileSha256(sampleZipPath);

    expect(sha1).toBe(sha2);
    expect(sha1.length).toBe(64);
  });

  it('deve armazenar o ZIP no diretório privado e preservar o arquivo original', async () => {
    if (!fs.existsSync(sampleZipPath)) return;

    const sha256 = await computeFileSha256(sampleZipPath);
    const result = await storeZipFile(sampleZipPath, sha256);

    expect(result.storagePath).toBeDefined();
    expect(fs.existsSync(result.storagePath)).toBe(true);
    expect(fs.existsSync(sampleZipPath)).toBe(true); // Arquivo original intacto!
  });

  it('deve extrair com segurança o TXT temporário e executar o cleanup', async () => {
    if (!fs.existsSync(sampleZipPath)) return;

    const { tempTxtPath, originalTxtName, cleanup } = await extractTxtFromZip(sampleZipPath);

    expect(fs.existsSync(tempTxtPath)).toBe(true);
    expect(originalTxtName).toBe('COTAHIST_D26082026.TXT');

    // Executa a limpeza
    await cleanup();
    expect(fs.existsSync(tempTxtPath)).toBe(false);
  });
});
