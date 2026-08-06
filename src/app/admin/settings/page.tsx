"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AdminSidebar from "@/components/AdminSidebar";
import { getTrainingSettings, updateTrainingSettings } from "@/lib/submission-service";
import { notifyAdminSubmissionAction } from "@/lib/telegram-service";
import { TrainingSettings } from "@/lib/types";
import { Settings, Save, CheckCircle2, ListOrdered, Sparkles, Eye } from "lucide-react";

export default function AdminSettingsPage() {
  const router = useRouter();

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
    workSlotTitles: [
      "ชิ้นที่ 1: แผนการจัดการเรียนรู้ Active Learning (ไฟล์ PDF)",
      "ชิ้นที่ 2: สื่อและนวัตกรรมการสอนดิจิทัล (รูปภาพ / PDF / Google Drive)",
      "ชิ้นที่ 3: ภาพบรรยากาศการจัดกิจกรรมการเรียนรู้ (ไฟล์รูปภาพ / PDF)"
    ],
    activeProjectFilterMode: 'all',
    activeProjectFilterName: "",
  });

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
    }
    load();
  }, [router]);

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

    try {
      await updateTrainingSettings(settings);
      notifyAdminSubmissionAction("edit", {
        id: "project-settings",
        fullName: "แอดมินผู้ดูแลระบบ",
        projectTitle: `อัปเดตการตั้งค่าโครงการ: ${settings.trainingName}`,
      }).catch((err) => console.warn("Telegram error:", err));

      setSuccessMessage("บันทึกการตั้งค่าโครงการเรียบร้อยแล้ว");
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
            <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
              <Settings className="w-6 h-6 text-blue-600" />
              <span>กำหนดค่าการอบรม และ โครงการส่งผลงาน</span>
            </h1>
            <p className="text-xs font-semibold text-slate-500">
              กำหนดชื่อโครงการ กำหนดหัวข้อผลงานในแต่ละสล็อต (1-10 ชิ้นงาน) และวันเปิด-ปิดรับส่งผลงาน
            </p>
          </div>

          <form onSubmit={handleSave} className="glass-panel p-6 sm:p-8 rounded-3xl border border-white space-y-8 shadow-xs bg-white">
            {/* Step 1: Training / Project Name & Details */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <Sparkles className="w-5 h-5 text-blue-600" />
                <h2 className="font-extrabold text-base text-slate-900">
                  ส่วนที่ 1: กำหนดชื่อโครงการ / การอบรม และรายละเอียดหลัก
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

            {/* Step 2: Work Slot Titles Management */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <ListOrdered className="w-5 h-5 text-blue-600" />
                <h2 className="font-extrabold text-base text-slate-900">
                  ส่วนที่ 2: กำหนดจำนวนและชื่อหัวข้อผลงานที่ต้องส่งสำหรับโครงการนี้ (1 - 10 ชิ้นงาน)
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
                    กำหนดชื่อเรื่อง / ประเภทเอกสารของผลงานแต่ละชิ้นงาน (ที่แอดมินกำหนดล็อคไว้อัตโนมัติ):
                  </span>

                  {Array.from({ length: settings.maxUpload }).map((_, idx) => {
                    const currentTitle = settings.workSlotTitles?.[idx] || `ชิ้นที่ ${idx + 1}: ผลงานการเรียนรู้/สื่อการสอน`;
                    return (
                      <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl border border-slate-200 bg-slate-50/50">
                        <span className="font-extrabold text-xs text-blue-600 bg-blue-100 px-3 py-1 rounded-xl shrink-0">
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

            {/* Step 3: Active Project Display Filter Settings */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <Eye className="w-5 h-5 text-blue-600" />
                <h2 className="font-extrabold text-base text-slate-900">
                  ส่วนที่ 3: ตั้งค่าการแสดงผลงานบนหน้าเว็บ (เลือกว่าจะให้แสดงผลงานของโครงการ/การอบรมใด)
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
                <span>{saving ? "กำลังบันทึก..." : "บันทึกการตั้งค่าโครงการ"}</span>
              </button>
            </div>
          </form>
        </main>
      </div>

      <Footer />
    </div>
  );
}
