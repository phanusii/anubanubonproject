import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ระบบส่งผลงานการอบรมผู้เข้าอบรม | Training Work Submission System",
  description: "ระบบส่งผลงานการอบรมรูปแบบ Google Form โดยไม่ต้อง Login พร้อมคลังผลงานสไตล์ Pinterest และระบบผู้ดูแลหลังบ้าน",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans">
        {children}
      </body>
    </html>
  );
}
