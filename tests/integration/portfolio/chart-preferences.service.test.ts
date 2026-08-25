import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '../../../src/lib/db';
import { users, userChartPreferences } from '../../../src/lib/db/schema';
import {
  getUserChartPreferences,
  getUserChartPreferenceByArea,
  saveUserChartPreference,
} from '../../../src/modules/portfolio/server/chart-preferences.service';
import type { SafeUser } from '../../../src/modules/identity/domain/user.types';

describe('Integração: Persistência de Preferências de Gráficos (PostgreSQL Real)', () => {
  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  const userAEmail = 'chart_pref_user_a@carteiraexpert.invalid';
  const userBEmail = 'chart_pref_user_b@carteiraexpert.invalid';

  const userA: SafeUser = {
    id: userAId,
    email: userAEmail,
    name: 'Chart Pref User A',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const userB: SafeUser = {
    id: userBId,
    email: userBEmail,
    name: 'Chart Pref User B',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeAll(async () => {
    // Insere usuários de teste
    await db.insert(users).values([
      {
        id: userAId,
        email: userAEmail,
        name: 'Chart Pref User A',
        passwordHash: 'dummy_hash',
        status: 'active',
      },
      {
        id: userBId,
        email: userBEmail,
        name: 'Chart Pref User B',
        passwordHash: 'dummy_hash',
        status: 'active',
      },
    ]);
  });

  afterEach(async () => {
    // Limpa preferências criadas nos testes
    await db
      .delete(userChartPreferences)
      .where(
        eq(userChartPreferences.userId, userAId)
      );
    await db
      .delete(userChartPreferences)
      .where(
        eq(userChartPreferences.userId, userBId)
      );
  });

  afterAll(async () => {
    // Limpeza de usuários de teste
    await db.delete(users).where(eq(users.id, userAId));
    await db.delete(users).where(eq(users.id, userBId));
  });

  it('1. deve retornar mapa vazio quando o usuário não possuir preferências salvas', async () => {
    const preferences = await getUserChartPreferences(userA);
    expect(preferences).toEqual({});

    const singleArea = await getUserChartPreferenceByArea(userA, 'portfolio_evolution');
    expect(singleArea).toBeNull();
  });

  it('2. deve salvar e recuperar preferências para todas as 3 áreas', async () => {
    // Salva preferência de evolução
    const prefEvol = await saveUserChartPreference(userA, {
      chartArea: 'portfolio_evolution',
      period: '6M',
      viewMode: 'market_value',
    });
    expect(prefEvol.chartArea).toBe('portfolio_evolution');
    expect(prefEvol.period).toBe('6M');
    expect(prefEvol.viewMode).toBe('market_value');

    // Salva preferência de alocação no dashboard
    const prefDash = await saveUserChartPreference(userA, {
      chartArea: 'dashboard_allocation',
      groupingType: 'portfolio',
      basis: 'cost_basis',
    });
    expect(prefDash.chartArea).toBe('dashboard_allocation');
    expect(prefDash.groupingType).toBe('portfolio');
    expect(prefDash.basis).toBe('cost_basis');

    // Salva preferência de alocação na carteira
    const prefPortAlloc = await saveUserChartPreference(userA, {
      chartArea: 'portfolio_allocation',
      groupingType: 'asset_type',
      basis: 'market_value',
    });
    expect(prefPortAlloc.chartArea).toBe('portfolio_allocation');
    expect(prefPortAlloc.groupingType).toBe('asset_type');
    expect(prefPortAlloc.basis).toBe('market_value');

    // Recupera mapa completo
    const map = await getUserChartPreferences(userA);
    expect(map.portfolio_evolution?.period).toBe('6M');
    expect(map.portfolio_evolution?.viewMode).toBe('market_value');
    expect(map.dashboard_allocation?.groupingType).toBe('portfolio');
    expect(map.dashboard_allocation?.basis).toBe('cost_basis');
    expect(map.portfolio_allocation?.groupingType).toBe('asset_type');
    expect(map.portfolio_allocation?.basis).toBe('market_value');
  });

  it('3. deve atualizar preferência de forma idempotente mantendo campos não alterados', async () => {
    // 1. Cria com period='1Y' e viewMode='comparison'
    await saveUserChartPreference(userA, {
      chartArea: 'portfolio_evolution',
      period: '1Y',
      viewMode: 'comparison',
    });

    // 2. Atualiza apenas viewMode='pnl'
    const updated = await saveUserChartPreference(userA, {
      chartArea: 'portfolio_evolution',
      viewMode: 'pnl',
    });

    expect(updated.viewMode).toBe('pnl');
    expect(updated.period).toBe('1Y');

    // Verifica no banco
    const [dbRecord] = await db
      .select()
      .from(userChartPreferences)
      .where(
        and(
          eq(userChartPreferences.userId, userAId),
          eq(userChartPreferences.chartArea, 'portfolio_evolution')
        )
      );

    expect(dbRecord.viewMode).toBe('pnl');
    expect(dbRecord.period).toBe('1Y');
  });

  it('4. deve garantir isolamento multi-tenant absoluto entre usuários', async () => {
    // Usuário A define preferências
    await saveUserChartPreference(userA, {
      chartArea: 'dashboard_allocation',
      groupingType: 'currency',
      basis: 'cost_basis',
    });

    // Usuário B define preferências distintas
    await saveUserChartPreference(userB, {
      chartArea: 'dashboard_allocation',
      groupingType: 'portfolio',
      basis: 'market_value',
    });

    // Verifica que Usuário A vê apenas as suas
    const mapA = await getUserChartPreferences(userA);
    expect(mapA.dashboard_allocation?.groupingType).toBe('currency');
    expect(mapA.dashboard_allocation?.basis).toBe('cost_basis');

    // Verifica que Usuário B vê apenas as suas
    const mapB = await getUserChartPreferences(userB);
    expect(mapB.dashboard_allocation?.groupingType).toBe('portfolio');
    expect(mapB.dashboard_allocation?.basis).toBe('market_value');
  });

  it('5. deve excluir preferências em cascata quando o usuário for excluído', async () => {
    const tempUserId = crypto.randomUUID();
    const tempUser: SafeUser = {
      id: tempUserId,
      email: 'temp_user@carteiraexpert.invalid',
      name: 'Temp User',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(users).values({
      id: tempUserId,
      email: tempUser.email,
      name: tempUser.name,
      passwordHash: 'dummy_hash',
      status: 'active',
    });

    await saveUserChartPreference(tempUser, {
      chartArea: 'portfolio_evolution',
      period: 'ALL',
      viewMode: 'comparison',
    });

    const prefBefore = await getUserChartPreferences(tempUser);
    expect(prefBefore.portfolio_evolution?.period).toBe('ALL');

    // Exclui o usuário do banco
    await db.delete(users).where(eq(users.id, tempUserId));

    // Preferências devem ter sido removidas por ON DELETE CASCADE
    const remainingPrefs = await db
      .select()
      .from(userChartPreferences)
      .where(eq(userChartPreferences.userId, tempUserId));

    expect(remainingPrefs).toHaveLength(0);
  });
});
