import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Role } from "@/lib/types";

export function hasAdminAccess(role: Role | null | undefined) {
  return role === "admin" || role === "sub_admin";
}

function redirectWithMessage(path: string, message: string): never {
  redirect(`${path}?message=${encodeURIComponent(message)}`);
}

export async function requireUser() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return { supabase, user };
}

export async function requireProfile() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single<Profile>();

  if (!profile) {
    await supabase.auth.signOut();
    redirectWithMessage("/login", "허용된 계정 정보가 없습니다. 관리자에게 문의하세요.");
  }

  return { supabase, user, profile: profile as Profile };
}

export async function requireAdmin() {
  const context = await requireProfile();

  if (!hasAdminAccess(context.profile.role)) {
    redirectWithMessage("/dashboard", "관리자 권한이 필요합니다.");
  }

  return context;
}

export async function requireOwnerAdmin() {
  const context = await requireProfile();

  if (context.profile.role !== "admin") {
    redirectWithMessage("/admin", "관리자만 처리할 수 있습니다.");
  }

  return context;
}
