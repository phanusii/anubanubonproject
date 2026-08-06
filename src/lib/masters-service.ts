import { db } from "./firebase";
import { collection, getDocs, doc, setDoc, deleteDoc } from "firebase/firestore";
import { GradeLevelOption, SubjectGroupOption } from "./types";
import { DEFAULT_GRADE_LEVELS, DEFAULT_SUBJECT_GROUPS } from "./submission-service";

// High performance in-memory caches for 0ms instant loading
let cachedGradeLevels: GradeLevelOption[] | null = null;
let cachedSubjectGroups: SubjectGroupOption[] | null = null;

export async function getGradeLevels(forceRefresh = false): Promise<GradeLevelOption[]> {
  // Session in-memory cache avoids refetching repeatedly within a page view.
  if (!forceRefresh && cachedGradeLevels) {
    return cachedGradeLevels;
  }

  // Firestore is the source of truth. Read it first so edits sync across devices;
  // localStorage is only a fallback when Firestore is unreachable.
  try {
    const snapshot = await getDocs(collection(db, "gradeLevels"));
    if (!snapshot.empty) {
      const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as GradeLevelOption);
      items.sort((a, b) => a.order - b.order);
      cachedGradeLevels = items;
      if (typeof window !== "undefined") {
        localStorage.setItem("app_grade_levels", JSON.stringify(items));
      }
      return items;
    }
  } catch (err) {
    console.warn("Firestore getGradeLevels error, falling back to local cache:", err);
  }

  // Fallback 1: last-known localStorage snapshot.
  if (typeof window !== "undefined") {
    const local = localStorage.getItem("app_grade_levels");
    if (local) {
      try {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed) && parsed.length > 0) {
          cachedGradeLevels = parsed;
          return parsed;
        }
      } catch {}
    }
  }

  // Fallback 2: built-in defaults.
  cachedGradeLevels = [...DEFAULT_GRADE_LEVELS];
  if (typeof window !== "undefined") {
    localStorage.setItem("app_grade_levels", JSON.stringify(DEFAULT_GRADE_LEVELS));
  }
  return [...DEFAULT_GRADE_LEVELS];
}

export async function saveGradeLevel(item: GradeLevelOption): Promise<GradeLevelOption[]> {
  const current = await getGradeLevels();
  const existingIdx = current.findIndex((g) => g.id === item.id);
  if (existingIdx >= 0) {
    current[existingIdx] = item;
  } else {
    current.push(item);
  }

  cachedGradeLevels = [...current];
  if (typeof window !== "undefined") {
    localStorage.setItem("app_grade_levels", JSON.stringify(current));
  }

  try {
    await setDoc(doc(db, "gradeLevels", item.id), item);
  } catch (err) {
    console.warn("Firestore saveGradeLevel error:", err);
  }

  return [...current];
}

export async function deleteGradeLevel(id: string): Promise<GradeLevelOption[]> {
  const current = await getGradeLevels();
  const filtered = current.filter((g) => g.id !== id);

  cachedGradeLevels = [...filtered];
  if (typeof window !== "undefined") {
    localStorage.setItem("app_grade_levels", JSON.stringify(filtered));
  }

  try {
    await deleteDoc(doc(db, "gradeLevels", id));
  } catch (err) {
    console.warn("Firestore deleteGradeLevel error:", err);
  }

  return [...filtered];
}

/**
 * Replace the entire grade-level list (deletes existing, then saves the given set).
 * Used by the admin school-roster import.
 */
export async function replaceAllGradeLevels(
  items: { name: string; order: number }[]
): Promise<GradeLevelOption[]> {
  const current = await getGradeLevels(true);
  for (const g of current) {
    await deleteGradeLevel(g.id);
  }
  let result: GradeLevelOption[] = [];
  for (const it of items) {
    result = await saveGradeLevel({ id: `grade-${it.order}`, name: it.name, order: it.order });
  }
  return result;
}

export async function getSubjectGroups(forceRefresh = false): Promise<SubjectGroupOption[]> {
  if (!forceRefresh && cachedSubjectGroups) {
    return cachedSubjectGroups;
  }

  // Firestore is the source of truth; localStorage is only a fallback.
  try {
    const snapshot = await getDocs(collection(db, "subjectGroups"));
    if (!snapshot.empty) {
      const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as SubjectGroupOption);
      items.sort((a, b) => a.order - b.order);
      cachedSubjectGroups = items;
      if (typeof window !== "undefined") {
        localStorage.setItem("app_subject_groups", JSON.stringify(items));
      }
      return items;
    }
  } catch (err) {
    console.warn("Firestore getSubjectGroups error, falling back to local cache:", err);
  }

  if (typeof window !== "undefined") {
    const local = localStorage.getItem("app_subject_groups");
    if (local) {
      try {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed) && parsed.length > 0) {
          cachedSubjectGroups = parsed;
          return parsed;
        }
      } catch {}
    }
  }

  cachedSubjectGroups = [...DEFAULT_SUBJECT_GROUPS];
  if (typeof window !== "undefined") {
    localStorage.setItem("app_subject_groups", JSON.stringify(DEFAULT_SUBJECT_GROUPS));
  }
  return [...DEFAULT_SUBJECT_GROUPS];
}

export async function saveSubjectGroup(item: SubjectGroupOption): Promise<SubjectGroupOption[]> {
  const current = await getSubjectGroups();
  const existingIdx = current.findIndex((s) => s.id === item.id);
  if (existingIdx >= 0) {
    current[existingIdx] = item;
  } else {
    current.push(item);
  }

  cachedSubjectGroups = [...current];
  if (typeof window !== "undefined") {
    localStorage.setItem("app_subject_groups", JSON.stringify(current));
  }

  try {
    await setDoc(doc(db, "subjectGroups", item.id), item);
  } catch (err) {
    console.warn("Firestore saveSubjectGroup error:", err);
  }

  return [...current];
}

export async function deleteSubjectGroup(id: string): Promise<SubjectGroupOption[]> {
  const current = await getSubjectGroups();
  const filtered = current.filter((s) => s.id !== id);

  cachedSubjectGroups = [...filtered];
  if (typeof window !== "undefined") {
    localStorage.setItem("app_subject_groups", JSON.stringify(filtered));
  }

  try {
    await deleteDoc(doc(db, "subjectGroups", id));
  } catch (err) {
    console.warn("Firestore deleteSubjectGroup error:", err);
  }

  return [...filtered];
}
