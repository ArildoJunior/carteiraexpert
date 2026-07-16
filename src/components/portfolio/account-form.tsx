"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { accountTypeEnum, brokerEnum } from "@/lib/db/enums";
import {
  type CreateBrokerageAccount,
  createBrokerageAccountSchema,
} from "@/lib/validations/brokerage-account";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

const TYPE_LABELS: Record<(typeof accountTypeEnum)[number], string> = {
  brokerage: "Corretora",
  bank: "Banco",
  exchange: "Exchange",
  custodian: "Custodiante",
  wallet: "Carteira",
  other: "Outro",
};

const BROKER_LABELS: Record<(typeof brokerEnum)[number], string> = {
  xp: "XP",
  rico: "Rico",
  btg: "BTG",
  nuinvest: "NuInvest",
  inter: "Inter",
  sofisa: "Sofisa",
  modal: "Modal",
  b3: "B3",
  binance: "Binance",
  mercado: "Mercado",
  coinbase: "Coinbase",
  kraken: "Kraken",
  manual: "Manual",
  other: "Outro",
};

type Props = {
  defaultValues?: Partial<CreateBrokerageAccount>;
  accountId?: string;
};

// Input type: o que o formulario guarda (broker/currency opcionais antes do default)
type FormValues = z.input<typeof createBrokerageAccountSchema>;

export function AccountForm({ defaultValues, accountId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues, undefined, CreateBrokerageAccount>({
    //                              ^^^^^^^^^^^  ^^^^^^^^^^^^^^^^^^^^^^^^
    // FIX: 2o generico = ctx (undefined), 3o = OUTPUT type (com defaults aplicados)
    // Isso faz handleSubmit(onSubmit) tipar corretamente:
    // - inputs do form sao FormValues (broker/currency opcionais)
    // - onSubmit recebe CreateBrokerageAccount (broker/currency garantidos)
    resolver: zodResolver(createBrokerageAccountSchema),
    defaultValues: {
      name: "",
      type: "brokerage",
      broker: "manual",
      currency: "BRL",
      ...defaultValues,
    },
  });

  async function onSubmit(data: CreateBrokerageAccount) {
    setLoading(true);
    try {
      const url = accountId ? `/api/v1/accounts/${accountId}` : "/api/v1/accounts";
      const method = accountId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.message ?? "Erro ao salvar conta");
        return;
      }
      toast.success(accountId ? "Conta atualizada" : "Conta criada");
      router.push("/app/contas");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const currentType = watch("type");
  const currentBroker = watch("broker");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Nome da conta</Label>
        <Input id="name" {...register("name")} placeholder="Ex: XP Investimentos" />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Tipo</Label>
          <Select
            value={currentType}
            onValueChange={(v) => setValue("type", v as FormValues["type"])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {accountTypeEnum.map((t) => (
                <SelectItem key={t} value={t}>
                  {TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Corretora</Label>
          <Select
            value={currentBroker}
            onValueChange={(v) => setValue("broker", v as FormValues["broker"])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {brokerEnum.map((b) => (
                <SelectItem key={b} value={b}>
                  {BROKER_LABELS[b]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Observações (opcional)</Label>
        <Input id="notes" {...register("notes")} placeholder="Anotações" />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Salvando..." : accountId ? "Salvar alterações" : "Criar conta"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={loading}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
