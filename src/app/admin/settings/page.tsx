"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AdminSidebar from "@/components/AdminSidebar";
import { CalendarRange, ArrowRight } from "lucide-react";

/**
 * The old "กำหนดค่าการอบรม" page is superseded by "จัดการรอบ/โครงการ" (/admin/projects),
 * which owns per-round settings (name, category, dates, slot titles, active round).
 * Kept as a redirect so old links/bookmarks still work.
 */
export default function AdminSettingsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => router.push("/admin/projects"), 1200);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 flex flex-col md:flex-row gap-6">
        <AdminSidebar />
        <main className="flex-1">
          <div className="glass-panel p-8 rounded-3xl border border-blue-200 bg-white shadow-xs text-center space-y-4 max-w-xl mx-auto">
            <div className="w-14 h-14 mx-auto rounded-2xl ios-gradient-blue text-white flex items-center justify-center shadow-lg shadow-blue-500/25">
              <CalendarRange className="w-7 h-7" />
            </div>
            <h1 className="text-xl font-extrabold text-slate-900">
              ย้ายไปที่ "จัดการรอบ / โครงการ" แล้ว
            </h1>
            <p className="text-sm text-slate-600 font-medium">
              การตั้งค่าชื่อโครงการ หัวข้อชิ้นงาน วันเปิด-ปิดรับ และการเลือกรอบที่เปิดรับส่งผลงาน
              ตอนนี้จัดการรวมอยู่ที่หน้า "จัดการรอบ / โครงการ" ที่เดียว (กำลังพาไปอัตโนมัติ...)
            </p>
            <Link
              href="/admin/projects"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl ios-gradient-blue text-white font-extrabold text-sm shadow-md shadow-blue-500/25"
            >
              <span>ไปที่จัดการรอบ/โครงการ</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </main>
      </div>
      <Footer />
    </div>
  );
}
