"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AdminSidebar from "@/components/AdminSidebar";
import { getProjects, saveProject, deleteProject, setActiveProject, saveProjectsOrder } from "@/lib/projects-service";
import { getTrainingSettings, getSubmissions, updateSubmission } from "@/lib/submission-service";
import { Project, TrainingSettings } from "@/lib/types";
import { CalendarRange, Plus, Save, Trash2, CheckCircle2, Star, ListOrdered, Link2, X, Pencil, ChevronUp, ChevronDown } from "lucide-react";

function blankProject(settings: TrainingSettings | null): Project {
  const titles = settings?.workSlotTitles || [
    "ชิ้นที่ 1: แผนการจัดการเรียนรู้ (ไฟล์ PDF)",
    "ชิ้นที่ 2: สื่อ/นวัตกรรมการสอน (รูปภาพ / PDF / Google Drive)",
    "ชิ้นที่ 3: ภาพบรรยากาศการจัดกิจกรรม (รูปภาพ / PDF)",
  ];
  return {
    id: `proj-${Date.now()}`,
    name: "",
    kind: "project",
    categoryType: settings?.categoryType || "การส่งผลงานนวัตกรรมการเรียนรู้",
    academicYear: settings?.academicYear || "2569",
    description: "",
    openDate: "",
    closeDate: "",
    workSlotTitles: [...titles],
    maxUpload: titles.length || 3,
    status: "active",
    createdAt: Date.now(),
    order: 0,
  };
}

export default function AdminProjectsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<TrainingSettings | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  const [editing, setEditing] = useState<Project | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const reload = async () => {
    const [ps, s] = await Promise.all([getProjects(true), getTrainingSettings(true)]);
    setProjects(ps);
    setSettings(s);
    setActiveId(s.activeProjectId);
  };

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("admin_session")) {
      router.push("/admin/login");
      return;
    }
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const handleMaxUploadChange = (n: number) => {
    if (!editing) return;
    const count = Math.max(1, Math.min(50, n));
    const titles = Array.from({ length: count }).map(
      (_, i) => editing.workSlotTitles?.[i] || `ชิ้นที่ ${i + 1}: ผลงานการเรียนรู้/สื่อการสอน`
    );
    setEditing({ ...editing, maxUpload: count, workSlotTitles: titles });
  };

  const handleSlotTitleChange = (idx: number, val: string) => {
    if (!editing) return;
    const titles = [...editing.workSlotTitles];
    titles[idx] = val;
    setEditing({ ...editing, workSlotTitles: titles });
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.name.trim()) {
      setMessage("กรุณากรอกชื่อรอบ/โครงการ");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const isFirst = projects.length === 0;
      await saveProject({ ...editing, name: editing.name.trim() });
      // Make it the active round if it's the first project or has no active set yet.
      if (isFirst || !activeId) {
        await setActiveProject(editing.id);
      }
      await reload();
      setEditing(null);
      setMessage("บันทึกรอบ/โครงการเรียบร้อยแล้ว");
    } catch (err) {
      console.error("Save project error:", err);
      setMessage("เกิดข้อผิดพลาดในการบันทึก");
    } finally {
      setSaving(false);
    }
  };

  const handleSetActive = async (id: string) => {
    await setActiveProject(id);
    await reload();
    setMessage("ตั้งเป็นรอบที่เปิดรับส่งผลงานแล้ว");
  };

  // Reorder rounds: which project shows first in the public dropdowns.
  const moveProject = async (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= projects.length) return;
    const next = [...projects];
    [next[index], next[j]] = [next[j], next[index]];
    setProjects(next);
    const updated = await saveProjectsOrder(next.map((p) => p.id));
    setProjects(updated);
    setMessage("บันทึกการจัดเรียงโครงการแล้ว");
  };

  const handleDelete = async (p: Project) => {
    if (!confirm(`ลบรอบ "${p.name}" ? (ผลงานที่เคยส่งจะยังอยู่ แต่จะไม่ถูกจัดกลุ่มในรอบนี้)`)) return;
    await deleteProject(p.id);
    await reload();
    setMessage("ลบรอบเรียบร้อยแล้ว");
  };

  const handleSeedFromSettings = async () => {
    const s = await getTrainingSettings(true);
    const seeded: Project = {
      id: `proj-${Date.now()}`,
      name: s.trainingName || "โครงการปัจจุบัน",
      categoryType: s.categoryType,
      academicYear: s.academicYear,
      description: s.trainingDescription,
      bannerUrl: s.bannerUrl,
      openDate: s.openDate,
      closeDate: s.closeDate,
      workSlotTitles: s.workSlotTitles || [],
      maxUpload: s.maxUpload || 3,
      status: "active",
      createdAt: Date.now(),
      order: 0,
    };
    await saveProject(seeded);
    await setActiveProject(seeded.id);
    await reload();
    setMessage("สร้างรอบจากการตั้งค่าปัจจุบันและตั้งเป็นรอบที่เปิดรับแล้ว");
  };

  const handleBackfill = async (project: Project) => {
    if (!confirm(`ผูกผลงานเก่าที่ยังไม่มีรอบ เข้ากับ "${project.name}" ทั้งหมด?`)) return;
    setMessage("กำลังผูกผลงานเก่า...");
    const all = await getSubmissions({ ignoreProjectFilter: true, forceRefresh: true });
    const orphans = all.filter((s) => !s.projectId);
    let done = 0;
    for (const s of orphans) {
      await updateSubmission(s.id, { projectId: project.id, projectName: project.name });
      done++;
    }
    setMessage(`ผูกผลงานเก่าเข้ารอบ "${project.name}" แล้ว ${done} รายการ`);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 flex flex-col md:flex-row gap-6">
        <AdminSidebar />
        <main className="flex-1 space-y-6">
          <div className="glass-panel p-6 rounded-3xl border border-white bg-white shadow-xs space-y-1">
            <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
              <CalendarRange className="w-6 h-6 text-blue-600" />
              <span>จัดการรอบ / โครงการอบรม</span>
            </h1>
            <p className="text-xs font-semibold text-slate-500">
              สร้างได้หลายรอบ (เช่น อบรมรอบที่ 1, 2, 3...) เลือก 1 รอบให้ "เปิดรับส่งผลงาน" และหน้าเว็บจะแสดงผลงานแยกตามรอบ
            </p>
          </div>

          {message && (
            <div className="p-4 rounded-2xl bg-emerald-50 text-emerald-700 text-sm border border-emerald-200 flex items-center gap-2 font-bold">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span>{message}</span>
            </div>
          )}

          {/* Toolbar */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setEditing(blankProject(settings))}
              className="px-5 py-3 rounded-2xl ios-gradient-blue text-white font-extrabold text-sm shadow-md shadow-blue-500/25 flex items-center gap-2 hover:scale-[1.02] transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>สร้างรอบใหม่</span>
            </button>
            {projects.length === 0 && (
              <button
                onClick={handleSeedFromSettings}
                className="px-5 py-3 rounded-2xl bg-white border border-blue-200 text-blue-700 font-bold text-sm hover:bg-blue-50 transition-all flex items-center gap-2"
              >
                <Star className="w-4 h-4" />
                <span>สร้างรอบจากการตั้งค่าปัจจุบัน (สำหรับข้อมูลเดิม)</span>
              </button>
            )}
          </div>

          {/* Editor */}
          {editing && (
            <div className="glass-panel p-6 rounded-3xl border border-blue-200 bg-white space-y-5 shadow-sm">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h2 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                  <Pencil className="w-4 h-4 text-blue-600" />
                  {projects.some((p) => p.id === editing.id) ? "แก้ไขรอบ/โครงการ" : "รอบ/โครงการใหม่"}
                </h2>
                <button onClick={() => setEditing(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-800">ชื่อรอบ/โครงการอบรม *</label>
                <input
                  type="text"
                  placeholder="เช่น อบรม Active Learning รอบที่ 1 (ส.ค. 2569)"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 text-sm font-bold focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-800">ประเภทกิจกรรม (มีผลต่อคำบนเว็บ)</label>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { key: "training", title: "การอบรม", sub: 'ใช้คำว่า "ส่งงาน"' },
                    { key: "project", title: "โครงการ", sub: 'ใช้คำว่า "ส่งผลงาน"' },
                  ] as const).map((opt) => {
                    const active = (editing.kind || "project") === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setEditing({ ...editing, kind: opt.key })}
                        className={`p-3.5 rounded-2xl border text-left transition-all ${
                          active ? "bg-white border-blue-500 ring-2 ring-blue-500/20" : "bg-white/60 border-slate-200 hover:border-blue-300"
                        }`}
                      >
                        <span className="font-extrabold text-sm text-slate-900 block">{opt.title}</span>
                        <span className="text-[11px] text-slate-500">{opt.sub}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-800">ประเภท</label>
                  <input
                    type="text"
                    value={editing.categoryType || ""}
                    onChange={(e) => setEditing({ ...editing, categoryType: e.target.value })}
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 text-sm font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-800">ปีการศึกษา</label>
                  <input
                    type="text"
                    value={editing.academicYear || ""}
                    onChange={(e) => setEditing({ ...editing, academicYear: e.target.value })}
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 text-sm font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-800">วันเปิดรับ</label>
                  <input
                    type="datetime-local"
                    value={editing.openDate || ""}
                    onChange={(e) => setEditing({ ...editing, openDate: e.target.value })}
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 text-sm font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-800">วันปิดรับ</label>
                  <input
                    type="datetime-local"
                    value={editing.closeDate || ""}
                    onChange={(e) => setEditing({ ...editing, closeDate: e.target.value })}
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 text-sm font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-2xl bg-blue-50/60 border border-blue-100">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-2">
                  <ListOrdered className="w-4 h-4 text-blue-600" />
                  จำนวนชิ้นงานที่ต้องส่ง (ชิ้น/คน)
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={editing.maxUpload}
                  onChange={(e) => handleMaxUploadChange(parseInt(e.target.value) || 1)}
                  className="w-24 px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 font-bold text-center"
                />
              </div>

              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700 block">หัวข้อผลงานแต่ละชิ้น:</span>
                {editing.workSlotTitles.map((title, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 rounded-2xl border border-slate-200 bg-slate-50/50">
                    <span className="font-extrabold text-xs text-blue-600 bg-blue-100 px-3 py-1 rounded-xl shrink-0">
                      ชิ้นที่ {idx + 1}
                    </span>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => handleSlotTitleChange(idx, e.target.value)}
                      className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 font-semibold text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-8 py-3.5 rounded-2xl ios-gradient-blue text-white font-extrabold text-sm shadow-md shadow-blue-500/25 flex items-center gap-2 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{saving ? "กำลังบันทึก..." : "บันทึกรอบ/โครงการ"}</span>
                </button>
              </div>
            </div>
          )}

          {/* Project list */}
          <div className="space-y-3">
            {projects.length === 0 && !editing && (
              <div className="glass-panel p-10 text-center rounded-3xl border border-dashed border-slate-200 bg-white/60">
                <p className="font-extrabold text-slate-700">ยังไม่มีรอบ/โครงการ</p>
                <p className="text-xs text-slate-500 mt-1 font-medium">
                  กด "สร้างรอบใหม่" หรือ "สร้างรอบจากการตั้งค่าปัจจุบัน" เพื่อเริ่มต้น
                </p>
              </div>
            )}

            {projects.map((p, index) => {
              const isActive = p.id === activeId;
              return (
                <div
                  key={p.id}
                  className={`glass-panel p-5 rounded-3xl border bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    isActive ? "border-emerald-300 ring-2 ring-emerald-500/15" : "border-slate-200"
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-extrabold text-slate-900">{p.name}</h3>
                      {isActive ? (
                        <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                          เปิดรับส่งอยู่ (active)
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                          ปิดรับส่ง
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 font-medium">
                      {p.categoryType} · ปีการศึกษา {p.academicYear} · {p.maxUpload} ชิ้น/คน
                      {p.openDate ? ` · เปิด ${p.openDate.replace("T", " ")}` : ""}
                      {p.closeDate ? ` · ปิด ${p.closeDate.replace("T", " ")}` : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {/* Reorder: which round shows first in the public dropdown */}
                    <div className="flex items-center rounded-xl border border-slate-200 bg-white overflow-hidden">
                      <button
                        onClick={() => moveProject(index, -1)}
                        disabled={index === 0}
                        title="เลื่อนขึ้น (แสดงก่อน)"
                        className="p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <span className="px-1.5 text-[11px] font-extrabold text-slate-400 border-x border-slate-100">
                        {index + 1}
                      </span>
                      <button
                        onClick={() => moveProject(index, 1)}
                        disabled={index === projects.length - 1}
                        title="เลื่อนลง (แสดงทีหลัง)"
                        className="p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                    {!isActive && (
                      <button
                        onClick={() => handleSetActive(p.id)}
                        className="px-3.5 py-2 rounded-xl bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 hover:bg-emerald-600 transition-colors"
                      >
                        <Star className="w-3.5 h-3.5" />
                        <span>ตั้งเป็นรอบที่เปิดรับ</span>
                      </button>
                    )}
                    <button
                      onClick={() => handleBackfill(p)}
                      className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 hover:bg-slate-50 transition-colors"
                      title="ผูกผลงานเก่าที่ยังไม่มีรอบ เข้ากับรอบนี้"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      <span>ผูกผลงานเก่า</span>
                    </button>
                    <button
                      onClick={() => setEditing(p)}
                      className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 hover:bg-slate-50 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>แก้ไข</span>
                    </button>
                    <button
                      onClick={() => handleDelete(p)}
                      className="px-3 py-2 rounded-xl text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      </div>
      <Footer />
    </div>
  );
}
