import { CertificateBatchJob, CertificateCandidate, CertificateRecord, CertificateSlideField, Project, Submission } from "./types";
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
  const required = project.workSlotTitles.length;
  const unassigned: Submission[] = [];
  [...submissions]
    .filter((item) => item.projectId === project.id)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .forEach((item) => {
      const slotId = item.workSlotId || titleToId.get(item.projectTitle);
      if (slotId) {
        if (!result.has(slotId)) result.set(slotId, item);
      } else {
        // Older submissions predate workSlotId and may not match a slot title.
        unassigned.push(item);
      }
    });
  // Count each genuinely unmatched work toward the next empty slot so a title
  // mismatch doesn't wrongly mark a teacher as "ส่งไม่ครบ".
  for (let i = 0; i < required && unassigned.length; i += 1) {
    const id = slotIdAt(i);
    if (!result.has(id)) result.set(id, unassigned.shift() as Submission);
  }
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
    // Let automatic issuance finish even if the teacher leaves the success page.
    keepalive: payload.action === "issue",
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok) throw new Error(json?.error || "เชื่อมต่อระบบเกียรติบัตรไม่สำเร็จ");
  return json;
}

async function getAdminIdToken(): Promise<string> {
  // Firebase can restore the persisted session a fraction after the page mounts.
  // Waiting here prevents admin reads from being mistaken for an empty registry.
  await auth.authStateReady();
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("กรุณาเข้าสู่ระบบผู้ดูแลอีกครั้ง");
  return idToken;
}

export async function issueCertificate(projectId: string, fullName: string): Promise<CertificateRecord> {
  const result = await callService({ action: "issue", projectId, fullName: fullName.trim() });
  return result.certificate as CertificateRecord;
}

export async function retryCertificate(projectId: string, fullName: string, renumber = false): Promise<CertificateRecord> {
  const idToken = await getAdminIdToken();
  const result = await callService({ action: "retry", projectId, fullName: fullName.trim(), renumber, idToken });
  return result.certificate as CertificateRecord;
}

export async function createCertificatePreview(projectId: string): Promise<string> {
  const idToken = await getAdminIdToken();
  const result = await callService({ action: "preview", projectId, idToken });
  return String(result.url || "");
}

export async function inspectCertificateTemplate(projectId: string, slideTemplateId: string): Promise<CertificateSlideField[]> {
  const idToken = await getAdminIdToken();
  const result = await callService({ action: "inspectTemplate", projectId, slideTemplateId, idToken });
  return (result.fields || []) as CertificateSlideField[];
}

export async function revokeCertificate(id: string): Promise<void> {
  const idToken = await getAdminIdToken();
  await callService({ action: "revoke", certificateId: id, idToken });
}

export async function getCertificates(projectId: string): Promise<CertificateRecord[]> {
  const idToken = await getAdminIdToken();
  const result = await callService({ action: "list", projectId, idToken });
  return (result.certificates || []) as CertificateRecord[];
}

export async function getCertificateCandidates(projectId: string): Promise<CertificateCandidate[]> {
  const idToken = await getAdminIdToken();
  const result = await callService({ action: "certificateCandidates", projectId, idToken });
  return (result.candidates || []) as CertificateCandidate[];
}

export async function startCertificateBatch(projectId: string, fullNames: string[]): Promise<CertificateBatchJob> {
  const idToken = await getAdminIdToken();
  const result = await callService({ action: "startCertificateBatch", projectId, fullNames, idToken });
  return result.job as CertificateBatchJob;
}

export async function runCertificateBatch(projectId: string): Promise<CertificateBatchJob | null> {
  const idToken = await getAdminIdToken();
  const result = await callService({ action: "runCertificateBatch", projectId, idToken });
  return (result.job as CertificateBatchJob | null) || null;
}

export async function getCertificateBatchStatus(projectId: string): Promise<CertificateBatchJob | null> {
  const idToken = await getAdminIdToken();
  const result = await callService({ action: "certificateStatus", projectId, idToken });
  return (result.job as CertificateBatchJob | null) || null;
}

export async function removeCertificateScheduler(): Promise<void> {
  const idToken = await getAdminIdToken();
  await callService({ action: "removeCertificateScheduler", idToken });
}

export async function findCertificateForRecipient(projectId: string, fullName: string): Promise<CertificateRecord | null> {
  const result = await callService({ action: "recipientLookup", projectId, fullName: fullName.trim() });
  return (result.certificate as CertificateRecord | null) || null;
}

export async function reissueEditedCertificate(projectId: string, certificateId: string, changes: { fullName: string; position: string; gradeLevel: string; subjectGroup: string; certificateNumber: string; reason: string }): Promise<CertificateRecord> {
  const idToken = await getAdminIdToken();
  const result = await callService({ action: "reissueEdited", projectId, certificateId, changes, idToken });
  return result.certificate as CertificateRecord;
}

export async function previewEditedCertificate(projectId: string, changes: { fullName: string; certificateNumber: string }): Promise<string> {
  const idToken = await getAdminIdToken();
  const result = await callService({ action: "previewEdited", projectId, changes, idToken });
  return String(result.url || "");
}

export async function requestCertificateCorrection(projectId: string, fullName: string, requestedValue: string, note: string): Promise<void> {
  await callService({ action: "requestCorrection", projectId, fullName: fullName.trim(), requestedValue: requestedValue.trim(), note: note.trim() });
}

export async function findCertificateByNumber(certificateNumber: string): Promise<CertificateRecord | null> {
  const result = await callService({ action: "lookup", certificateNumber: certificateNumber.trim() });
  return (result.certificate as CertificateRecord | null) || null;
}
