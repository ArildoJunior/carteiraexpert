"use client";

import { cn } from "@/lib/utils";
import {
  BarChart3,
  Bell,
  Building2,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  Settings,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/carteira", label: "Carteira", icon: LayoutDashboard },
  { href: "/contas", label: "Contas", icon: Building2 },
  { href: "/posicoes", label: "Posicoes", icon: Wallet },
  { href: "/imports", label: "Importacoes", icon: FileSpreadsheet },
  { href: "/proventos", label: "Proventos", icon: TrendingUp },
  { href: "/movimentacoes", label: "Movimentacoes", icon: History },
  { href: "/risco", label: "Risco", icon: BarChart3 },
  { href: "/alertas", label: "Alertas", icon: Bell },
  { href: "/configuracoes", label: "Configuracoes", icon: Settings },
] as const;

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex h-full flex-col p-4">
      <Link href="/carteira" className="mb-6 px-2 text-lg font-bold tracking-tight">
        carteiraexpert
      </Link>
      <ul className="flex-1 space-y-1">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
