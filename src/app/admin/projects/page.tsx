"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AdminSidebar from "@/components/AdminSidebar";
import { getInstantProjects, getProjects, saveProject, deleteProject, setActiveProject, saveProjectsOrder, setProjectCertificateEnabled } from "@/lib/projects-service";
import { countSubmissions, deleteSubmissionsByProject, getTrainingSettings, getSubmissions, updateSubmission, updateTrainingSettings } from "@/lib/submission-service";
import { getTeachers, getInstantTeachers, saveTeacher, TeacherItem } from "@/lib/teachers-service";
import { Project, TrainingSettings } from "@/lib/types";
import { budgetYearOf, gradeLabel, normalizeGradeKey } from "@/lib/format";
import { CalendarRange, Plus, Save, Trash2, CheckCircle2, Star, ListOrdered, Link2, X, Pencil, ChevronUp, ChevronDown, ToggleLeft, ToggleRight, Eye, EyeOff, Users, Search, Award } from "lucide-react";

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
    groupBy: "gradeLevel",
    budgetYear: settings?.budgetYear || settings?.academicYear || "2569",
    description: "",
    openDate: "",
    closeDate: "",
    workSlotTitles: [...titles],
    workSlotAllowCustomTitle: titles.map(() => false),
    maxUpload: titles.length || 3,
    status: "active",
    createdAt: Date.now(),
    order: 0,
    attendeeIds: [],
    attendeeProfiles: {},
  };
}

export default function AdminProjectsPage() {
  const [settings, setSettings] = useState<TrainingSettings | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  const [editing, setEditing] = useState<Project | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [submissionCounts, setSubmissionCounts] = useState<Record<string, number>>({});
  const [allTeachers, setAllTeachers] = useState<TeacherItem[]>([]);
  const [attendeeSearch, setAttendeeSearch] = useState("");
  const [attendeeGradeFilter, setAttendeeGradeFilter] = useState("ทั้งหมด");
  const [attendeeSubjectFilter, setAttendeeSubjectFilter] = useState("ทั้งหมด");
  const [newTeacherName, setNewTeacherName] = useState("");
  const [newTeacherPosition, setNewTeacherPosition] = useState("");
  const [addingTeacher, setAddingTeacher] = useState(false);
  const [attendeeMsg, setAttendeeMsg] = useState("");

  const reload = () => {
    // Seed the roster from cache so the grade/subject filters and attendee list
    // are usable immediately instead of waiting on the network.
    const instantRoster = getInstantTeachers();
    if (instantRoster.length) setAllTeachers(instantRoster);
    const instantProjects = getInstantProjects();
    if (instantProjects.length) {
      setProjects(instantProjects);
      setProjectsLoading(false);
    }

    // Resolve each read independently — the teacher roster (fast) must not wait
    // behind the heavier full-document submissions read, which was making the
    // grade/subject dropdowns appear empty until everything finished.
    getTeachers().then((teachers) => setAllTeachers(teachers)).catch(() => {});
    getProjects(true)
      .then((ps) => {
        setProjects(ps);
        // Exact Firestore aggregation counts avoid downloading every submission
        // document merely to paint the small "ส่งแล้ว" labels on these cards.
        void Promise.all(ps.map(async (project) => [project.id, await countSubmissions(project.id)] as const))
          .then((entries) => {
            const counts: Record<string, number> = {};
            entries.forEach(([id, count]) => {
              if (count >= 0) counts[id] = count;
            });
            setSubmissionCounts(counts);
          })
          .catch(() => {});
      })
      .catch(() => {})
      .finally(() => setProjectsLoading(false));
    getTrainingSettings()
      .then((s) => {
        setSettings(s);
        setActiveId(s.activeProjectId);
      })
      .catch(() => {});

  };

  useEffect(() => {
    // Data loading is intentionally started after the client-side auth redirect check.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, []);

  const handleMaxUploadChange = (n: number) => {
    if (!editing) return;
    const count = Math.max(1, Math.min(50, n));
    const titles = Array.from({ length: count }).map(
      (_, i) => editing.workSlotTitles?.[i] || `ชิ้นที่ ${i + 1}: ผลงานการเรียนรู้/สื่อการสอน`
    );
    const customTitleFlags = Array.from({ length: count }).map(
      (_, i) => editing.workSlotAllowCustomTitle?.[i] || false,
    );
    setEditing({
      ...editing,
      maxUpload: count,
      workSlotTitles: titles,
      workSlotAllowCustomTitle: customTitleFlags,
    });
  };

  const handleSlotTitleChange = (idx: number, val: string) => {
    if (!editing) return;
    const titles = [...editing.workSlotTitles];
    titles[idx] = val;
    setEditing({ ...editing, workSlotTitles: titles });
  };

  const toggleSlotCustomTitle = (idx: number) => {
    if (!editing) return;
    const flags = Array.from({ length: editing.maxUpload }).map(
      (_, index) => editing.workSlotAllowCustomTitle?.[index] || false,
    );
    flags[idx] = !flags[idx];
    setEditing({ ...editing, workSlotAllowCustomTitle: flags });
  };

  const toggleAttendee = (id: string) => {
    if (!editing) return;
    const set = new Set(editing.attendeeIds || []);
    const profiles = { ...(editing.attendeeProfiles || {}) };
    if (set.has(id)) {
      set.delete(id);
      delete profiles[id];
    } else {
      set.add(id);
      const teacher = allTeachers.find((item) => item.id === id);
      if (teacher) profiles[id] = {
        fullName: teacher.fullName,
        position: teacher.position,
        gradeLevel: attendeeGradeFilter !== "ทั้งหมด" ? attendeeGradeFilter : teacher.gradeLevel,
        subjectGroup: attendeeSubjectFilter !== "ทั้งหมด" ? attendeeSubjectFilter : teacher.subjectGroup,
      };
    }
    setEditing({ ...editing, attendeeIds: Array.from(set), attendeeProfiles: profiles });
  };

  const setAttendees = (ids: string[]) => {
    if (!editing) return;
    const profiles = { ...(editing.attendeeProfiles || {}) };
    const keep = new Set(ids);
    Object.keys(profiles).forEach((id) => { if (!keep.has(id)) delete profiles[id]; });
    ids.forEach((id) => {
      if (profiles[id]) return;
      const teacher = allTeachers.find((item) => item.id === id);
      if (teacher) profiles[id] = {
        fullName: teacher.fullName,
        position: teacher.position,
        gradeLevel: attendeeGradeFilter !== "ทั้งหมด" ? attendeeGradeFilter : teacher.gradeLevel,
        subjectGroup: attendeeSubjectFilter !== "ทั้งหมด" ? attendeeSubjectFilter : teacher.subjectGroup,
      };
    });
    setEditing({ ...editing, attendeeIds: ids, attendeeProfiles: profiles });
  };

  const updateAttendeeProfile = (id: string, field: "fullName" | "position" | "gradeLevel" | "subjectGroup", value: string) => {
    if (!editing) return;
    const teacher = allTeachers.find((item) => item.id === id);
    const current = editing.attendeeProfiles?.[id] || teacher || {};
    setEditing({
      ...editing,
      attendeeProfiles: {
        ...(editing.attendeeProfiles || {}),
        [id]: { ...current, [field]: value },
      },
    });
  };

  // Add a teacher who isn't in the roster yet, into the currently filtered grade
  // and/or subject, then tick them as an attendee of this round.
  const handleAddTeacher = async () => {
    if (!editing) return;
    const name = newTeacherName.trim();
    if (!name) {
      setAttendeeMsg("กรุณากรอกชื่อครู");
      return;
    }
    const grade = attendeeGradeFilter !== "ทั้งหมด" ? attendeeGradeFilter : "";
    const subject = attendeeSubjectFilter !== "ทั้งหมด" ? attendeeSubjectFilter : "";
    if (!grade && !subject) {
      setAttendeeMsg("เลือกสายชั้นหรือกลุ่มสาระก่อน เพื่อระบุว่าจะเพิ่มครูเข้าที่ใด");
      return;
    }
    setAddingTeacher(true);
    setAttendeeMsg("");
    try {
      const saved = await saveTeacher({
        fullName: name,
        position: newTeacherPosition.trim() || "ครู",
        gradeLevel: grade,
        subjectGroup: subject,
      });
      const roster = await getTeachers();
      setAllTeachers(roster);
      // Tick the new teacher for this round straight away.
      const set = new Set(editing.attendeeIds || []);
      set.add(saved.id);
      setEditing({
        ...editing,
        attendeeIds: Array.from(set),
        attendeeProfiles: {
          ...(editing.attendeeProfiles || {}),
          [saved.id]: { fullName: saved.fullName, position: saved.position, gradeLevel: grade, subjectGroup: subject },
        },
      });
      setNewTeacherName("");
      setNewTeacherPosition("");
      setAttendeeMsg(`เพิ่ม "${saved.fullName}" แล้ว`);
    } catch (err) {
      setAttendeeMsg(err instanceof Error ? err.message : "เพิ่มครูไม่สำเร็จ");
    } finally {
      setAddingTeacher(false);
    }
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
      const updatedProjects = await saveProject({ ...editing, name: editing.name.trim() });
      setProjects(updatedProjects);
      // activeProjectId is only the default round shown first. Multiple rounds
      // can be open simultaneously, so editing another open round must not
      // silently replace the admin's chosen default.
      if (isFirst || !activeId) {
        await setActiveProject(editing.id);
      }
      reload();
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

  // Toggle whether this round shows in the public "คลังผลงานครู" dropdown.
  const toggleGalleryVisible = async (p: Project) => {
    const updatedProjects = await saveProject({ ...p, showInGallery: p.showInGallery === false });
    setProjects(updatedProjects);
    setMessage(p.showInGallery === false ? "เปิดแสดงโครงการในคลังผลงานแล้ว" : "ปิดการแสดงโครงการในคลังผลงานแล้ว");
  };

  // Each round controls submission independently. activeProjectId only decides
  // which of the open rounds is selected first on the public form.
  const toggleSubmissionOpen = async (p: Project) => {
    const willOpen = p.status === "closed";
    const updatedProjects = await saveProject({ ...p, status: willOpen ? "active" : "closed" });
    setProjects(updatedProjects);
    if (willOpen && !activeId) {
      await setActiveProject(p.id);
    } else if (!willOpen && activeId === p.id) {
      const nextOpen = projects.find((item) => item.id !== p.id && item.status !== "closed");
      if (nextOpen) await setActiveProject(nextOpen.id);
      else await updateTrainingSettings({ activeProjectId: "", allowSubmissions: false });
    }
    setMessage(willOpen ? "เปิดรับส่งงานสำหรับรอบนี้แล้ว" : "ปิดรับส่งงานสำหรับรอบนี้แล้ว");
  };

  // Certificate eligibility belongs to each round. The same flag is consumed by
  // the certificate page and Telegram, so all three surfaces stay in sync.
  const toggleCertificateEnabled = async (p: Project) => {
    const willEnable = !p.certificate?.enabled;
    const updatedProjects = await setProjectCertificateEnabled(p.id, willEnable);
    setProjects(updatedProjects);
    setMessage(
      willEnable
        ? "เปิดระบบเกียรติบัตรสำหรับรอบนี้แล้ว หากยังไม่มีแม่แบบให้ตั้งค่าในหน้าจัดการเกียรติบัตร"
        : "ปิดระบบเกียรติบัตรสำหรับรอบนี้แล้ว",
    );
  };

  const handleDelete = async (p: Project) => {
    const count = submissionCounts[p.id] || 0;
    if (!confirm(`ยืนยันลบรอบ "${p.name}" พร้อมผลงานที่ส่งในรอบนี้ทั้งหมด ${count} รายการ?\n\nการดำเนินการนี้ไม่สามารถย้อนกลับได้`)) return;
    setSaving(true);
    setMessage("กำลังลบโครงการและผลงานที่เกี่ยวข้อง...");
    try {
      const deletedCount = await deleteSubmissionsByProject(p.id);
      await deleteProject(p.id);

      // Never leave the submission form pointing at a deleted active round.
      if (activeId === p.id) {
        const nextProject = projects.find((item) => item.id !== p.id);
        if (nextProject) await setActiveProject(nextProject.id);
        else await updateTrainingSettings({ activeProjectId: "", allowSubmissions: false });
      }

      await reload();
      setMessage(`ลบรอบและผลงานที่เกี่ยวข้องแล้ว ${deletedCount} รายการ`);
    } catch (error) {
      console.error("Delete project with submissions error:", error);
      setMessage("ลบไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setSaving(false);
    }
  };

  const handleSeedFromSettings = async () => {
    const s = await getTrainingSettings(true);
    const seeded: Project = {
      id: `proj-${Date.now()}`,
      name: s.trainingName || "โครงการปัจจุบัน",
      categoryType: s.categoryType,
      budgetYear: s.budgetYear || s.academicYear,
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-800">แกนหมวดหมู่ของรอบนี้ (ใช้จัดกลุ่มในฟอร์มส่งงานและคลังผลงาน)</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {([
                    { key: "gradeLevel", title: "ตามสายชั้น", sub: "เลือกสายชั้น → เลือกชื่อครูในสายชั้น" },
                    { key: "subjectGroup", title: "ตามกลุ่มสาระ", sub: "เลือกกลุ่มสาระ → เลือกชื่อครูในกลุ่มสาระ" },
                  ] as const).map((opt) => {
                    const active = (editing.groupBy || "gradeLevel") === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setEditing({ ...editing, groupBy: opt.key })}
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
                  <label className="block text-xs font-bold text-slate-800">ปีงบประมาณ</label>
                  <input
                    type="text"
                    value={editing.budgetYear || editing.academicYear || ""}
                    onChange={(e) => setEditing({ ...editing, budgetYear: e.target.value })}
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 text-sm font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-800">สถานะการเปิดรับ</label>
                  <button
                    type="button"
                    onClick={() =>
                      setEditing({ ...editing, status: editing.status === "closed" ? "active" : "closed" })
                    }
                    className={`w-full px-4 py-3 rounded-2xl text-sm font-extrabold flex items-center justify-between transition-colors ${
                      editing.status === "closed"
                        ? "bg-slate-100 text-slate-500 border border-slate-200"
                        : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {editing.status === "closed" ? (
                        <ToggleLeft className="w-5 h-5" />
                      ) : (
                        <ToggleRight className="w-5 h-5 text-emerald-600" />
                      )}
                      {editing.status === "closed" ? "ปิดรับส่งผลงาน" : "กำลังเปิดรับส่งผลงาน"}
                    </span>
                    <span className="text-[11px] font-bold opacity-70">แตะเพื่อสลับ</span>
                  </button>
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
                  <div key={idx} className="p-3 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-2.5">
                    <div className="flex items-center gap-3">
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
                    <button
                      type="button"
                      role="switch"
                      aria-checked={Boolean(editing.workSlotAllowCustomTitle?.[idx])}
                      onClick={() => toggleSlotCustomTitle(idx)}
                      className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${
                        editing.workSlotAllowCustomTitle?.[idx]
                          ? "border-violet-200 bg-violet-50 text-violet-800"
                          : "border-slate-200 bg-white text-slate-500"
                      }`}
                    >
                      <span>
                        <span className="block text-xs font-extrabold">ให้ครูตั้งชื่อชิ้นงาน/ชื่อเรื่องเอง</span>
                        <span className="block text-[10px] font-semibold opacity-75 mt-0.5">
                          {editing.workSlotAllowCustomTitle?.[idx]
                            ? "เปิด — ครูต้องกรอกชื่อเรื่องก่อนส่งงานชิ้นนี้"
                            : "ปิด — ใช้หัวข้อที่แอดมินกำหนดด้านบน"}
                        </span>
                      </span>
                      {editing.workSlotAllowCustomTitle?.[idx] ? (
                        <ToggleRight className="w-7 h-7 shrink-0" />
                      ) : (
                        <ToggleLeft className="w-7 h-7 shrink-0" />
                      )}
                    </button>
                  </div>
                ))}
              </div>

              {/* Attendees for this round — restricts who the submit form offers */}
              <div className="space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-600" />
                    ผู้เข้าอบรมรอบนี้
                    <span className="font-semibold text-slate-400">(เลือกแล้ว {(editing.attendeeIds || []).length} คน)</span>
                  </span>
                  {(editing.attendeeIds || []).length > 0 && (
                    <button
                      type="button"
                      onClick={() => setAttendees([])}
                      className="text-[11px] font-bold text-slate-500 hover:text-red-600 px-2 py-1 rounded-lg border border-slate-200"
                    >
                      ล้างทั้งหมด
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
                  ถ้าไม่เลือกใครเลย = ฟอร์มส่งงานจะแสดงครูทั้ง{editing.groupBy === "subjectGroup" ? "กลุ่มสาระ" : "สายชั้น"}ตามปกติ ·
                  เลือกเฉพาะผู้ที่เข้าอบรมจริง เพื่อจำกัดรายชื่อในฟอร์ม (ครูยังพิมพ์ชื่อเองได้เสมอ)
                </p>

                {(editing.attendeeIds || []).length > 0 && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-3 space-y-2">
                    <p className="text-xs font-extrabold text-emerald-800">รายชื่อผู้เข้าอบรมที่เลือกแล้ว — ตรวจสอบและแก้ไขข้อมูลประจำรอบ</p>
                    <div className="max-h-80 overflow-y-auto space-y-2">
                      {(editing.attendeeIds || []).map((id, index) => {
                        const teacher = allTeachers.find((item) => item.id === id);
                        if (!teacher) return null;
                        const profile = editing.attendeeProfiles?.[id] || teacher;
                        return (
                          <div key={id} className="rounded-xl border border-emerald-100 bg-white p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div className="sm:col-span-2 flex items-center justify-between gap-2">
                              <span className="text-[10px] font-extrabold text-emerald-700">ลำดับ {index + 1}</span>
                              <button type="button" onClick={() => toggleAttendee(id)} className="text-[10px] font-bold text-red-500 hover:text-red-700">นำออกจากรอบ</button>
                            </div>
                            <input value={profile.fullName || ""} onChange={(e) => updateAttendeeProfile(id, "fullName", e.target.value)} placeholder="ชื่อ-สกุล" className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-900" />
                            <input value={profile.position || ""} onChange={(e) => updateAttendeeProfile(id, "position", e.target.value)} placeholder="ตำแหน่ง" className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-900" />
                            <select value={profile.gradeLevel || ""} onChange={(e) => updateAttendeeProfile(id, "gradeLevel", e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-900 bg-white">
                              <option value="">ไม่ระบุสายชั้น</option>
                              {Array.from(new Set(allTeachers.map((item) => item.gradeLevel).filter(Boolean))).sort((a, b) => normalizeGradeKey(a).localeCompare(normalizeGradeKey(b), "th")).map((grade) => <option key={grade} value={grade}>{gradeLabel(grade)}</option>)}
                            </select>
                            <select value={profile.subjectGroup || ""} onChange={(e) => updateAttendeeProfile(id, "subjectGroup", e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-900 bg-white">
                              <option value="">ไม่ระบุกลุ่มสาระ</option>
                              {Array.from(new Set(allTeachers.map((item) => item.subjectGroup).filter(Boolean))).sort((a, b) => a.localeCompare(b, "th")).map((subject) => <option key={subject} value={subject}>{subject}</option>)}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[10px] font-semibold text-slate-500">ข้อมูลนี้ใช้เฉพาะรอบนี้ และจะถูกใช้เป็นข้อมูลผู้ส่งเมื่อครูส่งงาน</p>
                  </div>
                )}

                {/* Narrow the roster by grade and/or subject, then tick names */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={attendeeGradeFilter}
                    onChange={(e) => setAttendeeGradeFilter(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="ทั้งหมด">ทุกสายชั้น</option>
                    {Array.from(new Set(allTeachers.map((t) => t.gradeLevel).filter(Boolean)))
                      .sort((a, b) => normalizeGradeKey(a).localeCompare(normalizeGradeKey(b), "th"))
                      .map((g) => (
                        <option key={g} value={g}>
                          {gradeLabel(g)}
                        </option>
                      ))}
                  </select>
                  <select
                    value={attendeeSubjectFilter}
                    onChange={(e) => setAttendeeSubjectFilter(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="ทั้งหมด">ทุกกลุ่มสาระ</option>
                    {Array.from(new Set(allTeachers.map((t) => t.subjectGroup).filter(Boolean)))
                      .sort((a, b) => a.localeCompare(b, "th"))
                      .map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    value={attendeeSearch}
                    onChange={(e) => setAttendeeSearch(e.target.value)}
                    placeholder="ค้นหาชื่อครูเพิ่มเติม (ไม่บังคับ)"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                {(() => {
                  const q = attendeeSearch.trim().toLowerCase();
                  const visible = allTeachers.filter((t) => {
                    if (attendeeGradeFilter !== "ทั้งหมด" && normalizeGradeKey(t.gradeLevel) !== normalizeGradeKey(attendeeGradeFilter)) return false;
                    if (attendeeSubjectFilter !== "ทั้งหมด" && (t.subjectGroup || "") !== attendeeSubjectFilter) return false;
                    return !q || `${t.fullName} ${t.position} ${t.gradeLevel} ${t.subjectGroup}`.toLowerCase().includes(q);
                  });
                  const selected = new Set(editing.attendeeIds || []);
                  const visibleIds = visible.map((t) => t.id);
                  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
                  return (
                    <>
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[11px] font-semibold text-slate-500">พบ {visible.length} คน</span>
                        {visibleIds.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const s = new Set(selected);
                              if (allVisibleSelected) visibleIds.forEach((id) => s.delete(id));
                              else visibleIds.forEach((id) => s.add(id));
                              setAttendees(Array.from(s));
                            }}
                            className="text-[11px] font-bold text-blue-600 hover:text-blue-700"
                          >
                            {allVisibleSelected ? "เอาออกที่แสดงทั้งหมด" : "เลือกที่แสดงทั้งหมด"}
                          </button>
                        )}
                      </div>
                      <div className="max-h-64 overflow-y-auto rounded-2xl border border-slate-200 divide-y divide-slate-100 bg-slate-50/40">
                        {visible.length === 0 ? (
                          <p className="p-4 text-center text-xs text-slate-400 font-medium">
                            ไม่พบรายชื่อครู{allTeachers.length === 0 ? " (ยังไม่มีข้อมูลครูในระบบ)" : ""}
                          </p>
                        ) : (
                          visible.map((t) => {
                            const on = selected.has(t.id);
                            return (
                              <label
                                key={t.id}
                                className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${on ? "bg-blue-50/70" : "hover:bg-white"}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={on}
                                  onChange={() => toggleAttendee(t.id)}
                                  className="w-4 h-4 accent-blue-600 shrink-0"
                                />
                                <span className="min-w-0">
                                  <span className="block text-xs font-bold text-slate-800 truncate">{t.fullName}</span>
                                  <span className="block text-[10px] text-slate-400 font-semibold truncate">
                                    {gradeLabel(t.gradeLevel)} · {t.subjectGroup || "-"}
                                  </span>
                                </span>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </>
                  );
                })()}

                {/* Add a teacher not yet in the roster, into the filtered grade/subject */}
                <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/40 p-3 space-y-2">
                  <p className="text-[11px] font-bold text-slate-700">
                    ไม่มีชื่อครูในรายการ? เพิ่มเข้า{" "}
                    <span className="text-blue-700">
                      {attendeeGradeFilter !== "ทั้งหมด" ? gradeLabel(attendeeGradeFilter) : ""}
                      {attendeeGradeFilter !== "ทั้งหมด" && attendeeSubjectFilter !== "ทั้งหมด" ? " · " : ""}
                      {attendeeSubjectFilter !== "ทั้งหมด" ? attendeeSubjectFilter : ""}
                      {attendeeGradeFilter === "ทั้งหมด" && attendeeSubjectFilter === "ทั้งหมด" ? "(เลือกสายชั้นหรือกลุ่มสาระด้านบนก่อน)" : ""}
                    </span>
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
                    <input
                      value={newTeacherName}
                      onChange={(e) => setNewTeacherName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleAddTeacher(); } }}
                      placeholder="ชื่อ-สกุลครูใหม่ (เช่น นางสาวสมฤดี ใจดี)"
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <input
                      value={newTeacherPosition}
                      onChange={(e) => setNewTeacherPosition(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleAddTeacher(); } }}
                      placeholder="ตำแหน่ง (ไม่บังคับ)"
                      className="w-full sm:w-40 px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => void handleAddTeacher()}
                      disabled={addingTeacher || (attendeeGradeFilter === "ทั้งหมด" && attendeeSubjectFilter === "ทั้งหมด")}
                      className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-extrabold shadow-sm disabled:opacity-40 flex items-center justify-center gap-1.5 shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {addingTeacher ? "กำลังเพิ่ม..." : "เพิ่มครู"}
                    </button>
                  </div>
                  {attendeeMsg && <p className="text-[11px] font-bold text-slate-600">{attendeeMsg}</p>}
                </div>
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
            {projectsLoading && projects.length === 0 && !editing && (
              <div className="glass-panel p-10 text-center rounded-3xl border border-slate-200 bg-white/60">
                <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
                <p className="font-extrabold text-slate-700">กำลังโหลดข้อมูลรอบ/โครงการ...</p>
                <p className="mt-1 text-xs font-medium text-slate-500">ระบบจะแสดงข้อมูลที่บันทึกไว้ทันทีที่พร้อม</p>
              </div>
            )}
            {!projectsLoading && projects.length === 0 && !editing && (
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
                  className={`glass-panel p-5 rounded-3xl border bg-white grid grid-cols-1 lg:grid-cols-[minmax(280px,1fr)_minmax(420px,1.65fr)] lg:items-center gap-5 ${
                    isActive ? "border-emerald-300 ring-2 ring-emerald-500/15" : "border-slate-200"
                  }`}
                >
                  <div className="min-w-0 space-y-2">
                    <div className="flex items-start gap-2 flex-wrap">
                      <h3 className="min-w-0 text-base leading-7 font-extrabold text-slate-900 break-words">{p.name}</h3>
                      {p.status === "closed" ? (
                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-red-50 text-red-600">ปิดรับส่งงาน</span>
                      ) : (
                        <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">เปิดรับส่งงาน</span>
                      )}
                      {isActive && <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-600">รอบเริ่มต้น</span>}
                    </div>
                    <p className="text-xs leading-relaxed text-slate-500 font-medium">
                      ปีงบประมาณ {budgetYearOf(p)} · {p.maxUpload} ชิ้น/คน · ส่งแล้ว {submissionCounts[p.id] || 0} ชิ้น ·{" "}
                      {p.status === "closed" ? "🔴 ปิดรับส่งผลงาน" : "🟢 กำลังเปิดรับส่งผลงาน"} ·{" "}
                      {p.showInGallery === false ? "ซ่อนจากคลังผลงาน" : "แสดงในคลังผลงาน"}
                    </p>
                  </div>

                  <div className="min-w-0 space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
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

                    {/* Show / hide this round in the public คลังผลงานครู dropdown */}
                    <button
                      onClick={() => toggleGalleryVisible(p)}
                      title={p.showInGallery === false ? "ซ่อนอยู่ — แตะเพื่อแสดงในคลังผลงาน" : "แสดงอยู่ — แตะเพื่อซ่อนจากคลังผลงาน"}
                      className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
                        p.showInGallery === false
                          ? "bg-slate-100 text-slate-400 hover:bg-slate-200"
                          : "bg-blue-50 text-blue-600 hover:bg-blue-100"
                      }`}
                    >
                      {p.showInGallery === false ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      <span>{p.showInGallery === false ? "คลัง: ปิด" : "คลัง: เปิด"}</span>
                    </button>

                    <button
                      onClick={() => toggleSubmissionOpen(p)}
                      title={p.status === "closed" ? "แตะเพื่อเปิดรับส่งงานรอบนี้" : "แตะเพื่อปิดรับส่งงานรอบนี้"}
                      className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
                        p.status === "closed"
                          ? "bg-slate-100 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"
                          : "bg-emerald-50 text-emerald-700 hover:bg-red-50 hover:text-red-600"
                      }`}
                    >
                      {p.status === "closed" ? <ToggleLeft className="w-4 h-4" /> : <ToggleRight className="w-4 h-4" />}
                      <span>{p.status === "closed" ? "ส่งงาน: ปิด" : "ส่งงาน: เปิด"}</span>
                    </button>

                    <button
                      onClick={() => toggleCertificateEnabled(p)}
                      title={p.certificate?.enabled ? "แตะเพื่อปิดระบบเกียรติบัตรรอบนี้" : "แตะเพื่อเปิดระบบเกียรติบัตรรอบนี้"}
                      className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
                        p.certificate?.enabled
                          ? "bg-amber-50 text-amber-700 hover:bg-slate-100 hover:text-slate-500"
                          : "bg-slate-100 text-slate-500 hover:bg-amber-50 hover:text-amber-700"
                      }`}
                    >
                      <Award className="w-3.5 h-3.5" />
                      <span>{p.certificate?.enabled ? "เกียรติบัตร: เปิด" : "เกียรติบัตร: ปิด"}</span>
                    </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    {!isActive && p.status !== "closed" && (
                      <button
                        onClick={() => handleSetActive(p.id)}
                        className="px-3.5 py-2 rounded-xl bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 hover:bg-emerald-600 transition-colors"
                      >
                        <Star className="w-3.5 h-3.5" />
                        <span>ตั้งเป็นรอบเริ่มต้น</span>
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
                      disabled={saving}
                      className="px-3 py-2 rounded-xl text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title={`ลบโครงการพร้อมผลงาน ${submissionCounts[p.id] || 0} รายการ`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    </div>
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
