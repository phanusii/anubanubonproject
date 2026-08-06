"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  FileCheck, 
  Send, 
  LayoutGrid, 
  ShieldCheck, 
  Menu, 
  X,
  Sparkles
} from "lucide-react";
import { getTrainingSettings } from "@/lib/submission-service";
import { TrainingSettings } from "@/lib/types";

export default function Navbar() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [settings, setSettings] = useState<TrainingSettings | null>(null);

  useEffect(() => {
    async function loadSettings() {
      const s = await getTrainingSettings();
      setSettings(s);
    }
    loadSettings();
  }, []);

  const navItems = [
    { label: "หน้าแรก", href: "/", icon: FileCheck },
    { label: "ส่งผลงาน", href: "/submit", icon: Send },
    { label: "ดูผลงานทั้งหมด", href: "/gallery", icon: LayoutGrid },
    { label: "ผู้ดูแลระบบ", href: "/admin/login", icon: ShieldCheck },
  ];

  return (
    <nav className="sticky top-0 z-50 glass-panel border-b border-white/80 shadow-xs bg-white/85">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          {/* Logo & Brand with Circular Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            {settings?.schoolLogoUrl ? (
              <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white shadow-md shadow-blue-500/10 bg-white shrink-0 group-hover:scale-105 transition-transform duration-300 flex items-center justify-center p-0.5">
                <img
                  src={settings.schoolLogoUrl}
                  alt="School Logo"
                  className="w-full h-full object-cover rounded-full"
                />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-full ios-gradient-blue flex items-center justify-center text-white shadow-md shadow-blue-500/25 shrink-0 group-hover:scale-105 transition-transform duration-300">
                <Sparkles className="w-6 h-6 animate-pulse" />
              </div>
            )}
            <div className="truncate max-w-xs sm:max-w-md">
              <span className="font-extrabold text-base sm:text-xl text-slate-900 tracking-tight block truncate">
                {settings?.schoolName || "โรงเรียนอนุบาลอุบลราชธานี"}
              </span>
              <span className="block text-[11px] font-semibold text-blue-600 truncate">
                {settings?.educationalArea || "สำนักงานเขตพื้นที่การศึกษาประถมศึกษาอุบลราชธานี เขต 1"}
              </span>
            </div>
          </Link>

          {/* Desktop Nav Items */}
          <div className="hidden md:flex items-center gap-1.5 bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200/50">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
                    isActive
                      ? "ios-gradient-blue text-white shadow-md shadow-blue-500/25"
                      : "text-slate-600 hover:text-slate-900 hover:bg-white/80"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Mobile menu trigger */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2.5 rounded-2xl text-slate-700 bg-white/80 shadow-xs border border-slate-100"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden glass-panel border-t border-slate-200/50 px-4 pt-2 pb-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-colors ${
                  isActive
                    ? "ios-gradient-blue text-white shadow-md"
                    : "text-slate-700 hover:bg-white/60"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
}
