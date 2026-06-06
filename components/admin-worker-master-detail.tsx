"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  BadgeCheck,
  CalendarClock,
  ChevronDown,
  KeyRound,
  MapPin,
  Search,
  Trash2,
  UserCog,
  XCircle
} from "lucide-react";
import {
  deleteCustomerByAdmin,
  rejectCustomerDeleteRequest,
  updateCustomerByAdmin,
  updateWorkerDisplayName
} from "@/app/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { Button } from "@/components/ui/button";
import type { BusinessProgressStatus, Customer, CustomerDeleteRequest, Profile, Role } from "@/lib/types";

const statusOptions = ["진행중", "서류요청", "검토중", "태블릿발송", "청구완료", "완료"] as const;

type AdminWorkerMasterDetailProps = {
  customers: Customer[];
  deleteRequests: CustomerDeleteRequest[];
  profileRole: Role;
  workers: Profile[];
};

type WorkerSummary = {
  id: string;
  name: string;
  kakaoDisplayName: string | null;
  reportCount: number;
  recentCount: number;
  activeCount: number;
  tabletRequestCount: number;
  deleteRequestCount: number;
};

export function AdminWorkerMasterDetail({
  customers,
  deleteRequests,
  profileRole,
  workers
}: AdminWorkerMasterDetailProps) {
  const [search, setSearch] = useState("");
  const summaries = useMemo(() => buildWorkerSummaries(workers, customers, deleteRequests), [
    workers,
    customers,
    deleteRequests
  ]);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(summaries[0]?.id ?? null);
  const filteredSummaries = summaries.filter((worker) => worker.name.toLowerCase().includes(search.toLowerCase()));
  const selectedWorker = filteredSummaries.find((worker) => worker.id === selectedWorkerId) ?? filteredSummaries[0] ?? null;
  const visibleCustomers = selectedWorker
    ? customers.filter((customer) => customer.assigned_worker_id === selectedWorker.id)
    : [];
  const deleteRequestsByCustomerId = new Map(deleteRequests.map((request) => [request.customer_id, request]));

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="border-b p-4 sm:p-5">
        <h2 className="text-lg font-semibold">협력자별 업무 관리</h2>
      </div>
      <div className="grid min-h-[520px] lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]">
        <aside className="border-b bg-muted/20 p-4 lg:border-b-0 lg:border-r">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="협력자 검색"
              className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          <div className="mt-4 grid gap-2 md:grid-cols-2 lg:grid-cols-1">
            {filteredSummaries.map((worker) => (
              <button
                key={worker.id}
                type="button"
                onClick={() => setSelectedWorkerId(worker.id)}
                className={
                  selectedWorker?.id === worker.id
                    ? "w-full rounded-md border bg-background p-3 text-left shadow-sm"
                    : "w-full rounded-md border bg-card p-3 text-left hover:bg-background"
                }
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="truncate font-medium">{worker.name}</div>
                  {worker.deleteRequestCount ? (
                    <span className="shrink-0 rounded-md bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">
                      삭제 {worker.deleteRequestCount}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2 text-xs text-muted-foreground">
                  <span>최근 {worker.recentCount}</span>
                  <span>진행 {worker.activeCount}</span>
                  <span>발송 {worker.tabletRequestCount}</span>
                  <span>전체 {worker.reportCount}</span>
                </div>
              </button>
            ))}

            {!filteredSummaries.length ? (
              <div className="rounded-md border bg-background p-4 text-center text-sm text-muted-foreground">
                협력자가 없습니다.
              </div>
            ) : null}
          </div>
        </aside>

        <div className="min-w-0">
          <div className="grid gap-4 border-b p-4 sm:p-5 xl:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <div className="text-sm text-muted-foreground">선택 협력자</div>
              <h3 className="truncate text-xl font-semibold">{selectedWorker?.name ?? "-"}</h3>
              {selectedWorker ? <WorkerNameForm worker={selectedWorker} /> : null}
            </div>
            {selectedWorker ? (
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <Stat label="진행중" value={selectedWorker.activeCount} />
                <Stat label="최근" value={selectedWorker.recentCount} />
                <Stat label="태블릿 발송" value={selectedWorker.tabletRequestCount} />
                <Stat label="삭제요청" value={selectedWorker.deleteRequestCount} />
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 p-4 sm:p-5">
            {visibleCustomers.map((customer) => {
              const deleteRequest = deleteRequestsByCustomerId.get(customer.id);

              return (
                <CustomerCard
                  key={customer.id}
                  customer={customer}
                  deleteRequest={deleteRequest}
                  profileRole={profileRole}
                />
              );
            })}

            {!visibleCustomers.length ? (
              <div className="rounded-md border bg-background p-8 text-center text-sm text-muted-foreground">
                선택한 협력자의 업무가 없습니다.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function CustomerCard({
  customer,
  deleteRequest,
  profileRole
}: {
  customer: Customer;
  deleteRequest?: CustomerDeleteRequest;
  profileRole: Role;
}) {
  const progress = getBusinessProgress(customer);

  return (
    <details className="group min-w-0 overflow-hidden rounded-md border bg-background">
      <summary className="grid cursor-pointer list-none gap-3 p-4 outline-none transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[minmax(0,1fr)_auto] [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 break-words text-base font-semibold">{customer.name}</h3>
            {deleteRequest ? (
              <span className="shrink-0 rounded-md bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">
                삭제 요청
              </span>
            ) : null}
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
            <SummaryFact label="연락처" value={customer.phone ?? "-"} />
            <SummaryFact label="진행" value={customer.status ?? "진행중"} />
            <SummaryFact label="카카오 채널" value={progress} />
            <SummaryFact label="옵션/발송" value={`${formatOptions(customer).join(" + ")} · ${formatTabletShipping(customer)}`} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 text-sm font-medium text-muted-foreground sm:justify-end">
          <span>상세</span>
          <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
        </div>
      </summary>

      <div className="border-t p-4">
        <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0 space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <InfoGroup label="주소">
                <div className="flex items-start gap-1">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{customer.address ?? "주소 미입력"}</span>
                </div>
              </InfoGroup>
              <InfoGroup label="사업자/제출">
                <div>사업자번호 {customer.business_no ?? "-"}</div>
                <div className="mt-1 flex items-center gap-1">
                  <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                  제출일 {formatDateTime(customer.created_at)}
                </div>
              </InfoGroup>
              <InfoGroup label="상태">
                <div>선택 옵션: {formatOptions(customer).join(" + ")}</div>
                <div>기기 발송: {formatTabletShipping(customer)}</div>
                <div>카카오 채널: {progress}</div>
                {deleteRequest?.reason ? <div className="mt-1 break-words">삭제 사유: {deleteRequest.reason}</div> : null}
              </InfoGroup>
            </div>

            <div className="grid gap-3 xl:grid-cols-2">
              <div className="rounded-md border bg-card p-3">
                <div className="mb-2 flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                  <KeyRound className="h-3.5 w-3.5" />
                  관리자 열람 계정
                </div>
                <Credential label="Kakao Biz ID" value={customer.kakao_business_id} />
                <Credential label="Kakao Biz PW" value={customer.kakao_business_password} />
                <Credential label="모아솔루션 ID" value={customer.moa_solution_id} />
                <Credential label="모아솔루션 PW" value={customer.moa_solution_password} />
              </div>
              <div className="rounded-md border bg-card p-3">
                <div className="mb-2 text-xs font-semibold text-muted-foreground">청구 상태</div>
                <BillingLine label="태블릿" done={Boolean(customer.tablet_billed)} />
                <BillingLine label="QR" done={Boolean(customer.qr_billed)} />
                <BillingLine label="서비스" done={Boolean(customer.service_fee_billed)} />
              </div>
            </div>
          </div>

          <AdminCustomerForm customer={customer} deleteRequest={deleteRequest} profileRole={profileRole} />
        </div>
      </div>
    </details>
  );
}

function AdminCustomerForm({
  customer,
  deleteRequest,
  profileRole
}: {
  customer: Customer;
  deleteRequest?: CustomerDeleteRequest;
  profileRole: Role;
}) {
  return (
    <div className="min-w-0">
      <form action={updateCustomerByAdmin} className="grid gap-2">
        <input type="hidden" name="customer_id" value={customer.id} />
        <select
          name="status"
          defaultValue={customer.status ?? "진행중"}
          className="h-10 w-full rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          {statusOptions.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <Check name="tablet_shipped" label="태블릿 발송" defaultChecked={Boolean(customer.tablet_shipped)} />
          <Check name="tablet_billed" label="태블릿 청구" defaultChecked={Boolean(customer.tablet_billed)} />
          <Check name="qr_billed" label="QR 청구" defaultChecked={Boolean(customer.qr_billed)} />
          <Check name="service_fee_billed" label="서비스 청구" defaultChecked={Boolean(customer.service_fee_billed)} />
        </div>
        <Button type="submit" size="sm" className="w-full">
          <BadgeCheck className="h-4 w-4" />
          저장
        </Button>
      </form>

      {profileRole === "admin" ? (
        <div className="mt-2 grid gap-2">
          <form action={deleteCustomerByAdmin}>
            <input type="hidden" name="customer_id" value={customer.id} />
            <ConfirmSubmitButton
              type="submit"
              variant="destructive"
              size="sm"
              className="w-full"
              confirmMessage={`${customer.name} 제출 건을 삭제할까요?`}
            >
              <Trash2 className="h-4 w-4" />
              {deleteRequest ? "요청 승인 삭제" : "삭제"}
            </ConfirmSubmitButton>
          </form>
          {deleteRequest ? (
            <form action={rejectCustomerDeleteRequest}>
              <input type="hidden" name="request_id" value={deleteRequest.id} />
              <Button type="submit" variant="outline" size="sm" className="w-full">
                <XCircle className="h-4 w-4" />
                삭제 요청 반려
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function WorkerNameForm({ worker }: { worker: WorkerSummary }) {
  return (
    <form action={updateWorkerDisplayName} className="mt-3 grid gap-2">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <input type="hidden" name="worker_id" value={worker.id} />
        <input
          name="name"
          defaultValue={worker.name}
          className="h-9 min-w-0 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          placeholder="협력자 실제 이름"
        />
        <Button type="submit" variant="secondary" size="sm" className="w-full sm:w-auto">
          <UserCog className="h-4 w-4" />
          이름 저장
        </Button>
      </div>
      <div className="break-all text-xs text-muted-foreground">
        처음 가입 카카오: {worker.kakaoDisplayName ?? "기록 없음"}
      </div>
    </form>
  );
}

function buildWorkerSummaries(
  workers: Profile[],
  customers: Customer[],
  deleteRequests: CustomerDeleteRequest[]
): WorkerSummary[] {
  const pendingDeleteCustomerIds = new Set(deleteRequests.map((request) => request.customer_id));
  const knownWorkerIds = new Set(workers.map((worker) => worker.id));
  const fallbackWorkers = new Map<string, Profile>();
  const now = Date.now();
  const sevenDays = 1000 * 60 * 60 * 24 * 7;

  customers.forEach((customer) => {
    if (customer.assigned_worker_id && !knownWorkerIds.has(customer.assigned_worker_id)) {
      fallbackWorkers.set(customer.assigned_worker_id, {
        id: customer.assigned_worker_id,
        name: customer.profiles?.name ?? "이름 없음",
        kakao_display_name: null,
        role: "worker" as Role,
        created_at: null
      });
    }
  });

  const allWorkers = [...workers, ...fallbackWorkers.values()];

  return allWorkers
    .map((worker) => {
      const workerCustomers = customers.filter((customer) => customer.assigned_worker_id === worker.id);

      return {
        id: worker.id,
        name: worker.name ?? "이름 없음",
        kakaoDisplayName: worker.kakao_display_name,
        reportCount: workerCustomers.length,
        recentCount: workerCustomers.filter((customer) => {
          if (!customer.created_at) {
            return false;
          }

          return now - new Date(customer.created_at).getTime() <= sevenDays;
        }).length,
        activeCount: workerCustomers.filter((customer) => customer.status !== "완료").length,
        tabletRequestCount: workerCustomers.filter((customer) => customer.needs_tablet && !customer.tablet_shipped).length,
        deleteRequestCount: workerCustomers.filter((customer) => pendingDeleteCustomerIds.has(customer.id)).length
      };
    })
    .sort((a, b) => b.activeCount - a.activeCount || b.reportCount - a.reportCount || a.name.localeCompare(b.name));
}

function formatOptions(customer: Customer) {
  const options = [
    customer.option_tablet || customer.selected_option === "tablet" ? "태블릿" : null,
    customer.option_qr || customer.selected_option === "qr" ? "QR" : null
  ].filter((option): option is string => Boolean(option));

  return options.length ? options : ["-"];
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

function InfoGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 text-sm">
      <div className="mb-1 text-xs font-semibold text-muted-foreground">{label}</div>
      <div className="space-y-1 break-words text-muted-foreground">{children}</div>
    </div>
  );
}

function SummaryFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-muted/60 px-3 py-2">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm text-foreground">{value}</div>
    </div>
  );
}

function Credential({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="break-all font-mono text-foreground">{value || "-"}</span>
    </div>
  );
}

function BillingLine({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={done ? "font-medium text-primary" : "text-muted-foreground"}>{done ? "청구 완료" : "미청구"}</span>
    </div>
  );
}

function Check({
  name,
  label,
  defaultChecked
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex h-10 min-w-0 items-center gap-2 rounded-md border bg-background px-3 text-sm">
      <input name={name} type="checkbox" defaultChecked={defaultChecked} className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </label>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-background px-3 py-2 text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
