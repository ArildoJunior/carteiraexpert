"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Benchmark, Period } from "@/lib/api/dashboard";
import { BENCHMARKS, PERIODS } from "@/lib/dashboard/formatters";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

interface PeriodFilterProps {
  currentPeriod: Period;
  currentBenchmark: Benchmark;
}

export function PeriodFilter({ currentPeriod, currentBenchmark }: PeriodFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <label className="text-sm text-muted-foreground" htmlFor="period-select">
          Periodo
        </label>
        <Select value={currentPeriod} onValueChange={(v) => update("period", v)}>
          <SelectTrigger id="period-select" className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-sm text-muted-foreground" htmlFor="benchmark-select">
          Benchmark
        </label>
        <Select value={currentBenchmark} onValueChange={(v) => update("benchmark", v)}>
          <SelectTrigger id="benchmark-select" className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BENCHMARKS.map((b) => (
              <SelectItem key={b.value} value={b.value}>
                {b.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
