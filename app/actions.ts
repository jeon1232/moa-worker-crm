"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin, requireOwnerAdmin, requireProfile, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AccessRequest, AllowedUser, BusinessProgressStatus, Role } from "@/lib/types";

const businessProgressOptions = ["진행중", "카카오비즈니스 채널 개설 완료"] as const;

const optionalText = z.string().trim().optional();

const customerSchema = z.object({
  name: z.string().trim().min(1, "고객명을 입력하세요."),
  address: optionalText,
  phone: optionalText,
  business_no: optionalText,
  kakao_business_id: optionalText,
  kakao_business_password: optionalText,
  moa_solution_id: optionalText,
  moa_solution_password: optionalText,
  option_tablet: z.coerce.boolean().optional(),
  option_qr: z.coerce.boolean().optional(),
  business_progress_status: z.enum(businessProgressOptions).default("진행중"),
  needs_tablet: z.coerce.boolean().optional()
});

const workerProgressSchema = z.object({
  customer_id: z.string().uuid(),
  address: optionalText,
  kakao_business_id: optionalText,
  kakao_business_password: optionalText,
  moa_solution_id: optionalText,
  moa_solution_password: optionalText,
  business_progress_status: z.enum(businessProgressOptions).default("진행중")
});

const adminUpdateSchema = z.object({
  customer_id: z.string().uuid(),
  status: z.string().trim().min(1),
  tablet_shipped: z.coerce.boolean().optional(),
  tablet_billed: z.coerce.boolean().optional(),
  qr_billed: z.coerce.boolean().optional(),
  service_fee_billed: z.coerce.boolean().optional()
});

const customerDeleteSchema = z.object({
  customer_id: z.string().uuid()
});

const customerDeleteRequestSchema = z.object({
  customer_id: z.string().uuid(),
  reason: z.string().trim().max(500, "삭제 요청 사유는 500자 이하로 입력하세요.").optional()
});

const customerDeleteRequestDecisionSchema = z.object({
  request_id: z.string().uuid()
});

const allowedUserSchema = z.object({
  email: z.string().trim().email("올바른 이메일을 입력하세요.").transform((email) => email.toLowerCase()),
  name: optionalText,
  role: z.enum(["admin", "sub_admin", "worker"]),
  active: z.coerce.boolean().optional()
});

const allowedUserStatusSchema = z.object({
  email: z.string().trim().email().transform((email) => email.toLowerCase()),
  active: z.enum(["true", "false"]).transform((value) => value === "true")
});

const accessRequestApprovalSchema = z.object({
  request_id: z.string().uuid(),
  role: z.enum(["admin", "sub_admin", "worker"])
});

const accessRequestDecisionSchema = z.object({
  request_id: z.string().uuid()
});

const roleChangeSchema = z.object({
  email: z.string().trim().email().transform((email) => email.toLowerCase()),
  role: z.enum(["admin", "sub_admin", "worker"])
});

const workerDisplayNameSchema = z.object({
  worker_id: z.string().uuid(),
  name: z.string().trim().min(1, "협력자 이름을 입력하세요.").max(80, "협력자 이름은 80자 이하로 입력하세요.")
});

function getOrigin() {
  return headers().get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";
}

function getNextPath(formData: FormData) {
  const next = String(formData.get("next") ?? "/dashboard");
  return next.startsWith("/") ? next : "/dashboard";
}

function rememberNextPath(next: string) {
  cookies().set("post_login_next", next, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10
  });
}

function redirectWithMessage(path: string, message: string): never {
  redirect(`${path}?message=${encodeURIComponent(message)}`);
}

function digitsOnly(value: string | null | undefined, maxLength: number) {
  return (value ?? "").replace(/\D/g, "").slice(0, maxLength);
}

function formatPhone(value: string | null | undefined) {
  const digits = digitsOnly(value, 11);

  if (digits.length <= 3) {
    return digits;
  }

  if (digits.length <= 7) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }

  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function formatBusinessNo(value: string | null | undefined) {
  const digits = digitsOnly(value, 10);

  if (digits.length <= 3) {
    return digits;
  }

  if (digits.length <= 5) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }

  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

function nullIfEmpty(value: string | null | undefined) {
  return value?.trim() ? value.trim() : null;
}

function isBusinessAuthDone(progress: BusinessProgressStatus) {
  return progress === "카카오비즈니스 채널 개설 완료";
}

export async function signInWithKakao(formData: FormData) {
  const supabase = createClient();
  const origin = getOrigin();
  const next = getNextPath(formData);
  rememberNextPath(next);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "kakao",
    options: {
      redirectTo: `${origin}/auth/callback`
    }
  });

  if (error) {
    redirect(`/login?message=${encodeURIComponent(error.message)}`);
  }

  if (data.url) {
    redirect(data.url);
  }
}

export async function signInWithEmail(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const supabase = createClient();
  const origin = getOrigin();
  const next = getNextPath(formData);
  rememberNextPath(next);

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback`
    }
  });

  if (error) {
    redirect(`/login?message=${encodeURIComponent(error.message)}`);
  }

  redirect(`/login?message=${encodeURIComponent("이메일로 로그인 링크를 보냈습니다.")}`);
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function createCustomer(formData: FormData) {
  const { supabase, user } = await requireUser();
  const values = customerSchema.parse(Object.fromEntries(formData));
  const phone = formatPhone(values.phone);
  const businessNo = formatBusinessNo(values.business_no);
  const optionTablet = Boolean(values.option_tablet);
  const optionQr = Boolean(values.option_qr);

  const { error } = await supabase.from("customers").insert({
    assigned_worker_id: user.id,
    name: values.name,
    address: nullIfEmpty(values.address),
    phone: phone || null,
    business_no: businessNo || null,
    kakao_business_id: nullIfEmpty(values.kakao_business_id),
    kakao_business_password: nullIfEmpty(values.kakao_business_password),
    moa_solution_id: nullIfEmpty(values.moa_solution_id),
    moa_solution_password: nullIfEmpty(values.moa_solution_password),
    selected_option: optionTablet && !optionQr ? "tablet" : optionQr && !optionTablet ? "qr" : null,
    option_tablet: optionTablet,
    option_qr: optionQr,
    business_progress_status: values.business_progress_status,
    business_auth_done: isBusinessAuthDone(values.business_progress_status),
    needs_tablet: Boolean(values.needs_tablet),
    status: "진행중"
  });

  if (error) {
    redirect(`/dashboard?message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/dashboard");
  redirectWithMessage("/dashboard", "고객을 등록했습니다.");
}

export async function updateCustomerByWorker(formData: FormData) {
  const { supabase } = await requireUser();
  const values = workerProgressSchema.parse({
    customer_id: formData.get("customer_id"),
    address: formData.get("address"),
    kakao_business_id: formData.get("kakao_business_id"),
    kakao_business_password: formData.get("kakao_business_password"),
    moa_solution_id: formData.get("moa_solution_id"),
    moa_solution_password: formData.get("moa_solution_password"),
    business_progress_status: formData.get("business_progress_status")
  });

  const { error } = await supabase.rpc("update_customer_worker_progress", {
    target_customer_id: values.customer_id,
    customer_address: nullIfEmpty(values.address),
    kakao_id: nullIfEmpty(values.kakao_business_id),
    kakao_password: nullIfEmpty(values.kakao_business_password),
    moa_id: nullIfEmpty(values.moa_solution_id),
    moa_password: nullIfEmpty(values.moa_solution_password),
    progress_status: values.business_progress_status
  });

  if (error) {
    redirect(`/dashboard?message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/dashboard");
  revalidatePath("/admin");
  redirectWithMessage("/dashboard", "고객 진행 정보를 저장했습니다.");
}

export async function updateCustomerByAdmin(formData: FormData) {
  const { supabase } = await requireAdmin();
  const values = adminUpdateSchema.parse({
    customer_id: formData.get("customer_id"),
    status: formData.get("status"),
    tablet_shipped: formData.has("tablet_shipped"),
    tablet_billed: formData.has("tablet_billed"),
    qr_billed: formData.has("qr_billed"),
    service_fee_billed: formData.has("service_fee_billed")
  });

  const { error } = await supabase
    .from("customers")
    .update({
      status: values.status,
      tablet_shipped: Boolean(values.tablet_shipped),
      tablet_shipped_at: values.tablet_shipped ? new Date().toISOString() : null,
      tablet_billed: Boolean(values.tablet_billed),
      qr_billed: Boolean(values.qr_billed),
      service_fee_billed: Boolean(values.service_fee_billed)
    })
    .eq("id", values.customer_id);

  if (error) {
    redirect(`/admin?message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  redirectWithMessage("/admin", "처리 상태를 저장했습니다.");
}

export async function requestCustomerDelete(formData: FormData) {
  const { supabase } = await requireUser();
  const values = customerDeleteRequestSchema.parse({
    customer_id: formData.get("customer_id"),
    reason: formData.get("reason")
  });

  const { error } = await supabase.rpc("request_customer_delete", {
    target_customer_id: values.customer_id,
    request_reason: values.reason || null
  });

  if (error) {
    redirect(`/dashboard?message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/dashboard");
  revalidatePath("/admin");
  redirectWithMessage("/dashboard", "삭제 요청을 보냈습니다.");
}

export async function deleteCustomerByAdmin(formData: FormData) {
  const { supabase } = await requireOwnerAdmin();
  const values = customerDeleteSchema.parse({
    customer_id: formData.get("customer_id")
  });

  const { data: filePaths, error } = await supabase.rpc("delete_customer_submission", {
    target_customer_id: values.customer_id
  });

  if (error) {
    redirect(`/admin?message=${encodeURIComponent(error.message)}`);
  }

  const paths = Array.isArray(filePaths) ? filePaths.filter((path): path is string => typeof path === "string") : [];

  if (paths.length) {
    const { error: storageError } = await supabase.storage.from("customer-documents").remove(paths);

    if (storageError) {
      redirectWithMessage("/admin", `제출 건은 삭제했지만 파일 삭제 오류가 있습니다: ${storageError.message}`);
    }
  }

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  redirectWithMessage("/admin", "제출 건을 삭제했습니다.");
}

export async function rejectCustomerDeleteRequest(formData: FormData) {
  const { supabase, user } = await requireOwnerAdmin();
  const values = customerDeleteRequestDecisionSchema.parse({
    request_id: formData.get("request_id")
  });

  const { error } = await supabase
    .from("customer_delete_requests")
    .update({
      status: "rejected",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString()
    })
    .eq("id", values.request_id)
    .eq("status", "pending");

  if (error) {
    redirect(`/admin?message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  redirectWithMessage("/admin", "삭제 요청을 반려했습니다.");
}

async function syncProfileFromAllowlist(supabase: ReturnType<typeof createClient>, email: string) {
  await supabase.rpc("sync_profile_from_allowlist", { target_email: email });
}

export async function upsertAllowedUser(formData: FormData) {
  const { supabase, user, profile } = await requireAdmin();
  const values = allowedUserSchema.parse({
    email: formData.get("email"),
    name: formData.get("name"),
    role: formData.get("role"),
    active: formData.has("active")
  });
  const isSelf = user.email?.toLowerCase() === values.email;
  const active = values.role === "worker" ? profile.role === "sub_admin" || Boolean(values.active) : true;

  if (profile.role === "sub_admin" && values.role !== "worker") {
    redirectWithMessage("/admin", "부관리자는 협력자 계정만 승인할 수 있습니다.");
  }

  if (isSelf && (values.role !== "admin" || !active)) {
    redirectWithMessage("/admin", "내 관리자 권한은 직접 낮추거나 비활성화할 수 없습니다.");
  }

  const { error } = await supabase.from("login_allowlist").upsert({
    email: values.email,
    name: values.name || null,
    role: values.role,
    active
  });

  if (error) {
    redirect(`/admin?message=${encodeURIComponent(error.message)}`);
  }

  await syncProfileFromAllowlist(supabase, values.email);
  revalidatePath("/admin");
  redirectWithMessage("/admin", "허용 계정을 저장했습니다.");
}

export async function setAllowedUserActive(formData: FormData) {
  const { supabase, user, profile } = await requireAdmin();
  const values = allowedUserStatusSchema.parse({
    email: formData.get("email"),
    active: formData.get("active")
  });

  const { data: allowedUser, error: readError } = await supabase
    .from("login_allowlist")
    .select("email,role")
    .eq("email", values.email)
    .single<Pick<AllowedUser, "email" | "role">>();

  if (readError || !allowedUser) {
    redirectWithMessage("/admin", "계정을 찾을 수 없습니다.");
  }

  if (allowedUser.role !== "worker") {
    redirectWithMessage("/admin", "관리자와 부관리자는 비활성화할 수 없습니다.");
  }

  if (profile.role === "sub_admin" && !values.active) {
    redirectWithMessage("/admin", "부관리자는 협력자 승인만 처리할 수 있습니다.");
  }

  if (user.email?.toLowerCase() === values.email && !values.active) {
    redirectWithMessage("/admin", "내 계정은 비활성화할 수 없습니다.");
  }

  const { error } = await supabase
    .from("login_allowlist")
    .update({ active: values.active })
    .eq("email", values.email);

  if (error) {
    redirect(`/admin?message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin");
  redirectWithMessage("/admin", values.active ? "계정을 활성화했습니다." : "계정을 비활성화했습니다.");
}

export async function approveAccessRequest(formData: FormData) {
  const { supabase, user, profile } = await requireAdmin();
  const values = accessRequestApprovalSchema.parse({
    request_id: formData.get("request_id"),
    role: formData.get("role")
  });

  if (profile.role === "sub_admin" && values.role !== "worker") {
    redirectWithMessage("/admin", "부관리자는 협력자 요청만 승인할 수 있습니다.");
  }

  const { data: request, error: requestError } = await supabase
    .from("access_requests")
    .select("*")
    .eq("id", values.request_id)
    .single<AccessRequest>();

  if (requestError || !request) {
    redirectWithMessage("/admin", "권한 요청을 찾을 수 없습니다.");
  }

  const { error: allowError } = await supabase.from("login_allowlist").upsert({
    email: request.email,
    name: request.name || request.email,
    role: values.role,
    active: true
  });

  if (allowError) {
    redirect(`/admin?message=${encodeURIComponent(allowError.message)}`);
  }

  const now = new Date().toISOString();
  const { error: reviewError } = await supabase
    .from("access_requests")
    .update({
      requested_role: values.role,
      status: "approved",
      reviewed_by: user.id,
      reviewed_at: now
    })
    .eq("id", request.id);

  if (reviewError) {
    redirect(`/admin?message=${encodeURIComponent(reviewError.message)}`);
  }

  await syncProfileFromAllowlist(supabase, request.email);
  revalidatePath("/admin");
  redirectWithMessage("/admin", "권한 요청을 승인했습니다.");
}

export async function rejectAccessRequest(formData: FormData) {
  const { supabase, user, profile } = await requireAdmin();
  const values = accessRequestDecisionSchema.parse({
    request_id: formData.get("request_id")
  });

  const { data: request, error: requestError } = await supabase
    .from("access_requests")
    .select("*")
    .eq("id", values.request_id)
    .single<AccessRequest>();

  if (requestError || !request) {
    redirectWithMessage("/admin", "권한 요청을 찾을 수 없습니다.");
  }

  if (profile.role === "sub_admin" && request.requested_role !== "worker") {
    redirectWithMessage("/admin", "부관리자는 협력자 요청만 반려할 수 있습니다.");
  }

  const { error } = await supabase
    .from("access_requests")
    .update({
      status: "rejected",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString()
    })
    .eq("id", request.id);

  if (error) {
    redirect(`/admin?message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin");
  redirectWithMessage("/admin", "권한 요청을 반려했습니다.");
}

export async function setAllowedUserRole(formData: FormData) {
  const { supabase, user } = await requireOwnerAdmin();
  const values = roleChangeSchema.parse({
    email: formData.get("email"),
    role: formData.get("role")
  });
  const isSelf = user.email?.toLowerCase() === values.email;

  if (isSelf && values.role !== "admin") {
    redirectWithMessage("/admin", "내 관리자 권한은 뺄 수 없습니다.");
  }

  const update: { role: Role; active?: boolean } = { role: values.role };
  if (values.role !== "worker") {
    update.active = true;
  }

  const { error } = await supabase.from("login_allowlist").update(update).eq("email", values.email);

  if (error) {
    redirect(`/admin?message=${encodeURIComponent(error.message)}`);
  }

  await syncProfileFromAllowlist(supabase, values.email);
  revalidatePath("/admin");
  redirectWithMessage("/admin", "계정 권한을 저장했습니다.");
}

export async function updateWorkerDisplayName(formData: FormData) {
  const { supabase } = await requireAdmin();
  const values = workerDisplayNameSchema.parse({
    worker_id: formData.get("worker_id"),
    name: formData.get("name")
  });

  const { error } = await supabase.rpc("update_worker_display_name", {
    target_worker_id: values.worker_id,
    display_name: values.name
  });

  if (error) {
    redirect(`/admin?message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  redirectWithMessage("/admin", "협력자 표시 이름을 저장했습니다.");
}

export async function updateProfileName(formData: FormData) {
  const { supabase, user } = await requireProfile();
  const name = String(formData.get("name") ?? "").trim();

  if (name) {
    await supabase.from("profiles").update({ name }).eq("id", user.id);
    revalidatePath("/dashboard");
    redirectWithMessage("/dashboard", "내 정보를 저장했습니다.");
  }
}
