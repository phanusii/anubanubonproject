"use client";

import { useEffect, useState, useMemo } from "react";
import type { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AdminSidebar from "@/components/AdminSidebar";
import SubmissionModal from "@/components/SubmissionModal";
import RevisionModal from "@/components/RevisionModal";
import {
  deleteSubmission,
  updateSubmission,
  getGallerySubmissions,
  getUserProjectSubmissions,
  rebuildGallerySnapshot,
  DEFAULT_GRADE_LEVELS,
  DEFAULT_SUBJECT_GROUPS
} from "@/lib/submission-service";
import { getGradeLevels, getSubjectGroups } from "@/lib/masters-service";
import { getProjects } from "@/lib/projects-service";
import { getProjectParticipantPage, searchProjectParticipants } from "@/lib/project-participant-service";
import { AdminSubmissionSummary, ProjectParticipantSummary, Submission, GradeLevelOption, SubjectGroupOption, Project } from "@/lib/types";
import { 
  Search, 
  Trash2, 
  Eye, 
  SlidersHorizontal, 
  Download,
  Edit,
  X,
  Save,
  HardDrive,
  History,
  UserRound,
  CalendarClock,
  FolderKanban,
  ChevronDown,
  ChevronRight,
  Loader2,
  Wrench
} from "lucide-react";
import { isGoogleDriveLink, extractGoogleDriveFileId } from "@/lib/google-drive-utils";
import { checkDriveLinkPublic } from "@/lib/certificate-service";
import { displayWorkTitle, shortSubject } from "@/lib/format";

const ADMIN_PAGE_SIZE = 20;

function participantToAdminSummary(item: ProjectParticipantSummary): AdminSubmissionSummary {
  return {
    key: item.participantKey || item.id,
    projectId: item.projectId,
    fullName: item.fullName,
    teacherId: item.teacherId,
    position: item.position || "",
    school: item.school || "",
    gradeLevel: item.gradeLevel || "",
    subjectGroup: item.subjectGroup || "",
    submissionIds: item.submissionIds || [],
    submittedCount: item.submittedCount || item.submissionIds?.length || 0,
    latestCreatedAt: item.latestCreatedAt || 0,
    latestUploadDate: item.latestUploadDate || "",
  };
}

export default function AdminSubmissionsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [summaries, setSummaries] = useState<AdminSubmissionSummary[]>([]);
  const [loadedTeachers, setLoadedTeachers] = useState<Set<string>>(new Set());
  const [loadingTeachers, setLoadingTeachers] = useState<Set<string>>(new Set());
  const [gradeLevels, setGradeLevels] = useState<GradeLevelOption[]>(DEFAULT_GRADE_LEVELS);
  const [subjectGroups, setSubjectGroups] = useState<SubjectGroupOption[]>(DEFAULT_SUBJECT_GROUPS);
  const [projects, setProjects] = useState<Project[]>([]);

  // Search & Filter
  const [search, setSearch] = useState("");
  const [selectedGrade, setSelectedGrade] = useState("ทั้งหมด");
  const [selectedSubject, setSelectedSubject] = useState("ทั้งหมด");
  const [selectedKind, setSelectedKind] = useState<"" | "training" | "project">("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [expandedTeachers, setExpandedTeachers] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageCursors, setPageCursors] = useState<Array<QueryDocumentSnapshot<DocumentData> | null>>([null]);
  const [hasNextPage, setHasNextPage] = useState(false);

  // Selected Submission Modal for viewing
  const [activeSubmission, setActiveSubmission] = useState<Submission | null>(null);

  // Version-history modal (Drive files only)
  const [versionsFor, setVersionsFor] = useState<Submission | null>(null);

  // Editing Modal
  const [editingSubmission, setEditingSubmission] = useState<Submission | null>(null);
  const [editForm, setEditForm] = useState<Partial<Submission>>({});

  // Non-public Drive-link scanner (find works whose pasted Drive link isn't shared publicly)
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState("");
  const [nonPublicSubs, setNonPublicSubs] = useState<Submission[] | null>(null);

  // Bulk selection / deletion
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });

  useEffect(() => {
    let cancelled = false;
    Promise.all([getProjects(), getGradeLevels(), getSubjectGroups()]).then(([projectData, gls, sgs]) => {
      if (cancelled) return;
      setProjects(projectData);
      if (gls.length) setGradeLevels(gls);
      if (sgs.length) setSubjectGroups(sgs);
      if (projectData.length) {
        const firstProject = projectData[0];
        setSelectedKind(firstProject.kind || "project");
        setSelectedProjectId(firstProject.id);
      }
    });
    return () => { cancelled = true; };
  }, []);

  async function loadData(
    targetPage = page,
    cursor: QueryDocumentSnapshot<DocumentData> | null = pageCursors[targetPage - 1] || null,
    reset = false,
  ) {
    if (!selectedProjectId) return;
    setLoadingSubmissions(true);
    try {
      const searchValue = search.trim();
      if (searchValue.length >= 2) {
        const found = await searchProjectParticipants({
          projectId: selectedProjectId,
          name: searchValue,
          pageSize: ADMIN_PAGE_SIZE,
        });
        const filtered = found.filter((item) =>
          (selectedGrade === "ทั้งหมด" || item.gradeLevel === selectedGrade) &&
          (selectedSubject === "ทั้งหมด" || item.subjectGroup === selectedSubject),
        );
        setSummaries(filtered.map(participantToAdminSummary));
        setHasNextPage(false);
        setPage(1);
      } else {
        const result = await getProjectParticipantPage({
          projectId: selectedProjectId,
          pageSize: ADMIN_PAGE_SIZE,
          cursor,
          gradeLevel: selectedGrade === "ทั้งหมด" ? undefined : selectedGrade,
          subjectGroup: selectedSubject === "ทั้งหมด" ? undefined : selectedSubject,
        });
        setSummaries(result.items.map(participantToAdminSummary));
        setHasNextPage(result.hasMore);
        setPage(targetPage);
        setPageCursors((previous) => {
          const next = reset ? [null] : [...previous];
          if (result.cursor) next[targetPage] = result.cursor;
          return next;
        });
      }
      setSubmissions([]);
      setLoadedTeachers(new Set());
      setLoadingTeachers(new Set());
      setExpandedTeachers(new Set());
    } catch (error) {
      console.error("Load project participants failed:", error);
      setSummaries([]);
      setHasNextPage(false);
    } finally {
      setLoadingSubmissions(false);
    }
  }

  useEffect(() => {
    if (!selectedProjectId) return;
    const timer = window.setTimeout(() => {
      setSummaries([]);
      setPage(1);
      setPageCursors([null]);
      setSelectedIds(new Set());
      setNonPublicSubs(null);
      setScanMessage("");
      void loadData(1, null, true);
    }, search.trim() ? 300 : 0);
    return () => window.clearTimeout(timer);
    // Loading is intentionally reset whenever the server-side query changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId, selectedGrade, selectedSubject, search]);

  const loadTeacherWorks = async (summary: AdminSubmissionSummary) => {
    if (!selectedProjectId || loadedTeachers.has(summary.key) || loadingTeachers.has(summary.key)) return;
    setLoadingTeachers((previous) => new Set(previous).add(summary.key));
    try {
      const items = await getUserProjectSubmissions(summary.fullName, selectedProjectId);
      setSubmissions((previous) => [
        ...previous.filter((item) => !(item.projectId === selectedProjectId && item.fullName === summary.fullName)),
        ...items,
      ]);
      setLoadedTeachers((previous) => new Set(previous).add(summary.key));
    } finally {
      setLoadingTeachers((previous) => {
        const next = new Set(previous);
        next.delete(summary.key);
        return next;
      });
    }
  };

  const handleDelete = async (sub: Submission) => {
    if (confirm(`คุณต้องการลบผลงาน "${sub.projectTitle}" ของ ${sub.fullName} ใช่หรือไม่?\n\n(ไฟล์และข้อมูลผลงานทั้งหมดจะถูกลบออกจากระบบและคลาวด์ไดร์ฟอย่างสมบูรณ์)`)) {
      await deleteSubmission(sub.id);
      loadData();
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Delete a batch of submissions (files + records) with one confirmation and a
  // progress readout. Used for "delete everything currently filtered" (a whole
  // round / grade / subject) and for "delete the selected people".
  const bulkDelete = async (items: Submission[], label: string) => {
    if (bulkDeleting || items.length === 0) return;
    if (
      !confirm(
        `ยืนยันลบ ${items.length} รายการ${label} ?\n\nไฟล์และข้อมูลทั้งหมดจะถูกลบถาวรจากระบบและ Google Drive — กู้คืนไม่ได้`,
      )
    )
      return;
    setBulkDeleting(true);
    setBulkProgress({ done: 0, total: items.length });
    for (let i = 0; i < items.length; i++) {
      try {
        await deleteSubmission(items[i].id, { skipSnapshotPatch: true });
      } catch {
        /* keep going — report count at the end */
      }
      setBulkProgress({ done: i + 1, total: items.length });
    }
    setSelectedIds(new Set());
    await rebuildGallerySnapshot().catch(() => {});
    setBulkDeleting(false);
    await loadData();
  };

  // Scan every pasted Drive-link submission and keep only those NOT shared publicly
  // (verified server-side, so throttled thumbnails aren't mistaken for private files).
  const scanNonPublicDriveLinks = async () => {
    setScanning(true);
    setNonPublicSubs(null);
    setScanMessage("กำลังตรวจการแชร์ของลิงก์ Google Drive...");
    const roundSubmissions = await getGallerySubmissions(selectedProjectId);
    const links = roundSubmissions.filter((s) => s.fileType === "drive");
    const found: Submission[] = [];
    try {
      for (let i = 0; i < links.length; i += 6) {
        const batch = links.slice(i, i + 6);
        const checks = await Promise.all(
          batch.map(async (sub) => {
            const fid = sub.driveFileId || extractGoogleDriveFileId(sub.fileURL);
            if (!fid) return { sub, isPublic: true };
            const share = await checkDriveLinkPublic(fid);
            return { sub, isPublic: share.isPublic };
          }),
        );
        checks.filter((c) => !c.isPublic).forEach((c) => found.push(c.sub));
        setScanMessage(`กำลังตรวจ... ${Math.min(i + 6, links.length)}/${links.length} ลิงก์`);
      }
      setNonPublicSubs(found);
      setScanMessage(
        found.length === 0
          ? `ตรวจ ${links.length} ลิงก์แล้ว — ทุกลิงก์แชร์สาธารณะเรียบร้อย ✓`
          : `พบ ${found.length} ชิ้นจาก ${new Set(found.map((s) => s.fullName)).size} ท่าน ที่ยังไม่ได้แชร์สาธารณะ`,
      );
    } catch {
      setScanMessage("ตรวจไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setScanning(false);
    }
  };

  const deleteNonPublicSub = async (sub: Submission) => {
    if (!confirm(`ลบผลงาน "${sub.projectTitle}" ของ ${sub.fullName}?\n(ครูจะต้องส่งใหม่โดยแชร์ลิงก์เป็นสาธารณะ)`)) return;
    await deleteSubmission(sub.id);
    setNonPublicSubs((prev) => (prev ? prev.filter((s) => s.id !== sub.id) : prev));
    loadData();
  };

  const deleteAllNonPublic = async () => {
    if (!nonPublicSubs || nonPublicSubs.length === 0) return;
    const people = new Set(nonPublicSubs.map((s) => s.fullName)).size;
    if (!confirm(`ยืนยันลบทั้งหมด ${nonPublicSubs.length} ชิ้น จาก ${people} ท่าน?\n\nงานเหล่านี้เปิดดูไม่ได้ (ยังไม่แชร์สาธารณะ) ครูจะต้องส่งใหม่\nการลบนี้ถาวร`)) return;
    setScanning(true);
    setScanMessage("กำลังลบ...");
    for (const sub of nonPublicSubs) {
      await deleteSubmission(sub.id, { skipSnapshotPatch: true }).catch(() => {});
    }
    await rebuildGallerySnapshot().catch(() => {});
    setScanMessage(`ลบแล้ว ${nonPublicSubs.length} ชิ้น เรียบร้อย`);
    setNonPublicSubs([]);
    setScanning(false);
    loadData();
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
      const matchesKind = selectedKind !== "" && projectKind === selectedKind;
      const matchesProject = selectedProjectId !== "" && sub.projectId === selectedProjectId;

      return matchesSearch && matchesGrade && matchesSubject && matchesKind && matchesProject;
    });
  }, [submissions, search, selectedGrade, selectedSubject, selectedKind, selectedProjectId, projects]);

  const projectsForKind = selectedKind
    ? projects.filter((project) => (project.kind || "project") === selectedKind)
    : [];

  const selectedProject = projects.find((project) => project.id === selectedProjectId);

  const teacherGroups = useMemo(() => {
    const searchKey = search.trim().toLowerCase();
    return summaries
      .filter((summary) => {
        const matchesSearch = !searchKey || [summary.fullName, summary.school, summary.position, summary.gradeLevel, summary.subjectGroup]
          .join(" ").toLowerCase().includes(searchKey);
        const matchesGrade = selectedGrade === "ทั้งหมด" || summary.gradeLevel === selectedGrade;
        const matchesSubject = selectedSubject === "ทั้งหมด" || summary.subjectGroup === selectedSubject;
        return matchesSearch && matchesGrade && matchesSubject;
      })
      .map((summary) => ({
        summary,
        teacher: {
          id: summary.key,
          fullName: summary.fullName,
          position: summary.position,
          school: summary.school,
          gradeLevel: summary.gradeLevel,
          subjectGroup: summary.subjectGroup,
          uploadDate: summary.latestUploadDate,
          createdAt: summary.latestCreatedAt,
        } as Submission,
        items: submissions
          .filter((item) => item.projectId === summary.projectId && item.fullName === summary.fullName)
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
      }));
  }, [summaries, submissions, search, selectedGrade, selectedSubject]);

  const pagedTeacherGroups = teacherGroups;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <div className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 flex flex-col md:flex-row gap-6">
        <AdminSidebar />

        <main className="flex-1 space-y-4 min-w-0">
          <div className="glass-panel p-4 sm:p-5 rounded-3xl border border-white bg-white shadow-xs">
            <div className="flex flex-col xl:flex-row xl:items-center gap-3">
              <div className="mr-auto min-w-0">
                <h1 className="text-xl font-extrabold text-slate-900">จัดการผลงาน</h1>
                <p className="text-xs font-semibold text-slate-500 truncate">
                  {selectedProject?.name || "กำลังโหลดรอบ..."} · หน้านี้ {teacherGroups.length.toLocaleString()} คน · {teacherGroups.reduce((total, group) => total + group.summary.submittedCount, 0).toLocaleString()} ชิ้น
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[150px_minmax(260px,1fr)] gap-2 xl:w-[610px]">
                <select
                  value={selectedKind}
                  onChange={(event) => {
                    const kind = event.target.value as "training" | "project";
                    const first = projects.find((project) => (project.kind || "project") === kind);
                    setSelectedKind(kind);
                    setSelectedProjectId(first?.id || "");
                  }}
                  className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-xs font-extrabold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="training">การอบรม</option>
                  <option value="project">โครงการ</option>
                </select>
                <select
                  value={selectedProjectId}
                  onChange={(event) => setSelectedProjectId(event.target.value)}
                  className="min-w-0 px-3.5 py-2.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-900 text-xs font-extrabold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  {projectsForKind.length === 0 && <option value="">ยังไม่มีรอบในประเภทนี้</option>}
                  {projectsForKind.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          {!selectedProjectId ? (
            <div className="glass-panel rounded-3xl border border-dashed border-blue-200 bg-blue-50/40 p-12 text-center">
              <FolderKanban className="w-10 h-10 mx-auto text-blue-400 mb-3" />
              <p className="font-extrabold text-slate-700">เลือกรอบด้านบนก่อนแสดงรายชื่อครูและผลงาน</p>
              <p className="text-xs text-slate-500 mt-1">ยังไม่มีข้อมูลใดถูกเลือกหรือพร้อมลบในตอนนี้</p>
            </div>
          ) : (
            <>

          <button
            type="button"
            onClick={() => setShowTools((value) => !value)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-600 hover:bg-slate-50"
          >
            <Wrench className="w-4 h-4 text-amber-600" />
            เครื่องมือเพิ่มเติม
            {showTools ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>

          {/* Expensive Drive checks stay collapsed until the admin explicitly uses them. */}
          {showTools && (
          <div className="glass-panel p-4 sm:p-5 rounded-3xl border border-amber-100 bg-amber-50/40 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <HardDrive className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900">ตรวจลิงก์ Google Drive ที่ยังไม่ได้แชร์สาธารณะ</h2>
                  <p className="text-[11px] font-semibold text-slate-500">
                    หางานที่ครูแปะลิงก์ Drive แต่ไม่ได้ตั้งแชร์ &ldquo;ทุกคนที่มีลิงก์&rdquo; (เปิดดูไม่ได้) เพื่อลบและให้ส่งใหม่
                  </p>
                </div>
              </div>
              <button
                onClick={scanNonPublicDriveLinks}
                disabled={scanning}
                className="px-4 py-2.5 rounded-2xl bg-amber-500 text-white text-xs font-extrabold shadow-md shadow-amber-500/20 disabled:opacity-50 shrink-0"
              >
                {scanning ? "กำลังตรวจ..." : "ตรวจลิงก์ทั้งหมด"}
              </button>
            </div>

            {scanMessage && (
              <p className="text-xs font-bold text-amber-800">{scanMessage}</p>
            )}

            {nonPublicSubs && nonPublicSubs.length > 0 && (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <button
                    onClick={deleteAllNonPublic}
                    disabled={scanning}
                    className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-extrabold shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    ลบทั้งหมด ({nonPublicSubs.length})
                  </button>
                </div>
                <div className="space-y-2">
                  {Array.from(new Set(nonPublicSubs.map((s) => s.fullName))).map((name) => {
                    const items = nonPublicSubs.filter((s) => s.fullName === name);
                    return (
                      <div key={name} className="rounded-2xl border border-amber-200 bg-white p-3">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="text-sm font-extrabold text-slate-900">{name}</span>
                          <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">{items.length} ชิ้น</span>
                        </div>
                        <div className="space-y-1">
                          {items.map((sub) => (
                            <div key={sub.id} className="flex items-center justify-between gap-2 text-xs">
                              <span className="text-slate-600 truncate">{displayWorkTitle(sub.projectTitle)}</span>
                              <button
                                onClick={() => deleteNonPublicSub(sub)}
                                className="text-rose-600 hover:bg-rose-50 rounded-lg p-1 shrink-0"
                                title="ลบชิ้นนี้"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          )}

          {/* Filter & Multi-Field Search Bar */}
          <div className="glass-panel p-4 sm:p-6 rounded-3xl border border-white space-y-4 shadow-xs bg-white">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              {/* Comprehensive Multi-Field Search Input */}
              <div className="relative w-full md:w-96">
                <Search className="w-4 h-4 absolute left-4 top-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="ค้นหาชื่อครู (อย่างน้อย 2 ตัวอักษร)..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); setExpandedTeachers(new Set()); }}
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
                  value={selectedGrade}
                  onChange={(e) => { setSelectedGrade(e.target.value); setPage(1); setExpandedTeachers(new Set()); }}
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
                  onChange={(e) => { setSelectedSubject(e.target.value); setPage(1); setExpandedTeachers(new Set()); }}
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

          {/* Bulk delete — operates on the current filter (a whole round / grade /
              subject) or on the individually ticked rows */}
          {filteredSubmissions.length > 0 && (
            <div className="glass-panel rounded-2xl border border-white bg-white shadow-xs p-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-600">
                เลือกแล้ว {filteredSubmissions.filter((s) => selectedIds.has(s.id)).length} รายการ
              </span>
              <button
                type="button"
                onClick={() => bulkDelete(filteredSubmissions.filter((s) => selectedIds.has(s.id)), " ที่เลือก")}
                disabled={bulkDeleting || filteredSubmissions.filter((s) => selectedIds.has(s.id)).length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-600 text-white text-xs font-extrabold shadow-sm disabled:opacity-40"
              >
                <Trash2 className="w-3.5 h-3.5" />
                ลบที่เลือก
              </button>
              {selectedIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 hover:bg-slate-50"
                >
                  ล้างการเลือก
                </button>
              )}
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">แสดง {filteredSubmissions.length} รายการ</span>
                <button
                  type="button"
                  onClick={() => bulkDelete(filteredSubmissions, " ทั้งหมดตามตัวกรองที่เลือกอยู่")}
                  disabled={bulkDeleting}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs font-extrabold hover:bg-red-100 disabled:opacity-40"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  ลบทั้งหมดที่แสดง ({filteredSubmissions.length})
                </button>
              </div>
              {bulkDeleting && (
                <span className="w-full text-xs font-bold text-red-600">
                  กำลังลบ {bulkProgress.done}/{bulkProgress.total} ...
                </span>
              )}
            </div>
          )}

          {/* Teacher-grouped submissions */}
          <div className="space-y-4">
            {loadingSubmissions && submissions.length === 0 ? (
              <div className="glass-panel rounded-3xl border border-white bg-white p-12 text-center text-blue-600 font-bold">
                <Loader2 className="w-7 h-7 mx-auto mb-3 animate-spin" />
                กำลังโหลดผลงานเฉพาะรอบนี้...
              </div>
            ) : teacherGroups.length === 0 ? (
              <div className="glass-panel rounded-3xl border border-white bg-white p-12 text-center text-slate-400 font-semibold">
                ไม่พบรายชื่อครูหรือผลงานตามตัวกรอง
              </div>
            ) : pagedTeacherGroups.map(({ summary, teacher, items }) => {
              const teacherKey = summary.key;
              const expanded = expandedTeachers.has(teacherKey);
              const teacherLoading = loadingTeachers.has(teacherKey);
              const teacherLoaded = loadedTeachers.has(teacherKey);
              const allSelected = items.length > 0 && items.every((item) => selectedIds.has(item.id));
              return (
                <section key={teacherKey} className="glass-panel rounded-2xl border border-white bg-white shadow-xs overflow-hidden">
                  <header className={`p-3.5 sm:px-4 bg-gradient-to-r from-blue-50/80 to-violet-50/50 flex items-center justify-between gap-3 ${expanded ? "border-b border-blue-100" : ""}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedTeachers((previous) => {
                          const next = new Set(previous);
                          if (next.has(teacherKey)) next.delete(teacherKey); else next.add(teacherKey);
                          return next;
                        });
                        if (!expanded) void loadTeacherWorks(summary);
                      }}
                      className="flex items-center gap-3 min-w-0 text-left flex-1"
                      aria-expanded={expanded}
                    >
                      <span className="w-9 h-9 rounded-xl ios-gradient-blue text-white flex items-center justify-center shrink-0"><UserRound className="w-4 h-4" /></span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-extrabold text-sm text-slate-900">{teacher.fullName}</h2>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${summary.submittedCount >= (selectedProject?.maxUpload || 1) ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                            {summary.submittedCount}/{selectedProject?.maxUpload || summary.submittedCount} ชิ้น
                          </span>
                        </div>
                        <p className="text-[11px] font-semibold text-slate-500 truncate">{teacher.position || "ไม่ระบุตำแหน่ง"} · {teacher.gradeLevel || "-"} · {shortSubject(teacher.subjectGroup || "-")} · ล่าสุด {teacher.uploadDate || "-"}</p>
                      </div>
                      {expanded ? <ChevronDown className="w-4 h-4 text-blue-600 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                    </button>
                    {teacherLoaded && <label className="inline-flex items-center gap-2 text-[11px] font-bold text-slate-600 bg-white px-2.5 py-2 rounded-xl border border-slate-200 shrink-0" title="เลือกผลงานทุกชิ้นของครูคนนี้">
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-red-600"
                        checked={allSelected}
                        onChange={(event) => setSelectedIds((previous) => {
                          const next = new Set(previous);
                          items.forEach((item) => event.target.checked ? next.add(item.id) : next.delete(item.id));
                          return next;
                        })}
                      />
                      <span className="hidden sm:inline">เลือกทั้งหมด</span>
                    </label>}
                  </header>

                  {expanded && teacherLoading && <div className="p-6 text-center text-xs font-bold text-blue-600"><Loader2 className="w-5 h-5 mx-auto mb-2 animate-spin" />กำลังโหลดผลงานของครูคนนี้...</div>}
                  {expanded && teacherLoaded && <div className="divide-y divide-slate-100">
                    {items.map((sub, index) => {
                      const isDrive = sub.fileType === "drive" || isGoogleDriveLink(sub.fileURL);
                      return (
                        <div key={sub.id} className={`p-4 sm:px-5 grid grid-cols-[auto_1fr] lg:grid-cols-[auto_minmax(0,1fr)_190px_auto] items-start lg:items-center gap-3 ${selectedIds.has(sub.id) ? "bg-red-50/70" : "hover:bg-slate-50/70"}`}>
                          <input type="checkbox" aria-label={`เลือก ${sub.projectTitle}`} className="w-4 h-4 accent-red-600 mt-1 lg:mt-0" checked={selectedIds.has(sub.id)} onChange={() => toggleSelect(sub.id)} />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center text-[10px] font-extrabold">{index + 1}</span>
                              <h3 className="font-extrabold text-sm text-slate-900">{displayWorkTitle(sub.projectTitle)}</h3>
                              <span className={`px-2 py-0.5 rounded-md text-[9px] font-extrabold ${isDrive ? "bg-emerald-100 text-emerald-700" : sub.fileType === "pdf" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                                {isDrive ? "GOOGLE DRIVE" : sub.fileType.toUpperCase()}
                              </span>
                            </div>
                            {sub.description && <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">{sub.description}</p>}
                          </div>
                          <div className="col-start-2 lg:col-start-auto flex items-center gap-2 text-[11px] font-bold text-slate-500">
                            <CalendarClock className="w-4 h-4 text-blue-500 shrink-0" />
                            <span>ส่งเมื่อ {sub.uploadDate || "ไม่ระบุวันเวลา"}</span>
                          </div>
                          <div className="col-start-2 lg:col-start-auto flex items-center lg:justify-end gap-1">
                            <button onClick={() => setActiveSubmission(sub)} className="p-2 rounded-xl text-blue-600 hover:bg-blue-50" title="ดูรายละเอียด"><Eye className="w-4 h-4" /></button>
                            {(sub.driveFileId || isDrive) && <button onClick={() => setVersionsFor(sub)} className="p-2 rounded-xl text-violet-600 hover:bg-violet-50" title="ประวัติเวอร์ชัน / กู้คืน"><History className="w-4 h-4" /></button>}
                            <button onClick={() => handleStartEdit(sub)} className="p-2 rounded-xl text-amber-600 hover:bg-amber-50" title="แก้ไขข้อมูล"><Edit className="w-4 h-4" /></button>
                            <a href={sub.fileURL} target="_blank" rel="noreferrer" className="p-2 rounded-xl text-slate-600 hover:bg-slate-100" title="ดาวน์โหลด/เปิดไฟล์"><Download className="w-4 h-4" /></a>
                            <button onClick={() => handleDelete(sub)} className="p-2 rounded-xl text-red-500 hover:bg-red-50" title="ลบรายการ"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>}
                </section>
              );
            })}
          </div>

          {(page > 1 || hasNextPage) && !search.trim() && (
            <nav className="glass-panel rounded-2xl border border-white bg-white p-3 flex items-center justify-between gap-3" aria-label="แบ่งหน้ารายชื่อครู">
              <button type="button" disabled={page === 1 || loadingSubmissions} onClick={() => void loadData(page - 1, pageCursors[page - 2] || null)} className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-extrabold disabled:opacity-40">ก่อนหน้า</button>
              <span className="text-xs font-bold text-slate-600">หน้า {page} · แสดงครั้งละ {ADMIN_PAGE_SIZE} คน</span>
              <button type="button" disabled={!hasNextPage || loadingSubmissions} onClick={() => void loadData(page + 1, pageCursors[page] || null)} className="px-4 py-2 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-xs font-extrabold disabled:opacity-40">ถัดไป</button>
            </nav>
          )}
            </>
          )}
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
