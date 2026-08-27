import {
  collection,
  deleteDoc,
  doc,
  DocumentData,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  QueryDocumentSnapshot,
  runTransaction,
  startAfter,
  startAt,
  endAt,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import type { ProjectParticipantSummary, Submission } from "./types";

const COLLECTION = "projectParticipants";
const META_COLLECTION = "projectParticipantMeta";
const STATS_COLLECTION = "projectStats";
const PAGE_SIZE = 20;
const MAX_WORKS = 50;

export interface ProjectParticipantPage {
  items: ProjectParticipantSummary[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

interface ProjectStatsPerson {
  participantKey: string;
  fullName: string;
  teacherId?: string;
  position: string;
  gradeLevel: string;
  subjectGroup: string;
  workSlotIds: string[];
  fileTypes: string[];
  createdAts: number[];
  uploadDates: string[];
  latestCreatedAt: number;
}

interface ProjectStatsDocument {
  projectId: string;
  participants: ProjectStatsPerson[];
  totalWorks: number;
  updatedAt: number;
}

function normalizeParticipantName(value: string): string {
  return String(value || "")
    .normalize("NFC")
    .toLocaleLowerCase("th")
    .replace(/^(นาย|นางสาว|นาง|ครู)\s*/u, "")
    .replace(/[.\-_]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function safeId(value: string): string {
  // FNV-1a gives a short deterministic id without putting a Thai name or slash
  // into a Firestore path. This is not used for security or identity.
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function projectParticipantKey(submission: Pick<Submission, "projectId" | "teacherId" | "fullName">): string {
  const identity = submission.teacherId?.trim() || normalizeParticipantName(submission.fullName);
  return `${submission.projectId || "legacy"}::${identity}`;
}

export function projectParticipantId(submission: Pick<Submission, "projectId" | "teacherId" | "fullName">): string {
  return `participant_${safeId(projectParticipantKey(submission))}`;
}

function projectedWork(item: Submission): Submission {
  return {
    id: item.id,
    fullName: item.fullName,
    teacherId: item.teacherId,
    position: item.position || "",
    school: item.school || "",
    province: item.province || "",
    gradeLevel: item.gradeLevel || "",
    subjectGroup: item.subjectGroup || "",
    projectId: item.projectId,
    projectName: item.projectName || "",
    projectTitle: item.projectTitle || "",
    workSlotId: item.workSlotId,
    description: item.description || "",
    fileType: item.fileType || "",
    fileURL: item.fileURL || "",
    fileName: item.fileName || "",
    fileSize: item.fileSize,
    thumbUrl: item.thumbUrl || "",
    uploadDate: item.uploadDate || "",
    createdAt: item.createdAt || 0,
    driveLink: item.driveLink || "",
    driveFileId: item.driveFileId || "",
    submissionMethod: item.submissionMethod,
  };
}

function summaryFromWorks(worksInput: Submission[]): ProjectParticipantSummary | null {
  const works = [...worksInput]
    .filter((item) => item.id && item.projectId && item.fullName)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (!works.length) return null;
  const latest = works[0];
  const participantKey = projectParticipantKey(latest);
  return {
    id: projectParticipantId(latest),
    projectId: latest.projectId as string,
    participantKey,
    fullName: latest.fullName,
    teacherId: latest.teacherId,
    position: latest.position || "",
    school: latest.school || "",
    gradeLevel: latest.gradeLevel || "",
    subjectGroup: latest.subjectGroup || "",
    normalizedName: normalizeParticipantName(latest.fullName),
    submissionIds: works.map((item) => item.id),
    submittedCount: works.length,
    latestCreatedAt: latest.createdAt || 0,
    latestUploadDate: latest.uploadDate || "",
    works: works.slice(0, MAX_WORKS).map(projectedWork),
    updatedAt: Date.now(),
  };
}

function summaryData(summary: ProjectParticipantSummary): Omit<ProjectParticipantSummary, "id"> {
  return JSON.parse(JSON.stringify(
    Object.fromEntries(Object.entries(summary).filter(([key]) => key !== "id")),
  )) as Omit<ProjectParticipantSummary, "id">;
}

function statsPerson(summary: ProjectParticipantSummary): ProjectStatsPerson {
  return JSON.parse(JSON.stringify({
    participantKey: summary.participantKey,
    fullName: summary.fullName,
    teacherId: summary.teacherId,
    position: summary.position,
    gradeLevel: summary.gradeLevel,
    subjectGroup: summary.subjectGroup,
    workSlotIds: summary.works.map((work) => work.workSlotId || work.id).filter(Boolean),
    fileTypes: summary.works.map((work) => work.fileType || ""),
    createdAts: summary.works.map((work) => work.createdAt || 0),
    uploadDates: summary.works.map((work) => work.uploadDate || ""),
    latestCreatedAt: summary.latestCreatedAt,
  })) as ProjectStatsPerson;
}

async function updateProjectStats(projectId: string, participantKey: string, summary: ProjectParticipantSummary | null): Promise<void> {
  const statsRef = doc(db, STATS_COLLECTION, projectId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(statsRef);
    const current = snapshot.exists()
      ? (snapshot.data() as ProjectStatsDocument)
      : { projectId, participants: [], totalWorks: 0, updatedAt: 0 };
    const participants = (current.participants || []).filter((item) => item.participantKey !== participantKey);
    if (summary) participants.push(statsPerson(summary));
    participants.sort((a, b) => b.latestCreatedAt - a.latestCreatedAt);
    transaction.set(statsRef, {
      projectId,
      participants,
      totalWorks: participants.reduce((sum, item) => sum + item.workSlotIds.length, 0),
      updatedAt: Date.now(),
    });
  });
}

export function summarizeProjectParticipants(items: Submission[]): ProjectParticipantSummary[] {
  const grouped = new Map<string, Submission[]>();
  for (const item of items) {
    if (!item.projectId || !item.fullName) continue;
    const key = projectParticipantKey(item);
    const rows = grouped.get(key) || [];
    rows.push(item);
    grouped.set(key, rows);
  }
  return [...grouped.values()]
    .map(summaryFromWorks)
    .filter((item): item is ProjectParticipantSummary => Boolean(item))
    .sort((a, b) => b.latestCreatedAt - a.latestCreatedAt);
}

export async function getProjectParticipantPage(params: {
  projectId: string;
  pageSize?: number;
  cursor?: QueryDocumentSnapshot<DocumentData> | null;
  gradeLevel?: string;
  subjectGroup?: string;
}): Promise<ProjectParticipantPage> {
  const pageSize = Math.max(1, Math.min(50, params.pageSize || PAGE_SIZE));
  const constraints = [where("projectId", "==", params.projectId)];
  if (params.gradeLevel) constraints.push(where("gradeLevel", "==", params.gradeLevel));
  if (params.subjectGroup) constraints.push(where("subjectGroup", "==", params.subjectGroup));
  const pageQuery = params.cursor
    ? query(collection(db, COLLECTION), ...constraints, orderBy("latestCreatedAt", "desc"), startAfter(params.cursor), limit(pageSize))
    : query(collection(db, COLLECTION), ...constraints, orderBy("latestCreatedAt", "desc"), limit(pageSize));
  const snapshot = await getDocs(pageQuery);
  return {
    items: snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<ProjectParticipantSummary, "id">) })),
    cursor: snapshot.docs.at(-1) || null,
    hasMore: snapshot.docs.length === pageSize,
  };
}

export async function searchProjectParticipants(params: {
  projectId?: string;
  name: string;
  pageSize?: number;
}): Promise<ProjectParticipantSummary[]> {
  const normalizedName = normalizeParticipantName(params.name);
  if (normalizedName.length < 2) return [];
  const pageSize = Math.max(1, Math.min(50, params.pageSize || PAGE_SIZE));
  const searchQuery = params.projectId
    ? query(
        collection(db, COLLECTION),
        where("projectId", "==", params.projectId),
        orderBy("normalizedName"),
        startAt(normalizedName),
        endAt(`${normalizedName}\uf8ff`),
        limit(pageSize),
      )
    : query(
        collection(db, COLLECTION),
        orderBy("normalizedName"),
        startAt(normalizedName),
        endAt(`${normalizedName}\uf8ff`),
        limit(pageSize),
      );
  const snapshot = await getDocs(searchQuery);
  return snapshot.docs.map((item) => ({
    id: item.id,
    ...(item.data() as Omit<ProjectParticipantSummary, "id">),
  }));
}

export async function hasProjectParticipantIndex(): Promise<boolean> {
  const snapshot = await getDoc(doc(db, META_COLLECTION, "current"));
  return snapshot.exists() && Number(snapshot.data().participants || 0) > 0;
}

export async function upsertProjectParticipant(submission: Submission): Promise<void> {
  if (!submission.id || !submission.projectId || !submission.fullName) return;
  const summaryRef = doc(db, COLLECTION, projectParticipantId(submission));
  const updated = await runTransaction(db, async (transaction) => {
    const currentSnapshot = await transaction.get(summaryRef);
    const current = currentSnapshot.exists()
      ? ({ id: currentSnapshot.id, ...currentSnapshot.data() } as ProjectParticipantSummary)
      : null;
    const work = projectedWork(submission);
    const previousWorks = current?.works || [];
    const sameSlot = (item: Submission) =>
      Boolean(work.workSlotId && item.workSlotId && item.workSlotId === work.workSlotId);
    const merged = [work, ...previousWorks.filter((item) => item.id !== work.id && !sameSlot(item))]
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const next = summaryFromWorks(merged);
    if (!next) return null;
    transaction.set(summaryRef, summaryData(next));
    return next;
  });
  if (updated) await updateProjectStats(updated.projectId, updated.participantKey, updated);
}

export async function rebuildProjectParticipant(projectId: string, fullName: string, teacherId = ""): Promise<void> {
  if (!projectId || !fullName) return;
  const snapshot = await getDocs(query(
    collection(db, "submissions"),
    where("projectId", "==", projectId),
    where("fullName", "==", fullName),
  ));
  const works = snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<Submission, "id">) }));
  const identity = { projectId, fullName, teacherId };
  const targetRef = doc(db, COLLECTION, projectParticipantId(identity));
  const summary = summaryFromWorks(works);
  if (summary) await runTransaction(db, async (transaction) => transaction.set(targetRef, summaryData(summary)));
  else await deleteDoc(targetRef).catch(() => undefined);
  await updateProjectStats(projectId, projectParticipantKey(identity), summary);
}

export async function rebuildProjectParticipantIndex(items: Submission[]): Promise<{ participants: number; works: number }> {
  const summaries = summarizeProjectParticipants(items);
  const existing = await getDocs(collection(db, COLLECTION));
  const keep = new Set(summaries.map((item) => item.id));
  const operations: Array<{ type: "set"; item: ProjectParticipantSummary } | { type: "delete"; id: string }> = [
    ...summaries.map((item) => ({ type: "set" as const, item })),
    ...existing.docs.filter((item) => !keep.has(item.id)).map((item) => ({ type: "delete" as const, id: item.id })),
  ];
  for (let offset = 0; offset < operations.length; offset += 400) {
    const batch = writeBatch(db);
    for (const operation of operations.slice(offset, offset + 400)) {
      if (operation.type === "delete") batch.delete(doc(db, COLLECTION, operation.id));
      else {
        const { id, ...data } = operation.item;
        batch.set(doc(db, COLLECTION, id), data);
      }
    }
    await batch.commit();
  }
  const metaBatch = writeBatch(db);
  metaBatch.set(doc(db, META_COLLECTION, "current"), {
    participants: summaries.length,
    works: items.length,
    updatedAt: Date.now(),
  });
  await metaBatch.commit();
  const byProject = new Map<string, ProjectParticipantSummary[]>();
  summaries.forEach((summary) => {
    const list = byProject.get(summary.projectId) || [];
    list.push(summary);
    byProject.set(summary.projectId, list);
  });
  const existingStats = await getDocs(collection(db, STATS_COLLECTION));
  const statsBatch = writeBatch(db);
  byProject.forEach((rows, projectId) => {
    statsBatch.set(doc(db, STATS_COLLECTION, projectId), {
      projectId,
      participants: rows.map(statsPerson),
      totalWorks: rows.reduce((sum, row) => sum + row.submittedCount, 0),
      updatedAt: Date.now(),
    });
  });
  existingStats.docs.forEach((item) => {
    if (!byProject.has(item.id)) statsBatch.delete(item.ref);
  });
  await statsBatch.commit();
  return { participants: summaries.length, works: items.length };
}

export async function deleteProjectParticipantIndex(projectId: string): Promise<void> {
  const snapshot = await getDocs(query(collection(db, COLLECTION), where("projectId", "==", projectId)));
  for (let offset = 0; offset < snapshot.docs.length; offset += 400) {
    const batch = writeBatch(db);
    snapshot.docs.slice(offset, offset + 400).forEach((item) => batch.delete(item.ref));
    await batch.commit();
  }
  await deleteDoc(doc(db, STATS_COLLECTION, projectId)).catch(() => undefined);
}

function statsDocumentToSubmissions(stats: ProjectStatsDocument): Submission[] {
  return (stats.participants || []).flatMap((person) =>
    (person.workSlotIds || []).map((workSlotId, index) => ({
      id: `${person.participantKey}_${workSlotId}_${index}`,
      fullName: person.fullName,
      teacherId: person.teacherId,
      position: person.position || "",
      school: "",
      gradeLevel: person.gradeLevel || "",
      subjectGroup: person.subjectGroup || "",
      projectId: stats.projectId,
      projectTitle: "",
      workSlotId,
      fileType: person.fileTypes?.[index] || "",
      fileURL: "",
      uploadDate: person.uploadDates?.[index] || "",
      createdAt: person.createdAts?.[index] || person.latestCreatedAt,
    })),
  );
}

export async function getProjectStatsSubmissions(projectId: string): Promise<Submission[]> {
  if (!projectId) return [];
  const snapshot = await getDoc(doc(db, STATS_COLLECTION, projectId));
  return snapshot.exists() ? statsDocumentToSubmissions(snapshot.data() as ProjectStatsDocument) : [];
}

export async function getAllProjectStatsSubmissions(): Promise<Submission[]> {
  const snapshot = await getDocs(collection(db, STATS_COLLECTION));
  return snapshot.docs.flatMap((item) => statsDocumentToSubmissions(item.data() as ProjectStatsDocument));
}

export async function getProjectParticipant(id: string): Promise<ProjectParticipantSummary | null> {
  const snapshot = await getDoc(doc(db, COLLECTION, id));
  return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as ProjectParticipantSummary) : null;
}
