"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Award,
  CheckCircle2,
  Download,
  FileWarning,
  LoaderCircle,
  Send,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import {
  certificateProgress,
  issueCertificate,
  latestSubmissionPerSlot,
  slotIdAt,
} from "@/lib/certificate-service";
import { getActiveProject, getProjects } from "@/lib/projects-service";
import {
  DEFAULT_GRADE_LEVELS,
  getPersonSubmissions,
} from "@/lib/submission-service";
import { getGradeLevels } from "@/lib/masters-service";
import { getTeachers, TeacherItem } from "@/lib/teachers-service";
import { CertificateRecord, GradeLevelOption, Project } from "@/lib/types";

type MissingWork = { index: number; title: string };
type RoundResult = {
  project: Project;
  record: CertificateRecord | null;
  missing: MissingWork[];
  submitted: number;
  required: number;
  certificateLoading?: boolean;
  certificateError?: string;
  waitingUntil?: string;
};

function friendlyCertificateError(message: string): string {
  if (message.includes("NEXT_PUBLIC_CERTIFICATE_SERVICE_URL")) {
    return "ระบบเกียรติบัตรกำลังปรับปรุง กรุณาลองใหม่อีกครั้งในภายหลัง";
  }
  if (/unauthorized|สิทธิ์/i.test(message)) {
    return "ระบบยังไม่สามารถออกเกียรติบัตรได้ กรุณาแจ้งผู้ดูแลระบบ";
  }
  return "ยังสร้างเกียรติบัตรไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
}

function certificatePreviewUrl(record: CertificateRecord): string {
  if (record.pdfFileId)
    return `https://drive.google.com/file/d/${encodeURIComponent(record.pdfFileId)}/preview`;
  const fileId =
    record.pdfUrl?.match(/\/d\/([^/?]+)/)?.[1] ||
    record.pdfUrl?.match(/[?&]id=([^&]+)/)?.[1];
  return fileId
    ? `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`
    : "";
}

export default function CertificatePage() {
  const [name, setName] = useState("");
  const [gradeLevel, setGradeLevel] = useState(
    () => DEFAULT_GRADE_LEVELS[0]?.name || "",
  );
  const [gradeLevels, setGradeLevels] =
    useState<GradeLevelOption[]>(DEFAULT_GRADE_LEVELS);
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [activeProjectId, setActiveProjectId] = useState("");
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Cached lists are already usable above; this refresh never blocks grade selection.
    getGradeLevels()
      .then(async (levels) => {
        setGradeLevels(levels);
        const initialGrade = levels[0]?.name || "";
        if (initialGrade) {
          setGradeLevel(initialGrade);
          setTeachers(await getTeachers(initialGrade));
        }
      })
      .catch(() => setError("โหลดรายชื่อครูไม่สำเร็จ กรุณาลองใหม่"))
      .finally(() => setLoadingLists(false));
  }, []);

  const teachersByGrade = useMemo(() => {
    const grouped = new Map<string, TeacherItem[]>();
    teachers.forEach((teacher) => {
      const rows = grouped.get(teacher.gradeLevel) || [];
      rows.push(teacher);
      grouped.set(teacher.gradeLevel, rows);
    });
    grouped.forEach((rows) =>
      rows.sort((a, b) => a.fullName.localeCompare(b.fullName, "th")),
    );
    return grouped;
  }, [teachers]);
  const teachersInGrade = teachersByGrade.get(gradeLevel) || [];

  const resetResult = () => {
    setSearched(false);
    setResults([]);
    setError("");
  };

  const changeGrade = async (value: string) => {
    setGradeLevel(value);
    setName("");
    resetResult();
    setLoadingLists(true);
    try {
      setTeachers(await getTeachers(value));
    } catch {
      setError("โหลดรายชื่อครูไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setLoadingLists(false);
    }
  };

  const search = async (selectedName: string) => {
    const fullName = selectedName.trim();
    if (!fullName) return;
    setLoading(true);
    setError("");
    setResults([]);
    try {
      const [projects, active, all] = await Promise.all([
        getProjects(),
        getActiveProject(),
        getPersonSubmissions(fullName),
      ]);
      if (!projects.length) throw new Error("ยังไม่มีรอบการอบรมหรือโครงการ");
      setActiveProjectId(active?.id || "");
      const roundResults = projects.map((round): RoundResult => {
        const current = all.filter((item) => item.projectId === round.id);
        const status = certificateProgress(current, round);
        const latest = latestSubmissionPerSlot(current, round);
        const missingItems = round.workSlotTitles
          .map((title, index) => ({ title, index }))
          .filter(({ index }) => !latest.has(slotIdAt(index)));
        const finalizeAt = round.certificate?.certificateFinalizeAt;
        const cutoffPassed = Boolean(
          finalizeAt && Date.now() >= new Date(finalizeAt).getTime(),
        );
        const eligible =
          status.submitted > 0 &&
          (status.complete
            ? round.certificate?.issueForComplete !== false
            : Boolean(round.certificate?.issueForPartial));
        return {
          project: round,
          record: null,
          missing: status.complete ? [] : missingItems,
          submitted: status.submitted,
          required: status.required,
          certificateLoading:
            cutoffPassed && eligible && Boolean(round.certificate?.enabled),
          waitingUntil:
            !cutoffPassed && finalizeAt && status.submitted > 0
              ? finalizeAt
              : undefined,
        };
      });
      setResults(roundResults);
      setSearched(true);
      setLoading(false);

      // The service enforces the cutoff and returns the single shared Drive PDF.
      roundResults
        .filter((item) => item.certificateLoading)
        .forEach((item) => {
          issueCertificate(item.project.id, fullName)
            .then((certificate) =>
              setResults((current) =>
                current.map((row) =>
                  row.project.id === item.project.id
                    ? { ...row, record: certificate, certificateLoading: false }
                    : row,
                ),
              ),
            )
            .catch((cause) =>
              setResults((current) =>
                current.map((row) =>
                  row.project.id === item.project.id
                    ? {
                        ...row,
                        certificateLoading: false,
                        certificateError: friendlyCertificateError(
                          cause instanceof Error ? cause.message : "",
                        ),
                      }
                    : row,
                ),
              ),
            );
        });
    } catch (cause) {
      setSearched(true);
      setError(
        cause instanceof Error
          ? cause.message
          : "ตรวจสอบข้อมูลไม่สำเร็จ กรุณาลองใหม่",
      );
    } finally {
      setLoading(false);
    }
  };

  const submitLink = (item: MissingWork) =>
    `/?certificateName=${encodeURIComponent(name.trim())}&slot=${item.index + 1}#submit`;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6 sm:py-10 space-y-5">
        <section className="rounded-3xl bg-linear-to-br from-amber-400 to-orange-500 px-6 py-6 text-white shadow-lg flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
            <Award className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold">
              ตรวจสอบเกียรติบัตร
            </h1>
            <p className="text-sm font-semibold text-amber-50 mt-1">
              เลือกสายชั้นและชื่อ ระบบจะแสดงผลให้ทันที
            </p>
          </div>
        </section>
        <section className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 grid sm:grid-cols-2 gap-4 shadow-sm">
          <label className="space-y-1.5">
            <span className="text-xs font-extrabold text-slate-600">
              1. เลือกสายชั้น
            </span>
            <select
              value={gradeLevel}
              onChange={(e) => void changeGrade(e.target.value)}
              disabled={loadingLists}
              className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white font-bold outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="">เลือกสายชั้น</option>
              {gradeLevels.map((level) => (
                <option key={level.id} value={level.name}>
                  {level.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-extrabold text-slate-600">
              2. เลือกรายชื่อครู
            </span>
            <select
              value={name}
              onChange={(e) => {
                const value = e.target.value;
                setName(value);
                resetResult();
                if (value) void search(value);
              }}
              disabled={!gradeLevel || loadingLists || loading}
              className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white font-bold outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-60"
            >
              <option value="">
                {teachersInGrade.length
                  ? "เลือกรายชื่อครู"
                  : "ไม่พบรายชื่อในสายชั้นนี้"}
              </option>
              {teachersInGrade.map((teacher) => (
                <option key={teacher.id} value={teacher.fullName}>
                  {teacher.fullName}
                </option>
              ))}
            </select>
          </label>
          {loading && (
            <div className="sm:col-span-2 rounded-2xl bg-amber-50 p-3 flex items-center justify-center gap-2 text-sm font-extrabold text-amber-700">
              <LoaderCircle className="w-5 h-5 animate-spin" />
              กำลังตรวจสอบทุกรอบ...
            </div>
          )}
        </section>
        {error && (
          <p
            role="alert"
            className="rounded-2xl border border-red-200 bg-red-50 p-4 font-bold text-red-700"
          >
            {error}
          </p>
        )}
        {searched && !error && (
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-1">
              <div>
                <p className="text-xs font-extrabold text-amber-600 uppercase tracking-wide">
                  ผลการตรวจสอบ
                </p>
                <h2 className="text-xl font-extrabold text-slate-900">
                  {name}
                </h2>
              </div>
              <p className="text-sm font-semibold text-slate-500">
                ทั้งหมด {results.length} รอบ
              </p>
            </div>
            {results.map((result) => (
              <article
                key={result.project.id}
                className="overflow-hidden bg-white rounded-3xl border border-slate-200 shadow-sm"
              >
                <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold text-blue-600 mb-1">
                      {result.project.kind === "training"
                        ? "การอบรม"
                        : "โครงการ"}{" "}
                      · ปีงบประมาณ{" "}
                      {result.project.budgetYear ||
                        result.project.academicYear ||
                        "-"}
                    </p>
                    <h3 className="font-extrabold text-slate-900 leading-relaxed">
                      {result.project.name}
                    </h3>
                  </div>
                  <span
                    className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-extrabold ${result.submitted === result.required && result.required > 0 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}
                  >
                    ส่งแล้ว {result.submitted}/{result.required}
                  </span>
                </div>
                <div className="border-t border-slate-100 p-5 sm:p-6 bg-slate-50/60">
                  {result.record?.status === "issued" ? (
                    <div className="space-y-4">
                      <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex gap-3">
                          <CheckCircle2 className="w-7 h-7 text-emerald-600 shrink-0" />
                          <div>
                            <h4 className="font-extrabold text-emerald-900">
                              ได้รับเกียรติบัตรแล้ว
                            </h4>
                            <p className="text-sm text-emerald-700">
                              เลขที่ {result.record.certificateNumber}
                            </p>
                          </div>
                        </div>
                        {result.record.pdfUrl && (
                          <a
                            href={result.record.pdfUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex justify-center items-center gap-2 px-5 py-3 rounded-2xl bg-emerald-600 text-white font-extrabold shadow-sm"
                          >
                            <Download className="w-4 h-4" />
                            ดาวน์โหลดเกียรติบัตร
                          </a>
                        )}
                      </div>
                      {certificatePreviewUrl(result.record) && (
                        <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white">
                          <div className="px-4 py-3 border-b border-slate-100">
                            <h4 className="font-extrabold text-slate-800">
                              ตัวอย่างเกียรติบัตร
                            </h4>
                            <p className="text-xs text-slate-500">
                              ตรวจสอบรายละเอียดก่อนดาวน์โหลดหรือพิมพ์
                            </p>
                          </div>
                          <div className="aspect-[1.414/1] bg-slate-100">
                            <iframe
                              title={`ตัวอย่างเกียรติบัตรของ ${result.record.recipientName}`}
                              src={certificatePreviewUrl(result.record)}
                              className="w-full h-full border-0"
                              loading="lazy"
                              allowFullScreen
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : result.certificateLoading ? (
                    <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 flex items-center gap-3 text-sm font-bold text-emerald-700">
                      <LoaderCircle className="w-5 h-5 animate-spin shrink-0" />
                      <div>
                        <p className="font-extrabold">ส่งงานครบแล้ว</p>
                        <p className="font-medium">
                          กำลังจัดเตรียมเกียรติบัตร กรุณารอสักครู่
                        </p>
                      </div>
                    </div>
                  ) : result.certificateError ? (
                    <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 flex gap-3">
                      <FileWarning className="w-6 h-6 text-rose-500 shrink-0" />
                      <div>
                        <h4 className="font-extrabold text-rose-800">
                          ส่งงานครบแล้ว
                        </h4>
                        <p className="text-sm font-semibold text-rose-700 mt-0.5">
                          {result.certificateError}
                        </p>
                        <button
                          type="button"
                          onClick={() => void search(name)}
                          className="mt-3 px-4 py-2 rounded-xl bg-white border border-rose-200 text-sm font-extrabold text-rose-700"
                        >
                          ลองใหม่
                        </button>
                      </div>
                    </div>
                  ) : result.waitingUntil ? (
                    <div className="rounded-2xl bg-blue-50 border border-blue-200 p-4">
                      <h4 className="font-extrabold text-blue-900">
                        รอสรุปผลการส่งงาน
                      </h4>
                      <p className="mt-1 text-sm font-semibold text-blue-700">
                        ระบบจะตัดยอดตามวัน–เวลาที่ผู้ดูแลกำหนด
                        แล้วจึงแสดงเกียรติบัตรที่มีสิทธิ์
                      </p>
                    </div>
                  ) : result.missing.length ? (
                    <div className="space-y-3">
                      <div className="flex gap-3">
                        <FileWarning className="w-6 h-6 text-amber-600 shrink-0" />
                        <div>
                          <h4 className="font-extrabold text-amber-900">
                            ยังส่งไม่ครบ {result.missing.length} ชิ้นงาน
                          </h4>
                          <p className="text-sm text-slate-500">
                            ส่งรายการด้านล่างให้ครบเพื่อรับเกียรติบัตร
                          </p>
                        </div>
                      </div>
                      {result.missing.map((item) => (
                        <div
                          key={item.index}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-white border border-slate-200 p-4"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-rose-500">
                              ชิ้นที่ {item.index + 1}
                            </p>
                            <p className="font-bold text-slate-900 leading-relaxed">
                              {item.title}
                            </p>
                          </div>
                          {result.project.id === activeProjectId ? (
                            <a
                              href={submitLink(item)}
                              className="shrink-0 inline-flex justify-center items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-extrabold"
                            >
                              <Send className="w-4 h-4" />
                              ส่งชิ้นงาน
                            </a>
                          ) : (
                            <span className="shrink-0 text-xs font-bold text-slate-400">
                              ปิดรับส่งแล้ว
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-2xl bg-white border border-slate-200 p-4 text-sm font-bold text-slate-600">
                      ส่งงานครบแล้ว แต่รอบนี้ยังไม่ได้เปิดใช้งานเกียรติบัตร
                    </p>
                  )}
                </div>
              </article>
            ))}
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}
