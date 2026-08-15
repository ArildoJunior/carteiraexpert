import { describe, it, expect } from 'vitest';
import {
  searchAssets,
  getAssetById,
  createCustomAsset,
} from '../../../src/modules/portfolio/server/asset.service';
import { AssetNotFoundError } from '../../../src/modules/portfolio/domain/errors';
import type { SafeUser } from '../../../src/modules/identity/domain/user.types';
import crypto from 'node:crypto';

describe('Unidade: AssetService (Validações de Entrada e Formato)', () => {
  const user1: SafeUser = {
    id: crypto.randomUUID(),
    email: 'user1@carteiraexpert.test',
    name: 'Asset User 1',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('searchAssets (validação de parâmetros)', () => {
    it('deve rejeitar limit maior que 50', async () => {
      await expect(
        searchAssets({ query: 'PETR', limit: 51 }, user1)
      ).rejects.toThrow();
    });

    it('deve rejeitar limit menor que 1', async () => {
      await expect(
        searchAssets({ query: 'PETR', limit: 0 }, user1)
      ).rejects.toThrow();
    });
  });

  describe('getAssetById (validação de formato de ID)', () => {
    it('deve lançar AssetNotFoundError para ID com formato inválido (não-UUID)', async () => {
      await expect(getAssetById('id-invalido', user1)).rejects.toThrow(
        AssetNotFoundError
      );
    });

    it('deve lançar AssetNotFoundError para ID vazio', async () => {
      await expect(getAssetById('', user1)).rejects.toThrow(
        AssetNotFoundError
      );
    });
  });

  describe('createCustomAsset (validação de entrada)', () => {
    it('deve rejeitar ticker vazio', async () => {
      await expect(
        createCustomAsset(
          {
            ticker: '',
            name: 'Ativo Invalido',
            currency: 'BRL',
          },
          user1
        )
      ).rejects.toThrow();
    });

    it('deve rejeitar ticker com caracteres especiais proibidos', async () => {
      await expect(
        createCustomAsset(
          {
            ticker: 'TICKER@#$',
            name: 'Ativo Invalido',
            currency: 'BRL',
          },
          user1
        )
      ).rejects.toThrow();
    });

    it('deve rejeitar nome de ativo vazio', async () => {
      await expect(
        createCustomAsset(
          {
            ticker: 'VALIDO3',
            name: '   ',
            currency: 'BRL',
          },
          user1
        )
      ).rejects.toThrow();
    });
  });
});
