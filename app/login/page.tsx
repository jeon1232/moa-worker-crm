import Link from "next/link";
import { Mail, MessageCircle, ShieldCheck, UserRound } from "lucide-react";
import { signInWithEmail, signInWithKakao } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { hasSupabaseEnv } from "@/lib/env";

export default function LoginPage({
  searchParams
}: {
  searchParams: { message?: string; next?: string; mode?: string };
}) {
  const isConfigured = hasSupabaseEnv();
  const isAdminMode = searchParams.mode === "admin" || searchParams.next?.startsWith("/admin");
  const next = isAdminMode ? "/admin" : searchParams.next ?? "/dashboard";

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
        <div className="mb-6">
          <p className="text-sm font-medium text-primary">Moa Worker CRM</p>
          <h1 className="mt-2 text-2xl font-semibold">{isAdminMode ? "관리자 로그인" : "협력자 로그인"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            허용 전 계정은 로그인 시 권한 요청이 등록됩니다.
          </p>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2">
          <Button asChild variant={!isAdminMode ? "default" : "outline"}>
            <Link href="/login?next=/dashboard">
              <UserRound className="h-4 w-4" />
              협력자
            </Link>
          </Button>
          <Button asChild variant={isAdminMode ? "default" : "outline"}>
            <Link href="/login?mode=admin&next=/admin">
              <ShieldCheck className="h-4 w-4" />
              관리자
            </Link>
          </Button>
        </div>

        {!isConfigured || searchParams.message ? (
          <div className="mb-4 rounded-md border bg-muted p-3 text-sm">
            {searchParams.message ?? ".env.local에 Supabase URL과 anon key를 설정하세요."}
          </div>
        ) : null}

        <form action={signInWithKakao} className="mb-4">
          <input type="hidden" name="next" value={next} />
          <Button className="w-full" type="submit" disabled={!isConfigured}>
            <MessageCircle className="h-4 w-4" />
            카카오로 로그인
          </Button>
        </form>

        <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          이메일 링크
          <div className="h-px flex-1 bg-border" />
        </div>

        <form action={signInWithEmail} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          <label className="block text-sm font-medium" htmlFor="email">
            이메일
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            disabled={!isConfigured}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder="name@company.com"
          />
          <Button className="w-full" variant="secondary" type="submit" disabled={!isConfigured}>
            <Mail className="h-4 w-4" />
            로그인 링크 받기
          </Button>
        </form>
      </section>
    </main>
  );
}
