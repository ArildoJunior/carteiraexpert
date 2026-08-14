import crypto from 'node:crypto';
import { eq, and, or, isNull, ilike, asc } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { assets } from '../../../lib/db/schema/portfolio';
import { insertAuditLog } from '../../../lib/db/audit';
import { assertOwnership } from '../../identity/server/authorization-service';
import type { SafeUser } from '../../identity/domain/user.types';
import {
  createCustomAssetSchema,
  searchAssetsSchema,
  type CreateCustomAssetInput,
  type SearchAssetsInput,
} from '../domain/asset.schema';
import type { Asset } from '../domain/asset.types';
import { AssetNotFoundError, DuplicateAssetError } from '../domain/errors';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function escapeLike(str: string): string {
  return str.replace(/[%_\\]/g, '\\$&');
}

/**
 * Realiza busca textual por ativos no catálogo.
 * Retorna ativos globais (isCustom = false) e ativos customizados pertencentes exclusivamente
 * ao usuário autenticado (isCustom = true AND userId = user.id).
 * Ativos customizados de outros usuários nunca são retornados.
 */
export async function searchAssets(
  rawParams: SearchAssetsInput,
  user: SafeUser,
  executor: any = db
): Promise<Asset[]> {
  const params = searchAssetsSchema.parse(rawParams);
  const trimmedQuery = params.query.trim();

  const visibilityCondition = or(
    and(eq(assets.isCustom, false), isNull(assets.userId)),
    and(eq(assets.isCustom, true), eq(assets.userId, user.id))
  );

  const conditions = [visibilityCondition];

  if (trimmedQuery.length > 0) {
    const escaped = escapeLike(trimmedQuery);
    conditions.push(
      or(
        ilike(assets.ticker, `${escaped}%`),
        ilike(assets.name, `%${escaped}%`)
      )!
    );
  }

  if (params.assetType) {
    conditions.push(eq(assets.assetType, params.assetType));
  }

  return await executor
    .select()
    .from(assets)
    .where(and(...conditions))
    .orderBy(asc(assets.ticker))
    .limit(params.limit);
}

/**
 * Busca um ativo por ID com controle de autorização e proteção contra IDOR:
 * - Ativo global (isCustom = false): acessível por qualquer usuário autenticado.
 * - Ativo customizado (isCustom = true): acessível apenas pelo usuário proprietário.
 * Tentativas de acesso a ativo customizado de terceiro acionam assertOwnership,
 * gravando evento de segurança no audit_logs e lançando AuthorizationError.
 * IDs com formato inválido ou não encontrados lançam AssetNotFoundError.
 */
export async function getAssetById(
  id: string,
  user: SafeUser,
  executor: any = db
): Promise<Asset> {
  if (!id || !UUID_REGEX.test(id)) {
    throw new AssetNotFoundError();
  }

  const [asset] = await executor
    .select()
    .from(assets)
    .where(eq(assets.id, id))
    .limit(1);

  if (!asset) {
    throw new AssetNotFoundError();
  }

  if (asset.isCustom) {
    await assertOwnership(asset.userId ?? '', user, 'asset', executor);
  }

  return asset;
}

/**
 * Cria um ativo customizado pertencente exclusivamente ao usuário autenticado.
 * Registra evento de auditoria com os dados do ativo criado.
 * Converte violações de unicidade de ticker do usuário em DuplicateAssetError.
 */
export async function createCustomAsset(
  rawInput: Omit<CreateCustomAssetInput, 'userId'>,
  user: SafeUser,
  executor: any = db
): Promise<Asset> {
  const input = createCustomAssetSchema.parse({
    ...rawInput,
    userId: user.id,
  });

  const id = crypto.randomUUID();
  const now = new Date();

  let createdAsset: Asset | null = null;

  const runOperation = async (tx: any) => {
    let row: Asset;
    try {
      const [inserted] = await tx
        .insert(assets)
        .values({
          id,
          ticker: input.ticker,
          name: input.name,
          assetType: 'custom',
          market: 'CUSTOM',
          currency: input.currency,
          isCustom: true,
          userId: user.id,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      row = inserted;
    } catch (err: any) {
      const code = err?.code || err?.cause?.code;
      const constraintName =
        err?.constraint_name ||
        err?.cause?.constraint_name ||
        err?.constraint ||
        err?.cause?.constraint;

      const isUserTickerMarketConstraint =
        code === '23505' &&
        constraintName === 'idx_assets_user_ticker_market';

      if (isUserTickerMarketConstraint) {
        throw new DuplicateAssetError(
          `Já existe um ativo customizado com o ticker "${input.ticker}" para este usuário.`
        );
      }

      throw err;
    }

    createdAsset = row;

    await insertAuditLog(
      {
        tableName: 'assets',
        recordId: id,
        action: 'INSERT',
        actorId: user.id,
        actorType: 'user',
        source: 'manual',
      },
      {
        newValue: {
          ticker: input.ticker,
          name: input.name,
          assetType: 'custom',
          market: 'CUSTOM',
          currency: input.currency,
          isCustom: true,
        },
      },
      {
        allowlist: [
          'ticker',
          'name',
          'assetType',
          'market',
          'currency',
          'isCustom',
        ],
      },
      tx
    );
  };

  if (typeof executor.transaction === 'function') {
    await executor.transaction(runOperation);
  } else {
    await runOperation(executor);
  }

  if (!createdAsset) {
    throw new Error('Falha ao criar ativo customizado.');
  }

  return createdAsset;
}

/**
 * Lista todos os ativos customizados pertencentes exclusivamente ao usuário autenticado.
 */
export async function listCustomAssets(
  user: SafeUser,
  executor: any = db
): Promise<Asset[]> {
  return await executor
    .select()
    .from(assets)
    .where(and(eq(assets.isCustom, true), eq(assets.userId, user.id)))
    .orderBy(asc(assets.ticker));
}
