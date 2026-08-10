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
  fileType: string; // 'pdf' | 'png' | 'jpg' | 'jpeg' | 'webp' | 'drive'
  fileURL: string;
  fileName?: string;
  fileSize?: number;
  thumbnail?: string; // DataURL or Google Drive thumbnail / storage image URL
  uploadDate: string; // ISO String or formatted date
  createdAt?: number; // Timestamp ms for sorting
  // Google Drive integration fields
  driveLink?: string;
  driveFileId?: string;
  submissionMethod?: 'file' | 'drive';
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
