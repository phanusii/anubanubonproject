"use client";

import { useEffect, useState, useMemo } from "react";
import type { QueryDocumentSnapshot, DocumentData } from "firebase/firestore";
import MasonryCard from "@/components/MasonryCard";
import SubmissionModal from "@/components/SubmissionModal";
import { getSubmissionsPage, getTrainingSettings, getInstantSubmissions, DEFAULT_GRADE_LEVELS, DEFAULT_SUBJECT_GROUPS } from "@/lib/submission-service";
import { getGradeLevels, getSubjectGroups } from "@/lib/masters-service";
import { getInstantProjects, getProjects } from "@/lib/projects-service";
import { getTeachers } from "@/lib/teachers-service";
import { budgetYearOf, gradeLabel, sortGrades } from "@/lib/format";
import { Submission, GradeLevelOption, SubjectGroupOption, TrainingSettings, Project } from "@/lib/types";
import { Search, Sparkles, FolderKanban, Layers } from "lucide-react";

const PAGE_SIZE = 60;

/** Normalize a teacher name for matching (ignore spaces / leading "ครู"). */
const normName = (s: string) => (s || "").replace(/\s+/g, "").replace(/^ครู/, "").trim();

export default function GallerySection({ onOpenPerson }: { onOpenPerson?: (name: string) => void }) {
  const instantVisibleProjects = getInstantProjects().filter((project) => project.showInGallery !== false);
  // Instant synchronous initialization for 0ms frame-0 render (Never displays 0 items!)
  const [submissions, setSubmissions] = useState<Submission[]>(() => getInstantSubmissions());
  const [gradeLevels, setGradeLevels] = useState<GradeLevelOption[]>(DEFAULT_GRADE_LEVELS);
  const [subjectGroups, setSubjectGroups] = useState<SubjectGroupOption[]>(DEFAULT_SUBJECT_GROUPS);
  const [settings, setSettings] = useState<TrainingSettings | null>(null);

  // Training rounds / projects — tabs to browse works by round ("all" = every round)
  const [projects, setProjects] = useState<Project[]>(instantVisibleProjects);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(instantVisibleProjects[0]?.id || "");
  // Project IDs the admin hid — their works are excluded even under "ทั้งหมด".
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  // Teacher profile pictures keyed by normalized name (for the card avatar).
  const [avatarByName, setAvatarByName] = useState<Map<string, string>>(new Map());

  // Pagination state
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Search & Filter state
  const [search, setSearch] = useState("");
  const [selectedGrade, setSelectedGrade] = useState("ทั้งหมด");
  const [selectedSubject, setSelectedSubject] = useState("ทั้งหมด");

  // Selected Submission Modal
  const [activeSubmission, setActiveSubmission] = useState<Submission | null>(null);

  const projectIdParam = (pid: string) => (pid === "all" ? undefined : pid);

  // Load (or reload) the first page for a given round selection.
  const fetchFirstPage = async (pid: string) => {
    try {
      const page = await getSubmissionsPage({ pageSize: PAGE_SIZE, projectId: projectIdParam(pid) });
      setSubmissions(page.items);
      setCursor(page.cursor);
      setHasMore(page.hasMore);
    } catch (err) {
      console.error("Gallery fetch first page error:", err);
    }
  };

  useEffect(() => {
    async function loadInitial() {
      try {
        const [projs, gls, sgs, st, teachers] = await Promise.all([
          getProjects(),
          getGradeLevels(),
          getSubjectGroups(),
          getTrainingSettings(),
          getTeachers(),
        ]);

        // Map teacher name → profile picture for the card avatars.
        const avaMap = new Map<string, string>();
        for (const t of teachers) {
          if (t.photoUrl) avaMap.set(normName(t.fullName), t.photoUrl);
        }
        setAvatarByName(avaMap);

        if (gls && gls.length > 0) setGradeLevels(gls);
        if (sgs && sgs.length > 0) setSubjectGroups(sgs);
        if (st) setSettings(st);

        // Only rounds the admin flagged to show appear in the public dropdown.
        const visibleProjects = projs.filter((p) => p.showInGallery !== false);
        setProjects(visibleProjects);
        setHiddenIds(new Set(projs.filter((p) => p.showInGallery === false).map((p) => p.id)));

        // The landing gallery follows the first round in the display order set
        // by Admin. "All rounds" remains available as the final dropdown option.
        const initialPid = visibleProjects[0]?.id || "all";
        setSelectedProjectId(initialPid);
        await fetchFirstPage(initialPid);
      } catch (err) {
        console.error("Gallery page initial load error:", err);
      }
    }
    loadInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectProject = (pid: string) => {
    if (pid === selectedProjectId) return;
    setSelectedProjectId(pid);
    setSubmissions([]);
    setCursor(null);
    setHasMore(false);
    fetchFirstPage(pid);
  };

  const handleLoadMore = async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const page = await getSubmissionsPage({
        pageSize: PAGE_SIZE,
        cursor,
        projectId: projectIdParam(selectedProjectId),
      });
      setSubmissions((prev) => {
        const seen = new Set(prev.map((s) => s.id));
        const merged = [...prev];
        for (const item of page.items) {
          if (!seen.has(item.id)) merged.push(item);
        }
        return merged;
      });
      setCursor(page.cursor);
      setHasMore(page.hasMore);
    } catch (err) {
      console.error("Gallery load-more error:", err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Instant In-Memory Filter with useMemo (0ms latency!)
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
      // Exclude works belonging to hidden rounds (matters under "ทั้งหมด").
      const notHidden = !sub.projectId || !hiddenIds.has(sub.projectId);
      // A submission whose projectId no longer exists is an orphan left by a
      // project deleted before cascade deletion was introduced. Never expose
      // those records under "all rounds".
      const belongsToExistingProject = !sub.projectId || projects.some((project) => project.id === sub.projectId);
      const matchesProject = selectedProjectId === "all"
        ? true
        : selectedProjectId !== "" && sub.projectId === selectedProjectId;

      return matchesSearch && matchesGrade && matchesSubject && notHidden && belongsToExistingProject && matchesProject;
    });
  }, [submissions, search, selectedGrade, selectedSubject, hiddenIds, selectedProjectId, projects]);

  const isSpecificFilterActive = settings?.activeProjectFilterMode === 'specific' && settings.activeProjectFilterName;

  // Heading shows the selected round's project name (or "ทุกรอบ") with the work count.
  const selectedProjectName =
    selectedProjectId === "all"
      ? settings?.trainingName || "คลังผลงานครู"
      : projects.find((p) => p.id === selectedProjectId)?.name ||
        settings?.trainingName ||
        "คลังผลงานครู";
  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  return (
    <div className="flex flex-col w-full">

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="text-center space-y-3 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-extrabold bg-blue-100/70 text-blue-700 backdrop-blur-md border border-blue-200">
            <Sparkles className="w-3.5 h-3.5" />
            <span>คลังรวมผลงานและสื่อการจัดการเรียนรู้ดิจิทัล</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-snug">
            {selectedProjectName}
          </h1>
          {selectedProject && (
            <p className="text-sm font-extrabold text-blue-600">ปีงบประมาณ {budgetYearOf(selectedProject)}</p>
          )}
          <p className="text-xs sm:text-sm text-slate-600 font-medium">
            ค้นหาและเปิดดูผลงานนวัตกรรม แผนการจัดการเรียนรู้ และสื่อดิจิทัลของคุณครูโรงเรียนอนุบาลอุบลราชธานี
          </p>

          {isSpecificFilterActive && (
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold shadow-xs">
              <FolderKanban className="w-4 h-4 text-amber-600 shrink-0" />
              <span>แสดงเฉพาะผลงานโครงการ: "{settings.activeProjectFilterName}"</span>
            </div>
          )}
        </div>

        {/* Round / project selector — a dropdown ordered by the admin's setting */}
        {projects.length > 0 && (
          <div className="glass-panel p-3 sm:p-4 rounded-3xl border border-white bg-white shadow-xs">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700 shrink-0">
                <Layers className="w-4 h-4 text-blue-600" />
                <span>เลือกรอบ:</span>
              </span>
              <select
                value={selectedProjectId}
                onChange={(e) => selectProject(e.target.value)}
                className="flex-1 min-w-[220px] px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 text-slate-800 text-xs font-bold focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none shadow-2xs"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {` · ปีงบประมาณ ${budgetYearOf(p)}`}
                    {p.id === settings?.activeProjectId ? " · เปิดรับอยู่" : ""}
                  </option>
                ))}
                <option value="all">ทั้งหมด (ทุกรอบ)</option>
              </select>
            </div>
          </div>
        )}

        {/* Search + count + filters — all on one line (desktop) */}
        <div className="glass-panel p-3 sm:p-4 rounded-3xl border border-white shadow-sm bg-white">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            {/* Search bar (takes the remaining width) */}
            <div className="relative flex-1 min-w-[160px]">
              <Search className="w-4 h-4 absolute left-4 top-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="ค้นหาชื่อครู, ชื่อผลงาน, กลุ่มสาระ..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-2xl border border-slate-200 bg-slate-50/50 text-slate-900 font-semibold text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none transition-all"
              />
            </div>

            {/* Work count */}
            <span className="inline-flex items-center justify-center gap-2 pl-2 pr-4 py-2 rounded-2xl bg-blue-50 border border-blue-100 shrink-0">
              <span className="w-7 h-7 rounded-xl ios-gradient-blue text-white flex items-center justify-center shadow-sm shadow-blue-500/25">
                <FolderKanban className="w-3.5 h-3.5" />
              </span>
              <span className="text-xs font-bold text-slate-600">ผลงานทั้งหมด</span>
              <span className="text-lg font-extrabold text-blue-600 leading-none">
                {filteredSubmissions.length}
              </span>
              <span className="text-xs font-bold text-slate-600">ชิ้น</span>
            </span>

            {/* Grade Level Filter */}
            <select
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(e.target.value)}
              className="shrink-0 w-auto max-w-[190px] px-3.5 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-slate-800 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-2xs"
            >
              <option value="ทั้งหมด">ทุกสายชั้น (อ.1 - ป.6)</option>
              {sortGrades(gradeLevels).map((gl) => (
                <option key={gl.id} value={gl.name}>
                  {gradeLabel(gl.name)}
                </option>
              ))}
            </select>

            {/* Subject Group Filter */}
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="shrink-0 w-auto max-w-[210px] px-3.5 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-slate-800 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-2xs"
            >
              <option value="ทั้งหมด">ทุกกลุ่มสาระการเรียนรู้</option>
              {subjectGroups.map((sg) => (
                <option key={sg.id} value={sg.name}>
                  {sg.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Submissions Cards Grid */}
        {filteredSubmissions.length === 0 ? (
          <div className="glass-panel p-12 text-center rounded-3xl border border-slate-100 bg-slate-50/50 space-y-3">
            <p className="text-base font-extrabold text-slate-700">ไม่พบผลงานตามเงื่อนไขที่เลือก</p>
            <p className="text-xs text-slate-500 font-medium">
              ลองปรับเปลี่ยนคำค้นหา หรือ เลือกทุกสายชั้น / ทุกกลุ่มสาระ
              {hasMore && " หรือกดปุ่มโหลดผลงานเพิ่มเติมด้านล่างเพื่อค้นหาให้ครอบคลุมมากขึ้น"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filteredSubmissions.map((sub) => (
              <MasonryCard
                key={sub.id}
                submission={sub}
                avatarUrl={avatarByName.get(normName(sub.fullName))}
                onClick={() => (onOpenPerson ? onOpenPerson(sub.fullName) : setActiveSubmission(sub))}
              />
            ))}
          </div>
        )}

        {/* Load More (cursor-based pagination) */}
        {hasMore && (
          <div className="flex flex-col items-center gap-2 pt-2">
            <button
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              className="px-8 py-3.5 rounded-2xl ios-gradient-blue text-white font-extrabold text-sm shadow-md shadow-blue-500/25 disabled:opacity-60 disabled:cursor-not-allowed hover:scale-[1.02] transition-all"
            >
              {isLoadingMore ? "กำลังโหลด..." : "โหลดผลงานเพิ่มเติม"}
            </button>
            <p className="text-[11px] text-slate-400 font-medium">
              กำลังค้นหาจากผลงาน {submissions.length} รายการที่โหลดแล้ว — กดเพื่อโหลดเพิ่ม
            </p>
          </div>
        )}
      </main>


      {/* Submission Preview Modal */}
      {activeSubmission && (
        <SubmissionModal
          submission={activeSubmission}
          onClose={() => setActiveSubmission(null)}
        />
      )}
    </div>
  );
}
