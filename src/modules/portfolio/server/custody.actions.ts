'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/modules/identity/server/current-user';
import {
  getCustodyInstitutions,
  getCustodyAccountsByPortfolio,
  createCustodyAccount,
  updateCustodyAccount,
  archiveCustodyAccount,
  serializeCustodyInstitution,
  serializeCustodyAccount,
} from './custody.service';
import {
  createCustodyAccountSchema,
  updateCustodyAccountSchema,
  archiveCustodyAccountSchema,
  type CreateCustodyAccountInput,
  type UpdateCustodyAccountInput,
} from '../domain/custody.schema';
import {
  CustodyInstitutionNotFoundError,
  CustodyAccountNotFoundError,
  CustodyAccountArchivedError,
  PortfolioFrozenError,
  PortfolioNotFoundError,
} from '../domain/errors';
import type {
  SerializedCustodyInstitution,
  SerializedCustodyAccount,
} from '../domain/custody.types';

export type CustodyActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function getCustodyInstitutionsAction(): Promise<
  CustodyActionResult<SerializedCustodyInstitution[]>
> {
  try {
    const institutions = await getCustodyInstitutions();
    return {
      success: true,
      data: institutions.map(serializeCustodyInstitution),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao consultar instituições.';
    return { success: false, error: message };
  }
}

export async function getCustodyAccountsAction(
  portfolioId: string
): Promise<CustodyActionResult<SerializedCustodyAccount[]>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'Sessão expirada. Faça login novamente.' };
    }

    const accounts = await getCustodyAccountsByPortfolio(portfolioId, user);
    return {
      success: true,
      data: accounts.map(serializeCustodyAccount),
    };
  } catch (err) {
    if (err instanceof PortfolioNotFoundError) {
      return { success: false, error: err.message };
    }
    const message = err instanceof Error ? err.message : 'Erro ao consultar contas de custódia.';
    return { success: false, error: message };
  }
}

export async function createCustodyAccountAction(
  rawInput: CreateCustodyAccountInput
): Promise<CustodyActionResult<SerializedCustodyAccount>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'Sessão expirada. Faça login novamente.' };
    }

    const input = createCustodyAccountSchema.parse(rawInput);
    const account = await createCustodyAccount(input, user);

    revalidatePath(`/portfolios/${input.portfolioId}`);
    revalidatePath('/dashboard');

    return {
      success: true,
      data: serializeCustodyAccount(account),
    };
  } catch (err) {
    if (
      err instanceof CustodyInstitutionNotFoundError ||
      err instanceof PortfolioNotFoundError ||
      err instanceof PortfolioFrozenError
    ) {
      return { success: false, error: err.message };
    }
    const message = err instanceof Error ? err.message : 'Erro ao criar conta de custódia.';
    return { success: false, error: message };
  }
}

export async function updateCustodyAccountAction(
  rawInput: UpdateCustodyAccountInput
): Promise<CustodyActionResult<SerializedCustodyAccount>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'Sessão expirada. Faça login novamente.' };
    }

    const input = updateCustodyAccountSchema.parse(rawInput);
    const account = await updateCustodyAccount(input, user);

    revalidatePath(`/portfolios/${input.portfolioId}`);
    revalidatePath('/dashboard');

    return {
      success: true,
      data: serializeCustodyAccount(account),
    };
  } catch (err) {
    if (
      err instanceof CustodyAccountNotFoundError ||
      err instanceof PortfolioFrozenError
    ) {
      return { success: false, error: err.message };
    }
    const message = err instanceof Error ? err.message : 'Erro ao atualizar conta de custódia.';
    return { success: false, error: message };
  }
}

export async function archiveCustodyAccountAction(
  id: string,
  portfolioId: string
): Promise<CustodyActionResult<SerializedCustodyAccount>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'Sessão expirada. Faça login novamente.' };
    }

    const input = archiveCustodyAccountSchema.parse({ id, portfolioId });
    const account = await archiveCustodyAccount(input, user);

    revalidatePath(`/portfolios/${portfolioId}`);
    revalidatePath('/dashboard');

    return {
      success: true,
      data: serializeCustodyAccount(account),
    };
  } catch (err) {
    if (
      err instanceof CustodyAccountNotFoundError ||
      err instanceof PortfolioFrozenError
    ) {
      return { success: false, error: err.message };
    }
    const message = err instanceof Error ? err.message : 'Erro ao arquivar conta de custódia.';
    return { success: false, error: message };
  }
}
