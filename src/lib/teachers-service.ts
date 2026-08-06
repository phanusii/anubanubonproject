import { db } from "./firebase";
import { collection, getDocs, doc, setDoc, deleteDoc, writeBatch } from "firebase/firestore";

export interface TeacherItem {
  id: string;
  fullName: string;
  position: string;
  gradeLevel: string;
  subjectGroup: string;
  email?: string;
  phone?: string;
  createdAt?: number;
}

const DEFAULT_TEACHERS: TeacherItem[] = [
  { id: "t-1", fullName: "ครูสมชาย ใจดี", position: "ครูวิทยฐานะชำนาญการ", gradeLevel: "ป.4", subjectGroup: "กลุ่มสาระการเรียนรู้วิทยาศาสตร์และเทคโนโลยี" },
  { id: "t-2", fullName: "ครูวิภาวรรณ สุขเสรี", position: "ครูผู้ช่วย", gradeLevel: "ป.2", subjectGroup: "กลุ่มสาระการเรียนรู้คณิตศาสตร์" },
  { id: "t-3", fullName: "ครูอนุชา กิจเจริญ", position: "ครู คศ.2", gradeLevel: "อ.2", subjectGroup: "การศึกษาปฐมวัย / อนุบาล" },
  { id: "t-4", fullName: "ครูพิมลพรรณ รัตนโชติ", position: "ครู คศ.3", gradeLevel: "ป.3", subjectGroup: "กลุ่มสาระการเรียนรู้ภาษาต่างประเทศ" },
  { id: "t-5", fullName: "ครูนิพาภรณ์ รุ่งเรือง", position: "ครูวิทยฐานะชำนาญการพิเศษ", gradeLevel: "อ.1", subjectGroup: "การศึกษาปฐมวัย / อนุบาล" },
  { id: "t-6", fullName: "ครูประเสริฐ ชัยชนะ", position: "ครู คศ.2", gradeLevel: "ป.6", subjectGroup: "กลุ่มสาระการเรียนรู้ภาษาไทย" },
];

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
  if (typeof window !== "undefined") {
    localStorage.setItem("app_teachers", JSON.stringify(items));
  }
}

/**
 * Get all teachers with optional grade level filter
 */
export async function getTeachers(gradeLevel?: string): Promise<TeacherItem[]> {
  let list: TeacherItem[] = [];
  try {
    const snapshot = await getDocs(collection(db, "teachers"));
    if (!snapshot.empty) {
      list = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TeacherItem, "id">) }));
    }
  } catch (err) {
    console.warn("Firestore getTeachers error, fallback to local:", err);
  }

  if (list.length === 0) {
    list = getLocalTeachers();
  }

  if (gradeLevel && gradeLevel !== "ทั้งหมด") {
    list = list.filter((t) => t.gradeLevel === gradeLevel);
  }

  return list;
}

/**
 * Save or Add a teacher
 */
export async function saveTeacher(item: Omit<TeacherItem, "id"> & { id?: string }): Promise<TeacherItem> {
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
  const built: TeacherItem[] = items.map((it, i) => ({
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
