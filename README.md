# Moa Worker CRM

Supabase를 백엔드로 사용하는 협업 고객 관리 시스템입니다. Worker는 고객 정보를 등록하고 서류를 업로드하며, Admin은 태블릿 발송과 비용 청구 상태를 관리합니다.

## 실행

1. 의존성 설치

```bash
npm install
```

2. 환경 변수 설정

```bash
cp .env.example .env.local
```

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`을 설정합니다.

3. Supabase SQL Editor에서 `supabase/schema.sql` 실행

4. 개발 서버 실행

```bash
npm run dev
```

## 보안 메모

- `profiles` 테이블은 지시된 구조를 그대로 사용합니다.
- `customers` 테이블은 `name`, `business_no`, `needs_tablet`, `tablet_shipped`, `tablet_billed`, `service_fee_billed` 중심 구조를 사용합니다.
- 고객 서류 Storage 버킷은 비공개입니다.
- 서류 메타데이터는 `customer_documents` 테이블에 저장하며, 문서 타입은 `사업자등록증`, `신분증`만 허용합니다.
- RLS는 Worker 본인 배정 고객 조회/생성, Admin 전체 조회/수정으로 제한합니다.
- 로그인은 `login_allowlist`에 등록된 이메일만 허용합니다.
- `kakao_business_password`는 현재 평문 컬럼입니다. 운영 전에는 Supabase Vault, pgcrypto, 또는 애플리케이션 레벨 암호화를 적용해야 합니다.
- 첫 Admin 지정은 Supabase SQL Editor에서 직접 `profiles.role = 'admin'`으로 승격해야 합니다.
