"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FileCheck2,
  Settings,
  Layers,
  LogOut,
  Home,
  Sparkles,
  Bell,
  Building,
  CalendarRange,
  BarChart3
} from "lucide-react";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";

export default function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.warn("Signout error:", err);
    }
    router.push("/admin/login");
  };

  const navs = [
    { label: "Dashboard สรุปผล", href: "/admin/dashboard", icon: LayoutDashboard },
    { label: "จัดการรอบ/โครงการ", href: "/admin/projects", icon: CalendarRange },
    { label: "จัดการผลงาน", href: "/admin/submissions", icon: FileCheck2 },
    { label: "สถิติละเอียด", href: "/admin/stats", icon: BarChart3 },
    { label: "ข้อมูลโรงเรียน & โลโก้", href: "/admin/school", icon: Building },
    { label: "ตั้งค่า Telegram Bot", href: "/admin/telegram", icon: Bell },
    { label: "จัดการสายชั้น & กลุ่มสาระ", href: "/admin/masters", icon: Layers },
  ];

  return (
    <aside className="w-full md:w-64 glass-panel border border-white p-4 flex flex-col justify-between shrink-0 bg-white rounded-3xl shadow-sm">
      <div className="space-y-6">
        {/* Admin Header */}
        <div className="flex items-center gap-3 px-2 pb-2 border-b border-slate-100">
          <div className="w-10 h-10 rounded-2xl ios-gradient-blue text-white flex items-center justify-center font-bold shadow-md shadow-blue-500/20">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-extrabold text-sm text-slate-900">Admin Control</h2>
            <span className="text-[11px] font-semibold text-blue-600">ผู้ดูแลระบบ</span>
          </div>
        </div>

        {/* Nav Links */}
        <nav className="space-y-1.5">
          {navs.map((nav) => {
            const Icon = nav.icon;
            const isActive = pathname === nav.href;
            return (
              <Link
                key={nav.href}
                href={nav.href}
                className={`flex items-center gap-3 px-3.5 py-3 rounded-2xl text-xs font-bold transition-all ${
                  isActive
                    ? "ios-gradient-blue text-white shadow-md shadow-blue-500/20"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{nav.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer Controls */}
      <div className="pt-4 border-t border-slate-100 space-y-1.5">
        <Link
          href="/"
          className="flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <Home className="w-4 h-4 text-slate-500" />
          <span>กลับไปยังหน้าหลัก</span>
        </Link>

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold text-red-600 hover:bg-red-50 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>ออกจากระบบ</span>
        </button>
      </div>
    </aside>
  );
}
