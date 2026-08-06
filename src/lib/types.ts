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
  workSlotTitles?: string[]; // Custom slot titles defined by Admin
  // Active Project Display Filter Settings
  activeProjectFilterMode?: 'all' | 'specific'; // 'all' | 'specific'
  activeProjectFilterName?: string; // Specific training/project name to filter public display
  // Telegram Bot Notification Settings
  telegramChatId?: string;
  telegramNotificationsEnabled?: boolean;
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
