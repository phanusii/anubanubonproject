"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MasonryCard from "@/components/MasonryCard";
import SubmissionModal from "@/components/SubmissionModal";
import { getSubmissions, getTrainingSettings, getInstantSettings, getInstantSubmissions, DEFAULT_GRADE_LEVELS, DEFAULT_SUBJECT_GROUPS } from "@/lib/submission-service";
import { getGradeLevels, getSubjectGroups } from "@/lib/masters-service";
import { Submission, TrainingSettings, GradeLevelOption, SubjectGroupOption } from "@/lib/types";
import { 
  Send, 
  Search, 
  Sparkles, 
  SlidersHorizontal, 
  CheckCircle2, 
  ArrowRight,
  School,
  FileCheck,
  Building,
  Eye
} from "lucide-react";

export default function Home() {
  const [submissions, setSubmissions] = useState<Submission[]>(getInstantSubmissions());
  const [settings, setSettings] = useState<TrainingSettings>(getInstantSettings());
  const [gradeLevels, setGradeLevels] = useState<GradeLevelOption[]>(DEFAULT_GRADE_LEVELS);
  const [subjectGroups, setSubjectGroups] = useState<SubjectGroupOption[]>(DEFAULT_SUBJECT_GROUPS);
  // Only show the skeleton on a genuinely cold start (no cached/instant data yet).
  const [loading, setLoading] = useState(() => getInstantSubmissions().length === 0);

  // Filters
  const [search, setSearch] = useState("");
  const [selectedGrade, setSelectedGrade] = useState("ทั้งหมด");
  const [selectedSubject, setSelectedSubject] = useState("ทั้งหมด");

  // Selected Submission for Modal
  const [activeSubmission, setActiveSubmission] = useState<Submission | null>(null);

  useEffect(() => {
    async function loadDataParallel() {
      try {
        const [settingsData, subsData, glsData, sgsData] = await Promise.all([
          getTrainingSettings(true),
          getSubmissions({ limitNum: 12 }),
          getGradeLevels(),
          getSubjectGroups(),
        ]);

        if (settingsData) setSettings(settingsData);
        if (subsData.length > 0) setSubmissions(subsData);
        if (glsData.length > 0) setGradeLevels(glsData);
        if (sgsData.length > 0) setSubjectGroups(sgsData);
      } catch (err) {
        console.error("Error loading home page data:", err);
      } finally {
        setLoading(false);
      }
    }

    loadDataParallel();
  }, []);

  // Filter Submissions dynamically
  const filteredSubmissions = submissions.filter((sub) => {
    const fullText = [
      sub.fullName,
      sub.projectTitle,
      sub.school,
      sub.position,
      sub.gradeLevel,
      sub.subjectGroup,
      sub.province || "",
      sub.description || "",
    ].join(" ").toLowerCase();

    const matchesSearch = search === "" || fullText.includes(search.toLowerCase());
    const matchesGrade = selectedGrade === "ทั้งหมด" || sub.gradeLevel === selectedGrade;
    const matchesSubject = selectedSubject === "ทั้งหมด" || sub.subjectGroup === selectedSubject;
    return matchesSearch && matchesGrade && matchesSubject;
  });

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
        {/* Banner Section */}
        <section className="relative rounded-3xl overflow-hidden glass-panel border border-white shadow-xl bg-white">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600/90 via-sky-500/85 to-indigo-600/80 z-10" />
          <img
            src={settings?.bannerUrl || "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=1200&auto=format&fit=crop"}
            alt="Training Banner"
            loading="eager"
            fetchPriority="high"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover"
          />

          <div className="relative z-20 p-6 sm:p-12 text-white max-w-3xl space-y-6">
            {/* Header Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/20 backdrop-blur-md text-xs font-bold border border-white/30 shadow-xs">
              <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
              <span>{settings?.categoryType || "การส่งผลงานนวัตกรรมการเรียนรู้"} ปีการศึกษา {settings?.academicYear || "2569"}</span>
            </div>

            {/* Title */}
            <h1 className="text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight leading-tight text-white drop-shadow-xs">
              {settings?.trainingName || "โครงการส่งเสริมและพัฒนานวัตกรรมการจัดการเรียนรู้เชิงรุก (Active Learning)"}
            </h1>

            {/* School & Educational Area */}
            <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm font-semibold text-blue-100">
              <div className="flex items-center gap-1.5 bg-black/20 px-3 py-1 rounded-xl backdrop-blur-xs">
                <School className="w-4 h-4 text-amber-300" />
                <span>{settings?.schoolName || "โรงเรียนอนุบาลอุบลราชธานี"}</span>
              </div>
              <div className="flex items-center gap-1.5 bg-black/20 px-3 py-1 rounded-xl backdrop-blur-xs">
                <Building className="w-4 h-4 text-sky-300" />
                <span>{settings?.educationalArea || "สำนักงานเขตพื้นที่การศึกษาประถมศึกษาอุบลราชธานี เขต 1"}</span>
              </div>
            </div>

            {/* Description */}
            <p className="text-xs sm:text-sm text-blue-50/90 leading-relaxed font-medium line-clamp-3">
              {settings?.trainingDescription || "ขอเชิญชวนข้าราชการครูและบุคลากรทางการศึกษา ร่วมส่งผลงานแผนการจัดการเรียนรู้ สื่อดิจิทัล และผลงานนวัตกรรมเพื่อการเรียนรู้"}
            </p>

            {/* Active Filter Mode Indicator */}
            {settings?.activeProjectFilterMode === 'specific' && (
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-amber-500/30 border border-amber-300/40 text-amber-100 text-xs font-bold backdrop-blur-md">
                <Eye className="w-4 h-4 text-amber-300" />
                <span>กำลังแสดงเฉพาะผลงาน: {settings.activeProjectFilterName}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-2 flex flex-wrap gap-4">
              <Link
                href="/submit"
                className="px-6 py-3.5 rounded-2xl bg-white text-blue-600 font-extrabold text-sm shadow-lg hover:bg-blue-50 hover:scale-105 transition-all duration-200 flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                <span>ส่งผลงานนวัตกรรม</span>
              </Link>
              <Link
                href="/gallery"
                className="px-6 py-3.5 rounded-2xl bg-white/20 hover:bg-white/30 text-white border border-white/30 font-bold text-sm backdrop-blur-md transition-all flex items-center gap-2"
              >
                <span>ดูผลงานทั้งหมด</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* Filter & Search Bar */}
        <section className="glass-panel p-4 sm:p-6 rounded-3xl border border-white space-y-4 shadow-xs bg-white">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative w-full md:w-96">
              <Search className="w-4 h-4 absolute left-4 top-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="ค้นหาชื่อครู, ผลงาน, กลุ่มสาระ, สายชั้น..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50/50 text-slate-900 placeholder:text-slate-400 font-semibold text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none transition-all"
              />
            </div>

            {/* Select Filter Dropdowns */}
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                <SlidersHorizontal className="w-4 h-4 text-blue-600" />
                <span>ตัวกรอง:</span>
              </div>

              {/* Grade Level Dropdown */}
              <select
                value={selectedGrade}
                onChange={(e) => setSelectedGrade(e.target.value)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
              >
                <option value="ทั้งหมด">ทุกสายชั้น</option>
                {gradeLevels.map((gl) => (
                  <option key={gl.id} value={gl.name}>
                    {gl.name}
                  </option>
                ))}
              </select>

              {/* Subject Group Dropdown */}
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none max-w-xs"
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
        </section>

        {/* Submissions Section */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <FileCheck className="w-6 h-6 text-blue-600" />
              <span>ผลงานล่าสุดที่ได้รับการเผยแพร่</span>
            </h2>
            <Link
              href="/gallery"
              className="text-xs font-extrabold text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              <span>ดูทั้งหมด ({filteredSubmissions.length})</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {loading ? (
            /* Skeleton Loading Grid */
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {Array.from({ length: 8 }).map((_, idx) => (
                <div key={idx} className="glass-panel rounded-3xl p-4 space-y-3 animate-pulse border border-slate-100 bg-white">
                  <div className="aspect-4/3 bg-slate-200 rounded-2xl" />
                  <div className="h-4 bg-slate-200 rounded-lg w-3/4" />
                  <div className="h-3 bg-slate-150 rounded-lg w-1/2" />
                </div>
              ))}
            </div>
          ) : filteredSubmissions.length === 0 ? (
            /* Empty State */
            <div className="glass-panel p-12 text-center rounded-3xl border border-dashed border-slate-200 bg-white/50 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-500 flex items-center justify-center mx-auto">
                <FileCheck className="w-6 h-6" />
              </div>
              <h3 className="font-extrabold text-slate-800 text-base">ไม่พบผลงานตามเงื่อนไขที่เลือก</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto font-medium">
                ลองปรับเปลี่ยนคำค้นหา หรือเลือกตัวกรองสายชั้นและกลุ่มสาระการเรียนใหม่อีกครั้ง
              </p>
            </div>
          ) : (
            /* Fast Rendering Masonry Card Grid */
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {filteredSubmissions.map((submission) => (
                <MasonryCard
                  key={submission.id}
                  submission={submission}
                  onClick={() => setActiveSubmission(submission)}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Submission Detail Modal */}
      {activeSubmission && (
        <SubmissionModal
          submission={activeSubmission}
          onClose={() => setActiveSubmission(null)}
        />
      )}

      <Footer />
    </div>
  );
}
