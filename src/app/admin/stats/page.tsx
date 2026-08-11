"use client";

import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AdminSidebar from "@/components/AdminSidebar";
import { getInstantProjects, getProjects } from "@/lib/projects-service";
import { getInstantSubmissions, getSubmissions } from "@/lib/submission-service";
import { getInstantTeachers, getTeachers, mergeTeachersWithSubmitters, TeacherItem } from "@/lib/teachers-service";
import { gradeLabel, gradeOrder, shortSubject } from "@/lib/format";
import { Project, Submission } from "@/lib/types";
import { BarChart3, CheckCircle2, Clipboard, Clock3, FileStack, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const norm = (value: string) => (value || "").replace(/\s+/g, "").replace(/^ครู/, "").trim();

type TeacherProgress = {
  teacher: TeacherItem;
  submitted: number;
  missing: string[];
  complete: boolean;
};

export default function AdminStatsPage() {
  const instantTeachers = getInstantTeachers();
  const instantProjects = getInstantProjects();
  const instantSubmissions = getInstantSubmissions();
  const [teachers, setTeachers] = useState<TeacherItem[]>(instantTeachers);
  const [projects, setProjects] = useState<Project[]>(instantProjects);
  const [submissions, setSubmissions] = useState<Submission[]>(instantSubmissions);
  const [projectId, setProjectId] = useState(instantProjects[0]?.id || "");
  const [loading, setLoading] = useState(instantTeachers.length === 0 && instantProjects.length === 0 && instantSubmissions.length === 0);
  const [copiedGroup, setCopiedGroup] = useState("");
  const [incompleteGroupBy, setIncompleteGroupBy] = useState<"grade" | "subject">("grade");
  const [teacherListStatus, setTeacherListStatus] = useState<"incomplete" | "complete">("incomplete");

  useEffect(() => {
    Promise.all([
      getTeachers(),
      getProjects(),
      getSubmissions({ limitNum: 2000, ignoreProjectFilter: true }),
    ]).then(([teacherData, projectData, submissionData]) => {
      setTeachers(teacherData);
      setProjects(projectData);
      setSubmissions(submissionData);
      setProjectId((current) => current && projectData.some((item) => item.id === current) ? current : projectData[0]?.id || "");
    }).catch((error) => console.error("Admin stats load error:", error))
      .finally(() => setLoading(false));
  }, []);

  const project = projects.find((item) => item.id === projectId);
  const projectSubmissions = useMemo(
    () => submissions.filter((item) => item.projectId === projectId),
    [projectId, submissions],
  );
  const statisticalTeachers = useMemo(
    () => mergeTeachersWithSubmitters(teachers, projectSubmissions),
    [teachers, projectSubmissions],
  );

  const progress = useMemo<TeacherProgress[]>(() => {
    const requiredTitles = project?.workSlotTitles || [];
    const works = new Map<string, Set<string>>();
    for (const item of projectSubmissions) {
      const key = norm(item.fullName);
      if (!works.has(key)) works.set(key, new Set());
      works.get(key)?.add(item.projectTitle.trim());
    }
    return statisticalTeachers.map((teacher) => {
      const submittedTitles = works.get(norm(teacher.fullName)) || new Set<string>();
      const missing = requiredTitles.filter((title) => !submittedTitles.has(title.trim()));
      const matched = requiredTitles.length - missing.length;
      return { teacher, submitted: matched, missing, complete: requiredTitles.length > 0 && missing.length === 0 };
    });
  }, [project, projectSubmissions, statisticalTeachers]);

  const summary = useMemo(() => {
    const submitted = progress.filter((item) => item.submitted > 0).length;
    const complete = progress.filter((item) => item.complete).length;
    return { total: progress.length, submitted, complete, incomplete: progress.length - complete, works: projectSubmissions.length };
  }, [progress, projectSubmissions]);

  const gradeRows = useMemo(() => {
    const groups = new Map<string, { grade: string; total: number; complete: number; submitted: number; works: number }>();
    for (const item of progress) {
      const grade = item.teacher.gradeLevel || "ไม่ระบุ";
      const row = groups.get(grade) || { grade, total: 0, complete: 0, submitted: 0, works: 0 };
      row.total += 1;
      row.works += item.submitted;
      if (item.submitted > 0) row.submitted += 1;
      if (item.complete) row.complete += 1;
      groups.set(grade, row);
    }
    return [...groups.values()].sort((a, b) => gradeOrder(a.grade) - gradeOrder(b.grade));
  }, [progress]);

  const subjectByTeacher = useMemo(() => {
    const map = new Map<string, string>();
    for (const submission of projectSubmissions) {
      if (submission.subjectGroup) map.set(norm(submission.fullName), submission.subjectGroup);
    }
    return map;
  }, [projectSubmissions]);

  const subjectRows = useMemo(() => {
    const groups = new Map<string, { label: string; total: number; complete: number; works: number }>();
    for (const item of progress) {
      const label = shortSubject(subjectByTeacher.get(norm(item.teacher.fullName)) || item.teacher.subjectGroup) || "ไม่ระบุ";
      const row = groups.get(label) || { label, total: 0, complete: 0, works: 0 };
      row.total += 1;
      row.works += item.submitted;
      if (item.complete) row.complete += 1;
      groups.set(label, row);
    }
    return [...groups.values()].sort((a, b) => b.total - a.total);
  }, [progress, subjectByTeacher]);

  const displayedTeacherGroups = useMemo(() => {
    const groups = new Map<string, TeacherProgress[]>();
    for (const item of progress.filter((row) => teacherListStatus === "complete" ? row.complete : !row.complete)) {
      const key = incompleteGroupBy === "grade"
        ? item.teacher.gradeLevel || "ไม่ระบุ"
        : shortSubject(subjectByTeacher.get(norm(item.teacher.fullName)) || item.teacher.subjectGroup) || "ไม่ระบุ";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)?.push(item);
    }
    return [...groups.entries()].sort(([a], [b]) =>
      incompleteGroupBy === "grade" ? gradeOrder(a) - gradeOrder(b) : a.localeCompare(b, "th")
    );
  }, [incompleteGroupBy, progress, subjectByTeacher, teacherListStatus]);

  const copyIncompleteGroup = async (group: string, items: TeacherProgress[]) => {
    if (!project) return;
    const groupLabel = incompleteGroupBy === "grade" ? gradeLabel(group) : group;
    const lines = [`📋 รายชื่อครูที่ส่งงานไม่ครบ`, project.name, `【${groupLabel}】`, `เกณฑ์ครบ ${project.workSlotTitles.length} ชิ้น`, ""];
    for (const item of items) {
      lines.push(`• ${item.teacher.fullName} — ส่ง ${item.submitted}/${project.workSlotTitles.length} ชิ้น`);
      item.missing.forEach((title) => lines.push(`  - ขาด: ${title}`));
    }
    await navigator.clipboard.writeText(lines.join("\n").trim());
    setCopiedGroup(group);
    window.setTimeout(() => setCopiedGroup(""), 1800);
  };

  const pieData = [
    { name: "ส่งครบ", value: summary.complete, color: "#10b981" },
    { name: "ยังไม่ครบ", value: summary.incomplete, color: "#f59e0b" },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 flex flex-col md:flex-row gap-6">
        <AdminSidebar />
        <main className="flex-1 min-w-0 space-y-6">
          <section className="p-6 rounded-3xl bg-white border border-slate-100 shadow-xs">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div><h1 className="text-2xl font-extrabold text-slate-900">สถิติการส่งงานแบบละเอียด</h1><p className="text-xs font-semibold text-slate-500">ติดตามความครบถ้วนรายคน สายชั้น และกลุ่มสาระ</p></div>
              <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold min-w-[260px]">
                {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
          </section>

          {loading ? <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-28 rounded-3xl skeleton-loading" />)}</div> : <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <Metric icon={<Users />} label="ครูทั้งหมด" value={summary.total} color="blue" />
              <Metric icon={<Clock3 />} label="ส่งแล้ว" value={summary.submitted} color="cyan" />
              <Metric icon={<CheckCircle2 />} label="ส่งครบ" value={summary.complete} color="emerald" />
              <Metric icon={<BarChart3 />} label="ยังไม่ครบ" value={summary.incomplete} color="amber" />
              <Metric icon={<FileStack />} label="ชิ้นงานทั้งหมด" value={summary.works} color="violet" />
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              <ChartCard title="สัดส่วนความครบถ้วน"><ResponsiveContainer width="100%" height={280}><PieChart><Pie data={pieData} dataKey="value" nameKey="name" innerRadius={65} outerRadius={95} paddingAngle={3}>{pieData.map((item) => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></ChartCard>
              <ChartCard title="ความคืบหน้าตามสายชั้น"><ResponsiveContainer width="100%" height={280}><BarChart data={gradeRows}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="grade" /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Bar dataKey="complete" name="ส่งครบ" fill="#10b981" radius={[6,6,0,0]} /><Bar dataKey="total" name="ครูทั้งหมด" fill="#bfdbfe" radius={[6,6,0,0]} /></BarChart></ResponsiveContainer></ChartCard>
            </div>

            <ProgressTable title="สรุปตามสายชั้น" required={project?.workSlotTitles.length || project?.maxUpload || 1} rows={gradeRows.map((row) => ({ label: gradeLabel(row.grade), total: row.total, complete: row.complete, works: row.works }))} />
            <ProgressTable title="สรุปตามกลุ่มสาระ" required={project?.workSlotTitles.length || project?.maxUpload || 1} rows={subjectRows} />

            <section className="rounded-3xl bg-white border border-slate-100 shadow-xs overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="font-extrabold text-slate-900">รายชื่อครูตามสถานะการส่งงาน</h2><p className="text-xs text-slate-500">ตรวจสอบผู้ที่ส่งครบและยังส่งไม่ครบ แยกเป็นหมวดหมู่</p></div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex p-1 rounded-xl bg-slate-100">
                    <button onClick={() => setIncompleteGroupBy("grade")} className={`px-3 py-2 rounded-lg text-xs font-extrabold transition-colors ${incompleteGroupBy === "grade" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}>ตามสายชั้น</button>
                    <button onClick={() => setIncompleteGroupBy("subject")} className={`px-3 py-2 rounded-lg text-xs font-extrabold transition-colors ${incompleteGroupBy === "subject" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}>ตามกลุ่มสาระ</button>
                  </div>
                </div>
              </div>
              <div className="px-5 pt-4 bg-white">
                <div className="inline-flex p-1 rounded-2xl bg-slate-100">
                  <button onClick={() => setTeacherListStatus("incomplete")} className={`px-4 py-2.5 rounded-xl text-xs font-extrabold transition-colors ${teacherListStatus === "incomplete" ? "bg-amber-500 text-white shadow-sm" : "text-slate-500"}`}>ยังส่งไม่ครบ ({summary.incomplete})</button>
                  <button onClick={() => setTeacherListStatus("complete")} className={`px-4 py-2.5 rounded-xl text-xs font-extrabold transition-colors ${teacherListStatus === "complete" ? "bg-emerald-500 text-white shadow-sm" : "text-slate-500"}`}>ส่งครบแล้ว ({summary.complete})</button>
                </div>
              </div>
              <div className="max-h-[640px] overflow-y-auto">
                {displayedTeacherGroups.map(([group, items]) => <div key={group}>
                  <div className="sticky top-0 z-10 px-4 py-2.5 bg-blue-50/95 backdrop-blur border-y border-blue-100 flex items-center justify-between">
                    <h3 className="text-xs font-extrabold text-blue-800">{incompleteGroupBy === "grade" ? gradeLabel(group) : group}</h3>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full bg-white text-[11px] font-bold text-blue-700">{items.length} คน</span>
                      {teacherListStatus === "incomplete" && <button onClick={() => copyIncompleteGroup(group, items)} disabled={!project} className="px-2.5 py-1.5 rounded-lg bg-blue-600 text-white text-[11px] font-extrabold flex items-center gap-1.5 disabled:opacity-50"><Clipboard className="w-3.5 h-3.5" />{copiedGroup === group ? "คัดลอกแล้ว" : incompleteGroupBy === "grade" ? "คัดลอกสายชั้นนี้" : "คัดลอกกลุ่มนี้"}</button>}
                    </div>
                  </div>
                  <div className="divide-y divide-slate-100">{items.map((item) => <div key={item.teacher.id} className="p-4 grid sm:grid-cols-[220px_110px_1fr] gap-2"><div><p className="font-bold text-sm text-slate-900">{item.teacher.fullName}</p><p className="text-[11px] text-slate-500">{gradeLabel(item.teacher.gradeLevel)} · {shortSubject(subjectByTeacher.get(norm(item.teacher.fullName)) || item.teacher.subjectGroup) || "ไม่ระบุ"}</p></div><p className={`text-xs font-extrabold ${item.complete ? "text-emerald-600" : "text-amber-600"}`}>{item.complete ? "ส่งครบ" : "ส่ง"} {item.submitted}/{project?.workSlotTitles.length || 0}</p><div className="flex flex-wrap gap-1.5">{item.complete ? <span className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-semibold">ครบทุกชิ้นงานแล้ว</span> : item.missing.map((title) => <span key={title} className="px-2 py-1 rounded-lg bg-rose-50 text-rose-700 text-[11px] font-semibold">ขาด: {title}</span>)}</div></div>)}</div>
                </div>)}
                {displayedTeacherGroups.length === 0 && <p className="p-8 text-center text-sm font-bold text-slate-500">ไม่มีรายชื่อในสถานะนี้</p>}
              </div>
            </section>
          </>}
        </main>
      </div>
      <Footer />
    </div>
  );
}

function Metric({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  const tones: Record<string, string> = { blue: "bg-blue-50 text-blue-600", cyan: "bg-cyan-50 text-cyan-600", emerald: "bg-emerald-50 text-emerald-600", amber: "bg-amber-50 text-amber-600", violet: "bg-violet-50 text-violet-600" };
  return <div className="p-4 rounded-3xl bg-white border border-slate-100 shadow-xs"><div className={`w-9 h-9 rounded-xl ${tones[color]} flex items-center justify-center [&>svg]:w-4 [&>svg]:h-4`}>{icon}</div><p className="text-2xl font-extrabold text-slate-900 mt-2">{value}</p><p className="text-[11px] font-semibold text-slate-500">{label}</p></div>;
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="p-5 rounded-3xl bg-white border border-slate-100 shadow-xs"><h2 className="font-extrabold text-slate-900 mb-3">{title}</h2>{children}</section>;
}

function ProgressTable({ title, rows, required = 1 }: { title: string; rows: Array<{ label: string; total: number; complete: number; works: number }>; required?: number }) {
  return <section className="rounded-3xl bg-white border border-slate-100 shadow-xs overflow-hidden"><h2 className="p-5 font-extrabold text-slate-900 border-b border-slate-100">{title}</h2><div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="text-left p-3">รายการ</th><th className="p-3">ครู</th><th className="p-3">ส่งครบ</th><th className="p-3">ชิ้นงาน</th><th className="text-left p-3 min-w-48">ความคืบหน้า</th></tr></thead><tbody>{rows.map((row) => { const expected = row.total * required; const percent = expected ? Math.min(100, Math.round(row.works / expected * 100)) : 0; return <tr key={row.label} className="border-t border-slate-100"><td className="p-3 font-bold">{row.label}</td><td className="p-3 text-center">{row.total}</td><td className="p-3 text-center text-emerald-600 font-bold">{row.complete}</td><td className="p-3 text-center">{row.works}/{expected}</td><td className="p-3"><div className="flex items-center gap-2"><div className="h-2 flex-1 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500" style={{ width: `${percent}%` }} /></div><span>{percent}%</span></div></td></tr>; })}</tbody></table></div></section>;
}
