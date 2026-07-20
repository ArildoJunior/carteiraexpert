interface QuoteFallbackProps {
  value: string;
  label?: string;
}

export function QuoteFallback({ value, label }: QuoteFallbackProps) {
  const text = label ?? "Cotacao indisponivel";
  return (
    <span className="group relative inline-block">
      <span
        className="cursor-help border-b border-dotted border-muted-foreground/40 text-muted-foreground"
        title={text}
      >
        {value}
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-1 text-xs text-background opacity-0 transition-opacity duration-150 group-hover:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}
