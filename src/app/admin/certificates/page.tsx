"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Award,
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  Loader2,
  ScanText,
  Save,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AdminSidebar from "@/components/AdminSidebar";
import { getProjects, saveProject } from "@/lib/projects-service";
import { getProjectSubmissions } from "@/lib/submission-service";
import {
  createCertificatePreview,
  getCertificateBatchStatus,
  getCertificateCandidates,
  getCertificates,
  inspectCertificateTemplate,
  installCertificateScheduler,
  retryCertificate,
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
  const [candidates, setCandidates] = useState<CertificateCandidate[]>([]);
  const [job, setJob] = useState<CertificateBatchJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [slideFields, setSlideFields] = useState<CertificateSlideField[]>([]);

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
    void Promise.allSettled([
      getCertificates(project.id),
      getCertificateBatchStatus(project.id),
      getProjectSubmissions(project.id, true),
    ])
      .then(([certificateResult, jobResult]) => {
        if (cancelled) return;
        const certificateItems =
          certificateResult.status === "fulfilled"
            ? certificateResult.value
            : [];
        setRecords(certificateItems);
        setJob(jobResult.status === "fulfilled" ? jobResult.value : null);

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
      ])
        .then(([items, currentJob]) => {
          if (!cancelled) {
            setRecords(items);
            setJob(currentJob);
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
    if (!config.certificateFinalizeAt) {
      setMessage("กรุณากำหนดวันและเวลาสรุปผล");
      return;
    }
    if (!config.issueForComplete && !config.issueForPartial) {
      setMessage("กรุณาเลือกผู้มีสิทธิ์อย่างน้อยหนึ่งกลุ่ม");
      return;
    }
    setBusy(true);
    try {
      const normalizedConfig = {
        ...config,
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
      await installCertificateScheduler();
      setProjects((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );

      setMessage(
        nextConfig.enabled
          ? "บันทึกแล้ว ระบบจะตัดยอดตามเวลาที่กำหนด เกียรติบัตรเดิมจะไม่เปลี่ยน"
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

  const reissue = async (record: CertificateRecord) => {
    if (!project) return;
    setBusy(true);
    setMessage("กำลังออกเกียรติบัตรใหม่...");
    try {
      const next = await retryCertificate(project.id, record.recipientName);
      setRecords((items) => [
        next,
        ...items.filter((item) => item.id !== next.id),
      ]);
      setMessage("ออกเกียรติบัตรใหม่แล้ว โดยคงเลขที่เดิม");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ออกใหม่ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const scanCandidates = async () => {
    if (!project) return;
    setBusy(true);
    setMessage("กำลังตรวจผู้ที่ยังไม่มีเกียรติบัตร...");
    try {
      const items = await getCertificateCandidates(project.id);
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

  const confirmBatch = async () => {
    if (
      !project ||
      !confirm("ยืนยันออกเกียรติบัตรให้ผู้มีสิทธิ์ที่ยังไม่มีบัตร?")
    )
      return;
    setBusy(true);
    try {
      let current = await startCertificateBatch(project.id);
      setJob(current);
      while (current.status === "running")
        current = (await runCertificateBatch(project.id)) || current;
      setJob(current);
      setRecords(await getCertificates(project.id));
      setCandidates([]);
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
  const pendingCount = records.filter(
    (record) => record.status === "pending",
  ).length;
  const failedCount = records.filter(
    (record) => record.status === "failed",
  ).length;
  const newEligible = candidates.filter((item) => item.eligible);
  const alreadyIssued = candidates.filter((item) => item.reason === "ออกแล้ว");
  const notEligible = candidates.filter(
    (item) => !item.eligible && item.reason !== "ออกแล้ว",
  );
  const jobLabel =
    job?.status === "running"
      ? "กำลังออกเกียรติบัตร"
      : job?.status === "completed"
        ? "สรุปเสร็จแล้ว"
        : job?.status === "failed"
          ? "พบข้อผิดพลาด"
          : "รอถึงเวลาสรุป";

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 flex flex-col md:flex-row gap-6">
        <AdminSidebar />
        <main className="flex-1 space-y-6 min-w-0">
          <section className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm">
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
                        เปิดระบบสรุปและออกเกียรติบัตร
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
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                      <StepTitle
                        number={4}
                        title="วัน–เวลาสรุปผล"
                        done={Boolean(config.certificateFinalizeAt)}
                      />
                      <input
                        type="datetime-local"
                        value={config.certificateFinalizeAt || ""}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            certificateFinalizeAt: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2.5 rounded-xl border bg-white font-bold"
                      />
                      {project?.closeDate &&
                        config.certificateFinalizeAt &&
                        new Date(config.certificateFinalizeAt) <
                          new Date(project.closeDate) && (
                          <p className="text-xs font-extrabold text-rose-600">
                            คำเตือน: เวลาสรุปอยู่ก่อนเวลาปิดรับงาน
                          </p>
                        )}
                      <label className="flex items-center gap-2 text-sm font-bold">
                        <input
                          type="checkbox"
                          checked={config.issueForComplete !== false}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              issueForComplete: e.target.checked,
                            })
                          }
                        />{" "}
                        ผู้ส่งครบทุกชิ้น
                      </label>
                      <label className="flex items-center gap-2 text-sm font-bold">
                        <input
                          type="checkbox"
                          checked={Boolean(config.issueForPartial)}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              issueForPartial: e.target.checked,
                            })
                          }
                        />{" "}
                        ผู้ส่งอย่างน้อย 1 ชิ้นแต่ยังไม่ครบ
                      </label>
                      <p className="text-xs text-slate-500">
                        ผู้ที่ไม่เคยส่งงานจะไม่ได้รับเกียรติบัตร
                      </p>
                    </div>
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
          <section className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-100 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold text-blue-600">
                  สถานะการออกเกียรติบัตร
                </p>
                <h2 className="text-xl font-extrabold mt-1">
                  รอบสรุปอัตโนมัติ
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  ระบบจะตรวจและออกให้ตามเงื่อนไขที่เลือกเมื่อถึงเวลาตัดยอด
                </p>
              </div>
              <span
                className={`px-4 py-2 rounded-full text-xs font-extrabold ${job?.status === "completed" ? "bg-emerald-100 text-emerald-700" : job?.status === "running" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}
              >
                {jobLabel}
              </span>
            </div>
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-slate-500">กำหนดตัดยอด</p>
                <p className="font-extrabold text-slate-900">
                  {config?.certificateFinalizeAt
                    ? new Intl.DateTimeFormat("th-TH", {
                        dateStyle: "long",
                        timeStyle: "short",
                        timeZone: "Asia/Bangkok",
                      }).format(new Date(config.certificateFinalizeAt)) + " น."
                    : "ยังไม่ได้กำหนด"}
                </p>
              </div>
              <p className="text-xs font-semibold text-slate-500">
                เกียรติบัตรเดิมจะไม่ถูกสร้างซ้ำ
              </p>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4">
                <p className="text-xs font-bold text-emerald-700">
                  ออกแล้วทั้งหมด
                </p>
                <p className="text-3xl font-black text-emerald-900 mt-1">
                  {issuedCount}
                </p>
              </div>
              <div className="rounded-2xl bg-blue-50 border border-blue-100 p-4">
                <p className="text-xs font-bold text-blue-700">รอบนี้ทั้งหมด</p>
                <p className="text-3xl font-black text-blue-900 mt-1">
                  {job?.total || 0}
                </p>
              </div>
              <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4">
                <p className="text-xs font-bold text-amber-700">
                  กำลังดำเนินการ
                </p>
                <p className="text-3xl font-black text-amber-900 mt-1">
                  {pendingCount}
                </p>
              </div>
              <div className="rounded-2xl bg-rose-50 border border-rose-100 p-4">
                <p className="text-xs font-bold text-rose-700">ผิดพลาด</p>
                <p className="text-3xl font-black text-rose-900 mt-1">
                  {failedCount}
                </p>
              </div>
            </div>
            <div className="border-t border-slate-100 pt-5 space-y-4">
              <div>
                <h3 className="font-extrabold text-slate-900">
                  ต้องการตรวจรอบเพิ่มเติม?
                </h3>
                <p className="text-sm text-slate-500">
                  ใช้สำหรับครูที่ส่งงานภายหลังรอบสรุป
                  ระบบจะแสดงรายชื่อให้ตรวจก่อนออกบัตร
                </p>
              </div>
              <button
                onClick={scanCandidates}
                disabled={busy}
                className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-blue-600 text-white text-sm font-extrabold disabled:opacity-50 shadow-sm"
              >
                1. ตรวจรายชื่อรอบเพิ่มเติม
              </button>
              {candidates.length > 0 && (
                <div className="rounded-3xl border border-blue-200 bg-blue-50/60 p-4 sm:p-5 space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-2xl bg-white p-3 text-center">
                      <p className="text-2xl font-black text-emerald-600">
                        {newEligible.length}
                      </p>
                      <p className="text-[11px] font-bold text-slate-500">
                        ออกเพิ่มได้
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white p-3 text-center">
                      <p className="text-2xl font-black text-blue-600">
                        {alreadyIssued.length}
                      </p>
                      <p className="text-[11px] font-bold text-slate-500">
                        มีบัตรแล้ว
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white p-3 text-center">
                      <p className="text-2xl font-black text-slate-500">
                        {notEligible.length}
                      </p>
                      <p className="text-[11px] font-bold text-slate-500">
                        ยังไม่ตรงเกณฑ์
                      </p>
                    </div>
                  </div>
                  {newEligible.length > 0 ? (
                    <div className="grid md:grid-cols-2 gap-3">
                      {(["complete", "partial"] as const).map((type) => {
                        const rows = newEligible.filter(
                          (item) => item.qualificationType === type,
                        );
                        return (
                          <div
                            key={type}
                            className="rounded-2xl bg-white border border-slate-200 p-4"
                          >
                            <h4 className="font-extrabold text-sm">
                              {type === "complete"
                                ? `ส่งครบ (${rows.length})`
                                : `ส่งบางส่วน (${rows.length})`}
                            </h4>
                            <div className="mt-2 max-h-48 overflow-auto space-y-1.5">
                              {rows.length ? (
                                rows.map((item) => (
                                  <p
                                    key={item.fullName}
                                    className="text-xs font-semibold text-slate-700"
                                  >
                                    • {item.fullName}{" "}
                                    <span className="text-slate-400">
                                      {item.submitted}/{item.required}
                                    </span>
                                  </p>
                                ))
                              ) : (
                                <p className="text-xs text-slate-400">
                                  ไม่มีรายชื่อ
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="rounded-2xl bg-white p-4 text-center text-sm font-extrabold text-slate-600">
                      ตรวจแล้ว ไม่พบผู้ที่ต้องออกเกียรติบัตรเพิ่ม
                    </p>
                  )}
                  {newEligible.length > 0 && (
                    <button
                      onClick={confirmBatch}
                      disabled={busy}
                      className="w-full px-5 py-3.5 rounded-2xl bg-emerald-600 text-white text-sm font-extrabold disabled:opacity-50"
                    >
                      2. ยืนยันออกเพิ่ม {newEligible.length} คน
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>
          <section className="bg-white rounded-3xl p-4 sm:p-6 border border-slate-100 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-extrabold text-slate-900">
                  รายการเกียรติบัตร ({records.length})
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  ปุ่มดาวน์โหลดจะเปิดไฟล์เดิมที่ออกไว้
                  ทั้งหน้าแอดมินและหน้าครูใช้ไฟล์เดียวกัน
                </p>
              </div>
              <button
                onClick={exportCsv}
                disabled={!records.length}
                className="text-sm font-bold flex gap-2 items-center disabled:opacity-40"
              >
                <Download className="w-4 h-4" />
                ดาวน์โหลด CSV
              </button>
            </div>
            <div className="overflow-x-auto -mx-1">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b">
                    <th className="py-3">เลขที่</th>
                    <th>ผู้รับ</th>
                    <th>ตำแหน่ง</th>
                    <th>สถานะ</th>
                    <th>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.id} className="border-b">
                      <td className="py-3 font-bold">{r.certificateNumber}</td>
                      <td>{r.recipientName}</td>
                      <td>{r.snapshot?.position}</td>
                      <td>{r.status}</td>
                      <td>
                        <div className="flex gap-2 whitespace-nowrap">
                          {r.pdfUrl && (
                            <a
                              href={r.pdfUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 font-bold"
                            >
                              ดาวน์โหลด
                            </a>
                          )}
                          <button
                            onClick={() => reissue(r)}
                            disabled={busy}
                            className="text-amber-600 font-bold disabled:opacity-40"
                          >
                            ออกใหม่
                          </button>
                          {r.status !== "revoked" && (
                            <button
                              onClick={() => revoke(r)}
                              disabled={busy}
                              className="text-red-600 font-bold disabled:opacity-40"
                            >
                              ยกเลิก
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
      <Footer />
    </div>
  );
}
