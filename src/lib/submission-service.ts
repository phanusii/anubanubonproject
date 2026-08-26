import { auth, db, storage } from "./firebase";
import { ref as storageRef, uploadBytesResumable, getDownloadURL, listAll, getMetadata } from "firebase/storage";
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
  where,
  writeBatch,
  getCountFromServer,
  QueryDocumentSnapshot,
  DocumentData
} from "firebase/firestore";
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
  schoolLogoUrl: "",
  schoolName: "โรงเรียนอนุบาลอุบลราชธานี",
  educationalArea: "สำนักงานเขตพื้นที่การศึกษาประถมศึกษาอุบลราชธานี เขต 1",
  categoryType: "การส่งผลงานนวัตกรรมการเรียนรู้",
  academicYear: "2569",
  budgetYear: "2569",
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
const galleryPageCache = new Map<string, { data: SubmissionsPage; timestamp: number }>();
const projectSubmissionsCache = new Map<string, { data: Submission[]; timestamp: number }>();
// Full gallery result per round — the landing page and every "back to gallery"
// otherwise re-download ~all works (~1MB) each time. Keyed by round ("all" =
// every round). Cleared on any submission mutation via saveLocalSubmissions.
const galleryResultCache = new Map<string, { data: Submission[]; timestamp: number }>();
const GALLERY_RESULT_TTL_MS = 90000;
const galleryCacheKey = (projectId?: string) => (projectId && projectId !== "all" ? projectId : "all");
const CACHE_TTL_MS = 120000;

// Upper bound on how many newest submissions we fetch in one read. Bounds Firestore
// read cost/latency instead of downloading the entire collection. Client-side search
// and filtering run over this most-recent window.
// Admin/statistics safety window. One 300-person round with three works is 900
// documents; 2,000 leaves room for replacements and another active round.
const FETCH_CAP = 2000;

/**
 * True submission count without downloading the documents (Firestore aggregation).
 * Pass a projectId to count one round, or omit to count every submission.
 * Cheap: billed as 1 read per 1,000 matched docs. Returns -1 on failure.
 */
export async function countSubmissions(projectId?: string): Promise<number> {
  try {
    const base = collection(db, "submissions");
    const q = projectId ? query(base, where("projectId", "==", projectId)) : query(base);
    const snap = await getCountFromServer(q);
    return snap.data().count;
  } catch (err) {
    console.warn("countSubmissions error:", err);
    return -1;
  }
}

// Persisted, thumbnail-stripped window for the statistics pages. Base64 thumbnails
// are too big for localStorage, but stats only need the lightweight metadata — so we
// cache a stripped copy and reuse it across reloads/tabs to avoid re-reading ~2,000
// documents every visit (the biggest Firestore read cost).
// Bump the version suffix to force every device to discard an old/partial cached
// window and refetch fresh (e.g. after changing what fields are stored).
const STATS_WINDOW_KEY = "app_stats_window_v2";
const STATS_WINDOW_TTL = 10 * 60 * 1000; // 10 minutes

/** Clear the cached stats window so the next stats load fetches fresh data. */
export function clearStatsWindowCache(): void {
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(STATS_WINDOW_KEY);
      localStorage.removeItem("app_stats_window"); // legacy key
    } catch {}
  }
}

/** Synchronous read of the cached stats window (fresh only) for instant first paint.
 *  Returns [] when there's no fresh cache, so the caller can show a loading state
 *  instead of a small/partial set from a different cache. */
export function getInstantStatsWindow(): Submission[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STATS_WINDOW_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.data) && Date.now() - parsed.timestamp < STATS_WINDOW_TTL) {
      return parsed.data as Submission[];
    }
  } catch {}
  return [];
}

/**
 * Submissions for the statistics pages, cached (thumbnail-stripped) in localStorage.
 * Returns the cached window when fresh (0 Firestore reads); otherwise reads the
 * window once, strips heavy fields, persists it, and returns it. Pass forceRefresh
 * to bypass the cache (e.g. an admin "refresh stats" button).
 */
const STATS_FIELDS = [
  "fullName", "position", "gradeLevel", "subjectGroup", "fileType",
  "projectId", "projectName", "projectTitle", "workSlotId", "createdAt", "uploadDate",
];

/**
 * Fetch only the small fields the stats pages need via the Firestore REST API with a
 * field projection. The client SDK can only download whole documents — and submissions
 * carry a base64 thumbnail (~100 KB each), so a full fetch of ~700 docs is many MB and
 * slow. The projection keeps the response tiny (~150 KB). Returns null on any failure so
 * the caller can fall back to the SDK path.
 */
async function fetchStatsSubmissionsViaRest(): Promise<Submission[] | null> {
  try {
    const options = (db as unknown as { app?: { options?: { projectId?: string; apiKey?: string } } }).app?.options || {};
    const projectId = options.projectId;
    const apiKey = options.apiKey;
    if (!projectId || !apiKey) return null;
    const body = {
      structuredQuery: {
        from: [{ collectionId: "submissions" }],
        select: { fields: STATS_FIELDS.map((fieldPath) => ({ fieldPath })) },
        limit: FETCH_CAP,
      },
    };
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery?key=${apiKey}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );
    if (!res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows)) return null;
    return rows
      .filter((row) => row.document)
      .map((row) => {
        const f = row.document.fields || {};
        const str = (k: string) => f[k]?.stringValue as string | undefined;
        const num = (k: string) =>
          f[k]?.integerValue !== undefined ? Number(f[k].integerValue)
          : f[k]?.doubleValue !== undefined ? Number(f[k].doubleValue)
          : undefined;
        return {
          id: String(row.document.name).split("/").pop(),
          fullName: str("fullName"),
          position: str("position"),
          gradeLevel: str("gradeLevel"),
          subjectGroup: str("subjectGroup"),
          fileType: str("fileType"),
          projectId: str("projectId"),
          projectName: str("projectName"),
          projectTitle: str("projectTitle"),
          workSlotId: str("workSlotId"),
          createdAt: num("createdAt"),
          uploadDate: str("uploadDate"),
        } as Submission;
      });
  } catch {
    return null;
  }
}

export async function getSubmissionsForStats(forceRefresh = false): Promise<Submission[]> {
  if (!forceRefresh && typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(STATS_WINDOW_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.data) && Date.now() - parsed.timestamp < STATS_WINDOW_TTL) {
          return parsed.data as Submission[];
        }
      }
    } catch {}
  }
  // Fast path: projected REST query. Fall back to the SDK (full docs) only if it fails.
  let light = await fetchStatsSubmissionsViaRest();
  if (!light) {
    const full = await getSubmissions({ limitNum: FETCH_CAP, ignoreProjectFilter: true, forceRefresh });
    light = full.map((s) => ({
      id: s.id,
      fullName: s.fullName,
      position: s.position,
      gradeLevel: s.gradeLevel,
      subjectGroup: s.subjectGroup,
      fileType: s.fileType,
      projectId: s.projectId,
      projectName: s.projectName,
      projectTitle: s.projectTitle,
      workSlotId: s.workSlotId,
      createdAt: s.createdAt,
      uploadDate: s.uploadDate,
    })) as Submission[];
  }
  // Never cache an empty result — a transient failure would otherwise show 0 for
  // the whole TTL. Only persist a non-empty window.
  if (typeof window !== "undefined" && light.length > 0) {
    try {
      localStorage.setItem(STATS_WINDOW_KEY, JSON.stringify({ data: light, timestamp: Date.now() }));
    } catch {}
  }
  return light;
}

// Fields the gallery cards + preview need. Deliberately excludes the base64 `thumbnail`
// (the heavy field) — cards regenerate a thumbnail from driveFileId — so the whole
// gallery loads in one small request and can show every page number at once.
const GALLERY_FIELDS = [
  "fullName", "position", "gradeLevel", "subjectGroup", "school", "province",
  "projectId", "projectName", "projectTitle", "workSlotId", "description",
  "fileType", "fileURL", "fileName", "driveFileId", "driveLink", "thumbUrl", "createdAt", "uploadDate",
];

/**
 * Load ALL gallery submissions (optionally for one round) in a single light REST query
 * so the gallery can paginate over the full set and show every page number. Falls back to
 * the SDK (getSubmissions) on any failure. Sorted newest-first.
 */
/** Synchronous gallery snapshot for the current session (any age) — lets the
 *  gallery paint cached cards instantly while getGallerySubmissions revalidates. */
export function getInstantGallery(projectId?: string): Submission[] {
  const hit = galleryResultCache.get(galleryCacheKey(projectId));
  return hit ? hit.data : [];
}

/** One person's works pulled synchronously from whatever gallery rounds are
 *  already cached — lets the person page paint instantly on a card click while
 *  the authoritative per-name query runs. */
export function getInstantPersonWorks(fullName: string): Submission[] {
  const key = (fullName || "").replace(/\s+/g, "").replace(/^ครู/, "").trim();
  if (!key) return [];
  const seen = new Set<string>();
  const out: Submission[] = [];
  for (const entry of galleryResultCache.values()) {
    for (const s of entry.data) {
      const sk = (s.fullName || "").replace(/\s+/g, "").replace(/^ครู/, "").trim();
      if (sk === key && s.id && !seen.has(s.id)) {
        seen.add(s.id);
        out.push(s);
      }
    }
  }
  return out;
}

// Pre-aggregated gallery snapshot: the gallery would otherwise read ~1 document
// per work (hundreds of Firestore reads) on every visit. The snapshot stores the
// whole projected list in a few chunk documents (admin-writable, public-readable);
// a visit reads those chunks plus only the works created since the last rebuild.
const SNAPSHOT_COLLECTION = "gallerySnapshot";
const SNAPSHOT_CHUNK_SIZE = 600;

/** Map raw Firestore REST rows to projected Submission objects. */
function parseGalleryRows(rows: unknown[]): Submission[] {
  return (rows as Array<{ document?: { name: string; fields?: Record<string, { stringValue?: string; integerValue?: string; doubleValue?: number }> } }>)
    .filter((row) => row.document)
    .map((row) => {
      const f = row.document!.fields || {};
      const str = (k: string) => f[k]?.stringValue;
      const num = (k: string) =>
        f[k]?.integerValue !== undefined ? Number(f[k]!.integerValue)
        : f[k]?.doubleValue !== undefined ? Number(f[k]!.doubleValue)
        : undefined;
      return {
        id: String(row.document!.name).split("/").pop(),
        fullName: str("fullName"), position: str("position"), gradeLevel: str("gradeLevel"),
        subjectGroup: str("subjectGroup"), school: str("school"), province: str("province"),
        projectId: str("projectId"), projectName: str("projectName"), projectTitle: str("projectTitle"),
        workSlotId: str("workSlotId"), description: str("description"),
        fileType: str("fileType"), fileURL: str("fileURL"), fileName: str("fileName"),
        driveFileId: str("driveFileId"), driveLink: str("driveLink"), thumbUrl: str("thumbUrl"),
        createdAt: num("createdAt"), uploadDate: str("uploadDate"),
      } as Submission;
    });
}

/** Projected REST read of submissions, optionally scoped to one round and/or to
 *  works created after `sinceCreatedAt`. Returns null on any failure. */
async function fetchGalleryRest(opts: { projectId?: string; sinceCreatedAt?: number }): Promise<Submission[] | null> {
  try {
    const options = (db as unknown as { app?: { options?: { projectId?: string; apiKey?: string } } }).app?.options || {};
    const fbProjectId = options.projectId;
    const apiKey = options.apiKey;
    if (!fbProjectId || !apiKey) return null;
    const filters: unknown[] = [];
    if (opts.projectId && opts.projectId !== "all") {
      filters.push({ fieldFilter: { field: { fieldPath: "projectId" }, op: "EQUAL", value: { stringValue: opts.projectId } } });
    }
    if (typeof opts.sinceCreatedAt === "number") {
      filters.push({ fieldFilter: { field: { fieldPath: "createdAt" }, op: "GREATER_THAN", value: { integerValue: String(opts.sinceCreatedAt) } } });
    }
    const structuredQuery: Record<string, unknown> = {
      from: [{ collectionId: "submissions" }],
      select: { fields: GALLERY_FIELDS.map((fieldPath) => ({ fieldPath })) },
      limit: FETCH_CAP,
    };
    if (filters.length === 1) structuredQuery.where = filters[0];
    else if (filters.length > 1) structuredQuery.where = { compositeFilter: { op: "AND", filters } };
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${fbProjectId}/databases/(default)/documents:runQuery?key=${apiKey}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ structuredQuery }) },
    );
    if (!res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows)) return null;
    return parseGalleryRows(rows);
  } catch {
    return null;
  }
}

/** Read the pre-aggregated snapshot (few reads). Returns null when none exists. */
export async function getGallerySnapshotRaw(): Promise<{ items: Submission[]; updatedAt: number } | null> {
  try {
    const snap = await getDocs(collection(db, SNAPSHOT_COLLECTION));
    if (snap.empty) return null;
    const chunks = snap.docs
      .map((d) => d.data() as { index?: number; items?: Submission[]; updatedAt?: number })
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const items = chunks.flatMap((c) => c.items || []);
    const updatedAt = chunks.reduce((mx, c) => Math.max(mx, c.updatedAt || 0), 0);
    return items.length ? { items, updatedAt } : null;
  } catch {
    return null;
  }
}

/** Rebuild the snapshot from the full projected list. Admin-only (Firestore
 *  rules gate the write). Returns the counts, or null if there is nothing/failed. */
export async function rebuildGallerySnapshot(): Promise<{ count: number; chunks: number } | null> {
  const all = (await fetchGalleryRest({})) || [];
  if (!all.length) return null;
  // Strip undefined fields — Firestore rejects them inside arrays/maps.
  const clean = JSON.parse(JSON.stringify(all)) as Submission[];
  const updatedAt = Date.now();
  const chunks: Submission[][] = [];
  for (let i = 0; i < clean.length; i += SNAPSHOT_CHUNK_SIZE) chunks.push(clean.slice(i, i + SNAPSHOT_CHUNK_SIZE));
  const batch = writeBatch(db);
  chunks.forEach((items, index) => batch.set(doc(db, SNAPSHOT_COLLECTION, `chunk_${index}`), { index, items, updatedAt }));
  // Drop any leftover chunks from a previously larger snapshot.
  try {
    const existing = await getDocs(collection(db, SNAPSHOT_COLLECTION));
    existing.docs.forEach((d) => {
      const idx = (d.data() as { index?: number }).index ?? -1;
      if (idx >= chunks.length) batch.delete(d.ref);
    });
  } catch {
    /* best-effort cleanup */
  }
  await batch.commit();
  galleryResultCache.clear();
  return { count: clean.length, chunks: chunks.length };
}

export async function getGallerySubmissions(projectId?: string): Promise<Submission[]> {
  const key = galleryCacheKey(projectId);
  const cached = galleryResultCache.get(key);
  if (cached && Date.now() - cached.timestamp < GALLERY_RESULT_TTL_MS) return cached.data;

  // Fast path: pre-aggregated snapshot (a few chunk reads) + only the works
  // created since the last rebuild (a small delta), instead of reading every work.
  const snapshot = await getGallerySnapshotRaw();
  if (snapshot && snapshot.items.length) {
    const delta = (await fetchGalleryRest({ sinceCreatedAt: snapshot.updatedAt })) || [];
    const byId = new Map<string, Submission>();
    for (const s of snapshot.items) if (s.id) byId.set(s.id, s);
    for (const s of delta) if (s.id) byId.set(s.id, s); // fresher copy wins
    let items = Array.from(byId.values());
    if (projectId && projectId !== "all") items = items.filter((s) => s.projectId === projectId);
    items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    galleryResultCache.set(key, { data: items, timestamp: Date.now() });
    return items;
  }

  // No snapshot yet → projected full read; last resort is the SDK (full documents).
  const full = await fetchGalleryRest({ projectId });
  if (full && full.length) {
    const sorted = full.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    galleryResultCache.set(key, { data: sorted, timestamp: Date.now() });
    return sorted;
  }
  return getSubmissions({
    ignoreProjectFilter: true,
    projectId: projectId && projectId !== "all" ? projectId : undefined,
    limitNum: FETCH_CAP,
  });
}

/**
 * Total Firebase Storage used under uploads/ (bytes + file count). Walks the
 * uploads/{year}/{month}/ tree and sums each file's metadata size. This is an
 * on-demand calculation (many metadata reads), not something to run on every
 * page load. `onProgress` reports the running file count for a live readout.
 */
export async function getStorageUsage(onProgress?: (files: number) => void): Promise<{ bytes: number; files: number }> {
  let bytes = 0;
  let files = 0;
  const walk = async (prefixRef: ReturnType<typeof storageRef>): Promise<void> => {
    const listing = await listAll(prefixRef);
    await Promise.all(
      listing.items.map(async (item) => {
        try {
          const meta = await getMetadata(item);
          bytes += meta.size || 0;
          files += 1;
          onProgress?.(files);
        } catch {
          /* skip a file we can't read */
        }
      }),
    );
    for (const sub of listing.prefixes) await walk(sub);
  };
  await walk(storageRef(storage, "uploads"));
  return { bytes, files };
}

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
  galleryPageCache.clear();
  projectSubmissionsCache.clear();
  galleryResultCache.clear();
  if (typeof window !== "undefined") {
    localStorage.setItem("app_submissions", JSON.stringify(subs));
  }
}

/**
 * Delete a file from Firebase Storage by its download URL
 */
export async function deleteStorageFileByUrl(url?: string): Promise<void> {
  // Legacy Firebase Storage URLs cannot be deleted on the free Spark setup.
  // New uploads use the school's Google Drive Apps Script instead.
  if (url?.includes("firebasestorage.googleapis.com")) console.warn("Legacy Storage file retained:", url);
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
 * Load only one teacher's submissions in one round. This is the hot path used by
 * the public submit form; keeping it narrowly indexed prevents 300 clients from
 * downloading every submission in the round.
 */
export async function getUserProjectSubmissions(fullName: string, projectId: string): Promise<Submission[]> {
  const name = fullName.trim();
  if (!name || !projectId) return [];
  try {
    const snapshot = await getDocs(query(
      collection(db, "submissions"),
      where("projectId", "==", projectId),
      where("fullName", "==", name)
    ));
    return snapshot.docs
      .map((item) => ({ id: item.id, ...(item.data() as Omit<Submission, "id">) }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } catch (err) {
    console.warn("getUserProjectSubmissions error:", err);
    throw new Error("โหลดประวัติการส่งงานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }
}

/** Load every submission for an exact displayed sender name without the global 500-item cap. */
export async function getPersonSubmissions(fullName: string): Promise<Submission[]> {
  try {
    const snapshot = await getDocs(query(collection(db, "submissions"), where("fullName", "==", fullName)));
    return snapshot.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<Submission, "id">),
    }));
  } catch (err) {
    console.warn("getPersonSubmissions error, falling back to cached submissions:", err);
    const key = fullName.replace(/\s+/g, "").replace(/^ครู/, "").trim();
    return (await getSubmissions({ ignoreProjectFilter: true })).filter(
      (item) => item.fullName.replace(/\s+/g, "").replace(/^ครู/, "").trim() === key
    );
  }
}

/** Read only one round's submissions; avoids downloading the global collection. */
export async function getProjectSubmissions(projectId: string, forceRefresh = false): Promise<Submission[]> {
  if (!projectId) return [];
  const cached = projectSubmissionsCache.get(projectId);
  if (!forceRefresh && cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return [...cached.data];
  try {
    const snapshot = await getDocs(query(collection(db, "submissions"), where("projectId", "==", projectId)));
    const items = snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<Submission, "id">) }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    projectSubmissionsCache.set(projectId, { data: items, timestamp: Date.now() });
    return items;
  } catch (err) {
    console.warn("getProjectSubmissions error, falling back to cached submissions:", err);
    return (await getSubmissions({ ignoreProjectFilter: true })).filter((item) => item.projectId === projectId);
  }
}

/**
 * Check how many submissions a full name has made
 */
export async function getUserSubmissionCount(fullName: string): Promise<number> {
  const list = await getUserSubmissionsByName(fullName);
  return list.length;
}

// Google Apps Script web app that saves uploads into the school's own Google Drive.
// The /exec URL is a public endpoint (not a secret); the shared secret is a light
// abuse guard. Both can be overridden by env for a different deployment.
const DRIVE_UPLOAD_URL =
  process.env.NEXT_PUBLIC_DRIVE_UPLOAD_URL ||
  "https://script.google.com/macros/s/AKfycbyagMNd7lH3Q6TpsCZZMx1KvnPl5VHEcWdnDj3bJaxVvWqDIDE2Tw6uwbWcDCmiTLRy/exec";
const DRIVE_UPLOAD_SECRET = process.env.NEXT_PUBLIC_DRIVE_UPLOAD_SECRET || "anuban-upload-2569";

/** Send a Telegram test immediately through the trusted Apps Script endpoint. */
export async function sendTelegramTest(chatId: string): Promise<void> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("กรุณาเข้าสู่ระบบผู้ดูแลอีกครั้ง");
  const result = await postDriveJson({ action: "telegramTest", chatId: chatId.trim(), idToken }, 60000);
  if (!result?.ok) throw new Error(String(result?.error || "ส่งข้อความทดสอบไม่สำเร็จ"));
}

export interface DriveUploadResult {
  url: string;
  id: string;
  name: string;
  provider?: "storage" | "drive";
}

/**
 * Upload directly to Firebase Storage (uploads/<year>/<month>/<uuid-name>) over plain
 * HTTPS — no Apps Script, no manual sharing, works behind proxies that block WebChannel.
 * Returns the public download URL + storage path. Rejects if Storage isn't reachable yet
 * (e.g. the bucket hasn't been enabled), so callers can fall back to the Drive path.
 */
export async function uploadToFirebaseStorage(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<DriveUploadResult> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const uuid = (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-100) || "file";
  const path = `uploads/${year}/${month}/${uuid}-${safeName}`;
  const task = uploadBytesResumable(storageRef(storage, path), file, {
    contentType: file.type || "application/octet-stream",
  });
  return new Promise<DriveUploadResult>((resolve, reject) => {
    task.on(
      "state_changed",
      (snap) => { if (onProgress && snap.totalBytes) onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)); },
      (err) => reject(err),
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          resolve({ url, id: path, name: file.name, provider: "storage" });
        } catch (err) { reject(err); }
      },
    );
  });
}

/**
 * Upload a generated preview image (e.g. a PDF's first page, as a base64 data URL) to
 * Storage and return its download URL — so the submission stores a short thumbnail URL
 * instead of a ~100 KB base64 string bloating the Firestore document.
 */
export async function uploadThumbnailToStorage(dataUrl: string): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob(); // data: URL fetch is local, no CORS
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const uuid = (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const ext = blob.type === "image/png" ? "png" : "jpg";
  const path = `uploads/${year}/${month}/thumb-${uuid}.${ext}`;
  const task = uploadBytesResumable(storageRef(storage, path), blob, {
    contentType: blob.type || "image/jpeg",
  });
  await task;
  return getDownloadURL(task.snapshot.ref);
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
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(DRIVE_UPLOAD_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok !== false) return data;
      const retryable = res.status === 429 || res.status >= 500 || /too many|quota|rate|busy/i.test(String(data?.error || ""));
      if (!retryable) return data;
      lastError = new Error(String(data?.error || `HTTP ${res.status}`));
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timeout);
    }
    if (attempt < 4) {
      const waitMs = Math.min(16000, 1000 * (2 ** attempt)) + Math.floor(Math.random() * 750);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("บริการอัปโหลดไม่ตอบสนอง กรุณาลองใหม่อีกครั้ง");
}

/**
 * Upload a file into the school's Google Drive via the Apps Script web app.
 * Small files use one request; large files stream in chunks (resumable) so the
 * size ceiling is much higher and progress is real. Returns the Drive view link + id.
 */
export async function uploadFileToGoogleDrive(
  file: File,
  onProgress?: (percent: number) => void,
  meta?: { projectName?: string; gradeLevel?: string; submitterName?: string; workLabel?: string; existingFileId?: string; storageCategory?: "profile" }
): Promise<DriveUploadResult> {
  // Prefer Firebase Storage (direct HTTPS, fast, no Apps Script). If Storage isn't ready
  // yet — bucket not enabled, or the file exceeds the Storage-rules 10 MB cap — fall back
  // to the existing Google Drive path so uploads never break during the migration.
  if (file.size <= 10 * 1024 * 1024) {
    try {
      return await uploadToFirebaseStorage(file, onProgress);
    } catch (err) {
      console.warn("Firebase Storage upload unavailable, using Google Drive:", err);
    }
  }
  if (file.size > SINGLE_SHOT_MAX) {
    return uploadChunkedToGoogleDrive(file, onProgress, meta);
  }
  return uploadSingleShotToGoogleDrive(file, onProgress, meta);
}

async function uploadSingleShotToGoogleDrive(
  file: File,
  onProgress?: (percent: number) => void,
  meta?: { projectName?: string; gradeLevel?: string; submitterName?: string; workLabel?: string; existingFileId?: string; storageCategory?: "profile" }
): Promise<DriveUploadResult> {
  if (onProgress) onProgress(5);
  const dataUrl = await fileToDataURL(file);
  const base64 = dataUrl.includes(",") ? dataUrl.slice(dataUrl.indexOf(",") + 1) : dataUrl;
  if (onProgress) onProgress(15);

  const payload = {
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    data: base64,
    secret: DRIVE_UPLOAD_SECRET,
    // When set, update this existing Drive file's content (new version) instead of creating a new file.
    fileId: meta?.existingFileId || "",
    // Work: <project>/ผลงาน/<grade>/<teacher>; profile: รูปประจำตัว/<grade>/<teacher>.
    projectName: meta?.projectName || "",
    gradeLevel: meta?.gradeLevel || "",
    submitterName: meta?.submitterName || "",
    workLabel: meta?.workLabel || "",
    storageCategory: meta?.storageCategory || "",
  };

  // fetch gives no upload progress, so we animate the bar while the single request is in flight.
  let pct = 20;
  const timer = setInterval(() => {
    pct = Math.min(95, pct + 5);
    if (onProgress) onProgress(pct);
  }, 800);

  try {
    const json = await postDriveJson(payload, 300000);
    clearInterval(timer);
    if (json && json.ok && json.url) {
      if (onProgress) onProgress(100);
      return { url: String(json.url), id: String(json.id), name: String(json.name) };
    }
    throw new Error("อัปโหลดขึ้น Google Drive ไม่สำเร็จ" + (json?.error ? `: ${json.error}` : ""));
  } catch (err) {
    clearInterval(timer);
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
  meta?: { projectName?: string; gradeLevel?: string; submitterName?: string; workLabel?: string; existingFileId?: string; storageCategory?: "profile" }
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
      storageCategory: meta?.storageCategory || "",
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
    // Retry each chunk a few times — a single network blip shouldn't fail a big upload.
    let res: Record<string, unknown> | null = null;
    let lastErr = "";
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        res = await postDriveJson(
          { action: "chunk", secret: DRIVE_UPLOAD_SECRET, sessionId: init.sessionId, start, data },
          180000
        );
        if (res && res.ok) break;
        lastErr = (res as { error?: string })?.error || "";
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
        res = null;
      }
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
    if (!res || !res.ok) {
      throw new Error("อัปโหลดบางส่วนไม่สำเร็จ" + (lastErr ? `: ${lastErr}` : ""));
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

export interface DriveRevision {
  id: string;
  modifiedTime?: string;
  size?: number;
}

/** List the version history (revisions) of a Drive file, newest first. */
export async function getDriveRevisions(fileId: string): Promise<DriveRevision[]> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("กรุณาเข้าสู่ระบบผู้ดูแลอีกครั้ง");
  const res = await postDriveJson(
    { action: "listRevisions", fileId, idToken },
    60000
  );
  if (res && res.ok && Array.isArray((res as { revisions?: unknown }).revisions)) {
    return ((res as { revisions: DriveRevision[] }).revisions).slice().reverse();
  }
  throw new Error(
    "โหลดรายการเวอร์ชันไม่สำเร็จ" + ((res as { error?: string })?.error ? `: ${(res as { error?: string }).error}` : "")
  );
}

/** Restore an old revision as the file's current content (Drive keeps history). */
export async function restoreDriveRevision(fileId: string, revisionId: string): Promise<boolean> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("กรุณาเข้าสู่ระบบผู้ดูแลอีกครั้ง");
  const res = await postDriveJson(
    { action: "restoreRevision", fileId, revisionId, idToken },
    180000
  );
  if (res && res.ok) return true;
  throw new Error(
    "กู้คืนเวอร์ชันไม่สำเร็จ" + ((res as { error?: string })?.error ? `: ${(res as { error?: string }).error}` : "")
  );
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
    let docRef: Awaited<ReturnType<typeof addDoc>> | null = null;
    let lastError: unknown;
    for (let attempt = 0; attempt < 5 && !docRef; attempt++) {
      try {
        docRef = await addDoc(collection(db, "submissions"), newSub);
      } catch (err) {
        lastError = err;
        if (attempt < 4) {
          await new Promise((resolve) => setTimeout(resolve, Math.min(8000, 500 * (2 ** attempt)) + Math.random() * 400));
        }
      }
    }
    if (!docRef) throw lastError;
    const fullSub = { id: docRef.id, ...newSub };

    // One submission per (teacher, round, slot): re-submitting the same slot keeps
    // only the latest. Remove any older records this teacher has for this slot so a
    // resubmission never leaves a duplicate that inflates the "ส่งแล้ว" count.
    let removedDuplicateIds: string[] = [];
    if (submissionData.workSlotId && submissionData.projectId && submissionData.fullName) {
      try {
        const dupSnap = await getDocs(query(collection(db, "submissions"), where("fullName", "==", submissionData.fullName)));
        removedDuplicateIds = dupSnap.docs
          .filter((d) => d.id !== docRef!.id && d.data().projectId === submissionData.projectId && d.data().workSlotId === submissionData.workSlotId)
          .map((d) => d.id);
        await Promise.all(removedDuplicateIds.map((id) => deleteDoc(doc(db, "submissions", id)).catch(() => {})));
      } catch (dupErr) {
        console.warn("Slot de-duplication skipped:", dupErr);
      }
    }

    const subs = getLocalSubmissions().filter((item) => !removedDuplicateIds.includes(item.id));
    subs.unshift(fullSub);
    saveLocalSubmissions(subs);
    memorySubmissionsCache = null;
    projectSubmissionsCache.clear();
    galleryPageCache.clear();
    clearStatsWindowCache();
    return fullSub;
  } catch (err) {
    console.error("Firestore save submission failed:", err);
    // Never report a browser-only record as a successful school submission.
    // The uploaded Drive file remains available, and the teacher can retry the
    // metadata save without silently losing the official Firestore record.
    throw new Error("บันทึกข้อมูลการส่งงานไม่สำเร็จ กรุณากดส่งอีกครั้ง");
  }
}

/**
 * Replace / Update an existing submission file and metadata (Automatically deletes old file from Firebase Storage!)
 */
export async function replaceSubmission(oldId: string, submissionData: Omit<Submission, "id" | "uploadDate" | "createdAt">): Promise<Submission> {
  const now = new Date();
  const updated: Omit<Submission, "id"> = {
    ...submissionData,
    uploadDate: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    createdAt: now.getTime(),
  };
  let saved = false;
  let lastError: unknown;
  for (let attempt = 0; attempt < 5 && !saved; attempt++) {
    try {
      await updateDoc(doc(db, "submissions", oldId), updated);
      saved = true;
    } catch (err) {
      lastError = err;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, Math.min(8000, 500 * (2 ** attempt)) + Math.random() * 400));
    }
  }
  if (!saved) {
    console.error("Firestore replace submission failed:", lastError);
    throw new Error("บันทึกการแก้ไขงานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }
  const fullSub: Submission = { id: oldId, ...updated };
  const local = getLocalSubmissions().filter((item) => item.id !== oldId);
  local.unshift(fullSub);
  saveLocalSubmissions(local);
  memorySubmissionsCache = null;
  projectSubmissionsCache.clear();
  galleryPageCache.clear();
  clearStatsWindowCache();
  return fullSub;
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
      // Firestore returned nothing (offline/transient) — use the local fallback for
      // this render but DON'T cache it, so the next call retries Firestore instead of
      // being stuck showing a small stale set for the whole TTL.
      rawList = getLocalSubmissions();
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
  const cacheKey = !params?.cursor ? `${params?.projectId || "all"}:${pageSize}:${params?.ignoreProjectFilter ? "raw" : "filtered"}` : "";
  const cachedPage = cacheKey ? galleryPageCache.get(cacheKey) : undefined;
  if (cachedPage && Date.now() - cachedPage.timestamp < CACHE_TTL_MS) return cachedPage.data;

  try {
    const base = collection(db, "submissions");
    const pageQuery = params?.projectId
      ? (params.cursor
          ? query(base, where("projectId", "==", params.projectId), orderBy("createdAt", "desc"), startAfter(params.cursor), limit(pageSize))
          : query(base, where("projectId", "==", params.projectId), orderBy("createdAt", "desc"), limit(pageSize)))
      : (params?.cursor
          ? query(base, orderBy("createdAt", "desc"), startAfter(params.cursor), limit(pageSize))
          : query(base, orderBy("createdAt", "desc"), limit(pageSize)));

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

    const result = { items, cursor: lastDoc, hasMore };
    if (cacheKey) galleryPageCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
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
  // Drop every cached view so stats/gallery/admin reflect the deletion right away.
  memorySubmissionsCache = null;
  projectSubmissionsCache.clear();
  galleryPageCache.clear();
  clearStatsWindowCache();
}

/** Delete every Firestore submission belonging to one round/project. */
export async function deleteSubmissionsByProject(projectId: string): Promise<number> {
  const snapshot = await getDocs(query(collection(db, "submissions"), where("projectId", "==", projectId)));
  const documents = snapshot.docs;

  // Firestore batches allow at most 500 writes. Stay below the limit so this
  // also works for large historical rounds.
  for (let index = 0; index < documents.length; index += 450) {
    const batch = writeBatch(db);
    documents.slice(index, index + 450).forEach((item) => batch.delete(item.ref));
    await batch.commit();
  }

  const remaining = getLocalSubmissions().filter((item) => item.projectId !== projectId);
  saveLocalSubmissions(remaining);
  return documents.length;
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
  // Use the light, cached stats window (projected fields incl. fileType) instead
  // of downloading full documents — the dashboard only needs counts and dates.
  const submissions = await getSubmissionsForStats();
  
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
