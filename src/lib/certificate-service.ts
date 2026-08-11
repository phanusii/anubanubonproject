import { CertificateRecord, CertificateSlideField, Project, Submission } from "./types";
import { auth } from "./firebase";

// The Apps Script web-app URL is public by design. Keep a checked-in fallback
// so certificate lookup also works in clean CI/Firebase builds without .env.local.
const SERVICE_URL = process.env.NEXT_PUBLIC_CERTIFICATE_SERVICE_URL
  || "https://script.google.com/macros/s/AKfycbyhEJADSzKxiEsGcl80VuJyPPBaz_5GJhG7syFaJ2LgOake0smcU2Ipge5YmgyGNYg2/exec";

export function certificateRecipientKey(fullName: string): string {
  return fullName.trim().toLowerCase().replace(/\s+/g, " ");
}

export function slotIdAt(index: number): string {
  return `slot-${index + 1}`;
}

export function latestSubmissionPerSlot(submissions: Submission[], project: Project): Map<string, Submission> {
  const result = new Map<string, Submission>();
  const titleToId = new Map(project.workSlotTitles.map((title, index) => [title, slotIdAt(index)]));
  [...submissions]
    .filter((item) => item.projectId === project.id)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .forEach((item) => {
      const slotId = item.workSlotId || titleToId.get(item.projectTitle);
      if (slotId && !result.has(slotId)) result.set(slotId, item);
    });
  return result;
}

export function certificateProgress(submissions: Submission[], project: Project) {
  const latest = latestSubmissionPerSlot(submissions, project);
  const required = project.workSlotTitles.map((_, index) => slotIdAt(index));
  return { submitted: required.filter((id) => latest.has(id)).length, required: required.length, complete: required.length > 0 && required.every((id) => latest.has(id)) };
}

async function callService(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(SERVICE_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok) throw new Error(json?.error || "เชื่อมต่อระบบเกียรติบัตรไม่สำเร็จ");
  return json;
}

export async function issueCertificate(projectId: string, fullName: string): Promise<CertificateRecord> {
  const result = await callService({ action: "issue", projectId, fullName: fullName.trim() });
  return result.certificate as CertificateRecord;
}

export async function retryCertificate(projectId: string, fullName: string): Promise<CertificateRecord> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("กรุณาเข้าสู่ระบบผู้ดูแลอีกครั้ง");
  const result = await callService({ action: "retry", projectId, fullName: fullName.trim(), idToken });
  return result.certificate as CertificateRecord;
}

export async function createCertificatePreview(projectId: string): Promise<string> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("กรุณาเข้าสู่ระบบผู้ดูแลอีกครั้ง");
  const result = await callService({ action: "preview", projectId, idToken });
  return String(result.url || "");
}

export async function inspectCertificateTemplate(projectId: string, slideTemplateId: string): Promise<CertificateSlideField[]> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("กรุณาเข้าสู่ระบบผู้ดูแลอีกครั้ง");
  const result = await callService({ action: "inspectTemplate", projectId, slideTemplateId, idToken });
  return (result.fields || []) as CertificateSlideField[];
}

export async function revokeCertificate(id: string): Promise<void> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("กรุณาเข้าสู่ระบบผู้ดูแลอีกครั้ง");
  await callService({ action: "revoke", certificateId: id, idToken });
}

export async function getCertificates(projectId: string): Promise<CertificateRecord[]> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("กรุณาเข้าสู่ระบบผู้ดูแลอีกครั้ง");
  const result = await callService({ action: "list", projectId, idToken });
  return (result.certificates || []) as CertificateRecord[];
}

export async function findCertificateByNumber(certificateNumber: string): Promise<CertificateRecord | null> {
  const result = await callService({ action: "lookup", certificateNumber: certificateNumber.trim() });
  return (result.certificate as CertificateRecord | null) || null;
}
