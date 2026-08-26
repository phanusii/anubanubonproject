"use client";

import { useEffect, useMemo, useState } from "react";
import { getPersonSubmissions, getInstantPersonWorks } from "@/lib/submission-service";
import { getTeachers } from "@/lib/teachers-service";
import { getProjects } from "@/lib/projects-service";
import { Submission } from "@/lib/types";
import { displayWorkTitle, gradeLabel, normalizeGradeKey } from "@/lib/format";
import {
  extractGoogleDriveFileId,
  getGoogleDrivePreviewUrl,
  getGoogleDriveDownloadUrl,
  avatarUrlCandidates,
} from "@/lib/google-drive-utils";
import {
  ArrowLeft,
  User,
  Building,
  Tag,
  BookOpen,
  Calendar,
  ExternalLink,
  Download,
  HardDrive,
  FileText,
} from "lucide-react";

interface PersonWorksViewProps {
  name: string;
  /** Which dimension the gallery card was grouped on. */
  field?: "grade" | "subject";
  /** The category value (grade name or subject-group name) to scope works to.
   *  Empty means "every work for this name". */
  value?: string;
}

/** Full-page view listing every work submitted by one teacher (replaces the modal). */
export default function PersonWorksView({ name, field = "grade", value }: PersonWorksViewProps) {
  const [works, setWorks] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [avatarIdx, setAvatarIdx] = useState(0);
  const avatarSrc = avatarUrlCandidates(avatarUrl)[avatarIdx] || "";

  useEffect(() => {
    let alive = true;
    const norm = (s: string) => (s || "").replace(/\s+/g, "").replace(/^ครู/, "").trim();
    const scoped = (list: Submission[]) =>
      list.filter((w) => {
        if (!value) return true;
        return field === "subject"
          ? (w.subjectGroup || "").trim() === value.trim()
          : normalizeGradeKey(w.gradeLevel) === normalizeGradeKey(value);
      });
    async function load() {
      // Paint instantly from the gallery cache (the round the visitor just came
      // from), then refine with the authoritative per-name query below.
      const seed = scoped(getInstantPersonWorks(name)).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      if (seed.length) {
        setWorks(seed);
        setLoading(false);
      } else {
        setLoading(true);
      }
      try {
        // Load every visible round once, then order this person's work by the
        // round and work-slot order configured by Admin.
        const [all, teachers, projects] = await Promise.all([
          getPersonSubmissions(name),
          getTeachers(),
          getProjects(),
        ]);
        if (!alive) return;
        const visibleProjects = projects.filter((project) => project.showInGallery !== false);
        const visibleIds = new Set(visibleProjects.map((project) => project.id));
        const projectOrder = new Map(visibleProjects.map((project, index) => [project.id, index]));
        const projectByName = new Map(visibleProjects.map((project) => [project.name.trim(), project]));
        const slotOrder = new Map<string, number>();
        for (const project of visibleProjects) {
          project.workSlotTitles.forEach((title, index) => {
            slotOrder.set(`${project.id}::${title.trim()}`, index);
          });
        }
        const mine = all
          .filter((submission) => {
            if (norm(submission.fullName) !== norm(name)) return false;
            // Scope to the category of the gallery card that was opened, so a
            // teacher who spans more than one grade / subject shows only this
            // group's works.
            if (value) {
              if (field === "subject") {
                if ((submission.subjectGroup || "").trim() !== value.trim()) return false;
              } else if (normalizeGradeKey(submission.gradeLevel) !== normalizeGradeKey(value)) {
                return false;
              }
            }
            // Legacy submissions without a projectId remain visible. Works from
            // rounds hidden by Admin do not appear on the public person page.
            return !submission.projectId || visibleIds.has(submission.projectId);
          })
          .sort((a, b) => {
            const aProject = a.projectId
              ? visibleProjects.find((project) => project.id === a.projectId)
              : projectByName.get((a.projectName || "").trim());
            const bProject = b.projectId
              ? visibleProjects.find((project) => project.id === b.projectId)
              : projectByName.get((b.projectName || "").trim());
            const aProjectIndex = aProject ? projectOrder.get(aProject.id) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
            const bProjectIndex = bProject ? projectOrder.get(bProject.id) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
            if (aProjectIndex !== bProjectIndex) return aProjectIndex - bProjectIndex;

            const aSlot = aProject ? slotOrder.get(`${aProject.id}::${a.projectTitle.trim()}`) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
            const bSlot = bProject ? slotOrder.get(`${bProject.id}::${b.projectTitle.trim()}`) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
            if (aSlot !== bSlot) return aSlot - bSlot;
            return (a.createdAt || 0) - (b.createdAt || 0);
          });
        setWorks(mine);
        const t = teachers.find((tt) => norm(tt.fullName) === norm(name));
        setAvatarIdx(0);
        setAvatarUrl(t?.photoUrl || "");
      } catch (err) {
        console.error("PersonWorksView load error:", err);
      } finally {
        if (alive) setLoading(false);
      }
    }
    if (name) load();
    return () => {
      alive = false;
    };
  }, [name, field, value]);

  // Work cards are ordered by the Admin's slot order, so works[0] is not
  // necessarily the newest submission. Always use the newest submission as
  // the source of truth for sender metadata that may have changed over time.
  const person = useMemo(() => {
    return works.reduce<Submission | undefined>((latest, work) => {
      if (!latest) return work;
      const workTime = work.createdAt || Date.parse(work.uploadDate || "") || 0;
      const latestTime = latest.createdAt || Date.parse(latest.uploadDate || "") || 0;
      return workTime > latestTime ? work : latest;
    }, undefined);
  }, [works]);

  return (
    <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 space-y-6">
      {/* Back */}
      <a
        href="#gallery"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>กลับไปคลังผลงาน</span>
      </a>

      {/* Person header */}
      <div className="glass-panel p-6 rounded-3xl border border-white bg-white shadow-xs space-y-4">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl overflow-hidden bg-white flex items-center justify-center shrink-0 shadow-md shadow-blue-500/20 border border-white">
            {avatarSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarSrc}
                alt={name}
                className="w-full h-full object-cover"
                onError={() => setAvatarIdx((i) => i + 1)}
              />
            ) : (
              <span className="w-full h-full ios-gradient-blue text-white flex items-center justify-center">
                <User className="w-7 h-7" />
              </span>
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold text-slate-900 truncate">
              {name || "ไม่ระบุชื่อ"}
            </h1>
            {person && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs font-semibold text-slate-600">
                {person.position && (
                  <span className="flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5 text-amber-500" />
                    {person.position}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <BookOpen className="w-3.5 h-3.5 text-blue-500" />
                  {gradeLabel(person.gradeLevel)}
                </span>
                {person.school && (
                  <span className="flex items-center gap-1">
                    <Building className="w-3.5 h-3.5 text-sky-500" />
                    {person.school}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="pt-3 border-t border-slate-100">
          <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-blue-50 text-blue-600 border border-blue-100">
            ผลงานทั้งหมด {works.length} ชิ้น
          </span>
        </div>
      </div>

      {/* Works list */}
      {loading ? (
        <div className="glass-panel p-12 text-center rounded-3xl border border-slate-100 bg-slate-50/50">
          <p className="text-sm font-bold text-slate-500">กำลังโหลดผลงาน...</p>
        </div>
      ) : works.length === 0 ? (
        <div className="glass-panel p-12 text-center rounded-3xl border border-slate-100 bg-slate-50/50 space-y-2">
          <p className="text-base font-extrabold text-slate-700">ยังไม่พบผลงานของครูท่านนี้</p>
          <p className="text-xs text-slate-500 font-medium">อาจยังไม่ได้ส่งผลงาน หรือผลงานยังไม่เผยแพร่</p>
        </div>
      ) : (
        <div className="space-y-6">
          {works.map((w, idx) => (
            <WorkPreviewCard key={w.id} work={w} index={idx} latestSender={person} />
          ))}
        </div>
      )}
    </main>
  );
}

function WorkPreviewCard({ work, index, latestSender }: { work: Submission; index: number; latestSender?: Submission }) {
  const isDrive =
    work.fileType === "drive" ||
    work.submissionMethod === "drive" ||
    !!work.driveLink;
  const driveId =
    work.driveFileId || (isDrive ? extractGoogleDriveFileId(work.fileURL) : null);
  const isPdf = !isDrive && (work.fileType === "pdf" || work.fileURL?.endsWith(".pdf"));

  return (
    <div className="glass-panel rounded-3xl border border-white bg-white shadow-xs overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-100 bg-white/80">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-7 h-7 rounded-xl bg-blue-600 text-white text-xs font-extrabold flex items-center justify-center shrink-0">
            {index + 1}
          </span>
          {isDrive && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 flex items-center gap-1 shrink-0">
              <HardDrive className="w-3 h-3" />
              Drive
            </span>
          )}
          {isPdf && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-600 flex items-center gap-1 shrink-0">
              <FileText className="w-3 h-3" />
              PDF
            </span>
          )}
          <h3 className="font-extrabold text-sm text-slate-900 truncate">
            {displayWorkTitle(work.projectTitle)}
          </h3>
        </div>
        <a
          href={isDrive && driveId ? getGoogleDriveDownloadUrl(driveId, work.fileURL) : work.fileURL}
          target="_blank"
          rel="noopener noreferrer"
          download={!isDrive}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl ios-gradient-blue text-white text-xs font-bold shadow-sm shrink-0"
        >
          {isDrive ? <ExternalLink className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{isDrive ? "เปิดใน Drive" : "ดาวน์โหลด"}</span>
        </a>
      </div>

      {/* Preview */}
      <div className="p-4 bg-slate-100/70">
        {isDrive && driveId ? (
          <iframe
            src={getGoogleDrivePreviewUrl(driveId)}
            className="w-full h-[55dvh] sm:h-[70vh] min-h-[260px] sm:min-h-[420px] rounded-2xl border border-slate-200 bg-white"
            title={`ผลงานชิ้นที่ ${index + 1}`}
          />
        ) : isPdf ? (
          <iframe
            src={work.fileURL}
            className="w-full h-[55dvh] sm:h-[70vh] min-h-[260px] sm:min-h-[420px] rounded-2xl border border-slate-200 bg-white"
            title={`ผลงานชิ้นที่ ${index + 1}`}
          />
        ) : (
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={work.fileURL}
              alt={work.projectTitle}
              className="max-h-[70vh] object-contain rounded-2xl border border-slate-200 bg-white p-1"
            />
          </div>
        )}
      </div>

      {/* Meta footer */}
      <div className="px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 font-semibold border-t border-slate-100">
        <span className="flex items-center gap-1">
          <BookOpen className="w-3.5 h-3.5 text-purple-500" />
          {latestSender?.subjectGroup || work.subjectGroup}
        </span>
        {work.uploadDate && (
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            {work.uploadDate}
          </span>
        )}
        {work.projectName && (
          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
            {work.projectName}
          </span>
        )}
      </div>
    </div>
  );
}
