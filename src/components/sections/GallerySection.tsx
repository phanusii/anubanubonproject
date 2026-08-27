"use client";

import { useEffect, useState, useMemo } from "react";
import type { QueryDocumentSnapshot, DocumentData } from "firebase/firestore";
import PersonCard, { PersonGroup } from "@/components/PersonCard";
import SubmissionModal from "@/components/SubmissionModal";
import { countSubmissions, getSubmissionsPage, getGallerySubmissions, getInstantGallery, getTrainingSettings, getInstantSettings, getInstantSubmissions, DEFAULT_GRADE_LEVELS, DEFAULT_SUBJECT_GROUPS } from "@/lib/submission-service";
import { getProjectParticipantPage, hasProjectParticipantIndex, searchProjectParticipants } from "@/lib/project-participant-service";
import { getGradeLevels, getSubjectGroups } from "@/lib/masters-service";
import { getInstantProjects, getProjects } from "@/lib/projects-service";
import { getInstantTeachers, getTeachers } from "@/lib/teachers-service";
import { budgetYearOf, gradeLabel, normalizeGradeKey, sortGrades } from "@/lib/format";
import { useInstantState } from "@/lib/use-instant";
import { Submission, GradeLevelOption, SubjectGroupOption, TrainingSettings, Project } from "@/lib/types";
import { Search, Sparkles, FolderKanban, Layers } from "lucide-react";

const PAGE_SIZE = 20;
const ITEMS_PER_PAGE = 20;

/** Normalize a teacher name for matching (ignore spaces / leading "ครู"). */
const normName = (s: string) => (s || "").replace(/\s+/g, "").replace(/^ครู/, "").trim();

export default function GallerySection({ onOpenPerson }: { onOpenPerson?: (name: string, field: "grade" | "subject", value: string) => void }) {
  const visibleInstantProjects = () => getInstantProjects().filter((project) => project.showInGallery !== false);
  // Instant cache is applied after mount (via useInstantState) rather than in the
  // initializer, so the static build and first hydration render agree on the
  // defaults below — otherwise a warm localStorage cache mismatches the
  // prerendered HTML and React throws a hydration error.
  const [submissions, setSubmissions] = useInstantState<Submission[]>(getInstantSubmissions, []);
  const [gradeLevels, setGradeLevels] = useState<GradeLevelOption[]>(DEFAULT_GRADE_LEVELS);
  const [subjectGroups, setSubjectGroups] = useState<SubjectGroupOption[]>(DEFAULT_SUBJECT_GROUPS);
  const [settings, setSettings] = useInstantState<TrainingSettings | null>(getInstantSettings, null);

  // Training rounds / projects — tabs to browse works by round ("all" = every round)
  const [projects, setProjects] = useInstantState<Project[]>(visibleInstantProjects, []);
  const [selectedProjectId, setSelectedProjectId] = useInstantState<string>(() => visibleInstantProjects()[0]?.id || "", "");
  // Project IDs the admin hid — their works are excluded even under "ทั้งหมด".
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  // Teacher profile pictures keyed by normalized name (for the card avatar).
  const [avatarByName, setAvatarByName] = useInstantState<Map<string, string>>(
    () => new Map(getInstantTeachers().filter((t) => t.photoUrl).map((t) => [normName(t.fullName), t.photoUrl || ""])),
    new Map<string, string>(),
  );

  // True total works for the selected round (via a cheap count query, not the loaded page).
  const [totalCount, setTotalCount] = useState<number>(-1);

  // Pagination state
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Search & Filter state
  const [search, setSearch] = useState("");
  const [selectedGrade, setSelectedGrade] = useState("ทั้งหมด");
  const [selectedSubject, setSelectedSubject] = useState("ทั้งหมด");

  // Selected Submission Modal
  const [activeSubmission, setActiveSubmission] = useState<Submission | null>(null);

  const projectIdParam = (pid: string) => (pid === "all" ? undefined : pid);

  // Aggregation reads return the count without downloading hundreds of works.
  const refreshTotal = async (pid: string, hidden: Set<string>) => {
    try {
      if (pid !== "all") {
        setTotalCount(await countSubmissions(pid));
        return;
      }
      const visibleIds = projects.filter((project) => !hidden.has(project.id)).map((project) => project.id);
      const counts = await Promise.all(visibleIds.map((id) => countSubmissions(id)));
      setTotalCount(counts.some((count) => count < 0) ? -1 : counts.reduce((sum, count) => sum + count, 0));
    } catch {
      setTotalCount(-1);
    }
  };

  // Default path: read 20 teacher summaries for the selected round. The old
  // full snapshot remains a safe fallback while the one-time index migration is
  // still running, and for the intentionally broad "all rounds" view.
  const fetchFirstPage = async (pid: string, grade = selectedGrade, subject = selectedSubject) => {
    setIsRefreshing(true);
    try {
      if (pid !== "all") {
        const page = await getProjectParticipantPage({
          projectId: pid,
          pageSize: PAGE_SIZE,
          gradeLevel: grade === "ทั้งหมด" ? undefined : grade,
          subjectGroup: subject === "ทั้งหมด" ? undefined : subject,
        });
        if (page.items.length || await hasProjectParticipantIndex()) {
          setSubmissions(page.items.flatMap((item) => item.works));
          setCursor(page.cursor);
          setHasMore(page.hasMore);
          return;
        }
      }
      const instant = getInstantGallery(pid === "all" ? undefined : pid);
      if (instant.length) setSubmissions(instant);
      const items = await getGallerySubmissions(pid === "all" ? undefined : pid);
      setSubmissions(items);
      setCursor(null);
      setHasMore(false);
    } catch (err) {
      console.error("Gallery fetch error:", err);
      const instant = getInstantGallery(pid === "all" ? undefined : pid);
      if (instant.length) setSubmissions(instant);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    async function loadInitial() {
      try {
        const initialPid = visibleInstantProjects()[0]?.id || "all";
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
        void refreshTotal(resolvedPid, hidden);
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
    setCursor(null);
    setHasMore(false);
    setCurrentPage(1);
    setTotalCount(-1);
    void refreshTotal(pid, hiddenIds);
    void fetchFirstPage(pid, "ทั้งหมด", "ทั้งหมด");
    setSelectedGrade("ทั้งหมด");
    setSelectedSubject("ทั้งหมด");
    setSearch("");
  };

  const handleLoadMore = async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const participantPage = selectedProjectId !== "all" && !search.trim()
        ? await getProjectParticipantPage({
            projectId: selectedProjectId,
            pageSize: PAGE_SIZE,
            cursor,
            gradeLevel: selectedGrade === "ทั้งหมด" ? undefined : selectedGrade,
            subjectGroup: selectedSubject === "ทั้งหมด" ? undefined : selectedSubject,
          })
        : null;
      const page = participantPage
        ? { items: participantPage.items.flatMap((item) => item.works), cursor: participantPage.cursor, hasMore: participantPage.hasMore }
        : await getSubmissionsPage({
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

  useEffect(() => {
    const value = search.trim();
    if (value.length < 2) return;
    const timer = window.setTimeout(() => {
      setIsRefreshing(true);
      searchProjectParticipants({
        projectId: selectedProjectId === "all" ? undefined : selectedProjectId,
        name: value,
        pageSize: PAGE_SIZE,
      })
        .then((items) => {
          setSubmissions(items.flatMap((item) => item.works));
          setCursor(null);
          setHasMore(false);
          setCurrentPage(1);
        })
        .catch((error) => console.error("Gallery search fallback failed:", error))
        .finally(() => setIsRefreshing(false));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search, selectedProjectId, setSubmissions]);

  const changeSearch = (value: string) => {
    const wasSearching = search.trim().length >= 2;
    setSearch(value);
    setCurrentPage(1);
    if (wasSearching && value.trim().length < 2) {
      void fetchFirstPage(selectedProjectId, selectedGrade, selectedSubject);
    }
  };

  const changeGrade = (value: string) => {
    setSelectedGrade(value);
    setCurrentPage(1);
    setSearch("");
    void fetchFirstPage(selectedProjectId, value, selectedSubject);
  };

  const changeSubject = (value: string) => {
    setSelectedSubject(value);
    setCurrentPage(1);
    setSearch("");
    void fetchFirstPage(selectedProjectId, selectedGrade, value);
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

      const matchesGrade = selectedGrade === "ทั้งหมด" || normalizeGradeKey(sub.gradeLevel) === normalizeGradeKey(selectedGrade);
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

  // A round can be organised by grade level or by subject group. Cards for the
  // selected round follow that round's axis; "ทั้งหมด" (mixed rounds) falls back
  // to grade level.
  const groupAxis: "gradeLevel" | "subjectGroup" = useMemo(() => {
    if (selectedProjectId === "all" || !selectedProjectId) return "gradeLevel";
    const p = projects.find((project) => project.id === selectedProjectId);
    return p?.groupBy === "subjectGroup" ? "subjectGroup" : "gradeLevel";
  }, [selectedProjectId, projects]);

  // Group works so that one teacher = one card (grouped by name + the round's
  // category axis). Cards are ordered by the group's most recent submission
  // (latest sender first); each card's works are ordered newest-first.
  const groups = useMemo<PersonGroup[]>(() => {
    const timeOf = (s: Submission) => s.createdAt || Date.parse(s.uploadDate || "") || 0;
    const valueOf = (s: Submission) => (groupAxis === "subjectGroup" ? s.subjectGroup || "" : s.gradeLevel || "");
    const valueKey = (s: Submission) =>
      groupAxis === "subjectGroup" ? (s.subjectGroup || "").trim() : normalizeGradeKey(s.gradeLevel);
    const map = new Map<string, PersonGroup>();
    for (const sub of filteredSubmissions) {
      const key = `${normName(sub.fullName)}|${groupAxis}|${valueKey(sub)}`;
      const t = timeOf(sub);
      let g = map.get(key);
      if (!g) {
        g = { key, fullName: sub.fullName, axis: groupAxis, categoryValue: valueOf(sub), position: sub.position, works: [], latestTime: 0 };
        map.set(key, g);
      }
      g.works.push(sub);
      if (t >= g.latestTime) {
        // Trust the most recent submission for the display name / position.
        g.latestTime = t;
        g.fullName = sub.fullName;
        g.categoryValue = valueOf(sub);
        g.position = sub.position;
      }
    }
    const list = Array.from(map.values());
    for (const g of list) g.works.sort((a, b) => timeOf(b) - timeOf(a));
    list.sort((a, b) => b.latestTime - a.latestTime);
    return list;
  }, [filteredSubmissions, groupAxis]);

  const loadedPageCount = Math.max(1, Math.ceil(groups.length / ITEMS_PER_PAGE));
  const pageButtonCount = loadedPageCount + (hasMore ? 1 : 0);
  const pagedGroups = useMemo(
    () => groups.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE),
    [groups, currentPage],
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
          <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-extrabold bg-gradient-to-r from-blue-100 via-violet-100 to-fuchsia-100 text-violet-700 backdrop-blur-md border border-violet-200/60 shadow-sm">
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
              onChange={(e) => changeSearch(e.target.value)}
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
              <span className="text-lg font-extrabold leading-none bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
                {search.trim() === "" && selectedGrade === "ทั้งหมด" && selectedSubject === "ทั้งหมด"
                  ? totalCount >= 0
                    ? totalCount
                    : `${submissions.length}${hasMore ? "+" : ""}`
                  : filteredSubmissions.length}
              </span>
              <span className="text-xs font-bold text-slate-600">ชิ้น</span>
            </span>

            {/* Grade Level Filter */}
            <select
              aria-label="กรองตามสายชั้น"
              value={selectedGrade}
                onChange={(e) => changeGrade(e.target.value)}
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
                onChange={(e) => changeSubject(e.target.value)}
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
        {isRefreshing && submissions.length > 0 && (
          <div className="-mt-4 text-center text-xs font-bold text-blue-600" role="status">กำลังอัปเดตข้อมูลรอบที่เลือก…</div>
        )}
        {filteredSubmissions.length === 0 ? (
          <div className="glass-panel p-12 text-center rounded-3xl border border-slate-100 bg-slate-50/50 space-y-3">
            <p className="text-base font-extrabold text-slate-700">ไม่พบผลงานตามเงื่อนไขที่เลือก</p>
            <p className="text-xs text-slate-500 font-medium">
              ลองปรับเปลี่ยนคำค้นหา หรือ เลือกทุกสายชั้น / ทุกกลุ่มสาระ
              {hasMore && " หรือกดปุ่มโหลดผลงานเพิ่มเติมด้านล่างเพื่อค้นหาให้ครอบคลุมมากขึ้น"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {pagedGroups.map((group) => (
              <PersonCard
                key={group.key}
                group={group}
                avatarUrl={avatarByName.get(normName(group.fullName))}
                onOpen={() =>
                  onOpenPerson
                    ? onOpenPerson(
                        group.fullName,
                        group.axis === "subjectGroup" ? "subject" : "grade",
                        group.categoryValue,
                      )
                    : setActiveSubmission(group.works[0])
                }
              />
            ))}
          </div>
        )}

        {/* 20 works per page. The next cursor batch is fetched only when needed. */}
        {groups.length > ITEMS_PER_PAGE || hasMore ? (
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
