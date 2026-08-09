"use client";

import { useEffect, useState } from "react";
import { getSubmissions } from "@/lib/submission-service";
import { getTeachers } from "@/lib/teachers-service";
import { Submission } from "@/lib/types";
import { gradeLabel } from "@/lib/format";
import {
  extractGoogleDriveFileId,
  getGoogleDrivePreviewUrl,
  getGoogleDriveDownloadUrl,
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
}

/** Full-page view listing every work submitted by one teacher (replaces the modal). */
export default function PersonWorksView({ name }: PersonWorksViewProps) {
  const [works, setWorks] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string>("");

  useEffect(() => {
    let alive = true;
    const norm = (s: string) => (s || "").replace(/\s+/g, "").replace(/^ครู/, "").trim();
    async function load() {
      setLoading(true);
      try {
        // Every round, capped — then filter to this person by name.
        const [all, teachers] = await Promise.all([getSubmissions({ limitNum: 500 }), getTeachers()]);
        if (!alive) return;
        const mine = all
          .filter((s) => (s.fullName || "").trim() === name.trim())
          .sort((a, b) => (a.uploadDate || "").localeCompare(b.uploadDate || ""));
        setWorks(mine);
        const t = teachers.find((tt) => norm(tt.fullName) === norm(name));
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
  }, [name]);

  const person = works[0];

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
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
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
            <WorkPreviewCard key={w.id} work={w} index={idx} />
          ))}
        </div>
      )}
    </main>
  );
}

function WorkPreviewCard({ work, index }: { work: Submission; index: number }) {
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
            {work.projectTitle}
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
            className="w-full h-[70vh] min-h-[420px] rounded-2xl border border-slate-200 bg-white"
            title={`ผลงานชิ้นที่ ${index + 1}`}
          />
        ) : isPdf ? (
          <iframe
            src={work.fileURL}
            className="w-full h-[70vh] min-h-[420px] rounded-2xl border border-slate-200 bg-white"
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
          {work.subjectGroup}
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
