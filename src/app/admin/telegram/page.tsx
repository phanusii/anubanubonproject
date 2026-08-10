"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AdminSidebar from "@/components/AdminSidebar";
import { getTrainingSettings, updateTrainingSettings } from "@/lib/submission-service";
import { sendTelegramNotification } from "@/lib/telegram-service";
import { TrainingSettings } from "@/lib/types";
import { Bell, Send, CheckCircle2, AlertCircle, ShieldCheck, RefreshCw, Save, Sparkles } from "lucide-react";

export default function AdminTelegramPage() {
  const [settings, setSettings] = useState<TrainingSettings>({
    maxUpload: 10,
    trainingName: "",
    trainingDescription: "",
    openDate: "",
    closeDate: "",
    bannerUrl: "",
    allowSubmissions: true,
    schoolLogoUrl: "",
    schoolName: "",
    educationalArea: "",
    categoryType: "การส่งผลงานนวัตกรรมการเรียนรู้",
    academicYear: "2569",
    telegramChatId: "",
    telegramNotificationsEnabled: true,
  });

  const [testingTelegram, setTestingTelegram] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    async function load() {
      const data = await getTrainingSettings();
      setSettings(data);
      if (data.telegramChatId && typeof window !== "undefined") {
        localStorage.setItem("telegram_chat_id", data.telegramChatId);
      }
    }
    load();
  }, []);

  const handleTestTelegram = async () => {
    if (!settings.telegramChatId) {
      setTelegramStatus("❌ กรุณาระบุ Telegram Chat ID หรือ Channel ID ก่อนทดสอบ");
      return;
    }

    setTestingTelegram(true);
    setTelegramStatus(null);

    if (typeof window !== "undefined") {
      localStorage.setItem("telegram_chat_id", settings.telegramChatId.trim());
    }

    const testMsg = `
<b>🔔 [ทดสอบการเชื่อมต่อ Telegram Bot]</b>
━━━━━━━━━━━━━━━━━━
<b>โรงเรียน:</b> ${settings.schoolName || "โรงเรียนอนุบาลอุบลราชธานี"}
<b>ระบบ:</b> ส่งผลงานและสื่อการจัดการเรียนรู้ดิจิทัล
<b>สถานะ:</b> บอททำงานปกติ 100% พร้อมรับการแจ้งเตือนกิจกรรมทั้งหมด
━━━━━━━━━━━━━━━━━━
<i>⏰ เวลาทดสอบ: ${new Date().toLocaleString("th-TH")}</i>
`.trim();

    const ok = await sendTelegramNotification(testMsg);
    setTestingTelegram(false);

    if (ok) {
      setTelegramStatus("✅ ส่งข้อความทดสอบไปยัง Telegram เรียบร้อยแล้ว! โปรดเช็กในแอป Telegram ของท่าน");
    } else {
      setTelegramStatus("❌ ไม่สามารถส่งข้อความได้ กรุณาตรวจสอบ Chat ID หรือดึงบอทเข้ากลุ่ม / กด Start บอท");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMessage("");

    if (settings.telegramChatId && typeof window !== "undefined") {
      localStorage.setItem("telegram_chat_id", settings.telegramChatId.trim());
    }

    try {
      await updateTrainingSettings(settings);
      setSuccessMessage("บันทึกการตั้งค่าการแจ้งเตือน Telegram เรียบร้อยแล้ว");
    } catch (err) {
      console.error("Save telegram settings error:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <div className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 flex flex-col md:flex-row gap-6">
        <AdminSidebar />

        <main className="flex-1 space-y-6">
          {/* Header Banner */}
          <div className="glass-panel p-6 rounded-3xl border border-white bg-white shadow-xs space-y-1">
            <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
              <Bell className="w-6 h-6 text-blue-600 animate-bounce" />
              <span>ตั้งค่าการแจ้งเตือนทาง Telegram (Telegram Bot)</span>
            </h1>
            <p className="text-xs font-semibold text-slate-500">
              จัดการการเชื่อมต่อ Telegram Bot HTTP API สำหรับแจ้งเตือนการส่งผลงาน การแก้ไข และการลบข้อมูล
            </p>
          </div>

          <form onSubmit={handleSave} className="glass-panel p-6 sm:p-8 rounded-3xl border border-white space-y-6 shadow-xs bg-white">
            {/* Telegram Bot Details */}
            <div className="p-6 rounded-3xl bg-blue-50/70 border border-blue-100 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-blue-100">
                <div className="flex items-center gap-2 text-blue-900 font-extrabold text-sm">
                  <ShieldCheck className="w-5 h-5 text-blue-600" />
                  <span>การเชื่อมต่อ Telegram Bot HTTP API</span>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.telegramNotificationsEnabled !== false}
                    onChange={(e) => setSettings({ ...settings, telegramNotificationsEnabled: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded-md focus:ring-blue-500"
                  />
                  <span className="text-xs font-extrabold text-blue-900">
                    เปิดใช้งานการแจ้งเตือน Telegram
                  </span>
                </label>
              </div>

              {/* API Token Box (masked — full token is never shown in the UI) */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-800">
                  HTTP API Token (บอทมาตรฐานระบบ)
                </label>
                <div className="p-3.5 rounded-2xl bg-white border border-blue-200 font-mono text-xs text-blue-700 font-bold truncate shadow-2xs">
                  Bot token จัดเก็บใน Firebase Secret Manager และไม่ถูกส่งมายังเบราว์เซอร์
                </div>
              </div>

              {/* Chat ID Input */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-800">
                  Telegram Chat ID / Group Chat ID <span className="text-red-500">*</span>
                </label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    required
                    placeholder="เช่น 123456789 หรือ -100123456789"
                    value={settings.telegramChatId || ""}
                    onChange={(e) => setSettings({ ...settings, telegramChatId: e.target.value })}
                    className="flex-1 px-4 py-3 rounded-2xl border border-slate-200 bg-white text-slate-900 font-bold text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleTestTelegram}
                    disabled={testingTelegram}
                    className="px-6 py-3 rounded-2xl ios-gradient-blue text-white font-extrabold text-xs shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 hover:scale-105 transition-all shrink-0"
                  >
                    <Send className="w-4 h-4" />
                    <span>{testingTelegram ? "กำลังทดสอบ..." : "ทดสอบส่ง Telegram"}</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 font-medium pt-1">
                  💡 วิธีหา Chat ID: นำบอทกดเข้ากลุ่ม Telegram ของคณะทำงาน แล้วพิมพ์คำสั่ง <code className="bg-slate-200 px-1.5 py-0.5 rounded text-blue-800 font-bold">/my_id</code> เพื่อนำ Chat ID มากรอกที่นี่
                </p>
              </div>

              {telegramStatus && (
                <div className={`p-4 rounded-2xl text-xs font-bold border ${
                  telegramStatus.startsWith("✅")
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-red-50 text-red-700 border-red-200"
                }`}>
                  {telegramStatus}
                </div>
              )}
            </div>

            {/* Notification Event Checklist */}
            <div className="space-y-3 pt-2">
              <span className="text-xs font-bold text-slate-800 block">
                กิจกรรมที่จะส่งการแจ้งเตือนไปยัง Telegram อัตโนมัติ:
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/60 flex items-center gap-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="text-xs font-bold text-slate-800">เมื่อครูส่งผลงานใหม่ หรือ อัปเดตส่งแทนที่ผลงาน</span>
                </div>
                <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/60 flex items-center gap-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="text-xs font-bold text-slate-800">เมื่อแอดมินลบผลงานและไฟล์ในคลาวด์ไดร์ฟ</span>
                </div>
                <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/60 flex items-center gap-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="text-xs font-bold text-slate-800">เมื่อแอดมินแก้ไขข้อมูลผลงานในระบบ</span>
                </div>
                <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/60 flex items-center gap-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="text-xs font-bold text-slate-800">เมื่อแอดมินเปลี่ยนการตั้งค่าโครงการ</span>
                </div>
              </div>
            </div>

            {successMessage && (
              <div className="p-4 rounded-2xl bg-emerald-50 text-emerald-700 text-sm border border-emerald-200 flex items-center gap-2 font-bold animate-in fade-in">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-8 py-3.5 rounded-2xl ios-gradient-blue text-white font-extrabold text-sm shadow-md shadow-blue-500/25 flex items-center gap-2 hover:scale-[1.02] transition-all disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? "กำลังบันทึก..." : "บันทึกตั้งค่า Telegram"}</span>
              </button>
            </div>
          </form>
        </main>
      </div>

      <Footer />
    </div>
  );
}
