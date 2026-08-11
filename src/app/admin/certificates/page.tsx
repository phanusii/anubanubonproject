"use client";

import { useEffect, useMemo, useState } from "react";
import { Award, CheckCircle2, Download, ExternalLink, Eye, Loader2, ScanText, Save } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AdminSidebar from "@/components/AdminSidebar";
import { getProjects, saveProject } from "@/lib/projects-service";
import { getProjectSubmissions } from "@/lib/submission-service";
import { certificateProgress, createCertificatePreview, getCertificates, inspectCertificateTemplate, issueCertificate, retryCertificate, revokeCertificate } from "@/lib/certificate-service";
import { CertificateRecord, CertificateSettings, CertificateSlideField, CertificateTextField, Project } from "@/lib/types";

const field = (y: number, size: number): CertificateTextField => ({
  x: 15, y, width: 70, fontFamily: "Sarabun", fontSize: size, minFontSize: 18,
  fontWeight: "bold", color: "#15304f", align: "center",
});

function defaults(project: Project): CertificateSettings {
  return {
    enabled: false, title: "เกียรติบัตร", description: "", issueDateText: "",
    budgetYear: project.budgetYear || project.academicYear || "2569",
    numberPrefix: "", numberStart: 1, numberDigits: 1, templateVersion: 1, templateType: "google-slides",
    orientation: "landscape", nameField: field(47, 34),
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

function StepTitle({ number, title, done }: { number: number; title: string; done: boolean }) {
  return <div className="flex items-center gap-3"><span className={`w-8 h-8 rounded-full grid place-items-center text-sm font-black ${done ? "bg-emerald-500 text-white" : "bg-blue-700 text-white"}`}>{done ? <CheckCircle2 className="w-5 h-5" /> : number}</span><h2 className="font-extrabold text-slate-900">{title}</h2></div>;
}

export default function CertificatesAdminPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [config, setConfig] = useState<CertificateSettings | null>(null);
  const [records, setRecords] = useState<CertificateRecord[]>([]);
  const [eligibleNames, setEligibleNames] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [slideFields, setSlideFields] = useState<CertificateSlideField[]>([]);
  const [issuingAutomatically, setIssuingAutomatically] = useState(false);

  useEffect(() => { getProjects(true).then((items) => { setProjects(items); if (items[0]) setProjectId(items[0].id); }); }, []);
  const project = useMemo(() => projects.find((item) => item.id === projectId), [projects, projectId]);

  useEffect(() => {
    if (!project) return;
    // A selected round owns its own editor draft; reset that draft when the selection changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConfig(project.certificate || defaults(project));
    setSlideFields([]);
    setIssuingAutomatically(false);
    let cancelled = false;
    void Promise.all([getCertificates(project.id), getProjectSubmissions(project.id, true)])
      .then(async ([certificateItems, submissions]) => {
        if (cancelled) return;
        setRecords(certificateItems);
        const groups = new Map<string, typeof submissions>();
        submissions.forEach((item) => {
          const key = item.fullName.trim().toLowerCase().replace(/\s+/g, " ");
          groups.set(key, [...(groups.get(key) || []), item]);
        });
        const eligible = Array.from(groups.values()).filter((items) => certificateProgress(items, project).complete).map((items) => [...items].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0].fullName);
        setEligibleNames(eligible);

        // Create every missing certificate immediately. Work in small batches to
        // stay below Apps Script's concurrent execution quota for large rounds.
        const issuedKeys = new Set(certificateItems.filter((item) => item.status === "issued").map((item) => item.recipientName.trim().toLowerCase().replace(/\s+/g, " ")));
        const missing = project.certificate?.enabled
          ? eligible.filter((fullName) => !issuedKeys.has(fullName.trim().toLowerCase().replace(/\s+/g, " ")))
          : [];
        if (missing.length) {
          setIssuingAutomatically(true);
          setMessage(`พบผู้ส่งครบ ${missing.length} คน กำลังสร้างเกียรติบัตรอัตโนมัติ...`);
          for (let index = 0; index < missing.length && !cancelled; index += 3) {
            await Promise.allSettled(missing.slice(index, index + 3).map((fullName) => issueCertificate(project.id, fullName)));
          }
          if (!cancelled) {
            const refreshed = await getCertificates(project.id);
            setRecords(refreshed);
            setMessage("สร้างและอัปเดตรายการเกียรติบัตรอัตโนมัติแล้ว");
            setIssuingAutomatically(false);
          }
        }
      })
      .catch(() => { if (!cancelled) { setRecords([]); setEligibleNames([]); setIssuingAutomatically(false); } });

    const refreshTimer = window.setInterval(() => {
      void getCertificates(project.id).then((items) => { if (!cancelled) setRecords(items); }).catch(() => undefined);
    }, 15000);
    return () => { cancelled = true; window.clearInterval(refreshTimer); };
  }, [project]);

  const save = async () => {
    if (!project || !config) return;
    const slideId = extractSlidesId(config.slideTemplateId || config.slideTemplateUrl || "");
    if (!slideId) { setMessage("กรุณาวางลิงก์ Google Slides ที่ถูกต้อง"); return; }
    setBusy(true);
    try {
      const normalizedConfig = { ...config, slideTemplateId: slideId, slideTemplateUrl: `https://docs.google.com/presentation/d/${slideId}/edit`, templateType: "google-slides" as const };
      const previousComparable = { ...(project.certificate || {}) } as Partial<CertificateSettings>;
      const nextComparable = { ...normalizedConfig } as Partial<CertificateSettings>;
      delete previousComparable.templateVersion;
      delete nextComparable.templateVersion;
      const settingsChanged = JSON.stringify(previousComparable) !== JSON.stringify(nextComparable);
      const nextConfig = {
        ...normalizedConfig,
        templateVersion: settingsChanged
          ? Number(project.certificate?.templateVersion || config.templateVersion || 1) + 1
          : Number(project.certificate?.templateVersion || config.templateVersion || 1),
      };
      const updated = { ...project, certificate: nextConfig };
      await saveProject(updated);
      setProjects((items) => items.map((item) => item.id === updated.id ? updated : item));

      const recipients = Array.from(new Set(records
        .filter((record) => record.status !== "revoked")
        .map((record) => record.recipientName.trim())
        .filter(Boolean)));
      if (settingsChanged && nextConfig.enabled && recipients.length) {
        setMessage(`บันทึกแล้ว กำลังแก้เกียรติบัตรเดิม ${recipients.length} คนตามการตั้งค่าใหม่...`);
        const refreshedRecords: CertificateRecord[] = [];
        for (let index = 0; index < recipients.length; index += 3) {
          const batch = await Promise.allSettled(recipients.slice(index, index + 3).map((fullName) => retryCertificate(project.id, fullName)));
          batch.forEach((result) => { if (result.status === "fulfilled") refreshedRecords.push(result.value); });
          setMessage(`กำลังอัปเดตเกียรติบัตร ${Math.min(index + 3, recipients.length)}/${recipients.length} คน...`);
        }
        const latestRecords = await getCertificates(project.id);
        setRecords(latestRecords);
        const failedCount = recipients.length - refreshedRecords.length;
        setMessage(failedCount ? `อัปเดตสำเร็จ ${refreshedRecords.length} คน และมี ${failedCount} คนที่ต้องลองใหม่` : "อัปเดตเกียรติบัตรของครูทุกคนตามการตั้งค่าใหม่แล้ว");
      } else {
        setMessage(nextConfig.enabled ? "บันทึกแล้ว ระบบกำลังตรวจและสร้างเกียรติบัตรให้ผู้ส่งครบอัตโนมัติ" : "บันทึกการตั้งค่าเกียรติบัตรแล้ว");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "บันทึกหรืออัปเดตเกียรติบัตรไม่สำเร็จ");
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
      setProjects((items) => items.map((item) => item.id === updated.id ? updated : item));
      const url = await createCertificatePreview(project.id);
      window.open(url, "_blank", "noopener,noreferrer");
    }
    catch (error) { setMessage(error instanceof Error ? error.message : "สร้างตัวอย่างไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const inspectTemplate = async () => {
    if (!project || !config) return;
    const id = extractSlidesId(config.slideTemplateId || config.slideTemplateUrl || "");
    if (!id) { setMessage("กรุณาวางลิงก์ Google Slides ก่อน"); return; }
    setBusy(true); setMessage("กำลังอ่านกล่องข้อความจาก Google Slides...");
    try {
      const fields = await inspectCertificateTemplate(project.id, id);
      setSlideFields(fields);
      setMessage(`พบกล่องข้อความ ${fields.length} กล่อง กรุณาเลือกกล่องสำหรับแต่ละข้อมูล`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "อ่านกล่องข้อความไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const selectSlideField = (key: "slideNameField" | "slideNumberField", value: string) => {
    if (!config) return;
    const selected = slideFields.find((item) => `${item.slideIndex}:${item.objectId}` === value);
    setConfig({ ...config, [key]: selected });
  };

  const fieldValue = (value?: CertificateSlideField) => value ? `${value.slideIndex}:${value.objectId}` : "";

  const exportCsv = () => {
    const rows = [["เลขที่", "ชื่อ-นามสกุล", "ตำแหน่ง", "สถานะ", "ลิงก์"], ...records.map((r) => [r.certificateNumber, r.recipientName, r.snapshot?.position || "", r.status, r.pdfUrl || ""] )];
    const csv = "\uFEFF" + rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `certificates-${projectId}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const revoke = async (record: CertificateRecord) => {
    if (!confirm(`ยืนยันยกเลิกเกียรติบัตรเลขที่ ${record.certificateNumber}?`)) return;
    await revokeCertificate(record.id);
    setRecords((items) => items.map((item) => item.id === record.id ? { ...item, status: "revoked" } : item));
  };

  const reissue = async (record: CertificateRecord) => {
    if (!project) return;
    setBusy(true); setMessage("กำลังออกเกียรติบัตรใหม่...");
    try {
      const next = await retryCertificate(project.id, record.recipientName);
      setRecords((items) => [next, ...items.filter((item) => item.id !== next.id)]);
      setMessage("ออกเกียรติบัตรใหม่แล้ว โดยคงเลขที่เดิม");
    } catch (error) { setMessage(error instanceof Error ? error.message : "ออกใหม่ไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const downloadFresh = async (record: CertificateRecord) => {
    if (!project) return;
    const downloadWindow = window.open("", "_blank");
    setBusy(true); setMessage(`กำลังสร้างเกียรติบัตรล่าสุดของ ${record.recipientName}...`);
    try {
      const next = await retryCertificate(project.id, record.recipientName);
      setRecords((items) => items.map((item) => item.id === next.id ? next : item));
      setMessage("สร้างไฟล์ล่าสุดแล้ว กำลังเปิดเกียรติบัตร");
      if (next.pdfUrl && downloadWindow) downloadWindow.location.href = next.pdfUrl;
      else if (next.pdfUrl) setMessage("สร้างไฟล์ล่าสุดแล้ว กรุณาอนุญาตหน้าต่างป๊อปอัปแล้วกดดาวน์โหลดอีกครั้ง");
    } catch (error) {
      downloadWindow?.close();
      setMessage(error instanceof Error ? error.message : "สร้างไฟล์ล่าสุดไม่สำเร็จ");
    }
    finally { setBusy(false); }
  };

  const issueFor = async (fullName: string) => {
    if (!project) return;
    setBusy(true); setMessage(`กำลังออกเกียรติบัตรให้ ${fullName}...`);
    try {
      const next = await retryCertificate(project.id, fullName);
      setRecords((items) => [next, ...items.filter((item) => item.id !== next.id)]);
      setMessage("ออกเกียรติบัตรเรียบร้อยแล้ว");
    } catch (error) { setMessage(error instanceof Error ? error.message : "ออกเกียรติบัตรไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const slideId = config ? extractSlidesId(config.slideTemplateId || config.slideTemplateUrl || "") : "";
  const templatePreview = slideId ? `https://docs.google.com/presentation/d/${slideId}/preview?rm=minimal` : "";
  const fieldsReady = Boolean(config?.slideNameField && config?.slideNumberField);
  const sampleNumber = config ? toThaiDigits(`${config.numberPrefix || ""}${config.numberStart}/${config.budgetYear}`) : "๒/๒๕๖๙";
  const nameSource = config?.slideNameField?.sourceText || "ยังไม่ได้เลือก";
  const numberSource = config?.slideNumberField?.sourceText || "ยังไม่ได้เลือก";

  return <div className="min-h-screen flex flex-col"><Navbar /><div className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 flex flex-col md:flex-row gap-6"><AdminSidebar /><main className="flex-1 space-y-6 min-w-0">
    <section className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm"><div className="flex items-center gap-3"><Award className="text-amber-500" /><div><h1 className="text-2xl font-extrabold text-slate-900">จัดการเกียรติบัตร</h1><p className="text-sm text-slate-500">ใช้ Google Slides เป็นแม่แบบและออกไฟล์ PDF อัตโนมัติ</p></div></div></section>
    <section className="bg-white rounded-3xl p-6 border border-slate-100 space-y-5">
      <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full px-4 py-3 rounded-2xl border font-bold">{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      {config && <>
        <div className="grid lg:grid-cols-[380px_minmax(0,1fr)] gap-5 items-start">
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-200 p-4 space-y-3"><StepTitle number={1} title="เลขที่เกียรติบัตร" done={Boolean(config.budgetYear && config.numberStart)} /><div className="grid grid-cols-2 gap-2"><label className="text-[11px] font-bold text-slate-600">ปีงบประมาณ<input value={config.budgetYear} onChange={(e) => setConfig({ ...config, budgetYear: e.target.value })} className="mt-1 w-full px-3 py-2.5 rounded-xl border" /></label><label className="text-[11px] font-bold text-slate-600">เลขเริ่มต้น<input type="number" min="1" value={config.numberStart} onChange={(e) => setConfig({ ...config, numberStart: Number(e.target.value) || 1 })} className="mt-1 w-full px-3 py-2.5 rounded-xl border" /></label></div><p className="text-xs font-bold text-amber-700">ตัวอย่าง: {sampleNumber}</p></div>
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 space-y-3"><StepTitle number={2} title="ลิงก์ Google Slides" done={Boolean(slideId)} /><input value={config.slideTemplateUrl || config.slideTemplateId || ""} onChange={(e) => setConfig({ ...config, slideTemplateUrl: e.target.value, slideTemplateId: extractSlidesId(e.target.value), templateType: "google-slides" })} placeholder="วางลิงก์ Google Slides" className="w-full px-3 py-2.5 rounded-xl border border-blue-200 bg-white text-sm" /><div className="flex gap-2"><button type="button" onClick={inspectTemplate} disabled={busy || !slideId} className="flex-1 px-3 py-2.5 rounded-xl bg-blue-700 text-white text-xs font-extrabold flex justify-center items-center gap-1.5 disabled:opacity-40"><ScanText className="w-4 h-4" />ดึงข้อความ</button>{slideId && <a href={`https://docs.google.com/presentation/d/${slideId}/edit`} target="_blank" rel="noreferrer" className="px-3 py-2.5 rounded-xl bg-white text-blue-700 border border-blue-200"><ExternalLink className="w-4 h-4" /></a>}</div></div>
            <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4 space-y-3"><StepTitle number={3} title="เลือก 2 จุดที่จะแก้" done={fieldsReady} />{slideFields.length > 0 ? <div className="space-y-2">{([['slideNameField', 'ช่องชื่อ–นามสกุล'], ['slideNumberField', 'ช่องเลขที่']] as const).map(([key, label]) => <label key={key} className="text-[11px] font-extrabold text-slate-700">{label}<select value={fieldValue(config[key])} onChange={(e) => selectSlideField(key, e.target.value)} className="mt-1 w-full px-3 py-2.5 rounded-xl border bg-white text-xs"><option value="">— เลือกข้อความ —</option>{slideFields.map((item) => <option key={`${item.slideIndex}:${item.objectId}`} value={`${item.slideIndex}:${item.objectId}`}>หน้า {item.slideIndex + 1}: {item.sourceText.slice(0, 42)}</option>)}</select></label>)}</div> : <p className="text-xs text-slate-500">กด “ดึงข้อความ” ก่อน แล้วเลือกรายการสองช่อง</p>}</div>
            <label className="flex items-center justify-between p-3.5 rounded-2xl bg-emerald-50 border border-emerald-100"><span className="text-sm font-extrabold">ออกอัตโนมัติเมื่อส่งครบ</span><input type="checkbox" checked={config.enabled} onChange={(e) => setConfig({ ...config, enabled: e.target.checked })} className="w-5 h-5 accent-emerald-600" /></label>
            <div className="grid grid-cols-2 gap-2"><button onClick={preview} disabled={busy || !slideId || !fieldsReady} className="px-3 py-3 rounded-xl border-2 font-extrabold text-xs flex justify-center gap-1.5 items-center disabled:opacity-40"><Eye className="w-4 h-4" />ทดลอง PDF</button><button onClick={save} disabled={busy || !slideId || !fieldsReady} className="px-3 py-3 rounded-xl bg-emerald-600 text-white font-extrabold text-xs flex justify-center gap-1.5 items-center disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}บันทึก</button></div>
          </div>
          <div className="lg:sticky lg:top-4 space-y-3">
            <div className="max-w-lg mx-auto w-full rounded-2xl border border-slate-200 overflow-hidden bg-slate-100"><div className="px-4 py-2.5 bg-white border-b flex items-center justify-between"><strong className="text-sm">ตัวอย่างแม่แบบ</strong>{fieldsReady && <span className="text-xs font-bold text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" />เลือกครบแล้ว</span>}</div><div className={`relative ${config.orientation === "landscape" ? "aspect-[1.414/1]" : "aspect-[1/1.414]"}`}>{templatePreview ? <iframe title="ตัวอย่าง Google Slides" src={templatePreview} className="absolute inset-0 w-full h-full border-0" allowFullScreen /> : <div className="absolute inset-0 grid place-items-center text-slate-400 font-bold text-center px-4">วางลิงก์เพื่อแสดงแม่แบบตรงนี้</div>}</div></div>
            <div className={`rounded-2xl border-2 p-4 ${fieldsReady ? "border-emerald-300 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}><div className="flex items-center justify-between mb-3"><strong className="text-sm">ตรวจพื้นที่ที่ระบบจะแก้ไข</strong><span className={`text-xs font-bold ${fieldsReady ? "text-emerald-700" : "text-amber-700"}`}>{fieldsReady ? "ถูกเลือกครบ 2 จุด" : "ยังเลือกไม่ครบ"}</span></div><div className="grid sm:grid-cols-2 gap-3"><div className="rounded-xl bg-white border p-3"><p className="text-[10px] font-bold text-slate-400">ชื่อ: ข้อความเดิม</p><p className="text-sm font-bold truncate">{nameSource}</p><div className="my-2 border-t border-dashed" /><p className="text-[10px] font-bold text-emerald-600">จะเปลี่ยนเป็น</p><p className="text-lg font-black text-slate-900">นายสมชาย ใจดี</p></div><div className="rounded-xl bg-white border p-3"><p className="text-[10px] font-bold text-slate-400">เลขที่: ข้อความเดิม</p><p className="text-sm font-bold truncate">{numberSource}</p><div className="my-2 border-t border-dashed" /><p className="text-[10px] font-bold text-emerald-600">จะเปลี่ยนเป็น</p><p className="text-lg font-black text-pink-600">{sampleNumber}</p></div></div><p className="mt-3 text-[11px] text-slate-500">ระบบเปลี่ยนเฉพาะสองกล่องนี้ ข้อความ รูปภาพ และลายเซ็นอื่นจะคงเดิมทั้งหมด</p></div>
          </div>
        </div>
      </>}
      {message && <p className="text-sm font-bold text-blue-700">{message}</p>}
    </section>
    <section className="bg-white rounded-3xl p-6 border border-slate-100 space-y-4">{issuingAutomatically && <div className="rounded-2xl bg-blue-50 border border-blue-200 p-4 flex items-center gap-3 text-blue-700"><Loader2 className="w-5 h-5 animate-spin shrink-0" /><div><p className="font-extrabold">กำลังสร้างเกียรติบัตรอัตโนมัติ</p><p className="text-xs font-semibold">รายการจะปรากฏด้านล่างทันทีเมื่อสร้างเสร็จ</p></div></div>}<div className="grid sm:grid-cols-4 gap-3"><div className="rounded-2xl bg-blue-50 p-4"><p className="text-xs text-slate-500">มีสิทธิ์</p><p className="text-2xl font-extrabold">{eligibleNames.length}</p></div><div className="rounded-2xl bg-emerald-50 p-4"><p className="text-xs text-slate-500">ออกแล้ว</p><p className="text-2xl font-extrabold">{records.filter((r) => r.status === "issued").length}</p></div><div className="rounded-2xl bg-amber-50 p-4"><p className="text-xs text-slate-500">รอดำเนินการ</p><p className="text-2xl font-extrabold">{records.filter((r) => r.status === "pending").length}</p></div><div className="rounded-2xl bg-red-50 p-4"><p className="text-xs text-slate-500">ผิดพลาด</p><p className="text-2xl font-extrabold">{records.filter((r) => r.status === "failed").length}</p></div></div><div><h2 className="font-extrabold mb-2">ผู้มีสิทธิ์ที่ยังไม่มีเกียรติบัตร</h2><div className="flex flex-wrap gap-2">{eligibleNames.filter((name) => !records.some((r) => r.recipientName === name && r.status === "issued")).map((name) => <button key={name} onClick={() => issueFor(name)} disabled={busy || issuingAutomatically} className="px-3 py-2 rounded-xl bg-blue-50 text-blue-700 text-xs font-bold disabled:opacity-50">{issuingAutomatically ? "กำลังออกให้ " : "ออกให้ "}{name}</button>)}</div></div></section>
    <section className="bg-white rounded-3xl p-6 border border-slate-100 space-y-4"><div className="flex justify-between gap-3"><h2 className="font-extrabold text-slate-900">รายการเกียรติบัตร ({records.length})</h2><button onClick={exportCsv} disabled={!records.length} className="text-sm font-bold flex gap-2 items-center disabled:opacity-40"><Download className="w-4 h-4" />ดาวน์โหลด CSV</button></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-slate-500 border-b"><th className="py-3">เลขที่</th><th>ผู้รับ</th><th>ตำแหน่ง</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>{records.map((r) => <tr key={r.id} className="border-b"><td className="py-3 font-bold">{r.certificateNumber}</td><td>{r.recipientName}</td><td>{r.snapshot?.position}</td><td>{r.status}</td><td><div className="flex gap-2">{r.pdfUrl && <button onClick={() => downloadFresh(r)} disabled={busy} className="text-blue-600 font-bold disabled:opacity-40">สร้างล่าสุดและดาวน์โหลด</button>}<button onClick={() => reissue(r)} disabled={busy} className="text-amber-600 font-bold disabled:opacity-40">ออกใหม่</button>{r.status !== "revoked" && <button onClick={() => revoke(r)} disabled={busy} className="text-red-600 font-bold disabled:opacity-40">ยกเลิก</button>}</div></td></tr>)}</tbody></table></div></section>
  </main></div><Footer /></div>;
}
