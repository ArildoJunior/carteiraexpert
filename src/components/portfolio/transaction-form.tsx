"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { transactionTypeEnum } from "@/lib/db/enums";
import { type CreateTransaction, createTransactionSchema } from "@/lib/validations/transaction";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

type Account = { id: string; name: string };
type Asset = {
  id: string;
  ticker: string;
  name: string;
  assetClass: string;
};

type Props = {
  accounts: Account[];
  assets: Asset[];
  defaultAccountId?: string;
  defaultAssetId?: string;
  onSuccessRedirect?: string;
};

const TYPE_LABELS: Record<(typeof transactionTypeEnum)[number], string> = {
  buy: "Compra",
  sell: "Venda",
  dividend: "Dividendo",
  jcp: "JCP",
  reitIncome: "Rendimento FII",
  fixedIncomeCoupon: "Cupom Renda Fixa",
  bonus: "Bonificacao",
  split: "Split",
};

type FormValues = z.input<typeof createTransactionSchema>;

export function TransactionForm({
  accounts,
  assets,
  defaultAccountId,
  defaultAssetId,
  onSuccessRedirect = "/app/posicoes",
}: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues, undefined, CreateTransaction>({
    resolver: zodResolver(createTransactionSchema),
    defaultValues: {
      accountId: defaultAccountId ?? "",
      assetId: defaultAssetId ?? "",
      type: "buy",
      transactionDate: new Date().toISOString().slice(0, 10),
      quantity: 0,
      unitPrice: 0,
      fees: 0,
      currency: "BRL",
    },
  });

  const selectedAssetId = watch("assetId");
  const selectedAccountId = watch("accountId");
  const selectedType = watch("type");

  // TODO Cap. 6: buscar cotacao atual do ativo e popular unitPrice
  useEffect(() => {
    if (selectedAssetId && !defaultAssetId) {
      // sera preenchido pelo Cap. 6
    }
  }, [selectedAssetId, defaultAssetId]);

  async function onSubmit(data: CreateTransaction) {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.message ?? "Erro ao registrar movimentacao");
        return;
      }
      toast.success("Movimentacao registrada");
      router.push(onSuccessRedirect);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const filteredAssets = assets
    .filter((a) =>
      search
        ? a.ticker.toLowerCase().includes(search.toLowerCase()) ||
          a.name.toLowerCase().includes(search.toLowerCase())
        : true
    )
    .slice(0, 50);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{defaultAssetId ? "Nova movimentacao" : "Nova posicao"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Conta</Label>
              <Select
                value={selectedAccountId}
                onValueChange={(v) => setValue("accountId", v)}
                disabled={!!defaultAccountId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.accountId && (
                <p className="text-sm text-destructive">{errors.accountId.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select
                value={selectedType}
                onValueChange={(v) => setValue("type", v as FormValues["type"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {transactionTypeEnum.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABELS[t] ?? t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!defaultAssetId && (
            <div className="space-y-2">
              <Label>Ativo</Label>
              <Input
                placeholder="Buscar por ticker ou nome..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="mb-2"
              />
              <Select value={selectedAssetId} onValueChange={(v) => setValue("assetId", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o ativo" />
                </SelectTrigger>
                <SelectContent>
                  {filteredAssets.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.ticker} - {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.assetId && (
                <p className="text-sm text-destructive">{errors.assetId.message}</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="transactionDate">Data</Label>
              <Input id="transactionDate" type="date" {...register("transactionDate")} />
              {errors.transactionDate && (
                <p className="text-sm text-destructive">{errors.transactionDate.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantidade</Label>
              <Input
                id="quantity"
                type="number"
                step="0.00000001"
                {...register("quantity", { valueAsNumber: true })}
              />
              {errors.quantity && (
                <p className="text-sm text-destructive">{errors.quantity.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="unitPrice">Preco unitario</Label>
              <Input
                id="unitPrice"
                type="number"
                step="0.00000001"
                {...register("unitPrice", { valueAsNumber: true })}
              />
              {errors.unitPrice && (
                <p className="text-sm text-destructive">{errors.unitPrice.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="fees">Taxas (opcional)</Label>
              <Input
                id="fees"
                type="number"
                step="0.01"
                {...register("fees", { valueAsNumber: true })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Observacoes (opcional)</Label>
            <Input id="notes" {...register("notes")} placeholder="Anotacoes sobre a movimentacao" />
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={loading}>
              {loading ? "Salvando..." : "Registrar"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={loading}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
