"use client";

import { useState } from "react";
import Image from "next/image";
import { Submission } from "@/lib/types";
import { FileText, Image as ImageIcon, HardDrive, Smile, ChevronLeft, ChevronRight } from "lucide-react";
import { extractGoogleDriveFileId, getGoogleDriveThumbnail } from "@/lib/google-drive-utils";
import { displayWorkTitle, gradeLabel } from "@/lib/format";

/** One teacher (grouped by name + the round's category axis) with all of their works. */
export interface PersonGroup {
  key: string;
  fullName: string;
  /** Which dimension this group is keyed on. */
  axis: "gradeLevel" | "subjectGroup";
  /** The category value for this group — a grade name or a subject-group name. */
  categoryValue: string;
  position: string;
  works: Submission[];
  /** Newest submission time in the group — used to order cards. */
  latestTime: number;
}

/** Compact label for the card badge — grades use their short label; subject
 *  groups drop the long "กลุ่มสาระการเรียนรู้" prefix so the badge stays small. */
function categoryBadge(group: PersonGroup): string {
  if (group.axis === "subjectGroup") {
    return group.categoryValue.replace(/^กลุ่มสาระการเรียนรู้/, "").trim() || group.categoryValue;
  }
  return gradeLabel(group.categoryValue);
}

interface PersonCardProps {
  group: PersonGroup;
  avatarUrl?: string;
  onOpen: () => void;
}

/**
 * A gallery card that represents one teacher. When they submitted more than one
 * work, the preview becomes a slideshow the visitor can page through (arrows /
 * dots / swipe) without leaving the card. Clicking the card opens their full
 * works page.
 */
export default function PersonCard({ group, avatarUrl, onOpen }: PersonCardProps) {
  const works = group.works;
  const count = works.length;
  const [index, setIndex] = useState(0);
  const [avatarError, setAvatarError] = useState(false);
  const [touchX, setTouchX] = useState<number | null>(null);
  const compactAvatarUrl = avatarUrl?.replace(/=w\d+$/i, "=w64").replace(/([?&]sz=)w\d+/i, "$1w64");

  const current = works[Math.min(index, count - 1)];
  const step = (delta: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setIndex((i) => (i + delta + count) % count);
  };
  const jump = (i: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setIndex(i);
  };

  return (
    <div
      onClick={onOpen}
      className="glass-panel group rounded-3xl p-4 cursor-pointer border border-white hover:border-blue-200 transition-all duration-300 hover:shadow-xl hover:-translate-y-1.5 flex flex-col justify-between space-y-4 bg-white/90"
    >
      <div className="space-y-3">
        {/* Preview — A4 portrait; slideshow when the teacher has multiple works */}
        <div
          className="relative aspect-[210/297] rounded-2xl overflow-hidden bg-white border border-slate-100 flex items-center justify-center group-hover:shadow-md transition-all"
          onTouchStart={count > 1 ? (e) => setTouchX(e.touches[0].clientX) : undefined}
          onTouchEnd={
            count > 1
              ? (e) => {
                  if (touchX === null) return;
                  const dx = e.changedTouches[0].clientX - touchX;
                  if (Math.abs(dx) > 40) setIndex((i) => (i + (dx < 0 ? 1 : -1) + count) % count);
                  setTouchX(null);
                }
              : undefined
          }
        >
          <SlidePreview key={current.id} submission={current} />

          {/* Grade badge */}
          <div className="absolute top-2.5 left-2.5 z-20">
            <span className="max-w-[85%] px-2.5 py-1 rounded-xl text-[10px] font-extrabold bg-white/90 backdrop-blur-md text-slate-800 shadow-xs border border-white line-clamp-1">
              {categoryBadge(group)}
            </span>
          </div>

          {count > 1 && (
            <>
              {/* Position counter (e.g. 1/5) */}
              <div className="absolute top-2.5 right-2.5 z-20">
                <span className="px-2 py-1 rounded-lg text-[10px] font-extrabold text-white bg-slate-900/60 backdrop-blur-md tabular-nums">
                  {index + 1}/{count}
                </span>
              </div>

              {/* Prev / next arrows (reveal on hover; always visible on touch) */}
              <button
                type="button"
                aria-label="ผลงานก่อนหน้า"
                onClick={step(-1)}
                className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-white/85 backdrop-blur-md text-slate-700 shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-blue-600 hover:text-white transition-all max-[640px]:opacity-90"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                aria-label="ผลงานถัดไป"
                onClick={step(1)}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-white/85 backdrop-blur-md text-slate-700 shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-blue-600 hover:text-white transition-all max-[640px]:opacity-90"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {/* Dots */}
              <div className="absolute bottom-2.5 left-0 right-0 z-20 flex justify-center gap-1.5">
                {works.map((w, i) => (
                  <button
                    key={w.id}
                    type="button"
                    aria-label={`ผลงานชิ้นที่ ${i + 1}`}
                    onClick={jump(i)}
                    className={`h-1.5 rounded-full transition-all ${
                      i === index ? "w-4 bg-blue-600" : "w-1.5 bg-slate-900/25 hover:bg-slate-900/40"
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Current work title */}
        <div className="space-y-1">
          <h3 className="font-extrabold text-sm text-slate-900 leading-snug line-clamp-2 group-hover:text-blue-600 transition-colors">
            {displayWorkTitle(current.projectTitle)}
          </h3>
        </div>
      </div>

      {/* Teacher footer */}
      <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
        <span className="w-5 h-5 rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-gradient-to-br from-pink-200 via-purple-200 to-blue-200 border border-white shadow-2xs">
          {compactAvatarUrl && !avatarError ? (
            <Image
              src={compactAvatarUrl}
              alt=""
              width={20}
              height={20}
              className="w-full h-full object-cover"
              onError={() => setAvatarError(true)}
            />
          ) : (
            <Smile className="w-3 h-3 text-purple-500" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-slate-900 truncate">{group.fullName}</p>
          {group.position && (
            <p className="text-[11px] font-semibold text-slate-500 truncate" title={group.position}>
              {group.position}
            </p>
          )}
        </div>
        <span className="shrink-0 text-[10px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
          {count} ชิ้น
        </span>
      </div>
    </div>
  );
}

/** Renders a single work's thumbnail with graceful fallbacks (mirrors MasonryCard). */
function SlidePreview({ submission }: { submission: Submission }) {
  const isPdf = submission.fileType === "pdf";
  const driveFileId = submission.driveFileId || extractGoogleDriveFileId(submission.fileURL);
  const candidates = Array.from(
    new Set(
      [
        submission.thumbUrl,
        submission.thumbnail,
        driveFileId ? getGoogleDriveThumbnail(driveFileId) : "",
        driveFileId ? `https://lh3.googleusercontent.com/d/${driveFileId}=w1000` : "",
      ].filter(Boolean),
    ),
  ) as string[];
  const [thumbIndex, setThumbIndex] = useState(0);
  const thumb = candidates[thumbIndex] || "";

  if (thumb) {
    return (
      <Image
        src={thumb}
        alt={submission.projectTitle}
        fill
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
        className="w-full h-full object-contain animate-in fade-in duration-300"
        onError={() => setThumbIndex((i) => i + 1)}
      />
    );
  }

  if (isPdf) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-red-500 space-y-2">
        <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center shadow-xs">
          <FileText className="w-7 h-7" />
        </div>
        <span className="text-[11px] font-extrabold tracking-wider text-red-600 bg-red-100/80 px-2.5 py-0.5 rounded-full uppercase">
          PDF DOCUMENT
        </span>
      </div>
    );
  }

  if (submission.fileType === "drive") {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-amber-600 space-y-2 text-center">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center shadow-xs">
          <HardDrive className="w-7 h-7" />
        </div>
        <span className="text-[11px] font-extrabold tracking-wider text-amber-700 bg-amber-100/80 px-2.5 py-0.5 rounded-full uppercase">
          GOOGLE DRIVE
        </span>
        <span className="text-[10px] font-bold text-amber-600 leading-tight px-2">ยังไม่ได้แชร์สาธารณะ</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-6 text-blue-500 space-y-2">
      <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center shadow-xs">
        <ImageIcon className="w-7 h-7" />
      </div>
      <span className="text-[11px] font-extrabold tracking-wider text-blue-600 bg-blue-100/80 px-2.5 py-0.5 rounded-full uppercase">
        IMAGE FILE
      </span>
    </div>
  );
}
