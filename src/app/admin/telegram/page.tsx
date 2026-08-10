"use client";

import { FormEvent, useEffect, useState } from "react";
import { Send, ShieldCheck, Timer, CheckCircle2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AdminSidebar from "@/components/AdminSidebar";
import { getTrainingSettings, updateTrainingSettings } from "@/lib/submission-service";

export default function TelegramSettingsPage() {
  const [enabled, setEnabled] = useState(false);
  const [chatId, setChatId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    getTrainingSettings(true).then((settings) => {
      setEnabled(Boolean(settings.telegramNotificationsEnabled));
      setChatId(settings.telegramChatId || "");
      setLoading(false);
    });
  }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const ok = await updateTrainingSettings({
      telegramNotificationsEnabled: enabled,
      telegramChatId: chatId.trim(),
    });
    setMessage(ok ? "บันทึกการตั้งค่า Telegram แล้ว" : "บันทึกไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่แล้วลองอีกครั้ง");
    setSaving(false);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 flex flex-col md:flex-row gap-6">
        <AdminSidebar />
        <main className="flex-1 space-y-6">
          <div className="glass-panel rounded-3xl border border-white bg-white p-6 md:p-8 shadow-sm">
            <div className="flex items-center gap-4 mb-7">
              <div className="w-12 h-12 rounded-2xl bg-sky-500 text-white flex items-center justify-center shadow-lg shadow-sky-500/20">
                <Send className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-extrabold text-slate-900">แจ้งเตือนผ่าน Telegram</h1>
                <p className="text-sm text-slate-500 font-medium">ส่งข้อความเมื่อมีครูส่งงานหรือผลงานใหม่</p>
              </div>
            </div>

            {loading ? (
              <div className="h-40 rounded-2xl bg-slate-100 animate-pulse" />
            ) : (
              <form onSubmit={save} className="space-y-6 max-w-2xl">
                <label className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-slate-200 bg-slate-50">
                  <span>
                    <span className="block font-extrabold text-slate-800">เปิดการแจ้งเตือน</span>
                    <span className="block text-xs text-slate-500 mt-1">ระบบตรวจรายการใหม่ประมาณทุก 1 นาที</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(event) => setEnabled(event.target.checked)}
                    className="w-5 h-5 accent-sky-500"
                  />
                </label>

                <label className="block">
                  <span className="block text-sm font-extrabold text-slate-700 mb-2">Telegram Chat ID</span>
                  <input
                    value={chatId}
                    onChange={(event) => setChatId(event.target.value)}
                    inputMode="numeric"
                    required={enabled}
                    placeholder="กรอก Chat ID ที่ต้องการรับแจ้งเตือน"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-sky-400"
                  />
                </label>

                <div className="grid sm:grid-cols-2 gap-3 text-xs font-semibold text-slate-600">
                  <div className="flex gap-2 p-3 rounded-2xl bg-emerald-50 border border-emerald-100">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Bot Token เก็บฝั่ง Google Apps Script และไม่แสดงบนเว็บไซต์</span>
                  </div>
                  <div className="flex gap-2 p-3 rounded-2xl bg-blue-50 border border-blue-100">
                    <Timer className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>ทำงานด้วยบริการฟรี จึงอาจหน่วงจากเวลาส่งจริงไม่เกินประมาณ 1 นาที</span>
                  </div>
                </div>

                {message && (
                  <p className="flex items-center gap-2 text-sm font-bold text-emerald-700">
                    <CheckCircle2 className="w-4 h-4" /> {message}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-3 rounded-2xl bg-sky-500 hover:bg-sky-600 disabled:opacity-60 text-white text-sm font-extrabold shadow-lg shadow-sky-500/20 transition-colors"
                >
                  {saving ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
                </button>
              </form>
            )}
          </div>
        </main>
      </div>
      <Footer />
    </div>
  );
}
