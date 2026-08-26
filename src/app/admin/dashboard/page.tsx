"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AdminSidebar from "@/components/AdminSidebar";
import { getDashboardStats, getStorageUsage, getGallerySnapshotRaw, rebuildGallerySnapshot } from "@/lib/submission-service";
import { getTeacherSnapshotRaw, rebuildTeacherSnapshot } from "@/lib/teachers-service";
import { DashboardStats } from "@/lib/types";
import { FileCheck, Users, FileText, Image as ImageIcon, TrendingUp, HardDrive, RefreshCw, Zap } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

// Firebase Storage free allotment (Spark / the free monthly bucket on Blaze).
const STORAGE_FREE_BYTES = 5 * 1024 * 1024 * 1024;
function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [storage, setStorage] = useState<{ bytes: number; files: number } | null>(null);
  const [storageBusy, setStorageBusy] = useState(false);
  const [storageCount, setStorageCount] = useState(0);
  const [storageError, setStorageError] = useState("");

  const [snapInfo, setSnapInfo] = useState<{ count: number; updatedAt: number } | null>(null);
  const [snapBusy, setSnapBusy] = useState(false);
  const [snapMsg, setSnapMsg] = useState("");
  const [teacherSnapInfo, setTeacherSnapInfo] = useState<{ count: number; updatedAt: number; chunks: number } | null>(null);
  const [teacherSnapBusy, setTeacherSnapBusy] = useState(false);
  const [teacherSnapMsg, setTeacherSnapMsg] = useState("");

  useEffect(() => {
    getGallerySnapshotRaw()
      .then((s) => setSnapInfo(s ? { count: s.items.length, updatedAt: s.updatedAt } : null))
      .catch(() => {});
    getTeacherSnapshotRaw()
      .then(async (s) => {
        // First migration visit: create the snapshot automatically so public
        // traffic stops reading the roster one document at a time immediately.
        const ready = s || await rebuildTeacherSnapshot();
        setTeacherSnapInfo({ count: ready.items.length, updatedAt: ready.updatedAt, chunks: ready.chunks });
      })
      .catch(() => {});
  }, []);

  const rebuildRosterSnapshot = async () => {
    if (teacherSnapBusy) return;
    setTeacherSnapBusy(true);
    setTeacherSnapMsg("");
    try {
      const result = await rebuildTeacherSnapshot();
      setTeacherSnapInfo({ count: result.items.length, updatedAt: result.updatedAt, chunks: result.chunks });
      setTeacherSnapMsg(`อัปเดตแคชรายชื่อแล้ว ${result.items.length.toLocaleString()} คน (${result.chunks} ส่วน)`);
    } catch {
      setTeacherSnapMsg("อัปเดตแคชรายชื่อไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setTeacherSnapBusy(false);
    }
  };

  const rebuildSnapshot = async () => {
    if (snapBusy) return;
    setSnapBusy(true);
    setSnapMsg("");
    try {
      const result = await rebuildGallerySnapshot();
      if (result) {
        setSnapMsg(`อัปเดตแคชคลังแล้ว ${result.count.toLocaleString()} ชิ้น (${result.chunks} ส่วน)`);
        const fresh = await getGallerySnapshotRaw();
        setSnapInfo(fresh ? { count: fresh.items.length, updatedAt: fresh.updatedAt } : null);
      } else {
        setSnapMsg("ยังไม่มีผลงานให้สร้างแคช");
      }
    } catch {
      setSnapMsg("อัปเดตแคชไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setSnapBusy(false);
    }
  };

  const computeStorage = async () => {
    if (storageBusy) return;
    setStorageBusy(true);
    setStorageError("");
    setStorageCount(0);
    try {
      const usage = await getStorageUsage((n) => setStorageCount(n));
      setStorage(usage);
    } catch {
      setStorageError("คำนวณความจุไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setStorageBusy(false);
    }
  };

  useEffect(() => {
    async function loadStats() {
      setLoading(true);
      const data = await getDashboardStats();
      setStats(data);
      setLoading(false);
    }
    loadStats();
  }, []);

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

          {/* Gallery snapshot — cuts Firestore reads on the public gallery */}
          <div className="glass-panel p-6 rounded-3xl border border-white bg-white shadow-xs space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5">
                <span className="w-10 h-10 rounded-2xl ios-gradient-emerald text-white flex items-center justify-center shrink-0">
                  <Zap className="w-5 h-5" />
                </span>
                <div>
                  <h2 className="font-extrabold text-base text-slate-900">แคชคลังผลงาน (ลดการอ่านฐานข้อมูล)</h2>
                  <p className="text-[11px] text-slate-500 font-medium">
                    {snapInfo
                      ? `มีแคชแล้ว ${snapInfo.count.toLocaleString()} ชิ้น · อัปเดตล่าสุด ${new Date(snapInfo.updatedAt).toLocaleString("th-TH")}`
                      : "ยังไม่มีแคช — กดสร้างเพื่อให้หน้าคลังอ่านฐานข้อมูลน้อยลงมาก"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={rebuildSnapshot}
                disabled={snapBusy}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl ios-gradient-blue text-white text-xs font-extrabold shadow-sm disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${snapBusy ? "animate-spin" : ""}`} />
                {snapBusy ? "กำลังอัปเดต…" : snapInfo ? "อัปเดตแคช" : "สร้างแคช"}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
              หน้าคลังจะอ่านจากแคชนี้ (ไม่กี่ครั้ง) แทนการอ่านทุกผลงาน · เมื่อส่งใหม่ ส่งแทนที่ แก้ไข หรือลบผลงาน ระบบจะอัปเดตแคชให้อัตโนมัติ
            </p>
            {snapMsg && <p className="text-xs font-bold text-emerald-700">{snapMsg}</p>}
          </div>

          {/* Teacher snapshot — replaces one read per teacher on every public visit */}
          <div className="glass-panel p-6 rounded-3xl border border-white bg-white shadow-xs space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5">
                <span className="w-10 h-10 rounded-2xl ios-gradient-blue text-white flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5" />
                </span>
                <div>
                  <h2 className="font-extrabold text-base text-slate-900">แคชรายชื่อครู (ลด Reads สูงสุด)</h2>
                  <p className="text-[11px] text-slate-500 font-medium">
                    {teacherSnapInfo
                      ? `${teacherSnapInfo.count.toLocaleString()} คน · ${teacherSnapInfo.chunks} read ต่อการโหลด · อัปเดต ${new Date(teacherSnapInfo.updatedAt).toLocaleString("th-TH")}`
                      : "ยังไม่มีแคช — หน้าสาธารณะจะอ่านรายชื่อครูทีละเอกสารจนกว่าจะสร้างแคช"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={rebuildRosterSnapshot}
                disabled={teacherSnapBusy}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl ios-gradient-blue text-white text-xs font-extrabold shadow-sm disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${teacherSnapBusy ? "animate-spin" : ""}`} />
                {teacherSnapBusy ? "กำลังอัปเดต…" : teacherSnapInfo ? "อัปเดตแคช" : "สร้างแคชทันที"}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
              ระบบจะอัปเดตอัตโนมัติเมื่อผู้ดูแลเพิ่ม แก้ไข ลบ หรือนำเข้ารายชื่อใหม่
            </p>
            {teacherSnapMsg && <p className={`text-xs font-bold ${teacherSnapMsg.includes("ไม่สำเร็จ") ? "text-red-600" : "text-emerald-700"}`}>{teacherSnapMsg}</p>}
          </div>

          {/* Storage capacity vs free quota */}
          <div className="glass-panel p-6 rounded-3xl border border-white bg-white shadow-xs space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5">
                <span className="w-10 h-10 rounded-2xl ios-gradient-purple text-white flex items-center justify-center shrink-0">
                  <HardDrive className="w-5 h-5" />
                </span>
                <div>
                  <h2 className="font-extrabold text-base text-slate-900">ความจุพื้นที่จัดเก็บไฟล์ (Storage)</h2>
                  <p className="text-[11px] text-slate-500 font-medium">
                    ไฟล์ผลงานที่อัปโหลด (PDF / รูปภาพ) จากโควตาฟรี {formatBytes(STORAGE_FREE_BYTES)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={computeStorage}
                disabled={storageBusy}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl ios-gradient-blue text-white text-xs font-extrabold shadow-sm disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${storageBusy ? "animate-spin" : ""}`} />
                {storageBusy ? `กำลังคำนวณ… (${storageCount} ไฟล์)` : storage ? "คำนวณใหม่" : "คำนวณความจุ"}
              </button>
            </div>
            {storageError && <p className="text-xs font-bold text-red-600">{storageError}</p>}
            {storage && (
              <div className="space-y-2">
                <div className="flex items-end justify-between gap-2 flex-wrap">
                  <span className="text-2xl font-extrabold bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
                    {formatBytes(storage.bytes)}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    {storage.files.toLocaleString()} ไฟล์ · {((storage.bytes / STORAGE_FREE_BYTES) * 100).toFixed(1)}% ของ{" "}
                    {formatBytes(STORAGE_FREE_BYTES)}
                  </span>
                </div>
                <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all"
                    style={{ width: `${Math.min(100, (storage.bytes / STORAGE_FREE_BYTES) * 100)}%` }}
                  />
                </div>
              </div>
            )}
            {!storage && !storageBusy && (
              <p className="text-xs text-slate-400 font-medium">
                กด &quot;คำนวณความจุ&quot; เพื่อรวมขนาดไฟล์ทั้งหมดใน Storage (อาจใช้เวลาสักครู่หากมีไฟล์จำนวนมาก)
              </p>
            )}
          </div>

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
