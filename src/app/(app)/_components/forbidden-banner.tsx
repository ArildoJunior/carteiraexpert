"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/**
 * Cap. 9B.2 — banner dismissible que aparece quando uma Server Component
 * redireciona para "/?forbidden=<permission>". Lê o param e mostra o aviso.
 * Renderizado uma vez no layout (app) para valer em qualquer rota.
 */
export function ForbiddenBanner() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const permission = params.get("forbidden");

  const dismiss = useCallback(() => {
    const next = new URLSearchParams(params);
    next.delete("forbidden");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [params, pathname, router]);

  if (!permission) return null;

  return (
    <div
      role="alert"
      style={{
        background: "#fee2e2",
        borderBottom: "1px solid #dc2626",
        color: "#7f1d1d",
        padding: "12px 16px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: "14px",
        fontFamily: "inherit",
      }}
    >
      <span>
        Você não tem permissão para <code>{permission}</code>. Fale com um administrador.
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Fechar aviso"
        style={{
          background: "transparent",
          border: "none",
          color: "#7f1d1d",
          fontSize: "20px",
          cursor: "pointer",
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}
