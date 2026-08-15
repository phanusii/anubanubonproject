"use client";

import { useEffect, useState, useMemo } from "react";
import type { QueryDocumentSnapshot, DocumentData } from "firebase/firestore";
import MasonryCard from "@/components/MasonryCard";
import SubmissionModal from "@/components/SubmissionModal";
import { getSubmissionsPage, getTrainingSettings, getInstantSettings, getInstantSubmissions, countSubmissions, DEFAULT_GRADE_LEVELS, DEFAULT_SUBJECT_GROUPS } from "@/lib/submission-service";
import { getGradeLevels, getSubjectGroups } from "@/lib/masters-service";
import { getInstantProjects, getProjects } from "@/lib/projects-service";
import { getInstantTeachers, getTeachers } from "@/lib/teachers-service";
import { budgetYearOf, gradeLabel, sortGrades } from "@/lib/format";
import { Submission, GradeLevelOption, SubjectGroupOption, TrainingSettings, Project } from "@/lib/types";
import { Search, Sparkles, FolderKanban, Layers } from "lucide-react";

const PAGE_SIZE = 60;
const ITEMS_PER_PAGE = 20;

/** Normalize a teacher name for matching (ignore spaces / leading "ครู"). */
const normName = (s: string) => (s || "").replace(/\s+/g, "").replace(/^ครู/, "").trim();

export default function GallerySection({ onOpenPerson }: { onOpenPerson?: (name: string) => void }) {
  const instantVisibleProjects = getInstantProjects().filter((project) => project.showInGallery !== false);
  // Instant synchronous initialization for 0ms frame-0 render (Never displays 0 items!)
  const [submissions, setSubmissions] = useState<Submission[]>(() => getInstantSubmissions());
  const [gradeLevels, setGradeLevels] = useState<GradeLevelOption[]>(DEFAULT_GRADE_LEVELS);
  const [subjectGroups, setSubjectGroups] = useState<SubjectGroupOption[]>(DEFAULT_SUBJECT_GROUPS);
  const [settings, setSettings] = useState<TrainingSettings | null>(() => getInstantSettings());

  // Training rounds / projects — tabs to browse works by round ("all" = every round)
  const [projects, setProjects] = useState<Project[]>(instantVisibleProjects);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(instantVisibleProjects[0]?.id || "");
  // Project IDs the admin hid — their works are excluded even under "ทั้งหมด".
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  // Teacher profile pictures keyed by normalized name (for the card avatar).
  const [avatarByName, setAvatarByName] = useState<Map<string, string>>(() => new Map(getInstantTeachers().filter((t) => t.photoUrl).map((t) => [normName(t.fullName), t.photoUrl || ""])));

  // True total works for the selected round (via a cheap count query, not the loaded page).
  const [totalCount, setTotalCount] = useState<number>(-1);

  // Pagination state
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Search & Filter state
  const [search, setSearch] = useState("");
  const [selectedGrade, setSelectedGrade] = useState("ทั้งหมด");
  const [selectedSubject, setSelectedSubject] = useState("ทั้งหมด");

  // Selected Submission Modal
  const [activeSubmission, setActiveSubmission] = useState<Submission | null>(null);

  const projectIdParam = (pid: string) => (pid === "all" ? undefined : pid);

  // True total for the badge: one round, or all rounds minus hidden ones (excludes their works).
  const refreshTotal = async (pid: string, hidden: Set<string>) => {
    if (pid !== "all") {
      setTotalCount(await countSubmissions(pid));
      return;
    }
    const all = await countSubmissions();
    if (all < 0) {
      setTotalCount(-1);
      return;
    }
    let hiddenCount = 0;
    for (const id of hidden) {
      const c = await countSubmissions(id);
      if (c > 0) hiddenCount += c;
    }
    setTotalCount(Math.max(0, all - hiddenCount));
  };

  // Load (or reload) the first page for a given round selection.
  const fetchFirstPage = async (pid: string) => {
    try {
      const page = await getSubmissionsPage({ pageSize: PAGE_SIZE, projectId: projectIdParam(pid), ignoreProjectFilter: true });
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
        const initialPid = instantVisibleProjects[0]?.id || "all";
        const firstPagePromise = fetchFirstPage(initialPid);
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
        const hidden = new Set(projs.filter((p) => p.showInGallery === false).map((p) => p.id));
        setHiddenIds(hidden);

        // The landing gallery follows the first round in the display order set
        // by Admin. "All rounds" remains available as the final dropdown option.
        const resolvedPid = visibleProjects[0]?.id || "all";
        setSelectedProjectId(resolvedPid);
        refreshTotal(resolvedPid, hidden);
        await firstPagePromise;
        if (resolvedPid !== initialPid) await fetchFirstPage(resolvedPid);
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
    setCurrentPage(1);
    setTotalCount(-1);
    refreshTotal(pid, hiddenIds);
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
      const matchesLegacyProjectFilter = settings?.activeProjectFilterMode !== "specific" || !settings.activeProjectFilterName?.trim() ||
        [sub.projectTitle, sub.description || ""].join(" ").toLowerCase().includes(settings.activeProjectFilterName.trim().toLowerCase());
      // Exclude works belonging to hidden rounds (matters under "ทั้งหมด").
      const notHidden = !sub.projectId || !hiddenIds.has(sub.projectId);
      // A submission whose projectId no longer exists is an orphan left by a
      // project deleted before cascade deletion was introduced. Never expose
      // those records under "all rounds".
      const belongsToExistingProject = !sub.projectId || projects.some((project) => project.id === sub.projectId);
      const matchesProject = selectedProjectId === "all"
        ? true
        : selectedProjectId !== "" && sub.projectId === selectedProjectId;

      return matchesSearch && matchesGrade && matchesSubject && matchesLegacyProjectFilter && notHidden && belongsToExistingProject && matchesProject;
    });
  }, [submissions, search, selectedGrade, selectedSubject, hiddenIds, selectedProjectId, projects, settings]);

  const loadedPageCount = Math.max(1, Math.ceil(filteredSubmissions.length / ITEMS_PER_PAGE));
  const pageButtonCount = loadedPageCount + (hasMore ? 1 : 0);
  const pagedSubmissions = useMemo(
    () => filteredSubmissions.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE),
    [filteredSubmissions, currentPage],
  );

  const goToPage = async (page: number) => {
    if (page < 1 || isLoadingMore) return;
    if (page <= loadedPageCount) {
      setCurrentPage(page);
      return;
    }
    if (hasMore && page === loadedPageCount + 1) {
      await handleLoadMore();
      setCurrentPage(page);
    }
  };

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
        <div className="glass-panel p-3 sm:p-4 rounded-3xl border border-white bg-white shadow-xs min-h-[70px]">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700 shrink-0">
                <Layers className="w-4 h-4 text-blue-600" />
                <span>เลือกรอบ:</span>
              </span>
              <select
                aria-label="เลือกรอบการอบรมหรือโครงการ"
                value={selectedProjectId}
                onChange={(e) => selectProject(e.target.value)}
                disabled={projects.length === 0}
                className="w-full sm:flex-1 sm:min-w-[220px] px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 text-slate-800 text-xs font-bold focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none shadow-2xs"
              >
                {projects.length === 0 && <option value="">กำลังโหลดรอบ...</option>}
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

        {/* Search + count + filters — all on one line (desktop) */}
        <div className="glass-panel p-3 sm:p-4 rounded-3xl border border-white shadow-sm bg-white">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            {/* Search bar (takes the remaining width) */}
            <div className="relative w-full sm:flex-1 sm:min-w-[160px]">
              <Search className="w-4 h-4 absolute left-4 top-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="ค้นหาชื่อครู, ชื่อผลงาน, กลุ่มสาระ..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                className="w-full pl-11 pr-4 py-3 rounded-2xl border border-slate-200 bg-slate-50/50 text-slate-900 font-semibold text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none transition-all"
              />
            </div>

            {/* Work count */}
            <span className="inline-flex items-center justify-center gap-2 pl-2 pr-4 py-2 rounded-2xl bg-blue-50 border border-blue-100 shrink-0">
              <span className="w-7 h-7 rounded-xl ios-gradient-blue text-white flex items-center justify-center shadow-sm shadow-blue-500/25">
                <FolderKanban className="w-3.5 h-3.5" />
              </span>
              <span className="text-xs font-bold text-slate-600">
                {search.trim() === "" && selectedGrade === "ทั้งหมด" && selectedSubject === "ทั้งหมด"
                  ? "ผลงานทั้งหมด"
                  : "ผลงานที่กรอง"}
              </span>
              <span className="text-lg font-extrabold text-blue-600 leading-none">
                {search.trim() === "" && selectedGrade === "ทั้งหมด" && selectedSubject === "ทั้งหมด" && totalCount >= 0
                  ? totalCount
                  : filteredSubmissions.length}
              </span>
              <span className="text-xs font-bold text-slate-600">ชิ้น</span>
            </span>

            {/* Grade Level Filter */}
            <select
              aria-label="กรองตามสายชั้น"
              value={selectedGrade}
              onChange={(e) => { setSelectedGrade(e.target.value); setCurrentPage(1); }}
              className="w-full lg:w-auto lg:max-w-[190px] px-3.5 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-slate-800 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-2xs"
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
              aria-label="กรองตามกลุ่มสาระ"
              value={selectedSubject}
              onChange={(e) => { setSelectedSubject(e.target.value); setCurrentPage(1); }}
              className="w-full lg:w-auto lg:max-w-[210px] px-3.5 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-slate-800 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-2xs"
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
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {pagedSubmissions.map((sub) => (
              <MasonryCard
                key={sub.id}
                submission={sub}
                avatarUrl={avatarByName.get(normName(sub.fullName))}
                onClick={() => (onOpenPerson ? onOpenPerson(sub.fullName) : setActiveSubmission(sub))}
              />
            ))}
          </div>
        )}

        {/* 20 works per page. The next cursor batch is fetched only when needed. */}
        {filteredSubmissions.length > ITEMS_PER_PAGE || hasMore ? (
          <nav aria-label="หน้าคลังผลงาน" className="flex flex-wrap items-center justify-center gap-2 pt-3">
            <button type="button" onClick={() => void goToPage(currentPage - 1)} disabled={currentPage === 1 || isLoadingMore} className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-600 disabled:opacity-40">ก่อนหน้า</button>
            {Array.from({ length: pageButtonCount }, (_, index) => index + 1).map((page) => (
              <button key={page} type="button" onClick={() => void goToPage(page)} disabled={isLoadingMore} aria-current={page === currentPage ? "page" : undefined} className={`w-10 h-10 rounded-xl text-sm font-extrabold transition-colors ${page === currentPage ? "bg-blue-600 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-700 hover:bg-blue-50"}`}>
                {isLoadingMore && page > loadedPageCount ? "…" : page}
              </button>
            ))}
            <button type="button" onClick={() => void goToPage(currentPage + 1)} disabled={currentPage >= pageButtonCount || isLoadingMore} className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-600 disabled:opacity-40">ถัดไป</button>
          </nav>
        ) : null}
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
