"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AdminSidebar from "@/components/AdminSidebar";
import { getTrainingSettings, updateTrainingSettings, compressAndResizeImage, fileToDataURL, deleteStorageFileByUrl } from "@/lib/submission-service";
import { TrainingSettings } from "@/lib/types";
import { Building, Upload, Image as ImageIcon, CheckCircle2, Save, MapPin } from "lucide-react";

export default function AdminSchoolPage() {
  const [settings, setSettings] = useState<TrainingSettings>({
    maxUpload: 10,
    trainingName: "",
    trainingDescription: "",
    openDate: "",
    closeDate: "",
    bannerUrl: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=1200&auto=format&fit=crop",
    allowSubmissions: true,
    schoolLogoUrl: "https://images.unsplash.com/photo-1594312915251-48db9280c8f1?w=200&auto=format&fit=crop",
    schoolName: "โรงเรียนอนุบาลอุบลราชธานี",
    educationalArea: "สำนักงานเขตพื้นที่การศึกษาประถมศึกษาอุบลราชธานี เขต 1",
    categoryType: "การส่งผลงานนวัตกรรมการเรียนรู้",
    academicYear: "2569",
  });

  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function load() {
      const data = await getTrainingSettings();
      setSettings(data);
    }
    load();
  }, []);

  // Instant Instantaneous Logo File Handler (< 50ms DataURL preview & Automatic Old Logo File Deletion!)
  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const oldLogoUrl = settings.schoolLogoUrl;

    setUploadingLogo(true);
    setSuccessMessage("");
    try {
      const compressedFile = await compressAndResizeImage(file, 300, 300, 0.85);
      const dataUrl = await fileToDataURL(compressedFile);
      
      setSettings((prev) => ({ ...prev, schoolLogoUrl: dataUrl }));
      setUploadingLogo(false); // Reset uploading button state INSTANTLY in 50ms!
      setSuccessMessage('เลือกโลโก้ใหม่แล้ว — กดปุ่ม "บันทึก" ด้านล่างเพื่อยืนยันและบันทึกขึ้นระบบ');

      // Delete old logo file from Firebase Storage if applicable
      if (oldLogoUrl && oldLogoUrl.includes("firebasestorage.googleapis.com")) {
        deleteStorageFileByUrl(oldLogoUrl).catch(() => {});
      }
      // Persist happens on Save (handleSave) so we can confirm it reached the cloud.
    } catch (err) {
      console.error("Logo upload error:", err);
      setUploadingLogo(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMessage("");
    setErrorMessage("");

    try {
      const cloudSaved = await updateTrainingSettings(settings);

      if (cloudSaved) {
        setSuccessMessage("บันทึกข้อมูลโรงเรียนและโลโก้ขึ้นระบบเรียบร้อยแล้ว (แสดงผลทุกอุปกรณ์)");
      } else {
        setErrorMessage(
          "บันทึกในเครื่องนี้แล้ว แต่ยังขึ้นระบบ (คลาวด์) ไม่สำเร็จ — โลโก้จะไม่แสดงบนอุปกรณ์อื่น โปรดออกจากระบบแล้วเข้าสู่ระบบผู้ดูแลใหม่ด้วยอีเมล/รหัสผ่าน แล้วกดบันทึกอีกครั้ง"
        );
      }
    } catch (err) {
      console.error("Save school info error:", err);
      setErrorMessage("เกิดข้อผิดพลาดในการบันทึก กรุณาลองใหม่");
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
          {/* Page Header */}
          <div className="glass-panel p-6 rounded-3xl border border-white bg-white shadow-xs space-y-1">
            <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
              <Building className="w-6 h-6 text-blue-600" />
              <span>ข้อมูลโรงเรียน & อัปโหลดรูปโลโก้โรงเรียน</span>
            </h1>
            <p className="text-xs font-semibold text-slate-500">
              จัดการชื่อโรงเรียน สังกัดเขตพื้นที่การศึกษา อัปโหลดโลโก้โรงเรียนทรงวงกลม และภาพแบนเนอร์ส่วนหัว
            </p>
          </div>

          <form onSubmit={handleSave} className="glass-panel p-6 sm:p-8 rounded-3xl border border-white space-y-6 shadow-xs bg-white">
            {/* School Logo Section */}
            <div className="p-6 rounded-3xl bg-blue-50/70 border border-blue-100 space-y-4">
              <div className="flex items-center gap-2 text-blue-900 font-extrabold text-sm pb-2 border-b border-blue-100">
                <ImageIcon className="w-5 h-5 text-blue-600" />
                <span>โลโก้โรงเรียน (รูปทรงวงกลม)</span>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-6">
                <div className="relative group shrink-0">
                  <Image
                    src={settings.schoolLogoUrl || "https://images.unsplash.com/photo-1594312915251-48db9280c8f1?w=200&auto=format&fit=crop"}
                    alt="School Logo"
                    width={112}
                    height={112}
                    className="w-28 h-28 rounded-full object-cover border-4 border-white shadow-lg ring-4 ring-blue-500/20"
                  />
                  <label className="absolute inset-0 rounded-full bg-slate-900/40 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-[10px] font-bold">
                    <Upload className="w-5 h-5 mb-1" />
                    <span>เปลี่ยนโลโก้</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoFileChange}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="space-y-2 flex-1 text-center sm:text-left">
                  <h3 className="font-extrabold text-sm text-slate-900">
                    อัปโหลดไฟล์รูปภาพโลโก้โรงเรียน (ลบไฟล์เดิมอัตโนมัติ)
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    รองรับไฟล์รูปภาพ PNG, JPG, WEBP ระบบจะปรับขนาดและตัดแต่งเป็นรูปทรงวงกลมอัตโนมัติ พร้อมลบไฟล์เดิมออกจากพื้นที่จัดเก็บ
                  </p>

                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                    <label className="px-5 py-2.5 rounded-2xl ios-gradient-blue text-white font-extrabold text-xs shadow-md shadow-blue-500/20 cursor-pointer flex items-center gap-2 hover:scale-105 transition-all">
                      <Upload className="w-4 h-4" />
                      <span>{uploadingLogo ? "กำลังอัปโหลด..." : "เลือกรูปภาพโลโก้ใหม่"}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoFileChange}
                        className="hidden"
                      />
                    </label>

                    {settings.schoolLogoUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          if (settings.schoolLogoUrl?.includes("firebasestorage.googleapis.com")) {
                            deleteStorageFileByUrl(settings.schoolLogoUrl);
                          }
                          setSettings({ ...settings, schoolLogoUrl: "https://images.unsplash.com/photo-1594312915251-48db9280c8f1?w=200&auto=format&fit=crop" });
                          updateTrainingSettings({ schoolLogoUrl: "https://images.unsplash.com/photo-1594312915251-48db9280c8f1?w=200&auto=format&fit=crop" });
                        }}
                        className="px-4 py-2.5 rounded-2xl bg-white border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50"
                      >
                        ใช้รูปเริ่มต้น
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* School Name & Area Info Inputs */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Building className="w-4 h-4 text-blue-600" />
                  <span>ชื่อโรงเรียน <span className="text-red-500">*</span></span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="เช่น โรงเรียนอนุบาลอุบลราชธานี"
                  value={settings.schoolName || ""}
                  onChange={(e) => setSettings({ ...settings, schoolName: e.target.value })}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50/50 text-slate-900 font-bold text-sm focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-blue-600" />
                  <span>สังกัด / เขตพื้นที่การศึกษา <span className="text-red-500">*</span></span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="เช่น สำนักงานเขตพื้นที่การศึกษาประถมศึกษาอุบลราชธานี เขต 1"
                  value={settings.educationalArea || ""}
                  onChange={(e) => setSettings({ ...settings, educationalArea: e.target.value })}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50/50 text-slate-900 font-bold text-sm focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            {/* Banner URL Section */}
            <div className="space-y-3 pt-2">
              <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-blue-600" />
                <span>URL รูปภาพแบนเนอร์ส่วนหัว (Header Banner)</span>
              </label>
              <input
                type="url"
                placeholder="https://..."
                value={settings.bannerUrl || ""}
                onChange={(e) => setSettings({ ...settings, bannerUrl: e.target.value })}
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50/50 text-slate-900 font-semibold text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
              />

              {settings.bannerUrl && (
                <div className="rounded-2xl overflow-hidden border border-slate-200 h-36 relative shadow-xs">
                  <Image
                    src={settings.bannerUrl}
                    alt="Banner Preview"
                    fill
                    sizes="(max-width: 768px) 100vw, 900px"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-slate-900/20 flex items-center justify-center">
                    <span className="px-3 py-1 rounded-full bg-black/50 text-white text-[11px] font-bold backdrop-blur-md">
                      ตัวอย่างการแสดงผลแบนเนอร์ส่วนหัว
                    </span>
                  </div>
                </div>
              )}
            </div>

            {successMessage && (
              <div className="p-4 rounded-2xl bg-emerald-50 text-emerald-700 text-sm border border-emerald-200 flex items-center gap-2 font-bold animate-in fade-in">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {errorMessage && (
              <div className="p-4 rounded-2xl bg-amber-50 text-amber-800 text-sm border border-amber-200 flex items-start gap-2 font-bold animate-in fade-in">
                <CheckCircle2 className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-8 py-3.5 rounded-2xl ios-gradient-blue text-white font-extrabold text-sm shadow-md shadow-blue-500/25 flex items-center gap-2 hover:scale-[1.02] transition-all disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? "กำลังบันทึก..." : "บันทึกข้อมูลโรงเรียนและโลโก้"}</span>
              </button>
            </div>
          </form>
        </main>
      </div>

      <Footer />
    </div>
  );
}
