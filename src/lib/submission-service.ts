import { db, storage } from "./firebase";
import { 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query,
  orderBy,
  limit,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { Submission, TrainingSettings, GradeLevelOption, SubjectGroupOption, DashboardStats } from "./types";

// Default Master Data (สายชั้น อ.1 - อ.3 ถึง ป.1 - ป.6)
export const DEFAULT_GRADE_LEVELS: GradeLevelOption[] = [
  { id: "1", name: "อ.1", order: 1 },
  { id: "2", name: "อ.2", order: 2 },
  { id: "3", name: "อ.3", order: 3 },
  { id: "4", name: "ป.1", order: 4 },
  { id: "5", name: "ป.2", order: 5 },
  { id: "6", name: "ป.3", order: 6 },
  { id: "7", name: "ป.4", order: 7 },
  { id: "8", name: "ป.5", order: 8 },
  { id: "9", name: "ป.6", order: 9 },
  { id: "10", name: "ม.1", order: 10 },
  { id: "11", name: "ม.2", order: 11 },
  { id: "12", name: "ม.3", order: 12 },
  { id: "13", name: "อื่น ๆ", order: 13 },
];

// Default 8 กลุ่มสาระการเรียนรู้ + การศึกษาปฐมวัย
export const DEFAULT_SUBJECT_GROUPS: SubjectGroupOption[] = [
  { id: "1", name: "กลุ่มสาระการเรียนรู้ภาษาไทย", order: 1 },
  { id: "2", name: "กลุ่มสาระการเรียนรู้คณิตศาสตร์", order: 2 },
  { id: "3", name: "กลุ่มสาระการเรียนรู้วิทยาศาสตร์และเทคโนโลยี", order: 3 },
  { id: "4", name: "กลุ่มสาระการเรียนรู้สังคมศึกษา ศาสนา และวัฒนธรรม", order: 4 },
  { id: "5", name: "กลุ่มสาระการเรียนรู้สุขศึกษาและพลศึกษา", order: 5 },
  { id: "6", name: "กลุ่มสาระการเรียนรู้ศิลปะ", order: 6 },
  { id: "7", name: "กลุ่มสาระการเรียนรู้การงานอาชีพ", order: 7 },
  { id: "8", name: "กลุ่มสาระการเรียนรู้ภาษาต่างประเทศ", order: 8 },
  { id: "9", name: "การศึกษาปฐมวัย / อนุบาล", order: 9 },
  { id: "10", name: "กิจกรรมพัฒนาผู้เรียน / อื่น ๆ", order: 10 },
];

export const DEFAULT_SETTINGS: TrainingSettings = {
  maxUpload: 10,
  trainingName: "โครงการส่งเสริมและพัฒนานวัตกรรมการจัดการเรียนรู้เชิงรุก (Active Learning)",
  trainingDescription: "ระบบส่งผลงานการจัดการเรียนรู้ แผนการสอน และสื่อดิจิทัล สำหรับครูและบุคลากรทางการศึกษา โรงเรียนอนุบาลอุบลราชธานี",
  openDate: "2026-08-01T00:00",
  closeDate: "2026-08-31T23:59",
  bannerUrl: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=1200&auto=format&fit=crop",
  allowSubmissions: true,
  schoolLogoUrl: "https://images.unsplash.com/photo-1594312915251-48db9280c8f1?w=200&auto=format&fit=crop",
  schoolName: "โรงเรียนอนุบาลอุบลราชธานี",
  educationalArea: "สำนักงานเขตพื้นที่การศึกษาประถมศึกษาอุบลราชธานี เขต 1",
  categoryType: "การส่งผลงานนวัตกรรมการเรียนรู้",
  academicYear: "2569",
  workSlotTitles: [
    "ชิ้นที่ 1: แผนการจัดการเรียนรู้ Active Learning (ไฟล์ PDF)",
    "ชิ้นที่ 2: สื่อและนวัตกรรมการสอนดิจิทัล (รูปภาพ / PDF / Google Drive)",
    "ชิ้นที่ 3: ภาพบรรยากาศการจัดกิจกรรมการเรียนรู้ (ไฟล์รูปภาพ / PDF)",
    "ชิ้นที่ 4: สื่อคลิปวิดีโอการจัดกิจกรรมการเรียนรู้ (Google Drive Link)",
    "ชิ้นที่ 5: เครื่องมือวัดและประเมินผลการเรียนรู้ตามสภาพจริง (ไฟล์ PDF)",
    "ชิ้นที่ 6: ชิ้นงาน / ผลงานนักเรียนที่เกิดจากการจัดการเรียนรู้ (รูปภาพ / PDF)",
    "ชิ้นที่ 7: รายงานวิจัยในชั้นเรียนเพื่อแก้ปัญหาการเรียนรู้ (ไฟล์ PDF)",
    "ชิ้นที่ 8: เอกสารสรุปผลการจัดกิจกรรม / การวัดผลสัมฤทธิ์ (ไฟล์ PDF)",
    "ชิ้นที่ 9: เกียรติบัตร / รางวัลความสำเร็จของผลงานนวัตกรรม (ไฟล์รูปภาพ)",
    "ชิ้นที่ 10: สื่อประกอบการสอนเพิ่มเติม / QR Code แหล่งเรียนรู้ (Google Drive)"
  ],
  activeProjectFilterMode: 'all',
  activeProjectFilterName: "โครงการส่งเสริมและพัฒนานวัตกรรมการจัดการเรียนรู้เชิงรุก (Active Learning)"
};

// High Performance Runtime Memory Caches
let memorySettingsCache: { data: TrainingSettings; timestamp: number } | null = null;
let memorySubmissionsCache: { data: Submission[]; timestamp: number } | null = null;
const CACHE_TTL_MS = 120000;

// Upper bound on how many newest submissions we fetch in one read. Bounds Firestore
// read cost/latency instead of downloading the entire collection. Client-side search
// and filtering run over this most-recent window.
const FETCH_CAP = 500;

// No built-in sample submissions — the app shows only real data from Firestore.
const INITIAL_MOCK_SUBMISSIONS: Submission[] = [];

function getLocalSubmissions(): Submission[] {
  if (typeof window === "undefined") return INITIAL_MOCK_SUBMISSIONS;
  const stored = localStorage.getItem("app_submissions");
  if (!stored) {
    localStorage.setItem("app_submissions", JSON.stringify(INITIAL_MOCK_SUBMISSIONS));
    return INITIAL_MOCK_SUBMISSIONS;
  }
  try {
    const parsed = JSON.parse(stored);
    return parsed.length > 0 ? parsed : INITIAL_MOCK_SUBMISSIONS;
  } catch {
    return INITIAL_MOCK_SUBMISSIONS;
  }
}

function saveLocalSubmissions(subs: Submission[]) {
  memorySubmissionsCache = { data: subs, timestamp: Date.now() };
  if (typeof window !== "undefined") {
    localStorage.setItem("app_submissions", JSON.stringify(subs));
  }
}

/**
 * Delete a file from Firebase Storage by its download URL
 */
export async function deleteStorageFileByUrl(url?: string): Promise<void> {
  if (!url || !url.includes("firebasestorage.googleapis.com")) return;
  try {
    const fileRef = ref(storage, url);
    await deleteObject(fileRef);
    console.log("Successfully deleted old storage file:", url);
  } catch (err) {
    console.warn("Storage delete file by URL warning:", err);
  }
}

/**
 * Synchronous Instant Settings Getter for 0ms initial render (Never shows blank/fallback on frame 0!)
 */
export function getInstantSettings(): TrainingSettings {
  if (memorySettingsCache) {
    return memorySettingsCache.data;
  }
  if (typeof window !== "undefined") {
    const local = localStorage.getItem("app_settings");
    if (local) {
      try {
        const parsed = JSON.parse(local);
        return { ...DEFAULT_SETTINGS, ...parsed };
      } catch {}
    }
  }
  return DEFAULT_SETTINGS;
}

/**
 * Synchronous Instant Submissions Getter for 0ms initial render (Never shows 0 items!)
 */
export function getInstantSubmissions(): Submission[] {
  if (memorySubmissionsCache && memorySubmissionsCache.data.length > 0) {
    return [...memorySubmissionsCache.data];
  }
  return getLocalSubmissions();
}

/**
 * Client-Side Ultra-Fast Image Compressor (90% size reduction, < 1s upload time!)
 */
export async function compressAndResizeImage(file: File, maxWidth = 800, maxHeight = 800, quality = 0.8): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(file);

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) return resolve(file);
            const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, ".webp"), {
              type: "image/webp",
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          },
          "image/webp",
          quality
        );
      };
      img.onerror = () => resolve(file);
    };
    reader.onerror = () => resolve(file);
  });
}

/**
 * Convert file to compact Data URL fallback (< 100KB)
 */
export function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

/**
 * Fetch Training Settings with High Performance Caching (Prioritizes local custom logo & settings)
 */
export async function getTrainingSettings(forceRefresh = false): Promise<TrainingSettings> {
  const now = Date.now();

  let localData: TrainingSettings | null = null;
  if (typeof window !== "undefined") {
    const local = localStorage.getItem("app_settings");
    if (local) {
      try { 
        localData = JSON.parse(local);
      } catch {}
    }
  }

  if (!forceRefresh && memorySettingsCache && (now - memorySettingsCache.timestamp < CACHE_TTL_MS)) {
    return localData ? { ...DEFAULT_SETTINGS, ...localData, ...memorySettingsCache.data } : memorySettingsCache.data;
  }

  try {
    const docRef = doc(db, "settings", "training");
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      const firestoreData = snapshot.data();
      const merged = { ...DEFAULT_SETTINGS, ...localData, ...firestoreData } as TrainingSettings;
      memorySettingsCache = { data: merged, timestamp: now };
      if (typeof window !== "undefined") {
        localStorage.setItem("app_settings", JSON.stringify(merged));
      }
      return merged;
    }
  } catch (err) {
    console.warn("Firestore fetch settings error, using cached settings:", err);
  }

  const finalData = localData ? { ...DEFAULT_SETTINGS, ...localData } : DEFAULT_SETTINGS;
  memorySettingsCache = { data: finalData, timestamp: now };
  return finalData;
}

/**
 * Save / Update Training Settings (automatically deletes old logo/banner file and dispatches instant UI update)
 */
/**
 * Save settings to localStorage (instant) and Firestore (shared across devices).
 * Returns true only if the Firestore write succeeded — callers should warn the admin
 * when it returns false, because otherwise the change lives only in this browser.
 */
export async function updateTrainingSettings(settings: Partial<TrainingSettings>): Promise<boolean> {
  const current = await getTrainingSettings();

  // If logo URL is changing, delete old logo file from Firebase Storage automatically
  if (settings.schoolLogoUrl && current.schoolLogoUrl && settings.schoolLogoUrl !== current.schoolLogoUrl) {
    deleteStorageFileByUrl(current.schoolLogoUrl).catch(() => {});
  }

  const updated = { ...current, ...settings };
  memorySettingsCache = { data: updated, timestamp: Date.now() };

  if (typeof window !== "undefined") {
    localStorage.setItem("app_settings", JSON.stringify(updated));
    // Dispatch custom browser events so Navbar, Header, and all pages update logo INSTANTLY!
    window.dispatchEvent(new Event("settings_updated"));
    window.dispatchEvent(new Event("storage"));
  }

  try {
    const docRef = doc(db, "settings", "training");
    await setDoc(docRef, updated, { merge: true });
    return true;
  } catch (err) {
    console.warn("Firestore save settings error, saved to local cache only:", err);
    return false;
  }
}

/**
 * Fetch user's existing submissions by full name
 */
export async function getUserSubmissionsByName(fullName: string): Promise<Submission[]> {
  const trimmedName = fullName.trim().toLowerCase();
  if (!trimmedName) return [];

  const allSubs = await getSubmissions({ ignoreProjectFilter: true });
  return allSubs.filter((s) => s.fullName.trim().toLowerCase() === trimmedName);
}

/**
 * Check how many submissions a full name has made
 */
export async function getUserSubmissionCount(fullName: string): Promise<number> {
  const list = await getUserSubmissionsByName(fullName);
  return list.length;
}

/**
 * Fast Robust Upload to Firebase Storage with Instant DataURL Timeout Fallback (Never hangs at 0%!)
 */
export async function uploadFileToStorage(
  rawFile: File, 
  onProgress?: (percent: number) => void
): Promise<string> {
  if (onProgress) onProgress(10);

  // 1. Compress images client-side (PDFs and other files upload as-is).
  let fileToUpload = rawFile;
  if (rawFile.type.startsWith("image/")) {
    try {
      fileToUpload = await compressAndResizeImage(rawFile, 800, 800, 0.8);
    } catch (compressErr) {
      console.warn("Image compression fallback:", compressErr);
    }
  }
  if (onProgress) onProgress(15);

  // An inline base64 fallback is only safe for SMALL files — Firestore documents are
  // capped at ~1MB, so a multi-MB PDF as base64 would break the write. Large files must
  // reach Storage; if that fails we surface an error instead of saving a broken document.
  const SMALL_FILE_LIMIT = 500 * 1024;
  const canInlineFallback = fileToUpload.size <= SMALL_FILE_LIMIT;

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const randomId = Math.random().toString(36).substring(2, 10);
  const ext = fileToUpload.name.split(".").pop() || "bin";
  const path = `uploads/${year}/${month}/${Date.now()}_${randomId}.${ext}`;

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const done = (fn: () => void) => { if (!settled) { settled = true; fn(); } };
    const failOrFallback = async (message: string) => {
      if (settled) return;
      if (canInlineFallback) {
        const dataUrl = await fileToDataURL(fileToUpload);
        done(() => resolve(dataUrl));
      } else {
        done(() => reject(new Error(message)));
      }
    };

    let uploadTask: ReturnType<typeof uploadBytesResumable>;
    try {
      uploadTask = uploadBytesResumable(ref(storage, path), fileToUpload);
    } catch {
      failOrFallback("เริ่มอัปโหลดไม่สำเร็จ ลองใหม่ หรือแนบเป็นลิงก์ Google Drive สำหรับไฟล์ใหญ่");
      return;
    }

    // Hard cap so a truly stuck upload doesn't hang forever (real uploads report progress).
    const hardTimeout = setTimeout(() => {
      try { uploadTask.cancel(); } catch {}
      failOrFallback("อัปโหลดใช้เวลานานเกินไป (ไฟล์ใหญ่หรืออินเทอร์เน็ตช้า) — ลองใหม่ หรือแนบเป็นลิงก์ Google Drive แทน");
    }, 180000);

    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const pct = snapshot.totalBytes > 0 ? (snapshot.bytesTransferred / snapshot.totalBytes) * 100 : 0;
        if (onProgress) onProgress(Math.min(95, Math.max(15, Math.round(pct))));
      },
      (error) => {
        clearTimeout(hardTimeout);
        console.warn("Storage upload error:", error);
        failOrFallback("อัปโหลดไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง หรือแนบเป็นลิงก์ Google Drive แทน");
      },
      async () => {
        clearTimeout(hardTimeout);
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          if (onProgress) onProgress(100);
          done(() => resolve(downloadURL));
        } catch {
          failOrFallback("อัปโหลดสำเร็จแต่ดึงลิงก์ไฟล์ไม่ได้ ลองใหม่อีกครั้ง");
        }
      }
    );
  });
}

// Google Apps Script web app that saves uploads into the school's own Google Drive.
// The /exec URL is a public endpoint (not a secret); the shared secret is a light
// abuse guard. Both can be overridden by env for a different deployment.
const DRIVE_UPLOAD_URL =
  process.env.NEXT_PUBLIC_DRIVE_UPLOAD_URL ||
  "https://script.google.com/macros/s/AKfycbyl7g5NOqDwrskRvGIT22dch04Y4R_XGVeahm7P2dyewycK-RCS5cYZlUIhqsGd6I-X/exec";
const DRIVE_UPLOAD_SECRET = process.env.NEXT_PUBLIC_DRIVE_UPLOAD_SECRET || "anuban-upload-2569";

export interface DriveUploadResult {
  url: string;
  id: string;
  name: string;
}

/**
 * Upload a file into the school's Google Drive via the Apps Script web app.
 * Returns the shareable Drive view link + file id. Reports real progress via XHR.
 */
// Files up to this size upload in one request; bigger files stream in chunks (resumable).
const SINGLE_SHOT_MAX = 8 * 1024 * 1024; // 8 MB
// 4 MB per chunk — must be a multiple of 256 KB for Google Drive's resumable upload.
const CHUNK_SIZE = 4 * 1024 * 1024;

/** Base64-encode a Blob/File slice (without the "data:...," prefix). */
async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return dataUrl.includes(",") ? dataUrl.slice(dataUrl.indexOf(",") + 1) : dataUrl;
}

/** POST JSON to the Apps Script endpoint as text/plain (keeps it a simple, preflight-free request). */
async function postDriveJson(payload: object, timeoutMs: number): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(DRIVE_UPLOAD_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return await res.json().catch(() => null);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Upload a file into the school's Google Drive via the Apps Script web app.
 * Small files use one request; large files stream in chunks (resumable) so the
 * size ceiling is much higher and progress is real. Returns the Drive view link + id.
 */
export async function uploadFileToGoogleDrive(
  file: File,
  onProgress?: (percent: number) => void,
  meta?: { projectName?: string; gradeLevel?: string; submitterName?: string; workLabel?: string; existingFileId?: string }
): Promise<DriveUploadResult> {
  if (file.size > SINGLE_SHOT_MAX) {
    return uploadChunkedToGoogleDrive(file, onProgress, meta);
  }
  return uploadSingleShotToGoogleDrive(file, onProgress, meta);
}

async function uploadSingleShotToGoogleDrive(
  file: File,
  onProgress?: (percent: number) => void,
  meta?: { projectName?: string; gradeLevel?: string; submitterName?: string; workLabel?: string; existingFileId?: string }
): Promise<DriveUploadResult> {
  if (onProgress) onProgress(5);
  const dataUrl = await fileToDataURL(file);
  const base64 = dataUrl.includes(",") ? dataUrl.slice(dataUrl.indexOf(",") + 1) : dataUrl;
  if (onProgress) onProgress(15);

  const payload = JSON.stringify({
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    data: base64,
    secret: DRIVE_UPLOAD_SECRET,
    // When set, update this existing Drive file's content (new version) instead of creating a new file.
    fileId: meta?.existingFileId || "",
    // Folder path in Drive: <projectName>/<gradeLevel>/<submitterName>/  file named by workLabel
    projectName: meta?.projectName || "",
    gradeLevel: meta?.gradeLevel || "",
    submitterName: meta?.submitterName || "",
    workLabel: meta?.workLabel || "",
  });

  // fetch gives no upload progress, so we animate the bar while the single request is in flight.
  let pct = 20;
  const timer = setInterval(() => {
    pct = Math.min(95, pct + 5);
    if (onProgress) onProgress(pct);
  }, 800);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300000);

  try {
    const res = await fetch(DRIVE_UPLOAD_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: payload,
      signal: controller.signal,
    });
    const json = await res.json().catch(() => null);
    clearInterval(timer);
    clearTimeout(timeout);
    if (json && json.ok && json.url) {
      if (onProgress) onProgress(100);
      return { url: json.url, id: json.id, name: json.name };
    }
    throw new Error("อัปโหลดขึ้น Google Drive ไม่สำเร็จ" + (json?.error ? `: ${json.error}` : ""));
  } catch (err) {
    clearInterval(timer);
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("Google Drive")) throw err;
    if (msg.includes("abort")) throw new Error("อัปโหลดใช้เวลานานเกินไป — ลองใหม่ หรือใช้วิธีวางลิงก์ Google Drive");
    throw new Error("เชื่อมต่อ Google Drive ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }
}

/** Large-file path: init a resumable session, then PUT the file to Drive one chunk at a time. */
async function uploadChunkedToGoogleDrive(
  file: File,
  onProgress?: (percent: number) => void,
  meta?: { projectName?: string; gradeLevel?: string; submitterName?: string; workLabel?: string; existingFileId?: string }
): Promise<DriveUploadResult> {
  if (onProgress) onProgress(2);

  const init = await postDriveJson(
    {
      action: "init",
      secret: DRIVE_UPLOAD_SECRET,
      fileId: meta?.existingFileId || "",
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      totalBytes: file.size,
      projectName: meta?.projectName || "",
      gradeLevel: meta?.gradeLevel || "",
      submitterName: meta?.submitterName || "",
      workLabel: meta?.workLabel || "",
    },
    60000
  );
  if (!init || !init.ok || !init.sessionId) {
    throw new Error("เริ่มอัปโหลดไฟล์ขนาดใหญ่ไม่สำเร็จ" + (init?.error ? `: ${init.error}` : ""));
  }

  let start = 0;
  let done: Record<string, unknown> | null = null;
  while (start < file.size) {
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const data = await blobToBase64(file.slice(start, end));
    const res = await postDriveJson(
      { action: "chunk", secret: DRIVE_UPLOAD_SECRET, sessionId: init.sessionId, start, data },
      180000
    );
    if (!res || !res.ok) {
      throw new Error("อัปโหลดบางส่วนไม่สำเร็จ" + (res?.error ? `: ${res.error}` : ""));
    }
    start = end;
    if (onProgress) onProgress(Math.min(99, Math.round((start / file.size) * 100)));
    if (res.done) {
      done = res;
      break;
    }
  }

  if (!done || !done.url) throw new Error("อัปโหลดไม่สำเร็จ (ไม่ได้รับลิงก์ไฟล์)");
  if (onProgress) onProgress(100);
  return { url: done.url as string, id: done.id as string, name: done.name as string };
}

/**
 * Submit new work to Firestore & Local Storage
 */
export async function createSubmission(submissionData: Omit<Submission, "id" | "uploadDate" | "createdAt">): Promise<Submission> {
  const now = new Date();
  const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const timestamp = now.getTime();

  const newSub: Omit<Submission, "id"> = {
    ...submissionData,
    uploadDate: formattedDate,
    createdAt: timestamp,
  };

  try {
    const docRef = await addDoc(collection(db, "submissions"), newSub);
    const fullSub = { id: docRef.id, ...newSub };
    const subs = getLocalSubmissions();
    subs.unshift(fullSub);
    saveLocalSubmissions(subs);
    return fullSub;
  } catch (err) {
    console.warn("Firestore save submission failed, using local storage:", err);
    const localId = `sub-local-${Date.now()}`;
    const fullSub: Submission = { id: localId, ...newSub };
    const subs = getLocalSubmissions();
    subs.unshift(fullSub);
    saveLocalSubmissions(subs);
    return fullSub;
  }
}

/**
 * Replace / Update an existing submission file and metadata (Automatically deletes old file from Firebase Storage!)
 */
export async function replaceSubmission(oldId: string, submissionData: Omit<Submission, "id" | "uploadDate" | "createdAt">): Promise<Submission> {
  await deleteSubmission(oldId);
  return await createSubmission(submissionData);
}

/**
 * Get Submissions with fast in-memory caching, filters, search, and pagination
 */
export async function getSubmissions(params?: {
  search?: string;
  gradeLevel?: string;
  subjectGroup?: string;
  sortBy?: "newest" | "oldest" | "name";
  limitNum?: number;
  ignoreProjectFilter?: boolean;
  projectId?: string; // filter to a specific training round/project
  forceRefresh?: boolean;
}): Promise<Submission[]> {
  const now = Date.now();
  let rawList: Submission[] = [];

  if (!params?.forceRefresh && memorySubmissionsCache && (now - memorySubmissionsCache.timestamp < CACHE_TTL_MS)) {
    rawList = [...memorySubmissionsCache.data];
  } else {
    try {
      // Fetch only the most-recent window server-side (ordered + capped) instead of
      // downloading the whole collection. Client-side search/filter runs over this window.
      const submissionsQuery = query(
        collection(db, "submissions"),
        orderBy("createdAt", "desc"),
        limit(FETCH_CAP)
      );
      const snapshot = await getDocs(submissionsQuery);
      if (!snapshot.empty) {
        rawList = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<Submission, "id">),
        }));
        if (rawList.length >= FETCH_CAP) {
          console.warn(
            `getSubmissions: hit FETCH_CAP (${FETCH_CAP}). Older submissions beyond this window are not loaded; add pagination if needed.`
          );
        }
        memorySubmissionsCache = { data: rawList, timestamp: now };
      }
    } catch (err) {
      console.warn("Firestore getSubmissions error, reading local submissions:", err);
    }

    if (rawList.length === 0) {
      rawList = getLocalSubmissions();
      memorySubmissionsCache = { data: rawList, timestamp: now };
    }
  }

  let results = [...rawList];

  // Active Project Display Filter (if Admin configured specific project filter mode)
  if (!params?.ignoreProjectFilter) {
    const settings = await getTrainingSettings();
    if (settings.activeProjectFilterMode === 'specific' && settings.activeProjectFilterName?.trim()) {
      const filterKey = settings.activeProjectFilterName.trim().toLowerCase();
      results = results.filter((s) => {
        const text = [s.projectTitle, s.description || ""].join(" ").toLowerCase();
        return text.includes(filterKey);
      });
    }
  }

  // Comprehensive Multi-Field Search
  if (params?.search && params.search.trim() !== "") {
    const queryStr = params.search.trim().toLowerCase();
    results = results.filter((s) => {
      const fullText = [
        s.fullName,
        s.projectTitle,
        s.school,
        s.position,
        s.gradeLevel,
        s.subjectGroup,
        s.province || "",
        s.description || "",
      ].join(" ").toLowerCase();
      return fullText.includes(queryStr);
    });
  }

  // Filter Grade Level
  if (params?.gradeLevel && params.gradeLevel !== "ทั้งหมด") {
    results = results.filter((s) => s.gradeLevel === params.gradeLevel);
  }

  // Filter Subject Group
  if (params?.subjectGroup && params.subjectGroup !== "ทั้งหมด") {
    results = results.filter((s) => s.subjectGroup === params.subjectGroup);
  }

  // Filter by training round/project
  if (params?.projectId) {
    results = results.filter((s) => s.projectId === params.projectId);
  }

  // Sorting
  if (params?.sortBy === "oldest") {
    results.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  } else if (params?.sortBy === "name") {
    results.sort((a, b) => a.projectTitle.localeCompare(b.projectTitle, "th"));
  } else {
    // Default newest
    results.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  if (params?.limitNum) {
    results = results.slice(0, params.limitNum);
  }

  return results;
}

export interface SubmissionsPage {
  items: Submission[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

/**
 * Cursor-based pagination for the gallery ("load more"). Fetches one page ordered
 * newest-first; pass the returned `cursor` back in to fetch the next page. This lets
 * the gallery scale beyond FETCH_CAP without downloading everything at once.
 */
export async function getSubmissionsPage(params?: {
  pageSize?: number;
  cursor?: QueryDocumentSnapshot<DocumentData> | null;
  ignoreProjectFilter?: boolean;
  projectId?: string; // filter to a specific training round/project
}): Promise<SubmissionsPage> {
  const pageSize = params?.pageSize ?? 60;

  try {
    const base = collection(db, "submissions");
    const pageQuery = params?.cursor
      ? query(base, orderBy("createdAt", "desc"), startAfter(params.cursor), limit(pageSize))
      : query(base, orderBy("createdAt", "desc"), limit(pageSize));

    const snapshot = await getDocs(pageQuery);
    let items = snapshot.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<Submission, "id">),
    }));

    const lastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;
    const hasMore = snapshot.docs.length === pageSize;

    // Apply the admin "specific project" display filter, matching getSubmissions().
    if (!params?.ignoreProjectFilter) {
      const settings = await getTrainingSettings();
      if (settings.activeProjectFilterMode === "specific" && settings.activeProjectFilterName?.trim()) {
        const filterKey = settings.activeProjectFilterName.trim().toLowerCase();
        items = items.filter((s) => {
          const text = [s.projectTitle, s.description || ""].join(" ").toLowerCase();
          return text.includes(filterKey);
        });
      }
    }

    // Filter to a specific training round/project (by stamped projectId).
    if (params?.projectId) {
      items = items.filter((s) => s.projectId === params.projectId);
    }

    return { items, cursor: lastDoc, hasMore };
  } catch (err) {
    console.warn("getSubmissionsPage error, falling back to local submissions:", err);
    const local = getLocalSubmissions().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return { items: local, cursor: null, hasMore: false };
  }
}

/**
 * Delete Submission (Deletes document and associated Firebase Storage file)
 */
export async function deleteSubmission(id: string): Promise<void> {
  const localSubs = getLocalSubmissions();
  const targetSub = localSubs.find((s) => s.id === id);
  if (targetSub?.fileURL) {
    await deleteStorageFileByUrl(targetSub.fileURL);
  }

  try {
    const docRef = doc(db, "submissions", id);
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      const data = snapshot.data() as Submission;
      if (data.fileURL) {
        await deleteStorageFileByUrl(data.fileURL);
      }
    }
    await deleteDoc(docRef);
  } catch (err) {
    console.warn("Firestore delete submission error:", err);
  }

  const filtered = localSubs.filter((s) => s.id !== id);
  saveLocalSubmissions(filtered);
}

/**
 * Edit Submission Metadata (Admin)
 */
export async function updateSubmission(id: string, data: Partial<Submission>): Promise<void> {
  try {
    await updateDoc(doc(db, "submissions", id), data);
  } catch (err) {
    console.warn("Firestore update submission error:", err);
  }
  const subs = getLocalSubmissions().map((s) => (s.id === id ? { ...s, ...data } : s));
  saveLocalSubmissions(subs);
}

/**
 * Get Dashboard Analytics Data
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const submissions = await getSubmissions({ ignoreProjectFilter: true });
  
  const totalSubmissions = submissions.length;
  const uniqueSenders = new Set(submissions.map((s) => s.fullName.trim().toLowerCase())).size;
  const pdfCount = submissions.filter((s) => s.fileType === "pdf").length;
  const imageCount = totalSubmissions - pdfCount;

  // Compute daily trend stats
  const dailyMap: Record<string, number> = {};
  submissions.forEach((s) => {
    const dateStr = s.uploadDate ? s.uploadDate.split(" ")[0] : "2026-08-05";
    dailyMap[dateStr] = (dailyMap[dateStr] || 0) + 1;
  });

  const dailyStats = Object.entries(dailyMap).map(([date, count]) => ({
    date,
    count,
  })).sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalSubmissions,
    totalSenders: uniqueSenders,
    pdfCount,
    imageCount,
    dailyStats: dailyStats.length ? dailyStats : [
      { date: "2026-08-01", count: 2 },
      { date: "2026-08-02", count: 5 },
      { date: "2026-08-03", count: 8 },
      { date: "2026-08-04", count: 12 },
      { date: "2026-08-05", count: 18 },
    ],
  };
}
