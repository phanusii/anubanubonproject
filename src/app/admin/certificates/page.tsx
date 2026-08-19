"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Award,
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  Loader2,
  Pencil,
  ScanText,
  Save,
  X,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AdminSidebar from "@/components/AdminSidebar";
import { getProjects, saveProject } from "@/lib/projects-service";
import {
  certificateRecipientKey,
  createCertificatePreview,
  getCertificateBatchStatus,
  getCertificateCandidates,
  getCertificates,
  getIssuedCertificateCount,
  inspectCertificateTemplate,
  previewEditedCertificate,
  reissueEditedCertificate,
  removeCertificateScheduler,
  revokeCertificate,
  runCertificateBatch,
  startCertificateBatch,
} from "@/lib/certificate-service";
import {
  CertificateBatchJob,
  CertificateCandidate,
  CertificateRecord,
  CertificateSettings,
  CertificateSlideField,
  CertificateTextField,
  Project,
} from "@/lib/types";
import { getUserProjectSubmissions } from "@/lib/submission-service";
import { displayWorkTitle } from "@/lib/format";

const field = (y: number, size: number): CertificateTextField => ({
  x: 15,
  y,
  width: 70,
  fontFamily: "Sarabun",
  fontSize: size,
  minFontSize: 18,
  fontWeight: "bold",
  color: "#15304f",
  align: "center",
});

function defaults(project: Project): CertificateSettings {
  return {
    enabled: false,
    certificateFinalizeAt: "",
    issueForComplete: true,
    issueForPartial: false,
    title: "เกียรติบัตร",
    description: "",
    issueDateText: "",
    budgetYear: project.budgetYear || project.academicYear || "2569",
    numberPrefix: "",
    numberStart: 1,
    numberDigits: 1,
    templateVersion: 1,
    templateType: "google-slides",
    orientation: "landscape",
    nameField: field(47, 34),
    numberField: { ...field(13, 14), x: 72, width: 23, fontWeight: "normal" },
    dateField: { ...field(70, 16), fontWeight: "normal" },
  };
}

function extractSlidesId(value: string): string {
  return value.trim().match(/[-\w]{20,}/)?.[0] || "";
}

function toThaiDigits(value: string): string {
  const digits = ["๐", "๑", "๒", "๓", "๔", "๕", "๖", "๗", "๘", "๙"];
  return value.replace(/[0-9]/g, (digit) => digits[Number(digit)]);
}

function StepTitle({
  number,
  title,
  done,
}: {
  number: number;
  title: string;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`w-8 h-8 rounded-full grid place-items-center text-sm font-black ${done ? "bg-emerald-500 text-white" : "bg-blue-700 text-white"}`}
      >
        {done ? <CheckCircle2 className="w-5 h-5" /> : number}
      </span>
      <h2 className="font-extrabold text-slate-900">{title}</h2>
    </div>
  );
}

export default function CertificatesAdminPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [config, setConfig] = useState<CertificateSettings | null>(null);
  const [records, setRecords] = useState<CertificateRecord[]>([]);
  // Lightweight issued count for the summary card — loads faster than the full records
  // fetch, so the card doesn't sit on "0" while the heavier list is still loading.
  const [issuedTotal, setIssuedTotal] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<CertificateCandidate[]>([]);
  const [job, setJob] = useState<CertificateBatchJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [slideFields, setSlideFields] = useState<CertificateSlideField[]>([]);
  const [tab, setTab] = useState<"waiting" | "incomplete" | "issued">("waiting");
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [editing, setEditing] = useState<CertificateRecord | null>(null);
  const [reviewing, setReviewing] = useState<CertificateCandidate | null>(null);
  const [reviewWorks, setReviewWorks] = useState<import("@/lib/types").Submission[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [editForm, setEditForm] = useState({
    recipientName: "",
    position: "",
    gradeLevel: "",
    subjectGroup: "",
    certificateNumber: "",
    changeNumber: false,
    reason: "",
  });

  useEffect(() => {
    getProjects(true).then((items) => {
      setProjects(items);
      if (items[0]) setProjectId(items[0].id);
    });
  }, []);
  const project = useMemo(
    () => projects.find((item) => item.id === projectId),
    [projects, projectId],
  );

  useEffect(() => {
    if (!project) return;
    // A selected round owns its own editor draft; reset that draft when the selection changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConfig(project.certificate || defaults(project));
    setSlideFields([]);
    let cancelled = false;
    // Fast, standalone issued-count for the summary card (doesn't wait on the full list).
    setIssuedTotal(null);
    void getIssuedCertificateCount(project.id).then((n) => { if (!cancelled) setIssuedTotal(n); });
    void Promise.allSettled([
      getCertificates(project.id),
      getCertificateBatchStatus(project.id),
      getCertificateCandidates(project.id),
    ])
      .then(([certificateResult, jobResult, candidateResult]) => {
        if (cancelled) return;
        const certificateItems =
          certificateResult.status === "fulfilled"
            ? certificateResult.value
            : [];
        setRecords(certificateItems);
        setJob(jobResult.status === "fulfilled" ? jobResult.value : null);
        setCandidates(candidateResult.status === "fulfilled" ? candidateResult.value : []);

        if (certificateResult.status === "rejected") {
          setMessage(
            `อ่านทะเบียนเกียรติบัตรไม่สำเร็จ: ${certificateResult.reason instanceof Error ? certificateResult.reason.message : "กรุณาลองใหม่"}`,
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRecords([]);
          setCandidates([]);
        }
      });

    const refreshTimer = window.setInterval(() => {
      void Promise.all([
        getCertificates(project.id),
        getCertificateBatchStatus(project.id),
        getCertificateCandidates(project.id),
      ])
        .then(([items, currentJob, currentCandidates]) => {
          if (!cancelled) {
            setRecords(items);
            setJob(currentJob);
            setCandidates(currentCandidates);
          }
        })
        .catch(() => undefined);
    }, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, [project]);

  const save = async () => {
    if (!project || !config) return;
    const slideId = extractSlidesId(
      config.slideTemplateId || config.slideTemplateUrl || "",
    );
    if (!slideId) {
      setMessage("กรุณาวางลิงก์ Google Slides ที่ถูกต้อง");
      return;
    }
    setBusy(true);
    try {
      const normalizedConfig = {
        ...config,
        certificateFinalizeAt: undefined,
        issueForComplete: true,
        issueForPartial: false,
        slideTemplateId: slideId,
        slideTemplateUrl: `https://docs.google.com/presentation/d/${slideId}/edit`,
        templateType: "google-slides" as const,
      };
      const previousComparable = {
        ...(project.certificate || {}),
      } as Partial<CertificateSettings>;
      const nextComparable = {
        ...normalizedConfig,
      } as Partial<CertificateSettings>;
      delete previousComparable.templateVersion;
      delete nextComparable.templateVersion;
      const settingsChanged =
        JSON.stringify(previousComparable) !== JSON.stringify(nextComparable);
      const nextConfig = {
        ...normalizedConfig,
        templateVersion: settingsChanged
          ? Number(
              project.certificate?.templateVersion ||
                config.templateVersion ||
                1,
            ) + 1
          : Number(
              project.certificate?.templateVersion ||
                config.templateVersion ||
                1,
            ),
      };
      const updated = { ...project, certificate: nextConfig };
      await saveProject(updated);
      await removeCertificateScheduler();
      setProjects((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );

      setMessage(
        nextConfig.enabled
          ? "บันทึกแล้ว ผู้ส่งครบจะเข้ารอให้แอดมินเลือกอนุมัติ"
          : "บันทึกการตั้งค่าเกียรติบัตรแล้ว",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "บันทึกหรืออัปเดตเกียรติบัตรไม่สำเร็จ",
      );
    } finally {
      setBusy(false);
    }
  };

  const preview = async () => {
    if (!project || !config) return;
    setBusy(true);
    try {
      const updated = { ...project, certificate: config };
      await saveProject(updated);
      setProjects((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );
      const url = await createCertificatePreview(project.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "สร้างตัวอย่างไม่สำเร็จ",
      );
    } finally {
      setBusy(false);
    }
  };

  const inspectTemplate = async () => {
    if (!project || !config) return;
    const id = extractSlidesId(
      config.slideTemplateId || config.slideTemplateUrl || "",
    );
    if (!id) {
      setMessage("กรุณาวางลิงก์ Google Slides ก่อน");
      return;
    }
    setBusy(true);
    setMessage("กำลังอ่านกล่องข้อความจาก Google Slides...");
    try {
      const fields = await inspectCertificateTemplate(project.id, id);
      setSlideFields(fields);
      setMessage(
        `พบกล่องข้อความ ${fields.length} กล่อง กรุณาเลือกกล่องสำหรับแต่ละข้อมูล`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "อ่านกล่องข้อความไม่สำเร็จ",
      );
    } finally {
      setBusy(false);
    }
  };

  const selectSlideField = (
    key: "slideNameField" | "slideNumberField",
    value: string,
  ) => {
    if (!config) return;
    const selected = slideFields.find(
      (item) => `${item.slideIndex}:${item.objectId}` === value,
    );
    setConfig({ ...config, [key]: selected });
  };

  const fieldValue = (value?: CertificateSlideField) =>
    value ? `${value.slideIndex}:${value.objectId}` : "";

  const exportCsv = () => {
    const rows = [
      ["เลขที่", "ชื่อ-นามสกุล", "ตำแหน่ง", "สถานะ", "ลิงก์"],
      ...records.map((r) => [
        r.certificateNumber,
        r.recipientName,
        r.snapshot?.position || "",
        r.status,
        r.pdfUrl || "",
      ]),
    ];
    const csv =
      "\uFEFF" +
      rows
        .map((row) =>
          row
            .map((value) => `"${String(value).replaceAll('"', '""')}"`)
            .join(","),
        )
        .join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `certificates-${projectId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const revoke = async (record: CertificateRecord) => {
    if (!confirm(`ยืนยันยกเลิกเกียรติบัตรเลขที่ ${record.certificateNumber}?`))
      return;
    await revokeCertificate(record.id);
    setRecords((items) =>
      items.map((item) =>
        item.id === record.id ? { ...item, status: "revoked" } : item,
      ),
    );
  };

  const openEditor = (record: CertificateRecord) => {
    setEditing(record);
    setEditForm({
      recipientName: record.recipientName,
      position: record.snapshot?.position || "",
      gradeLevel: record.snapshot?.gradeLevel || "",
      subjectGroup: record.snapshot?.subjectGroup || "",
      certificateNumber: record.certificateNumber,
      changeNumber: false,
      reason: "",
    });
  };

  const editedPayload = () => ({
    fullName: editForm.recipientName.trim(),
    position: editForm.position.trim(),
    gradeLevel: editForm.gradeLevel.trim(),
    subjectGroup: editForm.subjectGroup.trim(),
    certificateNumber: (editForm.changeNumber
      ? editForm.certificateNumber.trim()
      : editing?.certificateNumber) || "",
    reason: editForm.reason.trim(),
  });

  const previewEdit = async () => {
    if (!project || !editing) return;
    setBusy(true);
    try {
      const url = await previewEditedCertificate(project.id, editedPayload());
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "สร้างตัวอย่างไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!project || !editing || !editForm.reason.trim()) {
      setMessage("กรุณาระบุเหตุผลในการแก้ไข");
      return;
    }
    setBusy(true);
    try {
      const next = await reissueEditedCertificate(project.id, editing.id, editedPayload());
      setRecords((items) => items.map((item) => (item.id === next.id ? next : item)));
      setEditing(null);
      setMessage("สร้างฉบับแก้ไขสำเร็จและเปลี่ยนลิงก์แล้ว");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ออกฉบับแก้ไขไม่สำเร็จ ฉบับเดิมยังใช้งานได้");
    } finally {
      setBusy(false);
    }
  };

  const scanCandidates = async () => {
    if (!project) return;
    setBusy(true);
    setMessage("กำลังตรวจผู้ที่ยังไม่มีเกียรติบัตร...");
    try {
      // refresh=true forces the Apps Script to re-scan Firestore (not serve its cache).
      const items = await getCertificateCandidates(project.id, true);
      setCandidates(items);
      setMessage(`ตรวจแล้ว ${items.length} คน กรุณาตรวจรายชื่อก่อนยืนยัน`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "ตรวจรายชื่อไม่สำเร็จ",
      );
    } finally {
      setBusy(false);
    }
  };

  const openWorkReview = async (candidate: CertificateCandidate) => {
    if (!project) return;
    setReviewing(candidate);
    setReviewWorks([]);
    setReviewError("");
    setReviewLoading(true);
    try {
      const works = await getUserProjectSubmissions(candidate.fullName, project.id);
      const titleOrder = new Map(
        project.workSlotTitles.map((title, index) => [title.trim(), index]),
      );
      const slotOrder = (value: import("@/lib/types").Submission) => {
        const slot = value.workSlotId?.match(/slot-(\d+)/)?.[1];
        return slot ? Number(slot) - 1 : titleOrder.get(value.projectTitle.trim()) ?? Number.MAX_SAFE_INTEGER;
      };
      setReviewWorks(
        [...works].sort(
          (a, b) => slotOrder(a) - slotOrder(b) || (b.createdAt || 0) - (a.createdAt || 0),
        ),
      );
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "โหลดผลงานไม่สำเร็จ");
    } finally {
      setReviewLoading(false);
    }
  };

  const confirmBatch = async () => {
    if (
      !project ||
      !confirm("ยืนยันออกเกียรติบัตรให้ผู้มีสิทธิ์ที่ยังไม่มีบัตร?")
    )
      return;
    setBusy(true);
    try {
      if (!selectedNames.length) return;
      let current = await startCertificateBatch(project.id, selectedNames);
      setJob(current);
      while (current.status === "running")
        current = (await runCertificateBatch(project.id)) || current;
      setJob(current);
      setRecords(await getCertificates(project.id));
      setCandidates(await getCertificateCandidates(project.id));
      setSelectedNames([]);
      setMessage(
        `ประมวลผลเสร็จ ออกแล้ว ${current.issued} ผิดพลาด ${current.failed}`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "เริ่มประมวลผลไม่สำเร็จ",
      );
    } finally {
      setBusy(false);
    }
  };

  const slideId = config
    ? extractSlidesId(config.slideTemplateId || config.slideTemplateUrl || "")
    : "";
  const templatePreview = slideId
    ? `https://docs.google.com/presentation/d/${slideId}/preview?rm=minimal`
    : "";
  const fieldsReady = Boolean(
    config?.slideNameField && config?.slideNumberField,
  );
  const sampleNumber = config
    ? toThaiDigits(
        `${config.numberPrefix || ""}${config.numberStart}/${config.budgetYear}`,
      )
    : "๒/๒๕๖๙";
  const nameSource = config?.slideNameField?.sourceText || "ยังไม่ได้เลือก";
  const numberSource = config?.slideNumberField?.sourceText || "ยังไม่ได้เลือก";
  const issuedCount = records.filter(
    (record) => record.status === "issued",
  ).length;
  const normalizedSearch = search.trim().toLocaleLowerCase("th");
  const matchesFilters = (item: {
    fullName?: string;
    recipientName?: string;
    gradeLevel?: string;
    subjectGroup?: string;
    snapshot?: CertificateRecord["snapshot"];
  }) => {
    const name = item.fullName || item.recipientName || "";
    const grade = item.gradeLevel || item.snapshot?.gradeLevel || "";
    const subject = item.subjectGroup || item.snapshot?.subjectGroup || "";
    return (
      (!normalizedSearch || name.toLocaleLowerCase("th").includes(normalizedSearch)) &&
      (!gradeFilter || grade === gradeFilter) &&
      (!subjectFilter || subject === subjectFilter)
    );
  };
  // Names that already have an issued certificate (from the loaded records, which
  // reflect Telegram/web issuance) so they drop out of the waiting/incomplete lists
  // immediately — even before the cached candidate scan is refreshed.
  const issuedKeys = new Set(
    records
      .filter((record) => record.status === "issued")
      .map((record) => certificateRecipientKey(record.recipientName || record.snapshot?.fullName || ""))
      .filter(Boolean),
  );
  const notIssued = (name: string) => !issuedKeys.has(certificateRecipientKey(name));
  const waiting = candidates.filter((item) => item.eligible && item.qualificationType === "complete" && notIssued(item.fullName) && matchesFilters(item));
  const incomplete = candidates.filter(
    (item) => item.eligible && item.qualificationType === "partial" && notIssued(item.fullName) && matchesFilters(item),
  );
  const issuedRecords = records.filter(
    (item) => item.status === "issued" && matchesFilters(item),
  );
  const gradeOptions = Array.from(
    new Set(candidates.map((item) => item.gradeLevel).filter((value): value is string => Boolean(value))),
  ).sort();
  const subjectOptions = Array.from(
    new Set(candidates.map((item) => item.subjectGroup).filter((value): value is string => Boolean(value))),
  ).sort((a, b) => (a === "ไม่ระบุ" ? 1 : b === "ไม่ระบุ" ? -1 : a.localeCompare(b, "th")));
  const visibleCandidates = tab === "incomplete" ? incomplete : waiting;
  const visibleNames = visibleCandidates.map((item) => item.fullName);
  const allVisibleSelected = visibleNames.length > 0 && visibleNames.every((name) => selectedNames.includes(name));

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 flex flex-col md:flex-row gap-6">
        <AdminSidebar />
        <main className="flex-1 space-y-6 min-w-0">
          <section className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Award className="text-amber-500" />
                <div>
                  <h1 className="text-2xl font-extrabold text-slate-900">
                    จัดการเกียรติบัตร
                  </h1>
                  <p className="text-sm text-slate-500">
                    ใช้ Google Slides เป็นแม่แบบและออกไฟล์ PDF อัตโนมัติ
                  </p>
                </div>
              </div>
              {/* Issued-count summary for the currently selected project. */}
              <div className="rounded-2xl bg-emerald-50 border border-emerald-100 px-5 py-3 text-center shrink-0">
                <p className="text-[11px] font-bold text-emerald-700">ออกเกียรติบัตรแล้ว (โครงการนี้)</p>
                <p className="text-3xl font-black text-emerald-700 leading-tight">
                  {issuedTotal === null && issuedCount === 0
                    ? <span className="text-base font-bold text-emerald-600/70">กำลังโหลด…</span>
                    : <>{toThaiDigits(String(issuedTotal ?? issuedCount))} <span className="text-base font-extrabold">ใบ</span></>}
                </p>
                <p className="text-[11px] font-semibold text-emerald-600/80 truncate max-w-[240px]">
                  {projects.find((p) => p.id === projectId)?.name || ""}
                </p>
              </div>
            </div>
          </section>
          <section className="bg-white rounded-3xl p-6 border border-slate-100 space-y-5">
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border font-bold"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {config && (
              <>
                <div className="grid lg:grid-cols-[380px_minmax(0,1fr)] gap-5 items-start">
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
                      <StepTitle
                        number={1}
                        title="เลขที่เกียรติบัตร"
                        done={Boolean(config.budgetYear && config.numberStart)}
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <label className="text-[11px] font-bold text-slate-600">
                          ปีงบประมาณ
                          <input
                            value={config.budgetYear}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                budgetYear: e.target.value,
                              })
                            }
                            className="mt-1 w-full px-3 py-2.5 rounded-xl border"
                          />
                        </label>
                        <label className="text-[11px] font-bold text-slate-600">
                          เลขเริ่มต้น
                          <input
                            type="number"
                            min="1"
                            value={config.numberStart}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                numberStart: Number(e.target.value) || 1,
                              })
                            }
                            className="mt-1 w-full px-3 py-2.5 rounded-xl border"
                          />
                        </label>
                      </div>
                      <p className="text-xs font-bold text-amber-700">
                        ตัวอย่าง: {sampleNumber}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 space-y-3">
                      <StepTitle
                        number={2}
                        title="ลิงก์ Google Slides"
                        done={Boolean(slideId)}
                      />
                      <input
                        value={
                          config.slideTemplateUrl ||
                          config.slideTemplateId ||
                          ""
                        }
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            slideTemplateUrl: e.target.value,
                            slideTemplateId: extractSlidesId(e.target.value),
                            templateType: "google-slides",
                          })
                        }
                        placeholder="วางลิงก์ Google Slides"
                        className="w-full px-3 py-2.5 rounded-xl border border-blue-200 bg-white text-sm"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={inspectTemplate}
                          disabled={busy || !slideId}
                          className="flex-1 px-3 py-2.5 rounded-xl bg-blue-700 text-white text-xs font-extrabold flex justify-center items-center gap-1.5 disabled:opacity-40"
                        >
                          <ScanText className="w-4 h-4" />
                          ดึงข้อความ
                        </button>
                        {slideId && (
                          <a
                            href={`https://docs.google.com/presentation/d/${slideId}/edit`}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-2.5 rounded-xl bg-white text-blue-700 border border-blue-200"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4 space-y-3">
                      <StepTitle
                        number={3}
                        title="เลือก 2 จุดที่จะแก้"
                        done={fieldsReady}
                      />
                      {slideFields.length > 0 ? (
                        <div className="space-y-2">
                          {(
                            [
                              ["slideNameField", "ช่องชื่อ–นามสกุล"],
                              ["slideNumberField", "ช่องเลขที่"],
                            ] as const
                          ).map(([key, label]) => (
                            <label
                              key={key}
                              className="text-[11px] font-extrabold text-slate-700"
                            >
                              {label}
                              <select
                                value={fieldValue(config[key])}
                                onChange={(e) =>
                                  selectSlideField(key, e.target.value)
                                }
                                className="mt-1 w-full px-3 py-2.5 rounded-xl border bg-white text-xs"
                              >
                                <option value="">— เลือกข้อความ —</option>
                                {slideFields.map((item) => (
                                  <option
                                    key={`${item.slideIndex}:${item.objectId}`}
                                    value={`${item.slideIndex}:${item.objectId}`}
                                  >
                                    หน้า {item.slideIndex + 1}:{" "}
                                    {item.sourceText.slice(0, 42)}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">
                          กด “ดึงข้อความ” ก่อน แล้วเลือกรายการสองช่อง
                        </p>
                      )}
                    </div>
                    <label className="flex items-center justify-between p-3.5 rounded-2xl bg-emerald-50 border border-emerald-100">
                      <span className="text-sm font-extrabold">
                        เปิดระบบเกียรติบัตร
                      </span>
                      <input
                        type="checkbox"
                        checked={config.enabled}
                        onChange={(e) =>
                          setConfig({ ...config, enabled: e.target.checked })
                        }
                        className="w-5 h-5 accent-emerald-600"
                      />
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        onClick={preview}
                        disabled={busy || !slideId || !fieldsReady}
                        className="px-3 py-3 rounded-xl border-2 font-extrabold text-xs flex justify-center gap-1.5 items-center disabled:opacity-40"
                      >
                        <Eye className="w-4 h-4" />
                        ทดลอง PDF
                      </button>
                      <button
                        onClick={save}
                        disabled={busy || !slideId || !fieldsReady}
                        className="px-3 py-3 rounded-xl bg-emerald-600 text-white font-extrabold text-xs flex justify-center gap-1.5 items-center disabled:opacity-50"
                      >
                        {busy ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        บันทึก
                      </button>
                    </div>
                  </div>
                  <div className="lg:sticky lg:top-4 space-y-3">
                    <div className="max-w-lg mx-auto w-full rounded-2xl border border-slate-200 overflow-hidden bg-slate-100">
                      <div className="px-4 py-2.5 bg-white border-b flex items-center justify-between">
                        <strong className="text-sm">ตัวอย่างแม่แบบ</strong>
                        {fieldsReady && (
                          <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                            <CheckCircle2 className="w-4 h-4" />
                            เลือกครบแล้ว
                          </span>
                        )}
                      </div>
                      <div
                        className={`relative ${config.orientation === "landscape" ? "aspect-[1.414/1]" : "aspect-[1/1.414]"}`}
                      >
                        {templatePreview ? (
                          <iframe
                            title="ตัวอย่าง Google Slides"
                            src={templatePreview}
                            className="absolute inset-0 w-full h-full border-0"
                            allowFullScreen
                          />
                        ) : (
                          <div className="absolute inset-0 grid place-items-center text-slate-400 font-bold text-center px-4">
                            วางลิงก์เพื่อแสดงแม่แบบตรงนี้
                          </div>
                        )}
                      </div>
                    </div>
                    <div
                      className={`rounded-2xl border-2 p-4 ${fieldsReady ? "border-emerald-300 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <strong className="text-sm">
                          ตรวจพื้นที่ที่ระบบจะแก้ไข
                        </strong>
                        <span
                          className={`text-xs font-bold ${fieldsReady ? "text-emerald-700" : "text-amber-700"}`}
                        >
                          {fieldsReady ? "ถูกเลือกครบ 2 จุด" : "ยังเลือกไม่ครบ"}
                        </span>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div className="rounded-xl bg-white border p-3">
                          <p className="text-[10px] font-bold text-slate-400">
                            ชื่อ: ข้อความเดิม
                          </p>
                          <p className="text-sm font-bold truncate">
                            {nameSource}
                          </p>
                          <div className="my-2 border-t border-dashed" />
                          <p className="text-[10px] font-bold text-emerald-600">
                            จะเปลี่ยนเป็น
                          </p>
                          <p className="text-lg font-black text-slate-900">
                            นายสมชาย ใจดี
                          </p>
                        </div>
                        <div className="rounded-xl bg-white border p-3">
                          <p className="text-[10px] font-bold text-slate-400">
                            เลขที่: ข้อความเดิม
                          </p>
                          <p className="text-sm font-bold truncate">
                            {numberSource}
                          </p>
                          <div className="my-2 border-t border-dashed" />
                          <p className="text-[10px] font-bold text-emerald-600">
                            จะเปลี่ยนเป็น
                          </p>
                          <p className="text-lg font-black text-pink-600">
                            {sampleNumber}
                          </p>
                        </div>
                      </div>
                      <p className="mt-3 text-[11px] text-slate-500">
                        ระบบเปลี่ยนเฉพาะสองกล่องนี้ ข้อความ รูปภาพ
                        และลายเซ็นอื่นจะคงเดิมทั้งหมด
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
            {message && (
              <p className="text-sm font-bold text-blue-700">{message}</p>
            )}
          </section>
          <section className="bg-white rounded-3xl p-4 sm:p-6 border border-slate-100 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">อนุมัติเกียรติบัตรโดยแอดมิน</h2>
                <p className="text-xs text-slate-500 mt-1">
                  เลือกผู้ส่งครบหรือผู้ที่ส่งแล้วแต่ยังไม่ครบ แล้วออกเกียรติบัตรเป็นรอบตามต้องการ
                </p>
              </div>
              <button
                onClick={scanCandidates}
                disabled={busy}
                className="px-4 py-2.5 rounded-2xl bg-blue-600 text-white text-sm font-extrabold disabled:opacity-40"
              >
                อัปเดตรายชื่อ
              </button>
            </div>
            <div className="grid grid-cols-3 rounded-2xl bg-slate-100 p-1 gap-1">
              {([
                ["waiting", `ส่งครบ ${waiting.length}`],
                ["incomplete", `ส่งยังไม่ครบ ${incomplete.length}`],
                ["issued", `ออกแล้ว ${issuedCount}`],
              ] as const).map(([value, label]) => (
                <button key={value} onClick={() => setTab(value)} className={`rounded-xl px-2 py-3 text-xs sm:text-sm font-extrabold ${tab === value ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="grid sm:grid-cols-3 gap-2 rounded-2xl border bg-slate-50 p-3">
              <label className="relative sm:col-span-1">
                <Filter className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาชื่อ" className="w-full rounded-xl border bg-white py-2.5 pl-9 pr-3 text-sm" />
              </label>
              <select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)} className="rounded-xl border bg-white px-3 py-2.5 text-sm font-bold">
                <option value="">ทุกสายชั้น</option>
                {gradeOptions.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
              <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} className="rounded-xl border bg-white px-3 py-2.5 text-sm font-bold">
                <option value="">ทุกกลุ่มสาระ</option>
                {subjectOptions.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
            {job?.status === "running" && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                <p className="font-extrabold text-blue-800">กำลังออกเกียรติบัตรรอบที่ {job.batchNumber || "ใหม่"}</p>
                <p className="text-sm text-blue-700">สำเร็จ {job.issued} · รอดำเนินการ {Math.max(0, job.total - job.processed)} · ผิดพลาด {job.failed}</p>
              </div>
            )}
            {(tab === "waiting" || tab === "incomplete") && (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-sm font-bold">
                    <input type="checkbox" checked={allVisibleSelected} onChange={() => setSelectedNames(allVisibleSelected ? selectedNames.filter((name) => !visibleNames.includes(name)) : Array.from(new Set([...selectedNames, ...visibleNames])))} className="w-5 h-5 accent-blue-600" />
                    เลือกทั้งหมดเฉพาะผลลัพธ์ที่กรอง
                  </label>
                  <button onClick={confirmBatch} disabled={busy || !selectedNames.length} className="rounded-2xl bg-emerald-600 text-white px-5 py-3 text-sm font-extrabold disabled:opacity-40">
                    ออกเกียรติบัตรให้ผู้ที่เลือก ({selectedNames.length})
                  </button>
                </div>
                {tab === "incomplete" && <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">กลุ่มนี้ยังส่งงานไม่ครบ แอดมินสามารถเลือกออกเกียรติบัตรให้เป็นรายบุคคลได้</p>}
                <div className="grid md:grid-cols-2 gap-2">
                  {visibleCandidates.map((item) => (
                    <div key={item.fullName} className="flex gap-3 rounded-2xl border p-4 hover:border-blue-300">
                      <input aria-label={`เลือก ${item.fullName}`} type="checkbox" checked={selectedNames.includes(item.fullName)} onChange={() => setSelectedNames((names) => names.includes(item.fullName) ? names.filter((name) => name !== item.fullName) : [...names, item.fullName])} className="mt-1 w-5 h-5 accent-blue-600 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <strong className="block">{item.fullName}</strong>
                        <small className="text-slate-500">{item.gradeLevel || "ไม่ระบุสายชั้น"} · {item.subjectGroup || "ไม่ระบุกลุ่มสาระ"} · ส่งแล้ว {item.submitted}/{item.required}</small>
                        {!!item.missingTitles?.length && <small className="mt-1 block text-amber-700">ขาด: {item.missingTitles.join(" · ")}</small>}
                        <button type="button" onClick={() => void openWorkReview(item)} className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-extrabold text-blue-700 hover:bg-blue-100">
                          <Eye className="w-4 h-4" /> ดูผลงานก่อนอนุมัติ
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {!visibleCandidates.length && <p className="rounded-2xl bg-slate-50 p-8 text-center text-slate-500 font-bold">ไม่มีรายชื่อที่รออนุมัติในกลุ่มนี้</p>}
              </div>
            )}
            {tab === "issued" && (
              <div className="space-y-3">
                <div className="flex justify-end"><button onClick={exportCsv} disabled={!issuedRecords.length} className="text-sm font-bold flex gap-2 items-center disabled:opacity-40"><Download className="w-4 h-4" />ดาวน์โหลด CSV</button></div>
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead><tr className="text-left text-slate-500 border-b"><th className="py-3">เลขที่</th><th>ผู้รับ</th><th>ตำแหน่ง</th><th>แก้ไขล่าสุด</th><th>จัดการ</th></tr></thead>
                    <tbody>{issuedRecords.map((r) => (
                      <tr key={r.id} className="border-b"><td className="py-3 font-bold">{r.certificateNumber}</td><td>{r.recipientName}</td><td>{r.snapshot?.position}</td><td>{r.revisionNumber ? `ฉบับที่ ${r.revisionNumber}` : "ฉบับแรก"}</td><td><div className="flex gap-3 whitespace-nowrap">{r.pdfUrl && <a href={r.pdfUrl} target="_blank" rel="noreferrer" className="text-blue-600 font-bold">ดาวน์โหลด</a>}<button onClick={() => openEditor(r)} className="text-amber-600 font-bold flex items-center gap-1"><Pencil className="w-3.5 h-3.5" />แก้ไขและออกใหม่</button><button onClick={() => revoke(r)} className="text-red-600 font-bold">ยกเลิก</button></div></td></tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
          {editing && (
            <div className="fixed inset-0 z-[100] bg-slate-950/50 backdrop-blur-sm p-3 sm:p-8 overflow-y-auto">
              <div className="max-w-3xl mx-auto rounded-3xl bg-white p-5 sm:p-7 shadow-2xl space-y-5">
                <div className="flex justify-between gap-3"><div><h2 className="text-xl font-extrabold">แก้ไขและออกเกียรติบัตรใหม่</h2><p className="text-sm text-slate-500">ฉบับเดิมยังดาวน์โหลดได้จนกว่าสร้างฉบับใหม่สำเร็จ</p></div><button onClick={() => setEditing(null)} className="text-slate-500 font-bold">ปิด</button></div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {([[
                    "recipientName", "ชื่อ–นามสกุล"
                  ], ["position", "ตำแหน่ง"], ["gradeLevel", "สายชั้น"], ["subjectGroup", "กลุ่มสาระ"]] as const).map(([key, label]) => <label key={key} className="text-xs font-bold text-slate-600">{label}<input value={editForm[key]} onChange={(e) => setEditForm({...editForm, [key]: e.target.value})} className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm" /></label>)}
                </div>
                <div className="rounded-2xl border bg-slate-50 p-4 space-y-3">
                  <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={editForm.changeNumber} onChange={(e) => setEditForm({...editForm, changeNumber: e.target.checked, certificateNumber: editing.certificateNumber})} /> เปลี่ยนเลขที่เกียรติบัตร</label>
                  <input disabled={!editForm.changeNumber} value={editForm.certificateNumber} onChange={(e) => setEditForm({...editForm, certificateNumber: e.target.value})} className="w-full rounded-xl border px-3 py-2.5 disabled:bg-slate-100" />
                  <p className="text-xs text-slate-500">ค่าเริ่มต้นคงเลขเดิม ระบบจะตรวจเลขซ้ำก่อนบันทึก</p>
                </div>
                <label className="text-xs font-bold text-slate-600">เหตุผลในการแก้ไข *<textarea value={editForm.reason} onChange={(e) => setEditForm({...editForm, reason: e.target.value})} rows={3} className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm" /></label>
                <div className="grid sm:grid-cols-2 gap-3 rounded-2xl border p-4"><div><p className="text-xs font-bold text-slate-400">ข้อมูลเดิม</p><strong>{editing.recipientName}</strong><p className="text-sm">{editing.certificateNumber}</p></div><div><p className="text-xs font-bold text-emerald-600">ข้อมูลใหม่</p><strong>{editForm.recipientName}</strong><p className="text-sm">{editForm.changeNumber ? editForm.certificateNumber : editing.certificateNumber}</p></div></div>
                <div className="grid sm:grid-cols-2 gap-2"><button onClick={previewEdit} disabled={busy} className="rounded-xl border-2 py-3 font-extrabold">ดู PDF ตัวอย่าง</button><button onClick={saveEdit} disabled={busy || !editForm.reason.trim()} className="rounded-xl bg-emerald-600 text-white py-3 font-extrabold disabled:opacity-40">สร้างฉบับใหม่และบันทึก</button></div>
              </div>
            </div>
          )}
          {reviewing && (
            <div className="fixed inset-0 z-[110] bg-slate-950/55 backdrop-blur-sm p-3 sm:p-8 overflow-y-auto">
              <div className="max-w-4xl mx-auto rounded-3xl bg-white shadow-2xl overflow-hidden">
                <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b bg-white/95 p-5 backdrop-blur-xl">
                  <div>
                    <h2 className="text-xl font-extrabold text-slate-900">ตรวจผลงานก่อนอนุมัติ</h2>
                    <p className="mt-1 text-sm font-bold text-slate-700">{reviewing.fullName}</p>
                    <p className="text-xs text-slate-500">ส่งแล้ว {reviewing.submitted}/{reviewing.required} ชิ้น · เรียงตามลำดับที่กำหนดในรอบ</p>
                  </div>
                  <button type="button" aria-label="ปิด" onClick={() => setReviewing(null)} className="rounded-xl bg-slate-100 p-2 text-slate-600 hover:bg-slate-200"><X className="h-5 w-5" /></button>
                </div>
                <div className="p-5 space-y-3">
                  {reviewLoading && <div className="flex items-center justify-center gap-2 rounded-2xl bg-blue-50 p-10 font-bold text-blue-700"><Loader2 className="h-5 w-5 animate-spin" /> กำลังโหลดผลงาน...</div>}
                  {reviewError && <p className="rounded-2xl border border-red-200 bg-red-50 p-4 font-bold text-red-700">{reviewError}</p>}
                  {!reviewLoading && !reviewError && reviewWorks.map((work, index) => (
                    <div key={work.id} className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-slate-200 p-4">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-600 text-sm font-black text-white">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-extrabold text-slate-900">{displayWorkTitle(work.projectTitle)}</p>
                        <p className="mt-1 text-xs text-slate-500">ส่ง {work.uploadDate || "ไม่ระบุวันเวลา"} · {work.fileType?.toUpperCase()}</p>
                      </div>
                      <a href={work.fileURL || work.driveLink} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-extrabold text-white">
                        <ExternalLink className="h-4 w-4" /> เปิดดูไฟล์
                      </a>
                    </div>
                  ))}
                  {!reviewLoading && !reviewError && !reviewWorks.length && <div className="rounded-2xl bg-slate-50 p-10 text-center text-sm font-bold text-slate-500"><FileText className="mx-auto mb-2 h-8 w-8" />ไม่พบไฟล์ผลงานในรอบนี้</div>}
                </div>
                <div className="sticky bottom-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t bg-white/95 p-4 backdrop-blur-xl">
                  <button type="button" onClick={() => setReviewing(null)} className="rounded-xl border px-5 py-3 text-sm font-extrabold">ปิดหน้าตรวจ</button>
                  <button type="button" onClick={() => { setSelectedNames((names) => names.includes(reviewing.fullName) ? names : [...names, reviewing.fullName]); setReviewing(null); }} className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-extrabold text-white">เลือกคนนี้เพื่อออกเกียรติบัตร</button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
      <Footer />
    </div>
  );
}
