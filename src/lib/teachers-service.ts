import { db } from "./firebase";
import { collection, getDocs, doc, setDoc, deleteDoc, writeBatch, updateDoc } from "firebase/firestore";

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
      } catch {}
    }
  }
}

/**
 * Get all teachers with optional grade level filter
 */
export async function getTeachers(gradeLevel?: string): Promise<TeacherItem[]> {
  if (memoryTeachersCache) {
    return gradeLevel && gradeLevel !== "ทั้งหมด"
      ? memoryTeachersCache.filter((teacher) => teacher.gradeLevel === gradeLevel)
      : [...memoryTeachersCache];
  }
  let list: TeacherItem[] = memoryTeachersCache ? [...memoryTeachersCache] : [];
  try {
    const snapshot = await getDocs(collection(db, "teachers"));
    if (!snapshot.empty) {
      list = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TeacherItem, "id">) }));
      saveLocalTeachers(list);
    }
  } catch (err) {
    console.warn("Firestore getTeachers error, fallback to local:", err);
  }

  if (list.length === 0) {
    list = getLocalTeachers();
  }

  memoryTeachersCache = list;

  if (gradeLevel && gradeLevel !== "ทั้งหมด") {
    list = list.filter((t) => t.gradeLevel === gradeLevel);
  }

  return list;
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
  const newItem: TeacherItem = { ...item, id: teacherId, createdAt: Date.now() };

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
  return built.length;
}
