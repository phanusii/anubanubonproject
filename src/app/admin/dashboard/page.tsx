"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AdminSidebar from "@/components/AdminSidebar";
import { getDashboardStats } from "@/lib/submission-service";
import { DashboardStats } from "@/lib/types";
import { FileCheck, Users, FileText, Image as ImageIcon, TrendingUp, Sparkles } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export default function AdminDashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check admin authentication session
    if (typeof window !== "undefined") {
      const session = localStorage.getItem("admin_session");
      if (!session) {
        router.push("/admin/login");
        return;
      }
    }

    async function loadStats() {
      setLoading(true);
      const data = await getDashboardStats();
      setStats(data);
      setLoading(false);
    }
    loadStats();
  }, [router]);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <div className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 flex flex-col md:flex-row gap-6">
        <AdminSidebar />

        <main className="flex-1 space-y-6">
          <div className="glass-panel p-6 rounded-3xl border border-white bg-white shadow-xs space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-extrabold ios-gradient-blue text-white shadow-xs">
                Admin Overview
              </span>
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900">
              Dashboard สรุปภาพรวมระบบ
            </h1>
            <p className="text-xs font-semibold text-slate-500">
              สถิติการส่งผลงานและแนวโน้มการใช้งานของผู้เข้าอบรม โรงเรียนอนุบาลอุบลราชธานี
            </p>
          </div>

          {/* Stat Cards Row */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-28 rounded-3xl skeleton-loading" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Stat 1: Total Submissions */}
              <div className="glass-panel p-5 rounded-3xl border border-white bg-white flex items-center justify-between shadow-xs">
                <div>
                  <span className="text-xs text-slate-500 block font-semibold">
                    ผลงานทั้งหมด
                  </span>
                  <span className="text-2xl font-extrabold text-blue-600">
                    {stats?.totalSubmissions || 0}
                  </span>
                  <span className="text-[11px] text-slate-400 block mt-0.5 font-medium">รายการที่ส่งเข้ามา</span>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <FileCheck className="w-6 h-6" />
                </div>
              </div>

              {/* Stat 2: Unique Senders */}
              <div className="glass-panel p-5 rounded-3xl border border-white bg-white flex items-center justify-between shadow-xs">
                <div>
                  <span className="text-xs text-slate-500 block font-semibold">
                    ผู้ส่งผลงานทั้งหมด
                  </span>
                  <span className="text-2xl font-extrabold text-emerald-600">
                    {stats?.totalSenders || 0}
                  </span>
                  <span className="text-[11px] text-slate-400 block mt-0.5 font-medium">ท่าน</span>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Users className="w-6 h-6" />
                </div>
              </div>

              {/* Stat 3: PDF Files */}
              <div className="glass-panel p-5 rounded-3xl border border-white bg-white flex items-center justify-between shadow-xs">
                <div>
                  <span className="text-xs text-slate-500 block font-semibold">
                    จำนวนไฟล์ PDF
                  </span>
                  <span className="text-2xl font-extrabold text-rose-600">
                    {stats?.pdfCount || 0}
                  </span>
                  <span className="text-[11px] text-slate-400 block mt-0.5 font-medium">ไฟล์</span>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
                  <FileText className="w-6 h-6" />
                </div>
              </div>

              {/* Stat 4: Image / Drive Files */}
              <div className="glass-panel p-5 rounded-3xl border border-white bg-white flex items-center justify-between shadow-xs">
                <div>
                  <span className="text-xs text-slate-500 block font-semibold">
                    ไฟล์รูปภาพ / Drive
                  </span>
                  <span className="text-2xl font-extrabold text-amber-600">
                    {stats?.imageCount || 0}
                  </span>
                  <span className="text-[11px] text-slate-400 block mt-0.5 font-medium">ไฟล์</span>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <ImageIcon className="w-6 h-6" />
                </div>
              </div>
            </div>
          )}

          {/* Daily Trend Chart */}
          <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-white bg-white space-y-4 shadow-xs">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              <h2 className="font-extrabold text-base text-slate-900">
                กราฟจำนวนการส่งผลงานรายวัน
              </h2>
            </div>

            <div className="h-72 w-full pt-4">
              {stats?.dailyStats && stats.dailyStats.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.dailyStats}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} stroke="#e2e8f0" />
                    <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
                    <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#ffffff",
                        borderColor: "#e2e8f0",
                        borderRadius: "16px",
                        boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
                        color: "#0f172a",
                        fontSize: "12px",
                        fontWeight: "bold",
                      }}
                    />
                    <Bar dataKey="count" fill="#007AFF" radius={[8, 8, 0, 0]} name="จำนวนที่ส่ง" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 text-xs font-semibold">
                  ยังไม่มีข้อมูลสำหรับสร้างกราฟ
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      <Footer />
    </div>
  );
}
