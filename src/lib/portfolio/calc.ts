import { PortfolioCalculationError, type PositionResult, type TransactionInput } from "./types";

// Re-exporta os tipos para quem preferir importar tudo de "calc"
export { type TransactionInput, type PositionResult, PortfolioCalculationError };

/**
 * Calcula custo medio ponderado apos uma nova compra.
 */
export function calculateAverageCost(
  currentQuantity: number,
  currentAvgCost: number,
  addedQuantity: number,
  addedPrice: number
): number {
  if (currentQuantity < 0 || addedQuantity < 0) {
    throw new PortfolioCalculationError("Quantidades nao podem ser negativas");
  }
  if (addedPrice < 0) {
    throw new PortfolioCalculationError("Preco nao pode ser negativo");
  }
  const newTotalQty = currentQuantity + addedQuantity;
  if (newTotalQty === 0) return 0;
  const newTotalCost = currentQuantity * currentAvgCost + addedQuantity * addedPrice;
  return newTotalCost / newTotalQty;
}

/**
 * Calcula lucro realizado de uma venda.
 */
export function calculateRealizedPnL(
  soldQuantity: number,
  avgCost: number,
  salePrice: number
): number {
  return (salePrice - avgCost) * soldQuantity;
}

/**
 * Aplica bonificacao, preservando o valor total investido.
 */
export function applyBonus(
  currentQuantity: number,
  currentAvgCost: number,
  bonusQuantity: number
): { quantity: number; averageCost: number } {
  if (bonusQuantity < 0) {
    throw new PortfolioCalculationError("Bonificacao nao pode ser negativa");
  }
  const newQuantity = currentQuantity + bonusQuantity;
  if (newQuantity === 0) return { quantity: 0, averageCost: 0 };
  const newAvgCost = (currentQuantity * currentAvgCost) / newQuantity;
  return { quantity: newQuantity, averageCost: newAvgCost };
}

/**
 * Aplica desdobramento (split) ou grupamento (inplit).
 */
export function applySplit(
  currentQuantity: number,
  currentAvgCost: number,
  splitRatio: number
): { quantity: number; averageCost: number } {
  if (splitRatio <= 0) {
    throw new PortfolioCalculationError("splitRatio deve ser positivo");
  }
  return {
    quantity: currentQuantity * splitRatio,
    averageCost: currentAvgCost / splitRatio,
  };
}

/**
 * Funcao principal.
 */
export function calculatePosition(transactions: TransactionInput[]): PositionResult {
  if (transactions.length === 0) {
    throw new PortfolioCalculationError("Lista de movimentacoes vazia");
  }

  const first = transactions[0];
  if (!first) {
    throw new PortfolioCalculationError("Lista de movimentacoes vazia");
  }
  const assetId = first.assetId;
  const accountId = first.accountId;

  for (const tx of transactions) {
    if (tx.assetId !== assetId || tx.accountId !== accountId) {
      throw new PortfolioCalculationError(
        "Todas as movimentacoes devem ser do mesmo ativo e conta"
      );
    }
  }

  const sorted = [...transactions].sort(
    (a, b) => a.transactionDate.getTime() - b.transactionDate.getTime()
  );

  let quantity = 0;
  let averageCost = 0;
  let totalInvested = 0;
  let realizedPnL = 0;
  let openedAt: Date | null = null;
  const firstTx = sorted[0];
  if (!firstTx) throw new PortfolioCalculationError("Lista vazia");
  let lastTransactionAt = firstTx.transactionDate;

  for (const tx of sorted) {
    lastTransactionAt = tx.transactionDate;

    switch (tx.type) {
      case "buy": {
        if (quantity === 0) openedAt = tx.transactionDate;
        averageCost = calculateAverageCost(quantity, averageCost, tx.quantity, tx.unitPrice);
        quantity += tx.quantity;
        totalInvested += tx.totalAmount;
        break;
      }

      case "sell": {
        if (tx.quantity > quantity) {
          throw new PortfolioCalculationError(
            `Venda de ${tx.quantity} unidades mas posicao tem apenas ${quantity}`
          );
        }
        realizedPnL += calculateRealizedPnL(tx.quantity, averageCost, tx.unitPrice);
        quantity -= tx.quantity;
        if (quantity === 0) {
          // FIX: zera custo medio quando posicao e totalmente vendida
          averageCost = 0;
        }
        break;
      }

      case "dividend":
      case "jcp":
      case "reitIncome": {
        break;
      }

      case "fixedIncomeCoupon": {
        // Cupom: renda recebida, acumula em totalInvested (rentabilidade)
        totalInvested += tx.totalAmount;
        break;
      }

      case "bonus": {
        const result = applyBonus(quantity, averageCost, tx.quantity);
        quantity = result.quantity;
        averageCost = result.averageCost;
        break;
      }

      case "split": {
        if (!tx.splitRatio) {
          throw new PortfolioCalculationError(
            "splitRatio e obrigatorio para movimentacoes de tipo split"
          );
        }
        const result = applySplit(quantity, averageCost, tx.splitRatio);
        quantity = result.quantity;
        averageCost = result.averageCost;
        break;
      }
    }
  }

  const isOpen = quantity > 0;
  const closedAt = !isOpen ? lastTransactionAt : null;

  return {
    assetId,
    accountId,
    quantity,
    averageCost,
    totalInvested,
    realizedPnL,
    isOpen,
    openedAt,
    closedAt,
    lastTransactionAt,
  };
}
