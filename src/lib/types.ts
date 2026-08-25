export interface Submission {
  id: string;
  fullName: string;
  position: string;
  school: string;
  province?: string;
  gradeLevel: string;
  subjectGroup: string;
  projectTitle: string;
  description?: string;
  // Which training round/project this submission belongs to (stamped at creation)
  projectId?: string;
  projectName?: string;
  /** Stable id of the required work slot. Legacy submissions fall back to their title/index. */
  workSlotId?: string;
  fileType: string; // 'pdf' | 'png' | 'jpg' | 'jpeg' | 'webp' | 'drive'
  fileURL: string;
  fileName?: string;
  fileSize?: number;
  thumbnail?: string; // DataURL or Google Drive thumbnail / storage image URL
  thumbUrl?: string;  // Short URL-only thumbnail (Storage) — safe to load in the gallery projection
  uploadDate: string; // ISO String or formatted date
  createdAt?: number; // Timestamp ms for sorting
  // Google Drive integration fields
  driveLink?: string;
  driveFileId?: string;
  submissionMethod?: 'file' | 'drive';
}

export type CertificateTextAlign = "left" | "center" | "right";

export interface CertificateTextField {
  x: number;
  y: number;
  width: number;
  fontFamily: string;
  fontSize: number;
  minFontSize: number;
  fontWeight: "normal" | "bold";
  color: string;
  align: CertificateTextAlign;
}

export interface CertificateSettings {
  enabled: boolean;
  /** ISO date-time used as the certificate eligibility cutoff (Asia/Bangkok in UI). */
  certificateFinalizeAt?: string;
  issueForComplete?: boolean;
  issueForPartial?: boolean;
  title?: string;
  description?: string;
  issueDateText?: string;
  budgetYear: string;
  numberPrefix?: string;
  numberStart: number;
  numberDigits: number;
  /** Google Slides presentation used as the certificate template. */
  slideTemplateId?: string;
  slideTemplateUrl?: string;
  templateType?: "google-slides" | "legacy-file";
  slideNameField?: CertificateSlideField;
  slideNumberField?: CertificateSlideField;
  slideDateField?: CertificateSlideField;
  /** Legacy image/PDF template fields retained for existing records. */
  templateFileId?: string;
  templateUrl?: string;
  templateMimeType?: string;
  templateVersion: number;
  orientation: "landscape" | "portrait";
  nameField: CertificateTextField;
  numberField: CertificateTextField;
  dateField?: CertificateTextField;
}

export interface CertificateSlideField {
  slideIndex: number;
  objectId: string;
  sourceText: string;
}

export interface CertificateRecord {
  id: string;
  projectId: string;
  recipientKey: string;
  recipientName: string;
  certificateNumber: string;
  budgetYear: string;
  issuedAt: number;
  templateVersion: number;
  submissionIds: string[];
  pdfFileId?: string;
  pdfUrl?: string;
  status: "pending" | "issued" | "failed" | "revoked";
  error?: string;
  qualificationType?: "complete" | "partial";
  finalizedAt?: number;
  batchType?: "scheduled" | "manual";
  submissionCountAtIssue?: number;
  cutoffAt?: number;
  batchId?: string;
  batchNumber?: number;
  revisionNumber?: number;
  reissuedAt?: number;
  reissuedBy?: string;
  reissueReason?: string;
  previousPdfFileId?: string;
  revisions?: CertificateRevision[];
  snapshot: {
    fullName: string;
    position: string;
    gradeLevel: string;
    subjectGroup: string;
  };
}

export interface CertificateRevision {
  revisionNumber: number;
  reissuedAt: number;
  reissuedBy: string;
  reason: string;
  certificateNumber: string;
  pdfFileId?: string;
  snapshot: CertificateRecord["snapshot"];
}

export interface CertificateCandidate {
  fullName: string;
  qualificationType: "complete" | "partial" | "none";
  submitted: number;
  required: number;
  eligible: boolean;
  reason?: string;
  position?: string;
  gradeLevel?: string;
  subjectGroup?: string;
  missingTitles?: string[];
}

export interface CertificateBatchJob {
  projectId: string;
  batchType: "scheduled" | "manual";
  cutoffAt: number;
  status: "waiting" | "running" | "completed" | "failed";
  total: number;
  processed: number;
  issued: number;
  failed: number;
  updatedAt: number;
  error?: string;
  batchId?: string;
  batchNumber?: number;
  names?: string[];
}

export interface TrainingSettings {
  maxUpload: number;
  trainingName: string;
  trainingDescription: string;
  openDate: string;
  closeDate: string;
  bannerUrl: string;
  allowSubmissions?: boolean;
  schoolLogoUrl?: string;
  schoolName?: string;
  educationalArea?: string;
  categoryType?: string; // "การส่งผลงานการอบรม" | "การส่งผลงานโครงการ" | "การประกวดผลงานนวัตกรรม"
  academicYear?: string; // "2569"
  budgetYear?: string; // ปีงบประมาณ; academicYear remains as a legacy fallback
  workSlotTitles?: string[]; // Custom slot titles defined by Admin
  // Active Project Display Filter Settings (legacy text-match; superseded by activeProjectId)
  activeProjectFilterMode?: 'all' | 'specific'; // 'all' | 'specific'
  activeProjectFilterName?: string; // Specific training/project name to filter public display
  // The training round/project currently open for submission and shown by default
  activeProjectId?: string;
  telegramNotificationsEnabled?: boolean;
  telegramChatId?: string;
  telegramTestRequestedAt?: number;
}

/**
 * A training round / project. Multiple can exist over time; one is "active"
 * (open for submission and shown by default on the public gallery).
 */
export interface Project {
  id: string;
  name: string;
  // 'training' (การอบรม) → wording uses "ส่งงาน"; 'project' (โครงการ) → "ส่งผลงาน"
  kind?: 'training' | 'project';
  categoryType?: string;
  // Which dimension this round is organised by. Drives both the submit form's
  // primary selector and how the gallery groups cards. Defaults to 'gradeLevel'
  // so every existing round keeps its current (grade-based) behaviour.
  groupBy?: 'gradeLevel' | 'subjectGroup';
  academicYear?: string;
  budgetYear?: string;
  description?: string;
  bannerUrl?: string;
  openDate?: string;
  closeDate?: string;
  workSlotTitles: string[];
  maxUpload: number;
  status?: 'active' | 'closed';
  createdAt?: number;
  order?: number;
  // Whether this round appears in the public "คลังผลงานครู" round dropdown (default: true).
  showInGallery?: boolean;
  certificate?: CertificateSettings;
}

export interface GradeLevelOption {
  id: string;
  name: string;
  order: number;
}

export interface SubjectGroupOption {
  id: string;
  name: string;
  order: number;
}

export interface DashboardStats {
  totalSubmissions: number;
  totalSenders: number;
  pdfCount: number;
  imageCount: number;
  dailyStats: { date: string; count: number }[];
}
