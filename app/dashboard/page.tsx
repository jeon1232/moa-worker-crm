import { CheckCircle2, KeyRound, MapPin, Plus, Save, Search, Trash2 } from "lucide-react";
import { createCustomer, requestCustomerDelete, updateCustomerByWorker, updateProfileName } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { FormSubmitButton } from "@/components/form-submit-button";
import { MaskedInput } from "@/components/masked-input";
import { SecretInput } from "@/components/secret-input";
import { Button } from "@/components/ui/button";
import { hasAdminAccess, requireProfile } from "@/lib/auth";
import type { BusinessProgressStatus, Customer, CustomerDeleteRequest } from "@/lib/types";

const businessProgressOptions: BusinessProgressStatus[] = [
  "진행중",
  "카카오비즈니스 채널 개설 완료"
];

export default async function DashboardPage({
  searchParams
}: {
  searchParams: { message?: string; q?: string };
}) {
  const { supabase, user, profile } = await requireProfile();
  const canManage = hasAdminAccess(profile?.role);
  const { data: customers } = await supabase
    .from("customers")
    .select("*")
    .eq(canManage ? "id" : "assigned_worker_id", canManage ? "00000000-0000-0000-0000-000000000000" : user.id)
    .order("created_at", { ascending: false })
    .returns<Customer[]>();

  const { data: adminCustomers } =
    canManage
      ? await supabase
          .from("customers")
          .select("*, profiles(name)")
          .order("created_at", { ascending: false })
          .limit(8)
          .returns<Customer[]>()
      : { data: null };

  const { data: deleteRequests, error: deleteRequestsError } = await supabase
    .from("customer_delete_requests")
    .select("*")
    .eq("status", "pending")
    .returns<CustomerDeleteRequest[]>();

  const customerSearch = String(searchParams.q ?? "").trim();
  const visibleCustomers = filterCustomers(canManage ? adminCustomers ?? [] : customers ?? [], customerSearch);
  const deleteRequestsByCustomerId = new Map(
    (deleteRequests ?? []).map((request) => [request.customer_id, request])
  );

  return (
    <AppShell role={profile?.role ?? "worker"} name={profile?.name}>
      <div className="grid gap-6 xl:grid-cols-[minmax(320px,390px)_minmax(0,1fr)]">
        <section className="rounded-lg border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold">고객 등록</h2>
          <form action={createCustomer} className="mt-4 space-y-4">
            <Field name="name" label="고객명" required />
            <Field name="address" label="고객 주소" />
            <div className="grid gap-3 sm:grid-cols-2">
              <MaskedInput name="phone" label="연락처" kind="phone" />
              <MaskedInput name="business_no" label="사업자번호" kind="business" />
            </div>

            <CredentialPair
              title="카카오비즈니스"
              idName="kakao_business_id"
              passwordName="kakao_business_password"
            />
            <CredentialPair title="모아솔루션" idName="moa_solution_id" passwordName="moa_solution_password" />

            <SelectField name="business_progress_status" label="카카오 채널 상태" />
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">선택 옵션</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <CheckInput name="option_tablet" label="태블릿" />
                <CheckInput name="option_qr" label="QR" />
              </div>
            </fieldset>
            <label className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
              <input name="needs_tablet" type="checkbox" value="true" className="h-4 w-4" />
              고객이 태블릿 기기발송을 원함
            </label>
            <FormSubmitButton type="submit" className="w-full">
              <Plus className="h-4 w-4" />
              제출
            </FormSubmitButton>
          </form>
        </section>

        <section className="space-y-4">
          {searchParams.message ? (
            <div className="rounded-md border bg-card p-3 text-sm">{searchParams.message}</div>
          ) : null}
          {deleteRequestsError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              삭제 요청 상태를 불러오지 못했습니다: {deleteRequestsError.message}
            </div>
          ) : null}

          <div className="rounded-lg border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold">내 정보</h2>
            <form action={updateProfileName} className="mt-3 flex gap-2">
              <input
                name="name"
                defaultValue={profile?.name ?? ""}
                className="h-10 flex-1 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                placeholder="표시 이름"
              />
              <Button variant="secondary" type="submit" size="icon" aria-label="저장">
                <Save className="h-4 w-4" />
              </Button>
            </form>
          </div>

          <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
              <div>
                <h2 className="text-lg font-semibold">{canManage ? "최근 고객" : "내 고객"}</h2>
                {customerSearch ? (
                  <p className="mt-1 text-sm text-muted-foreground">검색 결과 {visibleCustomers.length}건</p>
                ) : null}
              </div>
              <form method="get" className="flex w-full gap-2 sm:w-auto">
                <label className="relative min-w-0 flex-1 sm:w-72">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    name="q"
                    defaultValue={customerSearch}
                    placeholder="고객 검색"
                    className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
                <Button type="submit" variant="secondary">
                  검색
                </Button>
                {customerSearch ? (
                  <Button asChild type="button" variant="outline">
                    <a href="/dashboard">초기화</a>
                  </Button>
                ) : null}
              </form>
            </div>
            <div className="grid gap-3 p-4 sm:p-5">
              {visibleCustomers.map((customer) => (
                <CustomerListCard
                  key={customer.id}
                  canManage={canManage}
                  customer={customer}
                  deleteRequest={deleteRequestsByCustomerId.get(customer.id)}
                />
              ))}
              {!visibleCustomers.length ? (
                <div className="rounded-md border bg-background p-8 text-center text-sm text-muted-foreground">
                  {customerSearch ? "검색된 고객이 없습니다." : "등록된 고객이 없습니다."}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function CustomerListCard({
  canManage,
  customer,
  deleteRequest
}: {
  canManage: boolean;
  customer: Customer;
  deleteRequest?: CustomerDeleteRequest;
}) {
  const progress = getBusinessProgress(customer);

  return (
    <article className="rounded-md border bg-background p-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.45fr)]">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="break-words text-base font-semibold">{customer.name}</h3>
              <div className="mt-1 text-sm text-muted-foreground">{customer.phone ?? "-"}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <ProgressBadge progress={progress} />
              <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium">
                {customer.status ?? "진행중"}
              </span>
            </div>
          </div>

          <div className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
            <CustomerFact label="사업자번호" value={customer.business_no ?? "-"} />
            <CustomerFact label="선택 옵션" value={formatOptions(customer)} />
            <CustomerFact label="기기 발송" value={formatTabletShipping(customer)} />
            <CustomerFact label="제출일" value={formatDateTime(customer.created_at)} />
          </div>

          <div className="flex items-start gap-1 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="break-words">{customer.address ?? "주소 미입력"}</span>
          </div>

          {!canManage ? <WorkerProgressForm customer={customer} progress={progress} /> : null}
        </div>

        <div className="min-w-0 rounded-md border bg-card p-3">
          <div className="text-xs font-semibold text-muted-foreground">삭제 요청</div>
          <div className="mt-2">
            {!canManage ? <DeleteRequestForm customerId={customer.id} request={deleteRequest} /> : "-"}
          </div>
        </div>
      </div>
    </article>
  );
}

function CustomerFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-muted-foreground">{value}</div>
    </div>
  );
}

function filterCustomers(customers: Customer[], query: string) {
  const search = normalizeSearch(query);

  if (!search) {
    return customers;
  }

  return customers.filter((customer) => {
    const values = [
      customer.name,
      customer.phone,
      customer.business_no,
      customer.address,
      customer.status,
      getBusinessProgress(customer),
      formatOptions(customer),
      formatTabletShipping(customer),
      customer.kakao_business_id,
      customer.moa_solution_id
    ];

    return values.some((value) => normalizeSearch(value ?? "").includes(search));
  });
}

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase("ko-KR");
}

function WorkerProgressForm({
  customer,
  progress
}: {
  customer: Customer;
  progress: BusinessProgressStatus;
}) {
  return (
    <form action={updateCustomerByWorker} className="grid gap-3">
      <input type="hidden" name="customer_id" value={customer.id} />
      <div className="flex items-center gap-2 text-sm font-semibold">
        <KeyRound className="h-4 w-4 text-primary" />
        계정/카카오 채널 수정
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <EditField name="address" label="고객 주소" defaultValue={customer.address} />
        <SelectField name="business_progress_status" label="카카오 채널 상태" defaultValue={progress} />
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <CredentialPair
          title="카카오비즈니스"
          idName="kakao_business_id"
          passwordName="kakao_business_password"
          idDefaultValue={customer.kakao_business_id}
          passwordDefaultValue={customer.kakao_business_password}
          compact
        />
        <CredentialPair
          title="모아솔루션"
          idName="moa_solution_id"
          passwordName="moa_solution_password"
          idDefaultValue={customer.moa_solution_id}
          passwordDefaultValue={customer.moa_solution_password}
          compact
        />
      </div>
      <div>
        <FormSubmitButton type="submit" variant="secondary" size="sm">
          <Save className="h-4 w-4" />
          수정 저장
        </FormSubmitButton>
      </div>
    </form>
  );
}

function CredentialPair({
  title,
  idName,
  passwordName,
  idDefaultValue,
  passwordDefaultValue,
  compact
}: {
  title: string;
  idName: string;
  passwordName: string;
  idDefaultValue?: string | null;
  passwordDefaultValue?: string | null;
  compact?: boolean;
}) {
  return (
    <fieldset className={compact ? "rounded-md border bg-background p-3" : "rounded-md border bg-muted/20 p-3"}>
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <EditField name={idName} label="아이디" defaultValue={idDefaultValue ?? null} />
        <SecretInput
          name={passwordName}
          label="비밀번호"
          defaultValue={passwordDefaultValue ?? null}
          labelClassName="block text-xs font-medium text-muted-foreground"
        />
      </div>
    </fieldset>
  );
}

function DeleteRequestForm({
  customerId,
  request
}: {
  customerId: string;
  request?: CustomerDeleteRequest;
}) {
  if (request) {
    return (
      <div className="space-y-1">
        <span className="inline-flex rounded-md bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">
          삭제 요청됨
        </span>
        {request.reason ? <div className="max-w-[180px] text-xs text-muted-foreground">{request.reason}</div> : null}
      </div>
    );
  }

  return (
    <form action={requestCustomerDelete} className="grid min-w-[190px] gap-2">
      <input type="hidden" name="customer_id" value={customerId} />
      <input
        name="reason"
        maxLength={500}
        placeholder="삭제 사유"
        className="h-9 rounded-md border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
      />
      <Button type="submit" variant="outline" size="sm">
        <Trash2 className="h-4 w-4" />
        삭제 요청
      </Button>
    </form>
  );
}

function CheckInput({ name, label }: { name: string; label: string }) {
  return (
    <label className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
      <input name={name} type="checkbox" value="true" className="h-4 w-4" />
      {label}
    </label>
  );
}

function formatOptions(customer: Customer) {
  const options = [
    customer.option_tablet || customer.selected_option === "tablet" ? "태블릿" : null,
    customer.option_qr || customer.selected_option === "qr" ? "QR" : null
  ].filter(Boolean);

  return options.length ? options.join(" + ") : "-";
}

function formatTabletShipping(customer: Customer) {
  if (customer.tablet_shipped) {
    return "발송 완료";
  }

  if (customer.needs_tablet) {
    return "발송 요청";
  }

  return "미요청";
}

function getBusinessProgress(customer: Customer): BusinessProgressStatus {
  if (customer.business_progress_status === "카카오비즈니스 채널 개설 완료") {
    return customer.business_progress_status;
  }

  return "진행중";
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function Field({
  name,
  label,
  required,
  type = "text"
}: {
  name: string;
  label: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        name={name}
        required={required}
        type={type}
        className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}

function EditField({
  name,
  label,
  defaultValue,
  type = "text"
}: {
  name: string;
  label: string;
  defaultValue: string | null;
  type?: string;
}) {
  return (
    <label className="block text-xs font-medium text-muted-foreground">
      {label}
      <input
        name={name}
        defaultValue={defaultValue ?? ""}
        type={type}
        className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}

function SelectField({
  name,
  label,
  defaultValue = "진행중"
}: {
  name: string;
  label: string;
  defaultValue?: BusinessProgressStatus;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <select
        name={name}
        defaultValue={businessProgressOptions.includes(defaultValue) ? defaultValue : "진행중"}
        className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
      >
        {businessProgressOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function ProgressBadge({ progress }: { progress: BusinessProgressStatus }) {
  if (progress === "진행중") {
    return <span className="inline-flex rounded-md bg-muted px-2 py-1 text-xs font-medium">진행중</span>;
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
      <CheckCircle2 className="h-3.5 w-3.5" />
      {progress}
    </span>
  );
}
