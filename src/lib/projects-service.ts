import { db } from "./firebase";
import { collection, getDocs, doc, setDoc, deleteDoc } from "firebase/firestore";
import { Project } from "./types";
import { getTrainingSettings, updateTrainingSettings } from "./submission-service";

// High-performance in-memory cache (mirrors masters-service pattern)
let cachedProjects: Project[] | null = null;

/** Return the last cached rounds immediately while Firestore refreshes in background. */
export function getInstantProjects(): Project[] {
  if (cachedProjects) return [...cachedProjects];
  if (typeof window !== "undefined") {
    try {
      const value = localStorage.getItem("app_projects");
      const parsed = value ? JSON.parse(value) : [];
      if (Array.isArray(parsed)) return sortProjects(parsed);
    } catch {}
  }
  return [];
}

function sortProjects(items: Project[]): Project[] {
  // Newest first (by order if provided, else createdAt)
  return [...items].sort((a, b) => {
    if (a.order != null && b.order != null && a.order !== b.order) return a.order - b.order;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}

/**
 * Get all training rounds/projects. Firestore is the source of truth;
 * localStorage is only a fallback when Firestore is unreachable.
 */
export async function getProjects(forceRefresh = false): Promise<Project[]> {
  if (!forceRefresh && cachedProjects) return cachedProjects;

  try {
    const snapshot = await getDocs(collection(db, "projects"));
    if (!snapshot.empty) {
      const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Project);
      const sorted = sortProjects(items);
      cachedProjects = sorted;
      if (typeof window !== "undefined") {
        localStorage.setItem("app_projects", JSON.stringify(sorted));
      }
      return sorted;
    }
  } catch (err) {
    console.warn("Firestore getProjects error, falling back to local cache:", err);
  }

  if (typeof window !== "undefined") {
    const local = localStorage.getItem("app_projects");
    if (local) {
      try {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed) && parsed.length > 0) {
          cachedProjects = parsed;
          return parsed;
        }
      } catch {}
    }
  }

  cachedProjects = [];
  return [];
}

export async function saveProject(project: Project): Promise<Project[]> {
  const current = await getProjects();
  const idx = current.findIndex((p) => p.id === project.id);
  const next = [...current];
  if (idx >= 0) next[idx] = project;
  else next.push(project);

  const sorted = sortProjects(next);
  cachedProjects = sorted;
  if (typeof window !== "undefined") {
    localStorage.setItem("app_projects", JSON.stringify(sorted));
  }

  try {
    await setDoc(doc(db, "projects", project.id), project, { merge: true });
  } catch (err) {
    console.warn("Firestore saveProject error, saved to local cache:", err);
  }

  return sorted;
}

/**
 * Persist a new display order for the rounds. `orderedIds` is the desired order;
 * each project's `order` becomes its index so getProjects() returns them this way.
 */
export async function saveProjectsOrder(orderedIds: string[]): Promise<Project[]> {
  const current = await getProjects();
  const byId = new Map(current.map((p) => [p.id, p]));
  const reordered: Project[] = [];
  orderedIds.forEach((id, i) => {
    const p = byId.get(id);
    if (p) {
      reordered.push({ ...p, order: i });
      byId.delete(id);
    }
  });
  // Append anything not in the list (shouldn't happen) at the end.
  let i = reordered.length;
  for (const p of byId.values()) reordered.push({ ...p, order: i++ });

  const sorted = sortProjects(reordered);
  cachedProjects = sorted;
  if (typeof window !== "undefined") {
    localStorage.setItem("app_projects", JSON.stringify(sorted));
  }
  await Promise.all(
    reordered.map((p) =>
      setDoc(doc(db, "projects", p.id), { order: p.order }, { merge: true }).catch((err) =>
        console.warn("saveProjectsOrder Firestore error:", err)
      )
    )
  );
  return sorted;
}

export async function deleteProject(id: string): Promise<Project[]> {
  const current = await getProjects();
  const filtered = current.filter((p) => p.id !== id);
  cachedProjects = filtered;
  if (typeof window !== "undefined") {
    localStorage.setItem("app_projects", JSON.stringify(filtered));
  }
  try {
    await deleteDoc(doc(db, "projects", id));
  } catch (err) {
    console.warn("Firestore deleteProject error:", err);
  }
  return filtered;
}

/**
 * The round currently open for submission and shown by default on the gallery.
 * Resolves settings.activeProjectId; falls back to the newest project.
 */
export async function getActiveProject(): Promise<Project | null> {
  const projects = await getProjects();
  if (projects.length === 0) return null;

  const settings = await getTrainingSettings();
  if (settings.activeProjectId) {
    const match = projects.find((p) => p.id === settings.activeProjectId);
    if (match) return match;
  }
  // Fallback: newest (getProjects is sorted newest-first when no explicit order)
  return projects[0];
}

/** Mark a project as the active round (open for submission + default display). */
export async function setActiveProject(id: string): Promise<void> {
  await updateTrainingSettings({ activeProjectId: id });

  // Reflect status on the projects for admin clarity (active vs closed).
  const projects = await getProjects();
  for (const p of projects) {
    const desired: Project["status"] = p.id === id ? "active" : "closed";
    if (p.status !== desired) {
      await saveProject({ ...p, status: desired });
    }
  }
}
