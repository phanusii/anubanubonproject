"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AdminSidebar from "@/components/AdminSidebar";
import { 
  getTrainingSettings, 
  updateTrainingSettings, 
  uploadFileToStorage, 
  compressAndResizeImage, 
  fileToDataURL 
} from "@/lib/submission-service";
import { sendTelegramNotification, DEFAULT_TELEGRAM_BOT_TOKEN } from "@/lib/telegram-service";
import { TrainingSettings } from "@/lib/types";
import { Settings, Save, CheckCircle2, Building, GraduationCap, ListOrdered, Upload, Image as ImageIcon, X, AlertCircle, Eye, RefreshCw, Sparkles, Send, Bell, ShieldCheck } from "lucide-react";

export default function AdminSettingsPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [settings, setSettings] = useState<TrainingSettings>({
    maxUpload: 3,
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
    workSlotTitles: [
      "ชิ้นที่ 1: แผนการจัดการเรียนรู้ Active Learning (ไฟล์ PDF)",
      "ชิ้นที่ 2: สื่อและนวัตกรรมการสอนดิจิทัล (รูปภาพ / PDF / Google Drive)",
      "ชิ้นที่ 3: ภาพบรรยากาศการจัดกิจกรรมการเรียนรู้ (ไฟล์รูปภาพ / PDF)"
    ],
    activeProjectFilterMode: 'all',
    activeProjectFilterName: "",
    telegramChatId: "",
    telegramNotificationsEnabled: true,
  });

  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoUploadProgress, setLogoUploadProgress] = useState(0);
  const [logoError, setLogoError] = useState("");

  const [testingTelegram, setTestingTelegram] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const session = localStorage.getItem("admin_session");
      if (!session) {
        router.push("/admin/login");
        return;
      }
    }

    async function load() {
      const data = await getTrainingSettings();
      setSettings(data);
      if (data.telegramChatId && typeof window !== "undefined") {
        localStorage.setItem("telegram_chat_id", data.telegramChatId);
      }
    }
    load();
  }, [router]);

  // Instant Instantaneous Logo Upload Handler (< 50ms instant preview guarantee!)
  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setLogoError("");
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setLogoError("รองรับเฉพาะไฟล์รูปภาพ (PNG, JPG, JPEG, WEBP, SVG) เท่านั้น");
      return;
    }

    try {
      setUploadingLogo(true);
      setLogoUploadProgress(30);

      // 1. Compress image to max 300x300 logo size (< 30KB)
      const compressedLogo = await compressAndResizeImage(file, 300, 300, 0.85);
      setLogoUploadProgress(60);

      // 2. Read instant DataURL
      const instantDataUrl = await fileToDataURL(compressedLogo);

      // Set logo URL immediately into UI state (Instant preview!)
      setSettings((prev) => ({
        ...prev,
        schoolLogoUrl: instantDataUrl,
      }));

      setLogoUploadProgress(100);
      setUploadingLogo(false);

      if (e.target) e.target.value = "";

      // Background try upload to Firebase Storage
      uploadFileToStorage(compressedLogo).then((remoteUrl) => {
        if (remoteUrl && remoteUrl.startsWith("http")) {
          setSettings((prev) => ({
            ...prev,
            schoolLogoUrl: remoteUrl,
          }));
        }
      }).catch(() => {});

    } catch (err: any) {
      setUploadingLogo(false);
      setLogoError(err.message || "เกิดข้อผิดพลาดในการอัปโหลดรูปโลโก้");
    }
  };

  const handleRemoveLogo = () => {
    setSettings((prev) => ({
      ...prev,
      schoolLogoUrl: "",
    }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

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

    const ok = await sendTelegramNotification(testMsg, settings.telegramChatId.trim());
    setTestingTelegram(false);

    if (ok) {
      setTelegramStatus("✅ ส่งข้อความทดสอบไปยัง Telegram เรียบร้อยแล้ว! โปรดเช็กในแอป Telegram ของท่าน");
    } else {
      setTelegramStatus("❌ ไม่สามารถส่งข้อความได้ กรุณาตรวจสอบ Chat ID หรือดึงบอทเข้ากลุ่ม / กด Start บอท");
    }
  };

  const handleMaxUploadChange = (newCount: number) => {
    const validCount = Math.max(1, Math.min(50, newCount));
    const currentTitles = [...(settings.workSlotTitles || [])];

    const updatedTitles = Array.from({ length: validCount }).map((_, idx) => {
      return currentTitles[idx] || `ชิ้นที่ ${idx + 1}: ผลงานการเรียนรู้/สื่อการสอน`;
    });

    setSettings({
      ...settings,
      maxUpload: validCount,
      workSlotTitles: updatedTitles,
    });
  };

  const handleSlotTitleChange = (idx: number, newTitle: string) => {
    const updatedTitles = [...(settings.workSlotTitles || [])];
    updatedTitles[idx] = newTitle;
    setSettings({
      ...settings,
      workSlotTitles: updatedTitles,
    });
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
      setSuccessMessage("บันทึกการตั้งค่าระบบ และการแจ้งเตือนทาง Telegram เรียบร้อยแล้ว");
    } catch (err) {
      console.error("Save settings error:", err);
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
          <div className="glass-panel p-6 rounded-3xl border border-white bg-white shadow-xs space-y-1">
            <h1 className="text-2xl font-extrabold text-slate-900">
              กำหนดค่าการอบรม และการแจ้งเตือน Telegram Bot
            </h1>
            <p className="text-xs font-semibold text-slate-500">
              ตั้งค่าชื่อโครงการ ตั้งค่าการส่งการแจ้งเตือนผ่าน Telegram Bot HTTP API อัปโหลดโลโก้โรงเรียนทรงวงกลม
            </p>
          </div>

          <form onSubmit={handleSave} className="glass-panel p-6 sm:p-8 rounded-3xl border border-white space-y-8 shadow-xs bg-white">
            {/* Step 1: Telegram Bot HTTP API Notification Settings */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <Bell className="w-5 h-5 text-blue-600 animate-bounce" />
                <h2 className="font-extrabold text-base text-slate-900">
                  ตั้งค่าการแจ้งเตือนทาง Telegram (Telegram Bot HTTP API)
                </h2>
              </div>

              <div className="p-5 rounded-3xl bg-blue-50/70 border border-blue-100 space-y-4">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-800">
                    HTTP API Token (บอทมาตรฐานระบบ)
                  </label>
                  <div className="p-3 rounded-2xl bg-white border border-blue-200 font-mono text-xs text-blue-700 font-bold truncate">
                    {DEFAULT_TELEGRAM_BOT_TOKEN}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Telegram Chat ID Input */}
                  <div className="space-y-2 sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-800">
                      Telegram Chat ID / Group Chat ID <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="เช่น 123456789 หรือ -100123456789"
                        value={settings.telegramChatId || ""}
                        onChange={(e) => setSettings({ ...settings, telegramChatId: e.target.value })}
                        className="flex-1 px-4 py-3 rounded-2xl border border-slate-200 bg-white text-slate-900 font-bold text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleTestTelegram}
                        disabled={testingTelegram}
                        className="px-5 py-3 rounded-2xl ios-gradient-blue text-white font-extrabold text-xs shadow-md shadow-blue-500/20 flex items-center gap-1.5 hover:scale-105 transition-all shrink-0"
                      >
                        <Send className="w-4 h-4" />
                        <span>{testingTelegram ? "กำลังทดสอบ..." : "ทดสอบส่ง Telegram"}</span>
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium">
                      💡 คำแนะนำ: นำบอทกดเข้ากลุ่ม Telegram ของคณะทำงาน แล้วพิมพ์คำสั่ง <code className="bg-slate-200 px-1 py-0.5 rounded text-blue-800 font-bold">/my_id</code> เพื่อนำ Chat ID มากรอกที่นี่
                    </p>
                  </div>
                </div>

                {telegramStatus && (
                  <div className={`p-3 rounded-2xl text-xs font-bold border ${
                    telegramStatus.startsWith("✅")
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-red-50 text-red-700 border-red-200"
                  }`}>
                    {telegramStatus}
                  </div>
                )}
              </div>
            </div>

            {/* Step 2: Training / Project Name & Details */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <Sparkles className="w-5 h-5 text-blue-600" />
                <h2 className="font-extrabold text-base text-slate-900">
                  ขั้นตอนที่ 1: กำหนดชื่อโครงการ / การอบรม และรายละเอียดหลัก
                </h2>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-800">
                    ชื่อโครงการอบรม / กิจกรรม <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น โครงการส่งเสริมและพัฒนานวัตกรรมการจัดการเรียนรู้เชิงรุก (Active Learning)"
                    value={settings.trainingName}
                    onChange={(e) => setSettings({ ...settings, trainingName: e.target.value })}
                    className="w-full px-4 py-3.5 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 text-sm font-bold focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-800">
                    คำอธิบายรายละเอียดการอบรม / โครงการ
                  </label>
                  <textarea
                    rows={3}
                    placeholder="อธิบายวัตถุประสงค์โครงการ กลุ่มเป้าหมายผู้เข้าร่วม..."
                    value={settings.trainingDescription}
                    onChange={(e) => setSettings({ ...settings, trainingDescription: e.target.value })}
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 text-sm font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-800">
                      รูปแบบ / ประเภทการส่งผลงาน <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={settings.categoryType || "การส่งผลงานนวัตกรรมการเรียนรู้"}
                      onChange={(e) => setSettings({ ...settings, categoryType: e.target.value })}
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 text-sm font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
                    >
                      <option value="การส่งผลงานนวัตกรรมการเรียนรู้">การส่งผลงานนวัตกรรมการเรียนรู้</option>
                      <option value="การส่งผลงานการอบรม">การส่งผลงานการอบรม</option>
                      <option value="การส่งผลงานโครงการ">การส่งผลงานตามโครงการ</option>
                      <option value="การประกวดผลงานนวัตกรรม">การประกวดผลงานนวัตกรรม</option>
                      <option value="การส่งแผนการจัดการเรียนรู้ Active Learning">การส่งแผนการจัดการเรียนรู้ Active Learning</option>
                      <option value="อื่น ๆ">อื่น ๆ</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-800">
                      ปีการศึกษา <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="2569"
                      value={settings.academicYear || "2569"}
                      onChange={(e) => setSettings({ ...settings, academicYear: e.target.value })}
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 font-bold text-sm focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-800">
                      วันเปิดรับส่งผลงาน
                    </label>
                    <input
                      type="datetime-local"
                      value={settings.openDate}
                      onChange={(e) => setSettings({ ...settings, openDate: e.target.value })}
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 text-sm font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-800">
                      วันปิดรับส่งผลงาน
                    </label>
                    <input
                      type="datetime-local"
                      value={settings.closeDate}
                      onChange={(e) => setSettings({ ...settings, closeDate: e.target.value })}
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 text-sm font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3: Work Slot Titles Management */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <ListOrdered className="w-5 h-5 text-blue-600" />
                <h2 className="font-extrabold text-base text-slate-900">
                  ขั้นตอนที่ 2: กำหนดจำนวนและชื่อหัวข้อผลงานที่ต้องส่งสำหรับโครงการนี้
                </h2>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-2xl bg-blue-50/60 border border-blue-100">
                  <div>
                    <label className="block text-xs font-bold text-slate-800">
                      จำนวนผลงานสูงสุดที่กำหนดให้ส่ง (ชิ้น/คน) <span className="text-red-500">*</span>
                    </label>
                    <p className="text-[11px] text-slate-500 font-medium">
                      ระบบจะสร้างช่องกรอกหัวข้อตามจำนวนชิ้นงานที่คุณกำหนด
                    </p>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    required
                    value={settings.maxUpload}
                    onChange={(e) => handleMaxUploadChange(parseInt(e.target.value) || 1)}
                    className="w-24 px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 font-bold text-center text-base focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="space-y-3 pt-2">
                  <span className="text-xs font-bold text-slate-700 block">
                    กำหนดชื่อเรื่อง / ประเภทเอกสารของผลงานแต่ละชิ้นงาน:
                  </span>

                  {Array.from({ length: settings.maxUpload }).map((_, idx) => {
                    const currentTitle = settings.workSlotTitles?.[idx] || `ชิ้นที่ ${idx + 1}: ผลงานการเรียนรู้/สื่อการสอน`;
                    return (
                      <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl border border-slate-200 bg-slate-50/50">
                        <span className="font-extrabold text-xs text-blue-600 bg-blue-100 px-3 py-1 rounded-xl">
                          ชิ้นงานที่ {idx + 1}
                        </span>
                        <input
                          type="text"
                          required
                          placeholder={`เช่น ชิ้นที่ ${idx + 1}: แผนการจัดการเรียนรู้ Active Learning (ไฟล์ PDF)`}
                          value={currentTitle}
                          onChange={(e) => handleSlotTitleChange(idx, e.target.value)}
                          className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 font-semibold text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Step 4: Active Project Display Filter Settings */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <Eye className="w-5 h-5 text-blue-600" />
                <h2 className="font-extrabold text-base text-slate-900">
                  ขั้นตอนที่ 3: ตั้งค่าการแสดงผลงานบนหน้าเว็บ (เลือกว่าจะให้แสดงผลงานของโครงการ/การอบรมใด)
                </h2>
              </div>

              <div className="p-5 rounded-3xl bg-blue-50/60 border border-blue-100 space-y-4">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-800">
                    โหมดการแสดงผลงานบนหน้าแรกและหน้าคลังผลงาน <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className={`flex items-center gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all ${
                      settings.activeProjectFilterMode === 'all'
                        ? "bg-white border-blue-500 shadow-xs ring-2 ring-blue-500/20"
                        : "bg-white/60 border-slate-200 hover:border-blue-300"
                    }`}>
                      <input
                        type="radio"
                        name="activeProjectFilterMode"
                        value="all"
                        checked={settings.activeProjectFilterMode === 'all' || !settings.activeProjectFilterMode}
                        onChange={() => setSettings({ ...settings, activeProjectFilterMode: 'all' })}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <span className="font-extrabold text-xs text-slate-900 block">
                          แสดงผลงานจากทุกโครงการ / การอบรมทั้งหมด
                        </span>
                        <span className="text-[11px] text-slate-500">แสดงผลงานที่ครูส่งเข้ามาทุกรายการ</span>
                      </div>
                    </label>

                    <label className={`flex items-center gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all ${
                      settings.activeProjectFilterMode === 'specific'
                        ? "bg-white border-blue-500 shadow-xs ring-2 ring-blue-500/20"
                        : "bg-white/60 border-slate-200 hover:border-blue-300"
                    }`}>
                      <input
                        type="radio"
                        name="activeProjectFilterMode"
                        value="specific"
                        checked={settings.activeProjectFilterMode === 'specific'}
                        onChange={() => setSettings({ ...settings, activeProjectFilterMode: 'specific' })}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <span className="font-extrabold text-xs text-slate-900 block">
                          แสดงเฉพาะผลงานของโครงการ / การอบรมที่ระบุ
                        </span>
                        <span className="text-[11px] text-slate-500">กรองเฉพาะผลงานตามชื่อโครงการที่แอดมินเลือก</span>
                      </div>
                    </label>
                  </div>
                </div>

                {settings.activeProjectFilterMode === 'specific' && (
                  <div className="space-y-2 pt-2 animate-in fade-in">
                    <label className="block text-xs font-bold text-slate-800">
                      ระบุคำค้นหา / ชื่อโครงการอบรมที่ต้องการให้แสดงผลงาน <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required={settings.activeProjectFilterMode === 'specific'}
                      placeholder="เช่น Active Learning, นวัตกรรมดิจิทัล, ประกวดผลงาน..."
                      value={settings.activeProjectFilterName || ""}
                      onChange={(e) => setSettings({ ...settings, activeProjectFilterName: e.target.value })}
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white text-slate-900 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Step 5: School & Organization Settings with Circular Logo Upload */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <Building className="w-5 h-5 text-blue-600" />
                <h2 className="font-extrabold text-base text-slate-900">
                  ขั้นตอนที่ 4: ข้อมูลโรงเรียน และอัปโหลดรูปโลโก้โรงเรียน (ทรงวงกลม)
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-800">
                    ชื่อโรงเรียน / หน่วยงาน <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="โรงเรียนอนุบาลอุบลราชธานี"
                    value={settings.schoolName || ""}
                    onChange={(e) => setSettings({ ...settings, schoolName: e.target.value })}
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 text-sm font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-800">
                    สำนักงานเขตพื้นที่การศึกษา / สพท. / สพป. / สพม.
                  </label>
                  <input
                    type="text"
                    placeholder="สำนักงานเขตพื้นที่การศึกษาประถมศึกษาอุบลราชธานี เขต 1"
                    value={settings.educationalArea || ""}
                    onChange={(e) => setSettings({ ...settings, educationalArea: e.target.value })}
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 text-sm font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
                  />
                </div>

                <div className="space-y-3 sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-800">
                    อัปโหลด / เปลี่ยนรูปโลโก้โรงเรียน (แสดงผลทรงวงกลม)
                  </label>

                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleLogoFileChange}
                    className="hidden"
                  />

                  {settings.schoolLogoUrl ? (
                    <div className="flex items-center justify-between p-4 rounded-3xl border border-blue-200 bg-blue-50/50">
                      <div className="flex items-center gap-4">
                        <div className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-white shadow-md bg-white shrink-0">
                          <img
                            src={settings.schoolLogoUrl}
                            alt="School Logo Preview"
                            className="w-full h-full object-cover rounded-full"
                          />
                        </div>
                        <div>
                          <span className="text-xs font-extrabold text-slate-900 block">
                            โลโก้โรงเรียน (ทรงวงกลม)
                          </span>
                          <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1 mt-0.5">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            พร้อมใช้งานบนเว็บไซต์
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-blue-600 border border-blue-200 font-bold text-xs shadow-xs transition-all flex items-center gap-1.5"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>เลือกรูปใหม่</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleRemoveLogo}
                          className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-blue-200 hover:border-blue-500 bg-blue-50/40 rounded-3xl p-6 text-center cursor-pointer transition-all duration-200 group"
                    >
                      <div className="w-16 h-16 mx-auto mb-2 rounded-full ios-gradient-blue text-white flex items-center justify-center group-hover:scale-105 transition-transform shadow-md shadow-blue-500/20">
                        <Upload className="w-7 h-7" />
                      </div>
                      <p className="text-xs font-extrabold text-slate-800">
                        คลิกเพื่ออัปโหลดไฟล์รูปภาพโลโก้โรงเรียน
                      </p>
                      <p className="text-[11px] text-slate-500 font-medium mt-1">
                        รองรับไฟล์รูปภาพ PNG, JPG, JPEG, WEBP, SVG (แสดงผลทรงวงกลม)
                      </p>
                    </div>
                  )}

                  {uploadingLogo && (
                    <div className="space-y-1 pt-1">
                      <div className="flex justify-between text-xs text-blue-600 font-bold">
                        <span>กำลังประมวลผลรูปโลโก้...</span>
                        <span>{logoUploadProgress}%</span>
                      </div>
                      <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                        <div
                          className="ios-gradient-blue h-full transition-all duration-300 rounded-full"
                          style={{ width: `${logoUploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {logoError && (
                    <div className="flex items-center gap-2 p-3 rounded-2xl bg-red-50 text-red-600 text-xs font-bold border border-red-200">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{logoError}</span>
                    </div>
                  )}

                  <div className="pt-2">
                    <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                      หรือ วาง URL รูปภาพโลโก้โดยตรง:
                    </span>
                    <input
                      type="text"
                      placeholder="https://..."
                      value={settings.schoolLogoUrl || ""}
                      onChange={(e) => setSettings({ ...settings, schoolLogoUrl: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-800">
                    URL ภาพ Banner หน้าแรก
                  </label>
                  <input
                    type="text"
                    value={settings.bannerUrl}
                    onChange={(e) => setSettings({ ...settings, bannerUrl: e.target.value })}
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 text-sm font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
                  />
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
                disabled={saving || uploadingLogo}
                className="px-8 py-3.5 rounded-2xl ios-gradient-blue text-white font-extrabold text-sm shadow-md shadow-blue-500/25 flex items-center gap-2 hover:scale-[1.02] transition-all disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? "กำลังบันทึก..." : "บันทึกการตั้งค่าทั้งหมด"}</span>
              </button>
            </div>
          </form>
        </main>
      </div>

      <Footer />
    </div>
  );
}
