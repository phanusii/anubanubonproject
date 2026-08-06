"use client";

import { useEffect, useState, useMemo } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MasonryCard from "@/components/MasonryCard";
import SubmissionModal from "@/components/SubmissionModal";
import { getSubmissions, getTrainingSettings, getInstantSubmissions, DEFAULT_GRADE_LEVELS, DEFAULT_SUBJECT_GROUPS } from "@/lib/submission-service";
import { getGradeLevels, getSubjectGroups } from "@/lib/masters-service";
import { Submission, GradeLevelOption, SubjectGroupOption, TrainingSettings } from "@/lib/types";
import { Search, SlidersHorizontal, Sparkles, FolderKanban, CheckCircle2, Layers, BookOpen } from "lucide-react";

export default function GalleryPage() {
  // Instant synchronous initialization for 0ms frame-0 render (Never displays 0 items!)
  const [submissions, setSubmissions] = useState<Submission[]>(() => getInstantSubmissions());
  const [gradeLevels, setGradeLevels] = useState<GradeLevelOption[]>(DEFAULT_GRADE_LEVELS);
  const [subjectGroups, setSubjectGroups] = useState<SubjectGroupOption[]>(DEFAULT_SUBJECT_GROUPS);
  const [settings, setSettings] = useState<TrainingSettings | null>(null);

  // Search & Filter state
  const [search, setSearch] = useState("");
  const [selectedGrade, setSelectedGrade] = useState("ทั้งหมด");
  const [selectedSubject, setSelectedSubject] = useState("ทั้งหมด");

  // Selected Submission Modal
  const [activeSubmission, setActiveSubmission] = useState<Submission | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [subs, gls, sgs, st] = await Promise.all([
          getSubmissions(),
          getGradeLevels(),
          getSubjectGroups(),
          getTrainingSettings(),
        ]);

        if (subs && subs.length > 0) setSubmissions(subs);
        if (gls && gls.length > 0) setGradeLevels(gls);
        if (sgs && sgs.length > 0) setSubjectGroups(sgs);
        if (st) setSettings(st);
      } catch (err) {
        console.error("Gallery page refresh error:", err);
      }
    }
    loadData();
  }, []);

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

      return matchesSearch && matchesGrade && matchesSubject;
    });
  }, [submissions, search, selectedGrade, selectedSubject]);

  const isSpecificFilterActive = settings?.activeProjectFilterMode === 'specific' && settings.activeProjectFilterName;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="text-center space-y-3 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-extrabold bg-blue-100/70 text-blue-700 backdrop-blur-md border border-blue-200">
            <Sparkles className="w-3.5 h-3.5" />
            <span>คลังรวมผลงานและสื่อการจัดการเรียนรู้ดิจิทัล</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            ผลงานที่ได้รับการเผยแพร่ ({filteredSubmissions.length} รายการ)
          </h1>
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

        {/* Multi-Field Search & Filter Controls */}
        <div className="glass-panel p-4 sm:p-6 rounded-3xl border border-white space-y-4 shadow-sm bg-white">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Multi-Field Search Bar */}
            <div className="relative w-full md:w-96">
              <Search className="w-4 h-4 absolute left-4 top-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="ค้นหาชื่อครู, ชื่อผลงาน, โรงเรียน, กลุ่มสาระ..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-2xl border border-slate-200 bg-slate-50/50 text-slate-900 font-semibold text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none transition-all"
              />
            </div>

            {/* Instant Filter Select Dropdowns */}
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                <SlidersHorizontal className="w-4 h-4 text-blue-600" />
                <span>กรองผลงาน:</span>
              </div>

              {/* Grade Level Filter */}
              <select
                value={selectedGrade}
                onChange={(e) => setSelectedGrade(e.target.value)}
                className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 text-slate-800 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-2xs"
              >
                <option value="ทั้งหมด">ทุกสายชั้น (อ.1 - ป.6)</option>
                {gradeLevels.map((gl) => (
                  <option key={gl.id} value={gl.name}>
                    ครูสายชั้น{gl.name}
                  </option>
                ))}
              </select>

              {/* Subject Group Filter */}
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 text-slate-800 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-2xs max-w-xs"
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
        </div>

        {/* Submissions Cards Grid */}
        {filteredSubmissions.length === 0 ? (
          <div className="glass-panel p-12 text-center rounded-3xl border border-slate-100 bg-slate-50/50 space-y-3">
            <p className="text-base font-extrabold text-slate-700">ไม่พบผลงานตามเงื่อนไขที่เลือก</p>
            <p className="text-xs text-slate-500 font-medium">
              ลองปรับเปลี่ยนคำค้นหา หรือ เลือกทุกสายชั้น / ทุกกลุ่มสาระ
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredSubmissions.map((sub) => (
              <MasonryCard
                key={sub.id}
                submission={sub}
                onClick={() => setActiveSubmission(sub)}
              />
            ))}
          </div>
        )}
      </main>

      <Footer />

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
