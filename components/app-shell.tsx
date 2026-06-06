import Link from "next/link";
import { ClipboardList, LayoutDashboard, LogOut, ShieldCheck } from "lucide-react";
import { signOut } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { hasAdminAccess } from "@/lib/auth";
import type { Role } from "@/lib/types";

export function AppShell({
  children,
  role,
  name
}: {
  children: React.ReactNode;
  role: Role;
  name?: string | null;
}) {
  const roleLabel = role === "admin" ? "Admin" : role === "sub_admin" ? "Sub Admin" : "Worker";

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <ClipboardList className="h-5 w-5 text-primary" />
            Moa Worker
          </Link>
          <nav className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard">
                <LayoutDashboard className="h-4 w-4" />
                업무
              </Link>
            </Button>
            {hasAdminAccess(role) ? (
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin">
                  <ShieldCheck className="h-4 w-4" />
                  관리자
                </Link>
              </Button>
            ) : null}
            <form action={signOut}>
              <Button variant="ghost" size="icon" aria-label="로그아웃">
                <LogOut className="h-4 w-4" />
              </Button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{roleLabel}</p>
            <h1 className="text-2xl font-semibold">{name || "사용자"}님 업무</h1>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
