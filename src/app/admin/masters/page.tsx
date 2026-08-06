"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AdminSidebar from "@/components/AdminSidebar";
import { 
  getGradeLevels, 
  saveGradeLevel, 
  deleteGradeLevel, 
  getSubjectGroups, 
  saveSubjectGroup, 
  deleteSubjectGroup 
} from "@/lib/masters-service";
import { DEFAULT_GRADE_LEVELS, DEFAULT_SUBJECT_GROUPS } from "@/lib/submission-service";
import { getTeachers, saveTeacher, deleteTeacher, TeacherItem } from "@/lib/teachers-service";
import { GradeLevelOption, SubjectGroupOption } from "@/lib/types";
import { Layers, BookOpen, Plus, Trash2, Edit2, Save, X, UserCheck, Search, Users } from "lucide-react";

export default function AdminMastersPage() {
  const router = useRouter();

  // Active Tab: 'teachers' | 'grades' | 'subjects'
  const [activeTab, setActiveTab] = useState<'teachers' | 'grades' | 'subjects'>('teachers');

  // Master lists initialized with default values for 0ms instant display!
  const [gradeLevels, setGradeLevels] = useState<GradeLevelOption[]>(DEFAULT_GRADE_LEVELS);
  const [subjectGroups, setSubjectGroups] = useState<SubjectGroupOption[]>(DEFAULT_SUBJECT_GROUPS);
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);

  // Teacher Filter & Form States
  const [teacherSearch, setTeacherSearch] = useState("");
  const [selectedGradeFilter, setSelectedGradeFilter] = useState("ทั้งหมด");
  const [editingTeacher, setEditingTeacher] = useState<TeacherItem | null>(null);
  const [showAddTeacherModal, setShowAddTeacherModal] = useState(false);

  // New Teacher Form State
  const [teacherForm, setTeacherForm] = useState({
    fullName: "",
    position: "ครูวิทยฐานะชำนาญการ",
    gradeLevel: "ป.1",
    subjectGroup: "กลุ่มสาระการเรียนรู้ภาษาไทย",
  });

  // Grade Form State
  const [newGradeName, setNewGradeName] = useState("");
  const [editingGrade, setEditingGrade] = useState<GradeLevelOption | null>(null);

  // Subject Form State
  const [newSubjectName, setNewSubjectName] = useState("");
  const [editingSubject, setEditingSubject] = useState<SubjectGroupOption | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const session = localStorage.getItem("admin_session");
      if (!session) {
        router.push("/admin/login");
        return;
      }
    }

    loadAllMasters();
  }, [router]);

  async function loadAllMasters() {
    const [gls, sgs, ts] = await Promise.all([
      getGradeLevels(),
      getSubjectGroups(),
      getTeachers(),
    ]);

    setGradeLevels(gls);
    setSubjectGroups(sgs);
    setTeachers(ts);

    if (gls.length > 0) {
      setTeacherForm((prev) => ({ ...prev, gradeLevel: gls[0].name }));
    }
    if (sgs.length > 0) {
      setTeacherForm((prev) => ({ ...prev, subjectGroup: sgs[0].name }));
    }
  }

  // Instant In-Memory Filter with useMemo (0ms latency for Admin Teachers List!)
  const filteredTeachers = useMemo(() => {
    const searchKey = teacherSearch.trim().toLowerCase();
    return teachers.filter((t) => {
      const matchesSearch = searchKey === "" || t.fullName.toLowerCase().includes(searchKey) || t.position.toLowerCase().includes(searchKey);
      const matchesGrade = selectedGradeFilter === "ทั้งหมด" || t.gradeLevel === selectedGradeFilter;
      return matchesSearch && matchesGrade;
    });
  }, [teachers, teacherSearch, selectedGradeFilter]);

  // --- Teacher Actions ---
  const handleSaveTeacherSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherForm.fullName.trim()) return;

    if (editingTeacher) {
      await saveTeacher({ ...teacherForm, id: editingTeacher.id });
    } else {
      await saveTeacher(teacherForm);
    }

    setTeacherForm({
      fullName: "",
      position: "ครูวิทยฐานะชำนาญการ",
      gradeLevel: gradeLevels[0]?.name || "ป.1",
      subjectGroup: subjectGroups[0]?.name || "กลุ่มสาระการเรียนรู้ภาษาไทย",
    });
    setEditingTeacher(null);
    setShowAddTeacherModal(false);
    loadAllMasters();
  };

  const handleDeleteTeacherClick = async (id: string) => {
    if (confirm("คุณต้องการลบรายชื่อครูท่านนี้ใช่หรือไม่?")) {
      await deleteTeacher(id);
      loadAllMasters();
    }
  };

  const handleStartEditTeacher = (t: TeacherItem) => {
    setEditingTeacher(t);
    setTeacherForm({
      fullName: t.fullName,
      position: t.position,
      gradeLevel: t.gradeLevel,
      subjectGroup: t.subjectGroup,
    });
    setShowAddTeacherModal(true);
  };

  // --- Grade Level Actions ---
  const handleAddGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGradeName.trim()) return;
    const newId = String(Date.now());
    const maxOrder = gradeLevels.reduce((max, item) => Math.max(max, item.order), 0);
    await saveGradeLevel({ id: newId, name: newGradeName.trim(), order: maxOrder + 1 });
    setNewGradeName("");
    loadAllMasters();
  };

  const handleUpdateGrade = async (item: GradeLevelOption) => {
    await saveGradeLevel(item);
    setEditingGrade(null);
    loadAllMasters();
  };

  const handleDeleteGrade = async (id: string) => {
    if (confirm("คุณต้องการลบสายชั้นนี้ใช่หรือไม่?")) {
      await deleteGradeLevel(id);
      loadAllMasters();
    }
  };

  // --- Subject Group Actions ---
  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubjectName.trim()) return;
    const newId = String(Date.now());
    const maxOrder = subjectGroups.reduce((max, item) => Math.max(max, item.order), 0);
    await saveSubjectGroup({ id: newId, name: newSubjectName.trim(), order: maxOrder + 1 });
    setNewSubjectName("");
    loadAllMasters();
  };

  const handleUpdateSubject = async (item: SubjectGroupOption) => {
    await saveSubjectGroup(item);
    setEditingSubject(null);
    loadAllMasters();
  };

  const handleDeleteSubject = async (id: string) => {
    if (confirm("คุณต้องการลบกลุ่มสาระนี้ใช่หรือไม่?")) {
      await deleteSubjectGroup(id);
      loadAllMasters();
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
              จัดการข้อมูลหลัก และรายชื่อครูในสายชั้นต่างๆ
            </h1>
            <p className="text-xs font-semibold text-slate-500">
              เพิ่ม/แก้ไขรายชื่อครูตามสายชั้น (อ.1 - ป.6) จัดการสายชั้นเรียน และกลุ่มสาระการเรียนรู้ (ตอบสนองรวดเร็ว 0ms)
            </p>
          </div>

          <div className="flex items-center gap-2 bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200/60 max-w-fit">
            <button
              onClick={() => setActiveTab('teachers')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold transition-all ${
                activeTab === 'teachers'
                  ? "ios-gradient-blue text-white shadow-md shadow-blue-500/20"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Users className="w-4 h-4" />
              <span>รายชื่อครูในสายชั้น ({teachers.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('grades')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold transition-all ${
                activeTab === 'grades'
                  ? "ios-gradient-blue text-white shadow-md shadow-blue-500/20"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>ตัวเลือกสายชั้นเรียน ({gradeLevels.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('subjects')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold transition-all ${
                activeTab === 'subjects'
                  ? "ios-gradient-blue text-white shadow-md shadow-blue-500/20"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>กลุ่มสาระการเรียนรู้ ({subjectGroups.length})</span>
            </button>
          </div>

          {activeTab === 'teachers' && (
            <div className="space-y-6 animate-in fade-in">
              <div className="glass-panel p-6 rounded-3xl border border-white bg-white shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div className="space-y-1">
                    <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                      <Users className="w-5 h-5 text-blue-600" />
                      <span>รายชื่อครูจำแนกตามสายชั้น (อนุบาล อ.1 - อ.3 ถึง ประถมศึกษา ป.1 - ป.6)</span>
                    </h2>
                    <p className="text-xs text-slate-500 font-medium">
                      แอดมินสามารถเพิ่มและจัดการรายชื่อครูแต่ละสายชั้นเพื่ออำนวยความสะดวกในการกรอกส่งผลงาน
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setEditingTeacher(null);
                      setTeacherForm({
                        fullName: "",
                        position: "ครูวิทยฐานะชำนาญการ",
                        gradeLevel: gradeLevels[0]?.name || "ป.1",
                        subjectGroup: subjectGroups[0]?.name || "กลุ่มสาระการเรียนรู้ภาษาไทย",
                      });
                      setShowAddTeacherModal(true);
                    }}
                    className="px-5 py-2.5 rounded-2xl ios-gradient-blue text-white font-extrabold text-xs shadow-md shadow-blue-500/20 flex items-center gap-2 hover:scale-105 transition-all shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>เพิ่มรายชื่อครูใหม่</span>
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="relative w-full sm:w-80">
                    <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                    <input
                      type="text"
                      placeholder="ค้นหาชื่อครู หรือ ตำแหน่ง..."
                      value={teacherSearch}
                      onChange={(e) => setTeacherSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <span className="text-xs font-bold text-slate-600 shrink-0">กรองสายชั้น:</span>
                    <select
                      value={selectedGradeFilter}
                      onChange={(e) => setSelectedGradeFilter(e.target.value)}
                      className="px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-xs font-semibold focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="ทั้งหมด">ทุกสายชั้น (อ.1 - ป.6)</option>
                      {gradeLevels.map((gl) => (
                        <option key={gl.id} value={gl.name}>
                          {gl.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-extrabold">
                        <th className="py-3 px-4">ชื่อ-สกุล ครู</th>
                        <th className="py-3 px-4">ตำแหน่ง</th>
                        <th className="py-3 px-4">ครูสายชั้น</th>
                        <th className="py-3 px-4">กลุ่มสาระการเรียนรู้</th>
                        <th className="py-3 px-4 text-right">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold text-slate-800">
                      {filteredTeachers.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400 font-medium">
                            ไม่พบรายชื่อครูในสายชั้นที่เลือก
                          </td>
                        </tr>
                      ) : (
                        filteredTeachers.map((t) => (
                          <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3 px-4 font-bold text-slate-900">{t.fullName}</td>
                            <td className="py-3 px-4 text-slate-600">{t.position}</td>
                            <td className="py-3 px-4">
                              <span className="px-2.5 py-1 rounded-lg bg-blue-100 text-blue-700 font-bold">
                                {t.gradeLevel}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-slate-600">{t.subjectGroup}</td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleStartEditTeacher(t)}
                                  className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                                  title="แก้ไข"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteTeacherClick(t.id)}
                                  className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                                  title="ลบ"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'grades' && (
            <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-white space-y-6 shadow-xs bg-white animate-in fade-in">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-blue-600" />
                  <h2 className="font-extrabold text-base text-slate-900">
                    จัดการรายการสายชั้นเรียน (อ.1 - อ.3 ถึง ป.1 - ป.6)
                  </h2>
                </div>
              </div>

              <form onSubmit={handleAddGrade} className="flex gap-3">
                <input
                  type="text"
                  placeholder="เช่น อ.1, อ.2, อ.3, ป.1, ป.2..."
                  value={newGradeName}
                  onChange={(e) => setNewGradeName(e.target.value)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
                />
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl ios-gradient-blue text-white font-extrabold text-xs shadow-md shadow-blue-500/20 flex items-center gap-1.5 hover:scale-105 transition-all shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>เพิ่มสายชั้น</span>
                </button>
              </form>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {gradeLevels.map((gl) => (
                  <div
                    key={gl.id}
                    className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/50 flex items-center justify-between gap-2"
                  >
                    {editingGrade?.id === gl.id ? (
                      <div className="flex items-center gap-2 w-full">
                        <input
                          type="text"
                          value={editingGrade.name}
                          onChange={(e) => setEditingGrade({ ...editingGrade, name: e.target.value })}
                          className="flex-1 px-3 py-1.5 rounded-lg border border-blue-400 bg-white text-xs font-bold text-slate-900"
                        />
                        <button
                          onClick={() => handleUpdateGrade(editingGrade)}
                          className="p-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600"
                        >
                          <Save className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="font-extrabold text-xs text-slate-800">
                          {gl.name}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setEditingGrade(gl)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteGrade(gl.id)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'subjects' && (
            <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-white space-y-6 shadow-xs bg-white animate-in fade-in">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-blue-600" />
                  <h2 className="font-extrabold text-base text-slate-900">
                    จัดการกลุ่มสาระการเรียนรู้ (8 กลุ่มสาระ + ปฐมวัย)
                  </h2>
                </div>
              </div>

              <form onSubmit={handleAddSubject} className="flex gap-3">
                <input
                  type="text"
                  placeholder="เช่น กลุ่มสาระการเรียนรู้ภาษาไทย..."
                  value={newSubjectName}
                  onChange={(e) => setNewSubjectName(e.target.value)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
                />
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl ios-gradient-blue text-white font-extrabold text-xs shadow-md shadow-blue-500/20 flex items-center gap-1.5 hover:scale-105 transition-all shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>เพิ่มกลุ่มสาระ</span>
                </button>
              </form>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {subjectGroups.map((sg) => (
                  <div
                    key={sg.id}
                    className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/50 flex items-center justify-between gap-2"
                  >
                    {editingSubject?.id === sg.id ? (
                      <div className="flex items-center gap-2 w-full">
                        <input
                          type="text"
                          value={editingSubject.name}
                          onChange={(e) => setEditingSubject({ ...editingSubject, name: e.target.value })}
                          className="flex-1 px-3 py-1.5 rounded-lg border border-blue-400 bg-white text-xs font-bold text-slate-900"
                        />
                        <button
                          onClick={() => handleUpdateSubject(editingSubject)}
                          className="p-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600"
                        >
                          <Save className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="font-bold text-xs text-slate-800">
                          {sg.name}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setEditingSubject(sg)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteSubject(sg.id)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      <Footer />

      {/* Add / Edit Teacher Modal */}
      {showAddTeacherModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-md glass-panel p-6 rounded-3xl border border-white bg-white shadow-2xl space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                <span>{editingTeacher ? "แก้ไขข้อมูลครู" : "เพิ่มรายชื่อครูในสายชั้น"}</span>
              </h3>
              <button
                onClick={() => setShowAddTeacherModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTeacherSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800">
                  ชื่อ-สกุล ครู <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="เช่น ครูสมชาย ใจดี"
                  value={teacherForm.fullName}
                  onChange={(e) => setTeacherForm({ ...teacherForm, fullName: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800">
                  ตำแหน่ง <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="เช่น ครูวิทยฐานะชำนาญการ / ครูผู้ช่วย"
                  value={teacherForm.position}
                  onChange={(e) => setTeacherForm({ ...teacherForm, position: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800">
                  ครูประจำสายชั้น <span className="text-red-500">*</span>
                </label>
                <select
                  value={teacherForm.gradeLevel}
                  onChange={(e) => setTeacherForm({ ...teacherForm, gradeLevel: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
                >
                  {gradeLevels.map((gl) => (
                    <option key={gl.id} value={gl.name}>
                      {gl.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800">
                  กลุ่มสาระการเรียนรู้ <span className="text-red-500">*</span>
                </label>
                <select
                  value={teacherForm.subjectGroup}
                  onChange={(e) => setTeacherForm({ ...teacherForm, subjectGroup: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
                >
                  {subjectGroups.map((sg) => (
                    <option key={sg.id} value={sg.name}>
                      {sg.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddTeacherModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs hover:bg-slate-200"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-xl ios-gradient-blue text-white font-extrabold text-xs shadow-md shadow-blue-500/20"
                >
                  {editingTeacher ? "บันทึกการแก้ไข" : "เพิ่มรายชื่อครู"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
