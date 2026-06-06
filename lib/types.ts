export type Role = "admin" | "sub_admin" | "worker";

export type AccessRequestStatus = "pending" | "approved" | "rejected";
export type CustomerDeleteRequestStatus = "pending" | "approved" | "rejected";

export type SelectedOption = "tablet" | "qr";
export type BusinessProgressStatus = "진행중" | "카카오비즈니스 채널 개설 완료";

export type Profile = {
  id: string;
  name: string | null;
  kakao_display_name: string | null;
  role: Role;
  created_at: string | null;
};

export type AllowedUser = {
  email: string;
  name: string | null;
  role: Role;
  active: boolean;
  created_at: string | null;
};

export type AccessRequest = {
  id: string;
  email: string;
  name: string | null;
  requested_role: Role;
  status: AccessRequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type CustomerDeleteRequest = {
  id: string;
  customer_id: string;
  requested_by: string;
  reason: string | null;
  status: CustomerDeleteRequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type CustomerDocument = {
  id: string;
  document_type: "사업자등록증" | "신분증" | null;
  file_path?: string | null;
  uploaded_at?: string | null;
  signedUrl?: string | null;
};

export type Customer = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  business_no: string | null;
  kakao_business_id: string | null;
  kakao_business_password: string | null;
  moa_solution_id: string | null;
  moa_solution_password: string | null;
  selected_option: SelectedOption | null;
  option_tablet: boolean | null;
  option_qr: boolean | null;
  business_progress_status: BusinessProgressStatus | null;
  business_auth_done: boolean | null;
  needs_tablet: boolean | null;
  tablet_shipped: boolean | null;
  tablet_shipped_at: string | null;
  tablet_billed: boolean | null;
  qr_billed: boolean | null;
  service_fee_billed: boolean | null;
  assigned_worker_id: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  profiles?: { name: string | null } | null;
  customer_documents?: CustomerDocument[];
};
