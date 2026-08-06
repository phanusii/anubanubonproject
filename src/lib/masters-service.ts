import { db } from "./firebase";
import { collection, getDocs, doc, setDoc, deleteDoc } from "firebase/firestore";
import { GradeLevelOption, SubjectGroupOption } from "./types";
import { DEFAULT_GRADE_LEVELS, DEFAULT_SUBJECT_GROUPS } from "./submission-service";

// High performance in-memory caches for 0ms instant loading
let cachedGradeLevels: GradeLevelOption[] | null = null;
let cachedSubjectGroups: SubjectGroupOption[] | null = null;

export async function getGradeLevels(): Promise<GradeLevelOption[]> {
  if (cachedGradeLevels && cachedGradeLevels.length > 0) {
    return cachedGradeLevels;
  }

  if (typeof window !== "undefined") {
    const local = localStorage.getItem("app_grade_levels");
    if (local) {
      try { 
        const parsed = JSON.parse(local);
        if (parsed.length > 0) {
          cachedGradeLevels = parsed;
          return parsed;
        }
      } catch {}
    }
  }

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
    console.warn("Firestore getGradeLevels error, using default grade levels:", err);
  }

  cachedGradeLevels = DEFAULT_GRADE_LEVELS;
  if (typeof window !== "undefined") {
    localStorage.setItem("app_grade_levels", JSON.stringify(DEFAULT_GRADE_LEVELS));
  }
  return DEFAULT_GRADE_LEVELS;
}

export async function saveGradeLevel(item: GradeLevelOption): Promise<void> {
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
}

export async function deleteGradeLevel(id: string): Promise<void> {
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
}

export async function getSubjectGroups(): Promise<SubjectGroupOption[]> {
  if (cachedSubjectGroups && cachedSubjectGroups.length > 0) {
    return cachedSubjectGroups;
  }

  if (typeof window !== "undefined") {
    const local = localStorage.getItem("app_subject_groups");
    if (local) {
      try { 
        const parsed = JSON.parse(local);
        if (parsed.length > 0) {
          cachedSubjectGroups = parsed;
          return parsed;
        }
      } catch {}
    }
  }

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
    console.warn("Firestore getSubjectGroups error, using default subject groups:", err);
  }

  cachedSubjectGroups = DEFAULT_SUBJECT_GROUPS;
  if (typeof window !== "undefined") {
    localStorage.setItem("app_subject_groups", JSON.stringify(DEFAULT_SUBJECT_GROUPS));
  }
  return DEFAULT_SUBJECT_GROUPS;
}

export async function saveSubjectGroup(item: SubjectGroupOption): Promise<void> {
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
}

export async function deleteSubjectGroup(id: string): Promise<void> {
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
}
