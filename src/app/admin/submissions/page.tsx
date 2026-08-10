"use client";

import { useEffect, useState, useMemo } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AdminSidebar from "@/components/AdminSidebar";
import SubmissionModal from "@/components/SubmissionModal";
import RevisionModal from "@/components/RevisionModal";
import { 
  getSubmissions, 
  deleteSubmission, 
  updateSubmission, 
  getInstantSubmissions, 
  DEFAULT_GRADE_LEVELS, 
  DEFAULT_SUBJECT_GROUPS 
} from "@/lib/submission-service";
import { getGradeLevels, getSubjectGroups } from "@/lib/masters-service";
import { getProjects } from "@/lib/projects-service";
import { Submission, GradeLevelOption, SubjectGroupOption, Project } from "@/lib/types";
import { 
  Search, 
  Trash2, 
  Eye, 
  FileText, 
  SlidersHorizontal, 
  Download,
  Building,
  GraduationCap,
  Calendar,
  Edit,
  X,
  Save,
  HardDrive,
  History
} from "lucide-react";
import { isGoogleDriveLink, extractGoogleDriveFileId } from "@/lib/google-drive-utils";
import { displayWorkTitle, shortSubject } from "@/lib/format";

export default function AdminSubmissionsPage() {
  // Instant synchronous state initialization (0ms latency!)
  const [submissions, setSubmissions] = useState<Submission[]>(() => getInstantSubmissions());
  const [gradeLevels, setGradeLevels] = useState<GradeLevelOption[]>(DEFAULT_GRADE_LEVELS);
  const [subjectGroups, setSubjectGroups] = useState<SubjectGroupOption[]>(DEFAULT_SUBJECT_GROUPS);
  const [projects, setProjects] = useState<Project[]>([]);

  // Search & Filter
  const [search, setSearch] = useState("");
  const [selectedGrade, setSelectedGrade] = useState("ทั้งหมด");
  const [selectedSubject, setSelectedSubject] = useState("ทั้งหมด");
  const [selectedKind, setSelectedKind] = useState<"all" | "training" | "project">("all");
  const [selectedProjectId, setSelectedProjectId] = useState("all");

  // Selected Submission Modal for viewing
  const [activeSubmission, setActiveSubmission] = useState<Submission | null>(null);

  // Version-history modal (Drive files only)
  const [versionsFor, setVersionsFor] = useState<Submission | null>(null);

  // Editing Modal
  const [editingSubmission, setEditingSubmission] = useState<Submission | null>(null);
  const [editForm, setEditForm] = useState<Partial<Submission>>({});

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [subs, gls, sgs, projectData] = await Promise.all([
      getSubmissions({ ignoreProjectFilter: true }),
      getGradeLevels(),
      getSubjectGroups(),
      getProjects(),
    ]);

    if (subs && subs.length > 0) setSubmissions(subs);
    if (gls && gls.length > 0) setGradeLevels(gls);
    if (sgs && sgs.length > 0) setSubjectGroups(sgs);
    setProjects(projectData);
  }

  const handleDelete = async (sub: Submission) => {
    if (confirm(`คุณต้องการลบผลงาน "${sub.projectTitle}" ของ ${sub.fullName} ใช่หรือไม่?\n\n(ไฟล์และข้อมูลผลงานทั้งหมดจะถูกลบออกจากระบบและคลาวด์ไดร์ฟอย่างสมบูรณ์)`)) {
      await deleteSubmission(sub.id);
      loadData();
    }
  };

  const handleStartEdit = (sub: Submission) => {
    setEditingSubmission(sub);
    setEditForm({ ...sub });
  };

  const handleSaveEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubmission) return;

    await updateSubmission(editingSubmission.id, editForm);

    setEditingSubmission(null);
    loadData();
  };

  // High-Speed Instant In-Memory Filter with useMemo (0ms latency!)
  const filteredSubmissions = useMemo(() => {
    const searchKey = search.trim().toLowerCase();
    return submissions.filter((sub) => {
      const matchesSearch = searchKey === "" || [
        sub.fullName,
        sub.projectTitle,
        sub.school,
        sub.position,
        sub.gradeLevel,
        sub.subjectGroup,
        sub.province || "",
        sub.description || "",
      ].join(" ").toLowerCase().includes(searchKey);

      const matchesGrade = selectedGrade === "ทั้งหมด" || sub.gradeLevel === selectedGrade;
      const matchesSubject = selectedSubject === "ทั้งหมด" || sub.subjectGroup === selectedSubject;
      const relatedProject = projects.find((project) => project.id === sub.projectId);
      const projectKind = relatedProject?.kind || "project";
      const matchesKind = selectedKind === "all" || projectKind === selectedKind;
      const matchesProject = selectedProjectId === "all" || sub.projectId === selectedProjectId;

      return matchesSearch && matchesGrade && matchesSubject && matchesKind && matchesProject;
    });
  }, [submissions, search, selectedGrade, selectedSubject, selectedKind, selectedProjectId, projects]);

  const projectsForKind = selectedKind === "all"
    ? projects
    : projects.filter((project) => project.kind === selectedKind);

  const kindCounts = useMemo(() => {
    const projectKinds = new Map(projects.map((project) => [project.id, project.kind || "project"]));
    let training = 0;
    let project = 0;
    for (const submission of submissions) {
      if (projectKinds.get(submission.projectId || "") === "training") training += 1;
      else project += 1;
    }
    return { all: submissions.length, training, project };
  }, [projects, submissions]);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <div className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 flex flex-col md:flex-row gap-6">
        <AdminSidebar />

        <main className="flex-1 space-y-6">
          <div className="glass-panel p-6 rounded-3xl border border-white bg-white shadow-xs space-y-1">
            <h1 className="text-2xl font-extrabold text-slate-900">
              จัดการรายการผลงานทั้งหมด ({filteredSubmissions.length} รายการ)
            </h1>
            <p className="text-xs font-semibold text-slate-500">
              ค้นหา ตรวจสอบ แก้ไขข้อมูล และลบรายการผลงานพร้อมไฟล์ในระบบและไดร์ฟทั้งหมด
            </p>
          </div>

          {/* Filter & Multi-Field Search Bar */}
          <div className="glass-panel p-4 sm:p-6 rounded-3xl border border-white space-y-4 shadow-xs bg-white">
            <div className="flex flex-wrap items-center gap-2 pb-4 border-b border-slate-100">
              {([
                { key: "all", label: "ทั้งหมด", count: kindCounts.all },
                { key: "training", label: "การอบรม", count: kindCounts.training },
                { key: "project", label: "โครงการ", count: kindCounts.project },
              ] as const).map((item) => (
                <button
                  key={item.key}
                  onClick={() => { setSelectedKind(item.key); setSelectedProjectId("all"); }}
                  className={`px-4 py-2.5 rounded-xl text-xs font-extrabold transition-colors ${selectedKind === item.key ? "bg-blue-600 text-white shadow-md shadow-blue-500/20" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                >
                  {item.label} ({item.count})
                </button>
              ))}
            </div>
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              {/* Comprehensive Multi-Field Search Input */}
              <div className="relative w-full md:w-96">
                <Search className="w-4 h-4 absolute left-4 top-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="ค้นหาชื่อครู, ผลงาน, โรงเรียน, กลุ่มสาระ, สายชั้น..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50/50 text-slate-900 font-semibold text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
                />
              </div>

              {/* Select Filter Dropdowns */}
              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <SlidersHorizontal className="w-4 h-4 text-blue-600" />
                  <span>ตัวกรอง:</span>
                </div>

                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="px-3.5 py-2 rounded-xl border border-blue-200 bg-blue-50 text-blue-800 text-xs font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none max-w-[280px]"
                >
                  <option value="all">ทุกรอบในประเภทที่เลือก</option>
                  {projectsForKind.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.kind === "training" ? "การอบรม" : "โครงการ"} · {project.name}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedGrade}
                  onChange={(e) => setSelectedGrade(e.target.value)}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="ทั้งหมด">ทุกสายชั้น (อ.1 - ป.6)</option>
                  {gradeLevels.map((gl) => (
                    <option key={gl.id} value={gl.name}>
                      {gl.name}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none max-w-xs"
                >
                  <option value="ทั้งหมด">ทุกกลุ่มสาระ</option>
                  {subjectGroups.map((sg) => (
                    <option key={sg.id} value={sg.name}>
                      {sg.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Submissions Table */}
          <div className="glass-panel rounded-3xl border border-white overflow-hidden bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-extrabold">
                    <th className="py-4 px-4">ชื่อ-สกุล / ตำแหน่ง / โรงเรียน</th>
                    <th className="py-4 px-4">หัวข้อผลงาน</th>
                    <th className="py-4 px-4">สายชั้น / กลุ่มสาระ</th>
                    <th className="py-4 px-4">วันที่ส่ง</th>
                    <th className="py-4 px-4 text-right">การจัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-800">
                  {filteredSubmissions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400 font-medium">
                        ไม่พบรายการผลงานตามเงื่อนไข
                      </td>
                    </tr>
                  ) : (
                    filteredSubmissions.map((sub) => {
                      const isDrive = sub.fileType === "drive" || isGoogleDriveLink(sub.fileURL);
                      return (
                        <tr key={sub.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-4 px-4 space-y-0.5">
                            <div className="font-extrabold text-slate-900">{sub.fullName}</div>
                            <div className="text-[11px] text-slate-500">{sub.position}</div>
                            <div className="text-[11px] text-blue-600 font-semibold">{sub.school}</div>
                          </td>

                          <td className="py-4 px-4 space-y-1 max-w-xs">
                            <div className="font-extrabold text-slate-900 line-clamp-2">{displayWorkTitle(sub.projectTitle)}</div>
                            {sub.projectName && <div className="text-[10px] text-slate-400 line-clamp-1">{sub.projectName}</div>}
                            <div className="flex items-center gap-1.5">
                              {isDrive ? (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-100 text-emerald-700 flex items-center gap-1">
                                  <HardDrive className="w-3 h-3" />
                                  <span>GOOGLE DRIVE</span>
                                </span>
                              ) : (
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${
                                  sub.fileType === "pdf" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                                }`}>
                                  {sub.fileType.toUpperCase()}
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-4 px-4 space-y-1">
                            <div className="inline-block px-2.5 py-0.5 rounded-lg bg-blue-50 text-blue-700 font-bold">
                              ครูสายชั้น{sub.gradeLevel}
                            </div>
                            <div className="text-[11px] text-slate-500 font-medium line-clamp-1">
                              {shortSubject(sub.subjectGroup)}
                            </div>
                          </td>

                          <td className="py-4 px-4 text-slate-500 text-[11px]">
                            {sub.uploadDate}
                          </td>

                          <td className="py-4 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => setActiveSubmission(sub)}
                                className="p-2 rounded-xl text-blue-600 hover:bg-blue-50 transition-colors"
                                title="ดูรายละเอียด"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              {(sub.driveFileId || isDrive) && (
                                <button
                                  onClick={() => setVersionsFor(sub)}
                                  className="p-2 rounded-xl text-violet-600 hover:bg-violet-50 transition-colors"
                                  title="ประวัติเวอร์ชัน / กู้คืน"
                                >
                                  <History className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => handleStartEdit(sub)}
                                className="p-2 rounded-xl text-amber-600 hover:bg-amber-50 transition-colors"
                                title="แก้ไขข้อมูล"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <a
                                href={sub.fileURL}
                                target="_blank"
                                rel="noreferrer"
                                className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
                                title="ดาวน์โหลด/เปิดไฟล์"
                              >
                                <Download className="w-4 h-4" />
                              </a>
                              <button
                                onClick={() => handleDelete(sub)}
                                className="p-2 rounded-xl text-red-500 hover:bg-red-50 transition-colors"
                                title="ลบรายการ"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      <Footer />

      {/* Submission Detail Modal */}
      {activeSubmission && (
        <SubmissionModal
          submission={activeSubmission}
          onClose={() => setActiveSubmission(null)}
        />
      )}

      {/* Version History Modal */}
      {versionsFor && (
        <RevisionModal
          fileId={versionsFor.driveFileId || extractGoogleDriveFileId(versionsFor.fileURL) || ""}
          title={versionsFor.projectTitle}
          fileURL={versionsFor.fileURL}
          onClose={() => setVersionsFor(null)}
        />
      )}

      {/* Full Edit Submission Modal */}
      {editingSubmission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-lg glass-panel p-6 sm:p-8 rounded-3xl border border-white bg-white shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-extrabold text-lg text-slate-900 flex items-center gap-2">
                <Edit className="w-5 h-5 text-blue-600" />
                <span>แก้ไขข้อมูลผลงาน ({editingSubmission.id})</span>
              </h3>
              <button
                onClick={() => setEditingSubmission(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800">
                  ชื่อ-สกุล <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editForm.fullName || ""}
                  onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-800">ตำแหน่ง</label>
                  <input
                    type="text"
                    value={editForm.position || ""}
                    onChange={(e) => setEditForm({ ...editForm, position: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-xs font-semibold focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-800">โรงเรียน</label>
                  <input
                    type="text"
                    value={editForm.school || ""}
                    onChange={(e) => setEditForm({ ...editForm, school: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-xs font-semibold focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-800">ครูประจำสายชั้น</label>
                  <select
                    value={editForm.gradeLevel || ""}
                    onChange={(e) => setEditForm({ ...editForm, gradeLevel: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-xs font-semibold focus:ring-2 focus:ring-blue-500"
                  >
                    {gradeLevels.map((gl) => (
                      <option key={gl.id} value={gl.name}>
                        {gl.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-800">กลุ่มสาระการเรียนรู้</label>
                  <select
                    value={editForm.subjectGroup || ""}
                    onChange={(e) => setEditForm({ ...editForm, subjectGroup: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-xs font-semibold focus:ring-2 focus:ring-blue-500"
                  >
                    {subjectGroups.map((sg) => (
                      <option key={sg.id} value={sg.name}>
                        {sg.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800">ชื่อผลงาน</label>
                <input
                  type="text"
                  required
                  value={editForm.projectTitle || ""}
                  onChange={(e) => setEditForm({ ...editForm, projectTitle: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-xs font-semibold focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800">รายละเอียดผลงาน</label>
                <textarea
                  rows={3}
                  value={editForm.description || ""}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-xs font-semibold focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingSubmission(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs hover:bg-slate-200"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-xl ios-gradient-blue text-white font-extrabold text-xs shadow-md shadow-blue-500/20 flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>บันทึกการแก้ไข</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
