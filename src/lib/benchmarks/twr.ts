import type { PortfolioSnapshot } from "./types";

/**
 * TWR — Time-Weighted Return (CFA Institute / GIPS).
 * Encadeamento de retornos por subperíodo:
 *   R_total = ∏ (1 + R_i) - 1
 * Isola performance da gestão, sem efeito de aportes/resgates.
 */
export function calculateTWR(snapshots: PortfolioSnapshot[]): number {
  if (snapshots.length < 2) return 0;
  let cumulative = 1;
  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const curr = snapshots[i];
    if (!prev || !curr) continue;
    const prevVal = Number(prev.totalValue);
    if (prevVal <= 0) continue;
    const r = Number(curr.totalValue) / prevVal - 1;
    cumulative *= 1 + r;
  }
  return cumulative - 1;
}

export function calculateDailyTWR(prev: PortfolioSnapshot, curr: PortfolioSnapshot): number {
  const prevVal = Number(prev.totalValue);
  if (prevVal <= 0) return 0;
  return Number(curr.totalValue) / prevVal - 1;
}

export function annualizeTWR(cumulative: number, days: number): number {
  if (days <= 0) return 0;
  return (1 + cumulative) ** (365 / days) - 1;
}
