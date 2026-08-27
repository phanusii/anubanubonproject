"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  certificateRecipientKey,
  certificateProgress,
  findCertificateForRecipient,
  latestSubmissionPerSlot,
  requestCertificateCorrection,
  slotIdAt,
} from "@/lib/certificate-service";
import { getActiveProject, getProjects } from "@/lib/projects-service";
import {
  getGallerySubmissions,
  getUserProjectSubmissions,
} from "@/lib/submission-service";
import {
  getProjectParticipantsForStats,
  getTeachers,
  getInstantTeachers,
  mergeTeachersWithSubmitters,
  TeacherItem,
} from "@/lib/teachers-service";
import { getProjectStatsSubmissions, hasProjectParticipantIndex } from "@/lib/project-participant-service";
import { useInstantState } from "@/lib/use-instant";
import { CertificateRecord, Project } from "@/lib/types";

type MissingWork = { index: number; title: string };
type RoundResult = {
  project: Project;
  record: CertificateRecord | null;
  missing: MissingWork[];
  submitted: number;
  required: number;
  certificateLoading?: boolean;
  certificateError?: string;
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
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [dimensionValue, setDimensionValue] = useState("");
  const [roundTeachers, setRoundTeachers] = useState<TeacherItem[]>([]);
  // Seed the name list from cache after mount (SSR-safe) so the certificate
  // lookup dropdown is usable immediately instead of waiting for the network.
  const [teachers, setTeachers] = useInstantState<TeacherItem[]>(
    () => getInstantTeachers(),
    [],
  );
  const [loadingLists, setLoadingLists] = useState(true);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [activeProjectId, setActiveProjectId] = useState("");
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [correctionProjectId, setCorrectionProjectId] = useState("");
  const [correctionValue, setCorrectionValue] = useState("");
  const [correctionNote, setCorrectionNote] = useState("");
  const [correctionMessage, setCorrectionMessage] = useState("");

  const resetResult = useCallback(() => {
    setSearched(false);
    setResults([]);
    setError("");
  }, []);

  const loadRoundTeachers = useCallback(async (project: Project, roster: TeacherItem[]) => {
    let participants: TeacherItem[];
    if ((project.attendeeIds || []).length > 0) {
      participants = getProjectParticipantsForStats(project, roster, []);
    } else {
      // A legacy round without a saved roster must not expose the whole-school
      // directory. Its actual submitters are the safest backwards-compatible list.
      let submissions = await getProjectStatsSubmissions(project.id);
      // Safe rollout fallback before the one-time compact-index migration.
      // This preserves correct membership, though it is intentionally slower
      // and disappears as soon as the derived index exists.
      if (!submissions.length && !(await hasProjectParticipantIndex(project.id))) {
        submissions = await getGallerySubmissions(project.id);
      }
      participants = mergeTeachersWithSubmitters([], submissions);
    }
    participants.sort((a, b) => a.fullName.localeCompare(b.fullName, "th"));
    setRoundTeachers(participants);
    const groupBy = project.groupBy === "subjectGroup" ? "subjectGroup" : "gradeLevel";
    const firstDimension = participants.find((teacher) => teacher[groupBy])?.[groupBy] || "";
    setDimensionValue(firstDimension);
    setName("");
    resetResult();
  }, [resetResult]);

  useEffect(() => {
    (async () => {
      try {
        // Newly typed names are persisted to the teacher snapshot by the submit
        // flow, so this page does not need to read every submission merely to
        // build its selector.
        const [rounds, roster, active] = await Promise.all([
          getProjects(),
          getTeachers(),
          getActiveProject(),
        ]);
        setProjects(rounds);
        setTeachers(roster);
        setActiveProjectId(active?.id || "");
        const initial =
          rounds.find((round) => round.id === active?.id && round.certificate?.enabled) ||
          rounds.find((round) => round.certificate?.enabled) ||
          rounds[0];
        if (initial) {
          setSelectedProjectId(initial.id);
          await loadRoundTeachers(initial, roster);
        }
      } catch {
        setError("โหลดรอบและรายชื่อครูไม่สำเร็จ กรุณาลองใหม่");
      } finally {
        setLoadingLists(false);
      }
    })();
  }, [loadRoundTeachers, setTeachers]);

  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const groupBy = selectedProject?.groupBy === "subjectGroup" ? "subjectGroup" : "gradeLevel";
  const groupLabel = groupBy === "subjectGroup" ? "กลุ่มสาระ" : "สายชั้น";
  const dimensionOptions = useMemo(() => {
    return [...new Set(roundTeachers.map((teacher) => teacher[groupBy]).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "th"));
  }, [groupBy, roundTeachers]);
  const teachersInDimension = useMemo(() => {
    const grouped = new Map<string, TeacherItem[]>();
    roundTeachers.forEach((teacher) => {
      const key = teacher[groupBy] || "ไม่ระบุ";
      const rows = grouped.get(key) || [];
      rows.push(teacher);
      grouped.set(key, rows);
    });
    grouped.forEach((rows) =>
      rows.sort((a, b) => a.fullName.localeCompare(b.fullName, "th")),
    );
    return grouped.get(dimensionValue) || [];
  }, [dimensionValue, groupBy, roundTeachers]);

  const changeDimension = (value: string) => {
    setDimensionValue(value);
    setName("");
    resetResult();
  };

  const changeProject = async (projectId: string) => {
    const project = projects.find((item) => item.id === projectId);
    if (!project) return;
    setSelectedProjectId(projectId);
    setLoadingLists(true);
    try {
      await loadRoundTeachers(project, teachers);
    } catch {
      setRoundTeachers([]);
      setDimensionValue("");
      setError("โหลดรายชื่อผู้เข้าอบรมในรอบนี้ไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setLoadingLists(false);
    }
  };

  const search = async (selectedName: string, selectedTeacherId = "") => {
    const fullName = selectedName.trim();
    if (!fullName) return;
    setLoading(true);
    setError("");
    setResults([]);
    try {
      const round = projects.find((project) => project.id === selectedProjectId);
      if (!round) throw new Error("กรุณาเลือกรอบการอบรมหรือโครงการ");
      const selectedTeacher = roundTeachers.find((teacher) =>
        selectedTeacherId
          ? teacher.id === selectedTeacherId
          : certificateRecipientKey(teacher.fullName) === certificateRecipientKey(fullName),
      );
      if (!selectedTeacher) throw new Error("ไม่พบรายชื่อผู้เข้าอบรมในรอบนี้");
      const current = await getUserProjectSubmissions(fullName, round.id);
      const status = certificateProgress(current, round);
      const latest = latestSubmissionPerSlot(current, round);
      const missingItems = round.workSlotTitles
        .map((title, index) => ({ title, index }))
        .filter(({ index }) => !latest.has(slotIdAt(index)));
      const roundResults: RoundResult[] = [{
        project: round,
        record: null,
        missing: status.complete ? [] : missingItems,
        submitted: status.submitted,
        required: status.required,
        certificateLoading: Boolean(round.certificate?.enabled),
      }];
      setResults(roundResults);
      setSearched(true);
      setLoading(false);

      // Searching is read-only: it only fetches an existing admin-approved PDF.
      roundResults
        .filter((item) => item.certificateLoading)
        .forEach((item) => {
          findCertificateForRecipient(
            item.project.id,
            fullName,
            selectedTeacher?.id || selectedTeacherId,
            item.project,
          )
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

  const sendCorrection = async () => {
    if (!correctionProjectId || !correctionNote.trim()) return;
    setLoading(true);
    try {
      await requestCertificateCorrection(
        correctionProjectId,
        name.trim(),
        correctionValue.trim(),
        correctionNote.trim(),
      );
      setCorrectionMessage("ส่งคำขอให้ผู้ดูแลแล้ว");
      setCorrectionProjectId("");
    } catch (cause) {
      setCorrectionMessage(cause instanceof Error ? cause.message : "ส่งคำขอไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6 sm:py-10 space-y-5">
        <section className="rounded-3xl bg-linear-to-br from-amber-400 via-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/20 overflow-hidden">
          <div className="px-6 pt-6 pb-5 flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center shrink-0 shadow-inner">
              <Award className="w-8 h-8" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-extrabold leading-tight">
                ดาวน์โหลดเกียรติบัตร
              </h1>
              <p className="text-sm font-semibold text-amber-50/90 mt-0.5">
                เลือกรอบและรายชื่อผู้เข้าอบรม เพื่อดาวน์โหลดเกียรติบัตร
              </p>
            </div>
          </div>
        </section>
        <section className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 grid lg:grid-cols-3 gap-4 shadow-sm">
          <label className="space-y-1.5">
            <span className="text-xs font-extrabold text-slate-600">
              1. เลือกรอบ/โครงการ
            </span>
            <select
              value={selectedProjectId}
              onChange={(e) => void changeProject(e.target.value)}
              disabled={loadingLists}
              className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white font-bold outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="">เลือกรอบการอบรมหรือโครงการ</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-extrabold text-slate-600">
              2. เลือก{groupLabel}
            </span>
            <select
              value={dimensionValue}
              onChange={(e) => changeDimension(e.target.value)}
              disabled={loadingLists}
              className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white font-bold outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="">เลือก{groupLabel}</option>
              {dimensionOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-extrabold text-slate-600">
              3. เลือกรายชื่อครู
            </span>
            <select
              value={name}
              onChange={(e) => {
                const value = e.target.value;
                setName(value);
                resetResult();
                const teacherId = teachersInDimension.find(
                  (teacher) => teacher.fullName === value,
                )?.id || "";
                if (value) void search(value, teacherId);
              }}
              disabled={!dimensionValue || loadingLists || loading}
              className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white font-bold outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-60"
            >
              <option value="">
                {teachersInDimension.length
                  ? "เลือกรายชื่อครู"
                  : `ไม่พบรายชื่อใน${groupLabel}นี้`}
              </option>
              {teachersInDimension.map((teacher) => (
                <option key={teacher.id} value={teacher.fullName}>
                  {teacher.fullName}
                </option>
              ))}
            </select>
          </label>
          {loading && (
            <div className="lg:col-span-3 rounded-2xl bg-amber-50 p-3 flex items-center justify-center gap-2 text-sm font-extrabold text-amber-700">
              <LoaderCircle className="w-5 h-5 animate-spin" />
              กำลังตรวจสอบรอบที่เลือก...
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
            {results.length === 0 && (
              <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-center">
                <FileWarning className="w-8 h-8 text-amber-600 mx-auto mb-2" />
                <h3 className="font-extrabold text-amber-900">
                  ไม่พบรายชื่อในรอบการอบรมหรือโครงการ
                </h3>
                <p className="text-sm font-semibold text-amber-700 mt-1">
                  กรุณาติดต่อผู้ดูแล หากควรมีชื่ออยู่ในรอบใดรอบหนึ่ง
                </p>
              </div>
            )}
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
                        <button type="button" onClick={() => { setCorrectionProjectId(result.project.id); setCorrectionValue(result.record?.recipientName || name); setCorrectionNote(""); }} className="px-4 py-2.5 rounded-xl border border-emerald-300 text-sm font-extrabold text-emerald-800">
                          แจ้งข้อมูลไม่ถูกต้อง
                        </button>
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
                          กำลังตรวจสอบสถานะการอนุมัติ
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
                  ) : result.project.certificate?.enabled ? (
                    <div className="rounded-2xl bg-blue-50 border border-blue-200 p-4">
                      <h4 className="font-extrabold text-blue-900">ส่งงานครบแล้ว</h4>
                      <p className="mt-1 text-sm font-semibold text-blue-700">กำลังรอผู้ดูแลอนุมัติเกียรติบัตร เมื่ออนุมัติแล้วไฟล์จะปรากฏในหน้านี้</p>
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
        {correctionMessage && <p className="rounded-2xl bg-blue-50 p-4 text-sm font-bold text-blue-700">{correctionMessage}</p>}
      </main>
      {correctionProjectId && (
        <div className="fixed inset-0 z-[100] bg-slate-950/50 backdrop-blur-sm p-4 grid place-items-center">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div><h2 className="text-xl font-extrabold">แจ้งข้อมูลเกียรติบัตรไม่ถูกต้อง</h2><p className="text-sm text-slate-500">ผู้ดูแลจะตรวจสอบและออกฉบับแก้ไขให้</p></div>
            <label className="text-xs font-bold text-slate-600">ชื่อที่ควรแสดง<input value={correctionValue} onChange={(e) => setCorrectionValue(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm" /></label>
            <label className="text-xs font-bold text-slate-600">รายละเอียดที่ต้องแก้ *<textarea value={correctionNote} onChange={(e) => setCorrectionNote(e.target.value)} rows={4} className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm" /></label>
            <div className="grid grid-cols-2 gap-2"><button onClick={() => setCorrectionProjectId("")} className="rounded-xl border py-3 font-extrabold">ยกเลิก</button><button onClick={sendCorrection} disabled={!correctionNote.trim() || loading} className="rounded-xl bg-blue-600 text-white py-3 font-extrabold disabled:opacity-40">ส่งคำขอ</button></div>
          </div>
        </div>
      )}
      <Footer />
    </div>
  );
}
