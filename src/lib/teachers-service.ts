import { db } from "./firebase";
import { collection, getDocs, doc, setDoc, deleteDoc, writeBatch, updateDoc } from "firebase/firestore";
import { Submission } from "./types";
import { normalizeGradeKey } from "./format";

export interface TeacherItem {
  id: string;
  fullName: string;
  position: string;
  gradeLevel: string;
  subjectGroup: string;
  email?: string;
  phone?: string;
  createdAt?: number;
  // Profile picture (stored on Google Drive; photoUrl is a displayable thumbnail).
  photoUrl?: string;
  photoFileId?: string;
}

const DEFAULT_TEACHERS: TeacherItem[] = [
  { id: "t-1", fullName: "ครูสมชาย ใจดี", position: "ครูวิทยฐานะชำนาญการ", gradeLevel: "ป.4", subjectGroup: "กลุ่มสาระการเรียนรู้วิทยาศาสตร์และเทคโนโลยี" },
  { id: "t-2", fullName: "ครูวิภาวรรณ สุขเสรี", position: "ครูผู้ช่วย", gradeLevel: "ป.2", subjectGroup: "กลุ่มสาระการเรียนรู้คณิตศาสตร์" },
  { id: "t-3", fullName: "ครูอนุชา กิจเจริญ", position: "ครู คศ.2", gradeLevel: "อ.2", subjectGroup: "การศึกษาปฐมวัย / อนุบาล" },
  { id: "t-4", fullName: "ครูพิมลพรรณ รัตนโชติ", position: "ครู คศ.3", gradeLevel: "ป.3", subjectGroup: "กลุ่มสาระการเรียนรู้ภาษาต่างประเทศ" },
  { id: "t-5", fullName: "ครูนิพาภรณ์ รุ่งเรือง", position: "ครูวิทยฐานะชำนาญการพิเศษ", gradeLevel: "อ.1", subjectGroup: "การศึกษาปฐมวัย / อนุบาล" },
  { id: "t-6", fullName: "ครูประเสริฐ ชัยชนะ", position: "ครู คศ.2", gradeLevel: "ป.6", subjectGroup: "กลุ่มสาระการเรียนรู้ภาษาไทย" },
];

let memoryTeachersCache: TeacherItem[] | null = null;
// The roster changes when an admin edits it (e.g. moves a teacher to another
// สายชั้น). Refetch after this TTL so other open sessions pick up changes without
// a full page reload.
let memoryTeachersCacheAt = 0;
const TEACHERS_CACHE_TTL = 3 * 60 * 1000; // 3 minutes
const gradeTeachersCache = new Map<string, TeacherItem[]>();
const TEACHER_SNAPSHOT_COLLECTION = "teacherSnapshot";
const TEACHER_SNAPSHOT_CHUNK_SIZE = 400;

export interface TeacherSnapshotInfo {
  items: TeacherItem[];
  updatedAt: number;
  chunks: number;
}

/** Public roster snapshot: one read for the current 233-person roster instead
 * of one read per teacher. Chunking keeps the design safe below Firestore's
 * per-document size ceiling as the roster grows. */
export async function getTeacherSnapshotRaw(): Promise<TeacherSnapshotInfo | null> {
  try {
    const snap = await getDocs(collection(db, TEACHER_SNAPSHOT_COLLECTION));
    if (snap.empty) return null;
    const chunks = snap.docs
      .map((d) => d.data() as { index?: number; items?: TeacherItem[]; updatedAt?: number })
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const items = chunks.flatMap((chunk) => chunk.items || []);
    const updatedAt = chunks.reduce((latest, chunk) => Math.max(latest, chunk.updatedAt || 0), 0);
    return items.length ? { items, updatedAt, chunks: chunks.length } : null;
  } catch {
    return null;
  }
}

/** Admin-only rebuild. Passing items avoids rereading the collection after an
 * admin mutation; omitting them performs a full authoritative rebuild. */
export async function rebuildTeacherSnapshot(sourceItems?: TeacherItem[]): Promise<TeacherSnapshotInfo> {
  const items = sourceItems || (await getDocs(collection(db, "teachers"))).docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<TeacherItem, "id">) }),
  );
  const clean = JSON.parse(JSON.stringify(items)) as TeacherItem[];
  const chunks: TeacherItem[][] = [];
  for (let index = 0; index < clean.length; index += TEACHER_SNAPSHOT_CHUNK_SIZE) {
    chunks.push(clean.slice(index, index + TEACHER_SNAPSHOT_CHUNK_SIZE));
  }
  const existing = await getDocs(collection(db, TEACHER_SNAPSHOT_COLLECTION));
  const batch = writeBatch(db);
  const updatedAt = Date.now();
  chunks.forEach((chunkItems, index) => {
    batch.set(doc(db, TEACHER_SNAPSHOT_COLLECTION, `chunk_${index}`), {
      index,
      items: chunkItems,
      updatedAt,
    });
  });
  existing.docs.forEach((snapshotDoc) => {
    const index = Number(snapshotDoc.data().index ?? -1);
    if (index >= chunks.length) batch.delete(snapshotDoc.ref);
  });
  await batch.commit();
  saveLocalTeachers(clean);
  return { items: clean, updatedAt, chunks: chunks.length };
}

async function refreshTeacherSnapshotBestEffort(items: TeacherItem[]): Promise<void> {
  try {
    await rebuildTeacherSnapshot(items);
  } catch (error) {
    // The authoritative teacher mutation already succeeded. Keep the admin
    // operation successful and surface the cache problem in the dashboard.
    console.warn("Teacher snapshot refresh failed:", error);
  }
}

/** Normalize a displayed Thai name for duplicate checks without changing what is stored. */
export function normalizeTeacherName(value: string): string {
  return String(value || "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/^(นาย|นางสาว|นาง|ครู)\s*/u, "")
    .replace(/[.\-_]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function editDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const old = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = old;
    }
  }
  return previous[b.length];
}

export function findSimilarTeachers<T extends { fullName: string }>(query: string, items: T[], limit = 5): T[] {
  const key = normalizeTeacherName(query);
  if (key.length < 2) return [];
  return items
    .map((item) => {
      const candidate = normalizeTeacherName(item.fullName);
      const distance = editDistance(key, candidate);
      const similarity = 1 - distance / Math.max(key.length, candidate.length, 1);
      const contains = candidate.includes(key) || key.includes(candidate);
      const exact = candidate === key;
      return { item, score: exact ? 3 : contains ? 2 : similarity };
    })
    .filter(({ score }) => score >= 0.58)
    .sort((a, b) => b.score - a.score || a.item.fullName.localeCompare(b.item.fullName, "th"))
    .slice(0, limit)
    .map(({ item }) => item);
}

/**
 * Include people who typed a new name while submitting, even when they are not
 * yet in the master roster. The latest submission is authoritative for profile
 * fields, while normalized names prevent duplicate people in statistics.
 */
export function mergeTeachersWithSubmitters(teachers: TeacherItem[], submissions: Submission[]): TeacherItem[] {
  const merged = new Map<string, TeacherItem>();
  teachers.forEach((teacher) => merged.set(normalizeTeacherName(teacher.fullName), teacher));

  const latestByName = new Map<string, Submission>();
  [...submissions]
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .forEach((submission) => {
      const key = normalizeTeacherName(submission.fullName);
      if (key && !latestByName.has(key)) latestByName.set(key, submission);
    });

  latestByName.forEach((submission, key) => {
    const existing = merged.get(key);
    merged.set(key, {
      id: existing?.id || `submitter-${key}`,
      fullName: submission.fullName || existing?.fullName || "ไม่ระบุชื่อ",
      position: submission.position || existing?.position || "",
      gradeLevel: submission.gradeLevel || existing?.gradeLevel || "ไม่ระบุ",
      subjectGroup: submission.subjectGroup || existing?.subjectGroup || "",
      email: existing?.email,
      phone: existing?.phone,
      createdAt: existing?.createdAt || submission.createdAt,
      photoUrl: existing?.photoUrl,
      photoFileId: existing?.photoFileId,
    });
  });

  return [...merged.values()];
}

function getLocalTeachers(): TeacherItem[] {
  if (typeof window === "undefined") return DEFAULT_TEACHERS;
  const stored = localStorage.getItem("app_teachers");
  if (!stored) {
    localStorage.setItem("app_teachers", JSON.stringify(DEFAULT_TEACHERS));
    return DEFAULT_TEACHERS;
  }
  try { return JSON.parse(stored); } catch { return DEFAULT_TEACHERS; }
}

function saveLocalTeachers(items: TeacherItem[]) {
  memoryTeachersCache = items;
  memoryTeachersCacheAt = Date.now();
  gradeTeachersCache.clear();
  if (typeof window !== "undefined") {
    localStorage.setItem("app_teachers", JSON.stringify(items));
  }
}

/** Return cached roster immediately so statistics never need to block the whole page. */
export function getInstantTeachers(): TeacherItem[] {
  if (memoryTeachersCache) return [...memoryTeachersCache];
  return getLocalTeachers();
}

/**
 * Narrowly update only a teacher's subject group. Firestore rules permit this
 * single-field update from the public submit flow, so it can run automatically
 * when a teacher submits work (best-effort — never blocks the submission).
 */
export async function updateTeacherSubject(id: string, subjectGroup: string): Promise<void> {
  if (!id || !subjectGroup) return;
  try {
    await updateDoc(doc(db, "teachers", id), { subjectGroup });
  } catch (err) {
    console.warn("updateTeacherSubject failed (non-blocking):", err);
  }
  // Keep the local cache in sync when present.
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("app_teachers");
    if (stored) {
      try {
        const list: TeacherItem[] = JSON.parse(stored);
        const next = list.map((t) => (t.id === id ? { ...t, subjectGroup } : t));
        localStorage.setItem("app_teachers", JSON.stringify(next));
      } catch {}
    }
  }
}

/**
 * Update a teacher's profile picture (photoUrl + photoFileId only). Permitted from
 * the public submit flow by the Firestore rules, like the subject-group auto-fill.
 */
export async function updateTeacherPhoto(id: string, photoUrl: string, photoFileId: string): Promise<void> {
  if (!id || !photoUrl) return;
  try {
    await updateDoc(doc(db, "teachers", id), { photoUrl, photoFileId });
  } catch (err) {
    console.warn("updateTeacherPhoto failed (non-blocking):", err);
  }
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("app_teachers");
    if (stored) {
      try {
        const list: TeacherItem[] = JSON.parse(stored);
        const next = list.map((t) => (t.id === id ? { ...t, photoUrl, photoFileId } : t));
        localStorage.setItem("app_teachers", JSON.stringify(next));
        await refreshTeacherSnapshotBestEffort(next);
      } catch {}
    }
  }
}

/**
 * Get all teachers with optional grade level filter
 */
export async function getTeachers(gradeLevel?: string): Promise<TeacherItem[]> {
  // Match by NORMALIZED grade so whitespace variants (e.g. "อื่นๆ" vs "อื่น ๆ")
  // resolve to the same bucket — a per-grade exact-match query would drop the
  // teachers stored under the other spelling.
  const requestedGrade = gradeLevel && gradeLevel !== "ทั้งหมด" ? normalizeGradeKey(gradeLevel) : "";
  const byGrade = (teacher: TeacherItem) => normalizeGradeKey(teacher.gradeLevel) === requestedGrade;

  // Always work from the full roster so filtering is consistent everywhere.
  const cacheFresh = !!memoryTeachersCache && Date.now() - memoryTeachersCacheAt < TEACHERS_CACHE_TTL;
  let list = cacheFresh ? [...(memoryTeachersCache as TeacherItem[])] : [];
  if (!cacheFresh) {
    try {
      const snapshot = await getTeacherSnapshotRaw();
      if (snapshot?.items.length) {
        list = snapshot.items;
        saveLocalTeachers(list);
      } else {
        // Migration/failure fallback only. Once the snapshot exists, public
        // sessions no longer pay one read per teacher.
        const legacy = await getDocs(collection(db, "teachers"));
        if (!legacy.empty) {
          list = legacy.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TeacherItem, "id">) }));
          saveLocalTeachers(list);
        }
      }
    } catch (err) {
      console.warn("Firestore getTeachers error, fallback to local:", err);
    }
    if (list.length === 0) list = getLocalTeachers();
    memoryTeachersCache = list;
    memoryTeachersCacheAt = Date.now();
  }

  return requestedGrade ? list.filter(byGrade) : list;
}

/**
 * Add a teacher to the roster from a completed submission when their name isn't
 * registered yet, so a name typed via "เพิ่มชื่อใหม่" persists and shows up in the
 * dropdown next time. Idempotent: existing names (by normalized form) are left as-is.
 */
export async function ensureTeacherFromSubmission(input: {
  fullName: string;
  position?: string;
  gradeLevel?: string;
  subjectGroup?: string;
}): Promise<void> {
  const normalizedName = normalizeTeacherName(input.fullName);
  if (!normalizedName) return;
  const roster = await getTeachers();
  if (roster.some((teacher) => normalizeTeacherName(teacher.fullName) === normalizedName)) return;

  const teacherId = `teacher-${Date.now()}`;
  const newItem: TeacherItem = {
    id: teacherId,
    fullName: input.fullName.trim(),
    position: (input.position || "").trim(),
    gradeLevel: normalizeGradeKey(input.gradeLevel || ""),
    subjectGroup: (input.subjectGroup || "").trim(),
    createdAt: Date.now(),
  };
  try {
    await setDoc(doc(db, "teachers", teacherId), newItem);
  } catch (err) {
    console.warn("ensureTeacherFromSubmission error:", err);
  }
  const current = getLocalTeachers();
  current.unshift(newItem);
  saveLocalTeachers(current);
}

/**
 * Save or Add a teacher
 */
export async function saveTeacher(item: Omit<TeacherItem, "id"> & { id?: string }): Promise<TeacherItem> {
  const normalizedName = normalizeTeacherName(item.fullName);
  const duplicate = (await getTeachers()).find(
    (teacher) => teacher.id !== item.id && normalizeTeacherName(teacher.fullName) === normalizedName
  );
  if (duplicate) throw new Error(`มีรายชื่อ ${duplicate.fullName} อยู่ในระบบแล้ว`);
  const teacherId = item.id || `teacher-${Date.now()}`;
  // Canonicalize the grade on write so future saves converge on one spelling.
  const newItem: TeacherItem = { ...item, gradeLevel: normalizeGradeKey(item.gradeLevel), id: teacherId, createdAt: Date.now() };

  try {
    await setDoc(doc(db, "teachers", teacherId), newItem);
  } catch (err) {
    console.warn("Firestore saveTeacher error:", err);
  }

  const current = getLocalTeachers();
  const idx = current.findIndex((t) => t.id === teacherId);
  if (idx >= 0) {
    current[idx] = newItem;
  } else {
    current.unshift(newItem);
  }
  saveLocalTeachers(current);
  await refreshTeacherSnapshotBestEffort(current);
  return newItem;
}

/**
 * Delete a teacher
 */
export async function deleteTeacher(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "teachers", id));
  } catch (err) {
    console.warn("Firestore deleteTeacher error:", err);
  }

  const current = getLocalTeachers().filter((t) => t.id !== id);
  saveLocalTeachers(current);
  await refreshTeacherSnapshotBestEffort(current);
}

/**
 * Replace the entire teacher roster in one go (deletes existing, then batch-adds).
 * Used by the admin import to load the full school roster. Returns count added.
 */
export async function bulkReplaceTeachers(
  items: (Omit<TeacherItem, "id" | "subjectGroup"> & { subjectGroup?: string })[]
): Promise<number> {
  const seenNames = new Set<string>();
  const uniqueItems = items.filter((item) => {
    const key = normalizeTeacherName(item.fullName);
    if (!key || seenNames.has(key)) return false;
    seenNames.add(key);
    return true;
  });
  const built: TeacherItem[] = uniqueItems.map((it, i) => ({
    ...it,
    subjectGroup: it.subjectGroup ?? "",
    id: `teacher-${Date.now()}-${i}`,
    createdAt: Date.now(),
  }));

  try {
    // Delete all existing teacher docs (batched).
    const snapshot = await getDocs(collection(db, "teachers"));
    const existing = snapshot.docs;
    for (let i = 0; i < existing.length; i += 450) {
      const batch = writeBatch(db);
      existing.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    // Add the new roster (batched).
    for (let i = 0; i < built.length; i += 450) {
      const batch = writeBatch(db);
      built.slice(i, i + 450).forEach((t) => batch.set(doc(db, "teachers", t.id), t));
      await batch.commit();
    }
  } catch (err) {
    console.warn("bulkReplaceTeachers error (saved locally only):", err);
  }

  saveLocalTeachers(built);
  await refreshTeacherSnapshotBestEffort(built);
  return built.length;
}
