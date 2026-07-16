import { Badge } from "@/components/ui/badge";
import { FRESHNESS_LABELS, FRESHNESS_VARIANT, classifyDelay } from "@/lib/quotes/delay";
import type { Quote } from "@/lib/quotes/types";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function QuoteCell({ quote }: { quote: Quote | null }) {
  if (!quote) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground font-mono">—</span>
        <Badge variant="destructive" className="w-fit text-xs">
          Sem cotacao
        </Badge>
      </div>
    );
  }

  const freshness = classifyDelay(quote);
  const variant = FRESHNESS_VARIANT[freshness];
  const label = FRESHNESS_LABELS[freshness];
  const positive = quote.changePercent >= 0;

  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono">{fmtBRL.format(quote.price)}</span>
      <span className={positive ? "text-xs text-emerald-600" : "text-xs text-red-600"}>
        {positive ? "+" : ""}
        {quote.changePercent.toFixed(2)}%
      </span>
      <Badge variant={variant} className="w-fit text-xs">
        {label}
      </Badge>
    </div>
  );
}
