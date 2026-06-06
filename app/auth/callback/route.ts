import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type AllowedUser = {
  email: string;
  name: string | null;
  role: "admin" | "sub_admin" | "worker";
  active: boolean;
};

function redirectAndClear(url: URL) {
  const response = NextResponse.redirect(url);
  response.cookies.delete("post_login_next");
  return response;
}

function loginUrlWithMessage(origin: string, message: string) {
  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("message", message);
  return loginUrl;
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const oauthError = requestUrl.searchParams.get("error_description") ?? requestUrl.searchParams.get("error");
  const cookieNext = cookies().get("post_login_next")?.value;
  const next = requestUrl.searchParams.get("next") ?? cookieNext ?? "/dashboard";

  if (oauthError) {
    return redirectAndClear(loginUrlWithMessage(requestUrl.origin, oauthError));
  }

  if (!code) {
    return redirectAndClear(loginUrlWithMessage(requestUrl.origin, "인증 코드가 없습니다."));
  }

  const supabase = createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const loginUrl = new URL("/login", requestUrl.origin);
    loginUrl.searchParams.set("message", error.message);
    return redirectAndClear(loginUrl);
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const email = user?.email?.toLowerCase();
  const requestedRole = next.startsWith("/admin") ? "admin" : "worker";

  if (!user || !email) {
    await supabase.auth.signOut();
    return redirectAndClear(
      loginUrlWithMessage(requestUrl.origin, "이메일을 확인할 수 없는 계정입니다. 카카오 이메일 동의항목을 확인하세요.")
    );
  }

  const { data: allowedUser, error: allowError } = await supabase
    .from("login_allowlist")
    .select("email,name,role,active")
    .ilike("email", email)
    .maybeSingle<AllowedUser>();

  if (allowError) {
    await supabase.auth.signOut();
    const loginUrl = new URL("/login", requestUrl.origin);
    loginUrl.searchParams.set("message", allowError.message);
    return redirectAndClear(loginUrl);
  }

  if (!allowedUser?.active) {
    const { error: requestError } = await supabase.rpc("submit_access_request", {
      request_name: user.user_metadata?.name ?? user.user_metadata?.full_name ?? email,
      request_role: requestedRole
    });
    await supabase.auth.signOut();
    const message = requestError
      ? `권한 요청 등록 오류: ${requestError.message}`
      : `권한 요청을 보냈습니다. 승인 후 다시 로그인하세요: ${email}`;

    return redirectAndClear(loginUrlWithMessage(requestUrl.origin, message));
  }

  if (next.startsWith("/admin") && allowedUser.role !== "admin" && allowedUser.role !== "sub_admin") {
    await supabase.auth.signOut();
    return redirectAndClear(loginUrlWithMessage(requestUrl.origin, "관리자 권한이 없는 계정입니다."));
  }

  const userMetadata = user.user_metadata ?? {};
  const kakaoDisplayName =
    firstText(
      userMetadata.name,
      userMetadata.full_name,
      userMetadata.nickname,
      userMetadata.preferred_username,
      userMetadata.user_name
    ) ?? email;
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("kakao_display_name")
    .eq("id", user.id)
    .maybeSingle<{ kakao_display_name: string | null }>();

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: user.id,
    name: allowedUser.name ?? firstText(userMetadata.name, userMetadata.full_name, email),
    kakao_display_name: existingProfile?.kakao_display_name ?? kakaoDisplayName,
    role: allowedUser.role
  });

  if (profileError) {
    await supabase.auth.signOut();
    const loginUrl = new URL("/login", requestUrl.origin);
    loginUrl.searchParams.set("message", profileError.message);
    return redirectAndClear(loginUrl);
  }

  return redirectAndClear(new URL(next.startsWith("/") ? next : "/dashboard", requestUrl.origin));
}
