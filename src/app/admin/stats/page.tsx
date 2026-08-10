"use client";

import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AdminSidebar from "@/components/AdminSidebar";
import { getProjects } from "@/lib/projects-service";
import { getSubmissions } from "@/lib/submission-service";
import { getTeachers, TeacherItem } from "@/lib/teachers-service";
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
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [projectId, setProjectId] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Promise.all([
      getTeachers(),
      getProjects(),
      getSubmissions({ limitNum: 500, ignoreProjectFilter: true }),
    ]).then(([teacherData, projectData, submissionData]) => {
      setTeachers(teacherData);
      setProjects(projectData);
      setSubmissions(submissionData);
      setProjectId(projectData[0]?.id || "");
    }).catch((error) => console.error("Admin stats load error:", error))
      .finally(() => setLoading(false));
  }, []);

  const project = projects.find((item) => item.id === projectId);
  const projectSubmissions = useMemo(
    () => submissions.filter((item) => item.projectId === projectId),
    [projectId, submissions],
  );

  const progress = useMemo<TeacherProgress[]>(() => {
    const requiredTitles = project?.workSlotTitles || [];
    const works = new Map<string, Set<string>>();
    for (const item of projectSubmissions) {
      const key = norm(item.fullName);
      if (!works.has(key)) works.set(key, new Set());
      works.get(key)?.add(item.projectTitle.trim());
    }
    return teachers.map((teacher) => {
      const submittedTitles = works.get(norm(teacher.fullName)) || new Set<string>();
      const missing = requiredTitles.filter((title) => !submittedTitles.has(title.trim()));
      return { teacher, submitted: submittedTitles.size, missing, complete: missing.length === 0 };
    });
  }, [project, projectSubmissions, teachers]);

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

  const subjectRows = useMemo(() => {
    const subjectByTeacher = new Map<string, string>();
    for (const submission of projectSubmissions) {
      if (submission.subjectGroup) subjectByTeacher.set(norm(submission.fullName), submission.subjectGroup);
    }
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
  }, [progress, projectSubmissions]);

  const copyIncomplete = async () => {
    if (!project) return;
    const incomplete = progress.filter((item) => !item.complete);
    const grades = [...new Set(incomplete.map((item) => item.teacher.gradeLevel))]
      .sort((a, b) => gradeOrder(a) - gradeOrder(b));
    const lines = [`📋 รายชื่อครูที่ส่งงานไม่ครบ`, project.name, `เกณฑ์ครบ ${project.workSlotTitles.length} ชิ้น`, ""];
    for (const grade of grades) {
      lines.push(`【${gradeLabel(grade)}】`);
      for (const item of incomplete.filter((row) => row.teacher.gradeLevel === grade)) {
        lines.push(`• ${item.teacher.fullName} — ส่ง ${item.submitted}/${project.workSlotTitles.length} ชิ้น`);
        item.missing.forEach((title) => lines.push(`  - ขาด: ${title}`));
      }
      lines.push("");
    }
    await navigator.clipboard.writeText(lines.join("\n").trim());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
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

            <ProgressTable title="สรุปตามสายชั้น" rows={gradeRows.map((row) => ({ label: gradeLabel(row.grade), total: row.total, complete: row.complete, works: row.works }))} />
            <ProgressTable title="สรุปตามกลุ่มสาระ" rows={subjectRows} />

            <section className="rounded-3xl bg-white border border-slate-100 shadow-xs overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-extrabold text-slate-900">ครูที่ยังส่งไม่ครบ</h2><p className="text-xs text-slate-500">แสดงชิ้นงานที่ยังขาดรายบุคคล</p></div><button onClick={copyIncomplete} disabled={!project} className="px-4 py-2.5 rounded-2xl bg-blue-600 text-white text-xs font-extrabold flex items-center gap-2 disabled:opacity-50"><Clipboard className="w-4 h-4" />{copied ? "คัดลอกแล้ว" : "คัดลอกสำหรับ LINE"}</button></div>
              <div className="divide-y divide-slate-100 max-h-[560px] overflow-y-auto">{progress.filter((item) => !item.complete).map((item) => <div key={item.teacher.id} className="p-4 grid sm:grid-cols-[220px_110px_1fr] gap-2"><div><p className="font-bold text-sm text-slate-900">{item.teacher.fullName}</p><p className="text-[11px] text-slate-500">{gradeLabel(item.teacher.gradeLevel)} · {shortSubject(item.teacher.subjectGroup)}</p></div><p className="text-xs font-extrabold text-amber-600">ส่ง {item.submitted}/{project?.workSlotTitles.length || 0}</p><div className="flex flex-wrap gap-1.5">{item.missing.map((title) => <span key={title} className="px-2 py-1 rounded-lg bg-rose-50 text-rose-700 text-[11px] font-semibold">ขาด: {title}</span>)}</div></div>)}</div>
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

function ProgressTable({ title, rows }: { title: string; rows: Array<{ label: string; total: number; complete: number; works: number }> }) {
  return <section className="rounded-3xl bg-white border border-slate-100 shadow-xs overflow-hidden"><h2 className="p-5 font-extrabold text-slate-900 border-b border-slate-100">{title}</h2><div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="text-left p-3">รายการ</th><th className="p-3">ครู</th><th className="p-3">ส่งครบ</th><th className="p-3">ชิ้นงาน</th><th className="text-left p-3 min-w-48">ความคืบหน้า</th></tr></thead><tbody>{rows.map((row) => { const percent = row.total ? Math.round(row.complete / row.total * 100) : 0; return <tr key={row.label} className="border-t border-slate-100"><td className="p-3 font-bold">{row.label}</td><td className="p-3 text-center">{row.total}</td><td className="p-3 text-center text-emerald-600 font-bold">{row.complete}</td><td className="p-3 text-center">{row.works}</td><td className="p-3"><div className="flex items-center gap-2"><div className="h-2 flex-1 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500" style={{ width: `${percent}%` }} /></div><span>{percent}%</span></div></td></tr>; })}</tbody></table></div></section>;
}
