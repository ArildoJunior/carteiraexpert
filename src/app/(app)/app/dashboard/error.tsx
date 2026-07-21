"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>Erro ao carregar o dashboard</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {error.message || "Tente novamente em alguns instantes."}
          </p>
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
          >
            Tentar novamente
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
