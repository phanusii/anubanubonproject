"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { getInstantStatsWindow, getSubmissionsForStats } from "@/lib/submission-service";
import { getInstantTeachers, getTeachers, mergeTeachersWithSubmitters, TeacherItem } from "@/lib/teachers-service";
import { getInstantProjects, getProjects } from "@/lib/projects-service";
import { gradeLabel, gradeOrder, normalizeGradeKey } from "@/lib/format";
import { Submission, Project } from "@/lib/types";
import {
  BarChart3,
  Users,
  CheckCircle2,
  Clock,
  FileStack,
  Layers,
  ChevronDown,
} from "lucide-react";

/** Normalize a name for matching roster ↔ submissions (ignore spaces / a leading "ครู"). */
function normName(s: string): string {
  return (s || "").replace(/\s+/g, "").replace(/^ครู/, "").trim();
}

interface GroupStat {
  key: string;
  label: string;
  totalTeachers: number;
  submitted: number; // teachers with ≥1 work
  complete: number; // teachers with ≥ required works
  works: number; // total works submitted
  notDone: string[]; // teacher names not yet complete
  doneList: string[]; // teacher names who submitted the full set
}

function pct(n: number, d: number): number {
  if (!d) return 0;
  return Math.round((n / d) * 100);
}

export default function StatsSection() {
  const instantTeachers = getInstantTeachers();
  const instantProjects = getInstantProjects().filter((p) => p.showInGallery !== false);
  // Use the full stats-window cache (not the small gallery cache) so a warm cache
  // paints the correct totals instantly instead of flashing partial numbers.
  const instantStats = getInstantStatsWindow();
  const [teachers, setTeachers] = useState<TeacherItem[]>(instantTeachers);
  const [subs, setSubs] = useState<Submission[]>(instantStats);
  const [allSubs, setAllSubs] = useState<Submission[]>(instantStats);
  const [projects, setProjects] = useState<Project[]>(instantProjects);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(instantProjects[0]?.id || "all");
  const [required, setRequired] = useState<number>(() => instantProjects[0]?.workSlotTitles?.length || instantProjects[0]?.maxUpload || 1);
  // Only paint numbers once we have real submission data; otherwise show the loader
  // rather than misleading partial counts.
  const [loading, setLoading] = useState(instantStats.length === 0);
  const [expanded, setExpanded] = useState<string | null>(null);
  // Hidden rounds are excluded from the dropdown and from the "ทุกรอบ" totals.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  const applyProject = (pid: string, data: Submission[], projsForLookup: Project[], hidden: Set<string>) => {
    const selected = pid === "all" ? data : data.filter((s) => s.projectId === pid);
    // Under "ทุกรอบ", drop works that belong to hidden rounds.
    setSubs(selected.filter((s) => !s.projectId || !hidden.has(s.projectId)));
    const proj = projsForLookup.find((p) => p.id === pid);
    const req = pid === "all"
      ? Math.max(1, projsForLookup
          .filter((p) => p.showInGallery !== false)
          .reduce((sum, p) => sum + (p.workSlotTitles?.length || p.maxUpload || 1), 0))
      : proj?.workSlotTitles?.length || proj?.maxUpload || 1;
    setRequired(req);
  };

  useEffect(() => {
    async function init() {
      try {
        const [ts, projs, data] = await Promise.all([
          getTeachers(),
          getProjects(),
          getSubmissionsForStats(),
        ]);
        setTeachers(ts);
        setAllSubs(data);
        const visible = projs.filter((p) => p.showInGallery !== false);
        setProjects(visible);
        const hidden = new Set(projs.filter((p) => p.showInGallery === false).map((p) => p.id));
        setHiddenIds(hidden);
        // Default to the admin's first-ordered round.
        const initial = visible[0]?.id || "all";
        setSelectedProjectId(initial);
        applyProject(initial, data, projs, hidden);
      } catch (err) {
        console.error("Stats init error:", err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const selectProject = async (pid: string) => {
    if (pid === selectedProjectId) return;
    setSelectedProjectId(pid);
    applyProject(pid, allSubs, projects, hiddenIds);
  };

  // Count works per teacher (by normalized name).
  const worksByTeacher = useMemo(() => {
    const sets = new Map<string, Set<string>>();
    const allowed = new Map(projects.map((project) => [
      project.id,
      new Set((project.workSlotTitles || []).map((title) => title.trim())),
    ]));
    for (const s of subs) {
      const k = normName(s.fullName);
      const title = s.projectTitle?.trim();
      const projectTitles = s.projectId ? allowed.get(s.projectId) : undefined;
      if (!title || (projectTitles?.size && !projectTitles.has(title))) continue;
      if (!sets.has(k)) sets.set(k, new Set());
      sets.get(k)?.add(`${s.projectId || "legacy"}::${title}`);
    }
    return new Map([...sets].map(([key, titles]) => [key, titles.size]));
  }, [projects, subs]);

  // The imported roster has no subject group, so derive each teacher's group from
  // the subject group they picked on their submission (so submitters show correctly).
  const statisticalTeachers = useMemo(
    () => mergeTeachersWithSubmitters(teachers, subs),
    [teachers, subs],
  );

  const buildGroups = (pick: (t: TeacherItem) => string): GroupStat[] => {
    const groups = new Map<string, GroupStat>();
    for (const t of statisticalTeachers) {
      const key = pick(t) || "ไม่ระบุ";
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label: key,
          totalTeachers: 0,
          submitted: 0,
          complete: 0,
          works: 0,
          notDone: [],
          doneList: [],
        });
      }
      const g = groups.get(key)!;
      g.totalTeachers += 1;
      const count = worksByTeacher.get(normName(t.fullName)) || 0;
      g.works += count;
      if (count >= 1) g.submitted += 1;
      if (count >= required) { g.complete += 1; g.doneList.push(t.fullName); }
      else g.notDone.push(t.fullName);
    }
    return Array.from(groups.values());
  };

  const byGrade = useMemo(
    () => buildGroups((t) => normalizeGradeKey(t.gradeLevel)).sort((a, b) => gradeOrder(a.key) - gradeOrder(b.key)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [statisticalTeachers, worksByTeacher, required]
  );
  // School overall
  const overall = useMemo(() => {
    const totalTeachers = statisticalTeachers.length;
    let submitted = 0;
    let complete = 0;
    let works = 0;
    for (const t of statisticalTeachers) {
      const c = worksByTeacher.get(normName(t.fullName)) || 0;
      works += c;
      if (c >= 1) submitted += 1;
      if (c >= required) complete += 1;
    }
    return { totalTeachers, submitted, complete, works };
  }, [statisticalTeachers, worksByTeacher, required]);

  return (
    <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="text-center space-y-3 max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-extrabold bg-blue-100/70 text-blue-700 border border-blue-200">
          <BarChart3 className="w-3.5 h-3.5" />
          <span>สถิติการส่งงาน / ส่งผลงาน</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
          สรุปการส่งงานของครู
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 font-medium">
          สรุประดับโรงเรียนและสายชั้น — ใครส่งแล้ว ส่งครบไหม กี่ชิ้น คิดเป็นกี่%
          {required > 1 && ` (เกณฑ์ครบ = ${required} ชิ้น)`}
        </p>
      </div>

      {/* Round selector — dropdown ordered by the admin's setting */}
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
              className="w-full sm:flex-1 sm:min-w-[220px] px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 text-slate-800 text-xs font-bold focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none shadow-2xs"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value="all">ทั้งหมด (ทุกรอบ)</option>
            </select>
          </div>
        </div>
      )}

      {loading ? (
        <div className="glass-panel p-12 text-center rounded-3xl border border-slate-100 bg-slate-50/50">
          <p className="text-sm font-bold text-slate-500">กำลังคำนวณสถิติ...</p>
        </div>
      ) : (
        <>
          {/* Overall cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={<Users className="w-5 h-5" />} tone="blue" label="ครูทั้งหมด" value={overall.totalTeachers} />
            <StatCard
              icon={<CheckCircle2 className="w-5 h-5" />}
              tone="emerald"
              label="ส่งแล้ว (อย่างน้อย 1 ชิ้น)"
              value={overall.submitted}
              sub={`${pct(overall.submitted, overall.totalTeachers)}%`}
            />
            <StatCard
              icon={<CheckCircle2 className="w-5 h-5" />}
              tone="violet"
              label={`ส่งครบ (≥ ${required})`}
              value={overall.complete}
              sub={`${pct(overall.complete, overall.totalTeachers)}%`}
            />
            <StatCard icon={<FileStack className="w-5 h-5" />} tone="amber" label="ชิ้นงานทั้งหมด" value={overall.works} />
          </div>

          {/* By grade level */}
          <StatTable
            title="สรุปตามสายชั้น"
            icon={<Layers className="w-5 h-5 text-blue-600" />}
            groups={byGrade}
            required={required}
            labelFn={(k) => gradeLabel(k)}
            expanded={expanded}
            setExpanded={setExpanded}
          />

        </>
      )}
    </main>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub?: string;
  tone: "blue" | "emerald" | "violet" | "amber";
}) {
  const tones: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    violet: "bg-violet-50 text-violet-600",
    amber: "bg-amber-50 text-amber-600",
  };
  return (
    <div className="glass-panel p-4 rounded-3xl border border-white bg-white shadow-xs space-y-2">
      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${tones[tone]}`}>{icon}</div>
      <div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-extrabold text-slate-900">{value}</span>
          {sub && <span className="text-xs font-bold text-slate-500">{sub}</span>}
        </div>
        <p className="text-[11px] font-semibold text-slate-500 leading-tight">{label}</p>
      </div>
    </div>
  );
}

function StatTable({
  title,
  icon,
  groups,
  required,
  labelFn,
  expanded,
  setExpanded,
}: {
  title: string;
  icon: React.ReactNode;
  groups: GroupStat[];
  required: number;
  labelFn: (key: string) => string;
  expanded: string | null;
  setExpanded: (k: string | null) => void;
}) {
  // Progress means completed work slots, not only the share of teachers who
  // reached 100%. Cap at the expected slots so duplicates cannot exceed 100%.
  const rows = groups.map((g) => {
    const expectedWorks = g.totalTeachers * required;
    const p = pct(Math.min(g.works, expectedWorks), expectedWorks);
    return { g, p, isOpen: expanded === title + "|" + g.key };
  });
  const barTone = (p: number) => (p >= 100 ? "bg-emerald-500" : p >= 50 ? "bg-blue-500" : "bg-amber-400");
  const toggleKey = (key: string) => title + "|" + key;

  return (
    <div className="glass-panel rounded-3xl border border-white bg-white shadow-xs overflow-hidden">
      <div className="flex items-center gap-2 px-4 sm:px-5 py-4 border-b border-slate-100">
        {icon}
        <h2 className="text-base font-extrabold text-slate-900">{title}</h2>
      </div>

      {/* Mobile: stacked cards — everything fits in one column, no side-scroll. */}
      <div className="sm:hidden divide-y divide-slate-100">
        {rows.map(({ g, p, isOpen }) => (
          <div key={g.key} className="px-4 py-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-extrabold text-slate-800 text-sm min-w-0 truncate" title={labelFn(g.key)}>
                {labelFn(g.key)}
              </span>
              <span className="text-xs font-black text-slate-600 shrink-0">{p}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className={`h-full rounded-full ${barTone(p)}`} style={{ width: `${p}%` }} />
            </div>
            <div className="grid grid-cols-4 gap-1.5 text-center">
              <div className="rounded-xl bg-slate-50 py-1.5">
                <p className="text-sm font-black text-slate-700 leading-none">{g.totalTeachers}</p>
                <p className="text-[10px] font-bold text-slate-400 mt-1">ครู</p>
              </div>
              <div className="rounded-xl bg-emerald-50 py-1.5">
                <p className="text-sm font-black text-emerald-600 leading-none">{g.submitted}</p>
                <p className="text-[10px] font-bold text-emerald-500/80 mt-1">ส่งแล้ว</p>
              </div>
              <div className="rounded-xl bg-violet-50 py-1.5">
                <p className="text-sm font-black text-violet-600 leading-none">{g.complete}</p>
                <p className="text-[10px] font-bold text-violet-500/80 mt-1">ส่งครบ</p>
              </div>
              <div className="rounded-xl bg-amber-50 py-1.5">
                <p className="text-sm font-black text-amber-600 leading-none">{g.works}</p>
                <p className="text-[10px] font-bold text-amber-500/80 mt-1">ชิ้นงาน</p>
              </div>
            </div>
            {g.totalTeachers > 0 && (
              <div>
                <button
                  onClick={() => setExpanded(isOpen ? null : toggleKey(g.key))}
                  className="flex items-center gap-1 text-[11px] font-bold text-slate-600"
                >
                  <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  ดูรายชื่อ · ส่งครบ {g.complete} · ไม่ครบ {g.notDone.length}
                </button>
                {isOpen && (
                  <div className="mt-2 space-y-2.5">
                    {g.doneList.length > 0 && (
                      <div>
                        <p className="text-[11px] font-bold text-emerald-700 mb-1">ส่งครบแล้ว ({g.doneList.length} คน)</p>
                        <div className="flex flex-wrap gap-1.5">
                          {g.doneList.map((n) => (
                            <span key={n} className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-semibold">
                              {n}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {g.notDone.length > 0 && (
                      <div>
                        <p className="text-[11px] font-bold text-amber-700 mb-1">ยังส่งไม่ครบ ({g.notDone.length} คน)</p>
                        <div className="flex flex-wrap gap-1.5">
                          {g.notDone.map((n) => (
                            <span key={n} className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-slate-600 text-[11px] font-semibold">
                              {n}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Desktop: full table. */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 font-bold bg-slate-50/70">
              <th className="text-left px-4 py-3">รายการ</th>
              <th className="text-center px-3 py-3">ครู</th>
              <th className="text-center px-3 py-3">ส่งแล้ว</th>
              <th className="text-center px-3 py-3">ส่งครบ</th>
              <th className="text-center px-3 py-3">ชิ้นงาน</th>
              <th className="text-left px-4 py-3 w-40">ความคืบหน้า</th>
              <th className="px-2 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ g, p, isOpen }) => (
              <Fragment key={g.key}>
                <tr className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-bold text-slate-800 max-w-[220px] truncate" title={labelFn(g.key)}>
                    {labelFn(g.key)}
                  </td>
                  <td className="text-center px-3 py-3 font-semibold text-slate-700">{g.totalTeachers}</td>
                  <td className="text-center px-3 py-3 font-semibold text-emerald-600">
                    {g.submitted}
                    <span className="text-[10px] text-slate-400"> ({pct(g.submitted, g.totalTeachers)}%)</span>
                  </td>
                  <td className="text-center px-3 py-3 font-semibold text-violet-600">{g.complete}</td>
                  <td className="text-center px-3 py-3 font-semibold text-amber-600">{g.works}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className={`h-full rounded-full ${barTone(p)}`} style={{ width: `${p}%` }} />
                      </div>
                      <span className="text-[11px] font-bold text-slate-600 w-9 text-right">{p}%</span>
                    </div>
                  </td>
                  <td className="px-2 py-3 text-right">
                    {g.totalTeachers > 0 && (
                      <button
                        onClick={() => setExpanded(isOpen ? null : toggleKey(g.key))}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"
                        title="ดูรายชื่อครู"
                      >
                        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </button>
                    )}
                  </td>
                </tr>
                {isOpen && (
                  <tr className="bg-slate-50/60">
                    <td colSpan={7} className="px-4 py-3 space-y-3">
                      {g.doneList.length > 0 && (
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-[11px] font-bold text-emerald-700 mb-1">
                              ส่งครบแล้ว ({g.doneList.length} คน):
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {g.doneList.map((n) => (
                                <span key={n} className="px-2 py-0.5 rounded-md bg-white border border-emerald-200 text-emerald-800 text-[11px] font-semibold">
                                  {n}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                      {g.notDone.length > 0 && (
                        <div className="flex items-start gap-2">
                          <Clock className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-[11px] font-bold text-amber-700 mb-1">
                              ยังส่งไม่ครบ ({g.notDone.length} คน):
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {g.notDone.map((n) => (
                                <span key={n} className="px-2 py-0.5 rounded-md bg-white border border-amber-200 text-slate-600 text-[11px] font-semibold">
                                  {n}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
