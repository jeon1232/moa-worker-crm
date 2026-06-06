import {
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Power,
  Settings2,
  ShieldCheck,
  UserCheck,
  UserCog,
  XCircle
} from "lucide-react";
import {
  approveAccessRequest,
  rejectAccessRequest,
  setAllowedUserActive,
  setAllowedUserRole
} from "@/app/actions";
import { AdminWorkerMasterDetail } from "@/components/admin-worker-master-detail";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import type { AccessRequest, AllowedUser, Customer, CustomerDeleteRequest, Profile, Role } from "@/lib/types";

const roleLabels: Record<Role, string> = {
  admin: "관리자",
  sub_admin: "부관리자",
  worker: "협력자"
};

const ownerRoleOptions: Role[] = ["worker", "sub_admin", "admin"];

export default async function AdminPage({
  searchParams
}: {
  searchParams: { message?: string };
}) {
  const { supabase, profile, user } = await requireAdmin();
  const [
    { data: customers },
    { data: allowedUsers },
    { data: accessRequests },
    { data: customerDeleteRequests },
    { data: workers }
  ] = await Promise.all([
    supabase.from("customers").select("*, profiles(name)").order("created_at", { ascending: false }).returns<Customer[]>(),
    supabase.from("login_allowlist").select("*").order("created_at", { ascending: false }).returns<AllowedUser[]>(),
    supabase
      .from("access_requests")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .returns<AccessRequest[]>(),
    supabase
      .from("customer_delete_requests")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .returns<CustomerDeleteRequest[]>(),
    supabase.from("profiles").select("*").eq("role", "worker").order("created_at", { ascending: false }).returns<Profile[]>()
  ]);

  const customerList = customers ?? [];
  const allowlist = allowedUsers ?? [];
  const deleteRequests = customerDeleteRequests ?? [];
  const requests = (accessRequests ?? []).filter(
    (request) => profile.role === "admin" || request.requested_role === "worker"
  );
  const pending = customerList.filter((customer) => customer.status !== "완료").length;
  const tabletRequests = customerList.filter((customer) => customer.needs_tablet && !customer.tablet_shipped).length;
  const qrBillingOpen = customerList.filter((customer) => hasQr(customer) && !customer.qr_billed).length;
  const billingOpen = customerList.filter(
    (customer) =>
      (hasTablet(customer) && !customer.tablet_billed) ||
      (hasQr(customer) && !customer.qr_billed) ||
      !customer.service_fee_billed
  ).length;

  return (
    <AppShell role={profile.role} name={profile?.name}>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="진행중" value={pending} />
        <Metric label="태블릿 요청" value={tabletRequests} />
        <Metric label="QR 청구 대기" value={qrBillingOpen} />
        <Metric label="청구 미완료" value={billingOpen} />
        <Metric label="권한/삭제 요청" value={requests.length + deleteRequests.length} />
      </div>

      {searchParams.message ? (
        <div className="mb-4 rounded-md border bg-card p-3 text-sm">{searchParams.message}</div>
      ) : null}

      <details className="group mb-6 overflow-hidden rounded-lg border bg-card shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 sm:p-5">
          <div className="flex min-w-0 items-center gap-3">
            <Settings2 className="h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <h2 className="font-semibold">권한/계정 관리 메뉴</h2>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                권한 요청 {requests.length}건 · 계정 {allowlist.length}명
              </p>
            </div>
          </div>
          <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>

        <div className="border-t">
          <section>
            <div className="flex items-center justify-between border-b p-4 sm:p-5">
              <div>
                <h3 className="text-lg font-semibold">권한 요청 승인</h3>
                <p className="mt-1 text-sm text-muted-foreground">로그인 시도 계정의 접근 권한을 처리합니다.</p>
              </div>
              <UserCheck className="h-5 w-5 text-primary" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">계정</th>
                    <th className="px-4 py-3">요청</th>
                    <th className="px-4 py-3">요청일</th>
                    <th className="px-4 py-3">처리</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((request) => (
                    <tr key={request.id} className="border-t align-middle">
                      <td className="px-4 py-4">
                        <div className="font-medium">{request.name || "-"}</div>
                        <div className="mt-1 text-muted-foreground">{request.email}</div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="inline-flex rounded-md bg-secondary px-2 py-1 text-xs font-medium">
                          {roleLabels[request.requested_role]}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">{formatDate(request.created_at)}</td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <form action={approveAccessRequest} className="flex gap-2">
                            <input type="hidden" name="request_id" value={request.id} />
                            <select
                              name="role"
                              defaultValue={profile.role === "admin" ? request.requested_role : "worker"}
                              className="h-9 rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                            >
                              <RoleOptions profileRole={profile.role} />
                            </select>
                            <Button type="submit" size="sm">
                              <CheckCircle2 className="h-4 w-4" />
                              승인
                            </Button>
                          </form>
                          <form action={rejectAccessRequest}>
                            <input type="hidden" name="request_id" value={request.id} />
                            <Button type="submit" variant="outline" size="sm">
                              <XCircle className="h-4 w-4" />
                              반려
                            </Button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!requests.length ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-muted-foreground" colSpan={4}>
                        대기 중인 권한 요청이 없습니다.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="border-t">
            <div className="flex items-center justify-between border-b p-4 sm:p-5">
              <div>
                <h3 className="text-lg font-semibold">계정 권한 관리</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {profile.role === "admin" ? "관리자와 부관리자를 임명할 수 있습니다." : "부관리자는 협력자 승인만 처리합니다."}
                </p>
              </div>
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">계정</th>
                    <th className="px-4 py-3">권한</th>
                    <th className="px-4 py-3">상태</th>
                    <th className="px-4 py-3">등록일</th>
                    <th className="px-4 py-3">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {allowlist.map((allowedUser) => (
                    <tr key={allowedUser.email} className="border-t align-middle">
                      <td className="px-4 py-4">
                        <div className="font-medium">{allowedUser.name || "-"}</div>
                        <div className="mt-1 text-muted-foreground">{allowedUser.email}</div>
                      </td>
                      <td className="px-4 py-4">
                        {profile.role === "admin" ? (
                          <form action={setAllowedUserRole} className="flex gap-2">
                            <input type="hidden" name="email" value={allowedUser.email} />
                            <select
                              name="role"
                              defaultValue={allowedUser.role}
                              className="h-9 rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                            >
                              {ownerRoleOptions.map((role) => (
                                <option key={role} value={role}>
                                  {roleLabels[role]}
                                </option>
                              ))}
                            </select>
                            <Button type="submit" variant="secondary" size="sm">
                              <UserCog className="h-4 w-4" />
                              저장
                            </Button>
                          </form>
                        ) : (
                          <RoleBadge role={allowedUser.role} />
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {allowedUser.role === "worker" ? (
                          <span
                            className={
                              allowedUser.active
                                ? "inline-flex rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
                                : "inline-flex rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground"
                            }
                          >
                            {allowedUser.active ? "활성" : "비활성"}
                          </span>
                        ) : (
                          <span className="inline-flex rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                            권한 계정
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">{formatDate(allowedUser.created_at)}</td>
                      <td className="px-4 py-4">
                        {allowedUser.role === "worker" && (profile.role === "admin" || !allowedUser.active) ? (
                          <form action={setAllowedUserActive}>
                            <input type="hidden" name="email" value={allowedUser.email} />
                            <input type="hidden" name="active" value={allowedUser.active ? "false" : "true"} />
                            <Button
                              type="submit"
                              variant={allowedUser.active ? "outline" : "secondary"}
                              size="sm"
                              disabled={user.email?.toLowerCase() === allowedUser.email}
                            >
                              <Power className="h-4 w-4" />
                              {allowedUser.active ? "비활성화" : "활성화"}
                            </Button>
                          </form>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!allowlist.length ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-muted-foreground" colSpan={5}>
                        허용된 계정이 없습니다.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </details>

      <AdminWorkerMasterDetail
        customers={customerList}
        deleteRequests={deleteRequests}
        profileRole={profile.role}
        workers={workers ?? []}
      />
    </AppShell>
  );
}

function RoleOptions({ profileRole }: { profileRole: Role }) {
  const options = profileRole === "admin" ? ownerRoleOptions : (["worker"] as Role[]);

  return (
    <>
      {options.map((role) => (
        <option key={role} value={role}>
          {roleLabels[role]}
        </option>
      ))}
    </>
  );
}

function RoleBadge({ role }: { role: Role }) {
  return <span className="inline-flex rounded-md bg-secondary px-2 py-1 text-xs font-medium">{roleLabels[role]}</span>;
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleDateString("ko-KR");
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CreditCard className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold">{value}</div>
    </div>
  );
}

function hasTablet(customer: Customer) {
  return Boolean(customer.option_tablet || customer.selected_option === "tablet" || customer.needs_tablet);
}

function hasQr(customer: Customer) {
  return Boolean(customer.option_qr || customer.selected_option === "qr");
}
