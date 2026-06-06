import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Moa Worker CRM",
  description: "협업 고객 서류 수집 및 운영 관리 시스템"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
