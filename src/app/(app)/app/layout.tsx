import { AppSidebar } from "@/components/layout/app-sidebar";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export const metadata = { title: "Carteira" };

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=/app");
  }

  const name = session.user.name ?? "";
  const email = session.user.email ?? "";

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="w-64 shrink-0 border-r border-border hidden md:flex md:flex-col">
        <AppSidebar />
      </aside>
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="h-14 shrink-0 border-b border-border flex items-center justify-end gap-2 px-4">
          <ThemeToggle />
          <UserMenu name={name} email={email} />
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
