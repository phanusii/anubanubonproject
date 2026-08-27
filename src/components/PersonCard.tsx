"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Submission } from "@/lib/types";
import { FileText, Image as ImageIcon, HardDrive, Smile, ChevronLeft, ChevronRight } from "lucide-react";
import { extractGoogleDriveFileId, getGoogleDriveThumbnail, avatarUrlCandidates } from "@/lib/google-drive-utils";
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

/** Compact label for the card badge. Grades drop the "ครูสายชั้น" prefix (just
 *  "อ.1" / "ป.6"); subject groups drop the long "กลุ่มสาระการเรียนรู้" prefix so
 *  the badge stays short and fully visible in the card corner. */
function categoryBadge(group: PersonGroup): string {
  if (group.axis === "subjectGroup") {
    return group.categoryValue.replace(/^กลุ่มสาระการเรียนรู้/, "").trim() || group.categoryValue;
  }
  return gradeLabel(group.categoryValue).replace(/^ครูสายชั้น\s*/, "").trim() || group.categoryValue;
}

// A lively but readable colour per category, picked deterministically from the
// value so the same grade/subject always wears the same badge colour.
const BADGE_SCHEMES = [
  "bg-blue-500/90 border-blue-300/60",
  "bg-emerald-500/90 border-emerald-300/60",
  "bg-violet-500/90 border-violet-300/60",
  "bg-amber-500/90 border-amber-300/60",
  "bg-rose-500/90 border-rose-300/60",
  "bg-cyan-500/90 border-cyan-300/60",
  "bg-indigo-500/90 border-indigo-300/60",
  "bg-teal-500/90 border-teal-300/60",
  "bg-fuchsia-500/90 border-fuchsia-300/60",
  "bg-sky-500/90 border-sky-300/60",
];
function badgeScheme(value: string): string {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return BADGE_SCHEMES[h % BADGE_SCHEMES.length];
}

/** Thumbnail sources in priority order. Kept in one helper so the hidden
 * one-at-a-time loader and the visible preview request exactly the same URL. */
function previewCandidates(submission: Submission): string[] {
  const driveFileId = submission.driveFileId || extractGoogleDriveFileId(submission.fileURL);
  return Array.from(
    new Set(
      [
        submission.thumbUrl,
        submission.thumbnail,
        driveFileId ? getGoogleDriveThumbnail(driveFileId) : "",
        driveFileId ? `https://lh3.googleusercontent.com/d/${driveFileId}=w1000` : "",
      ].filter(Boolean),
    ),
  ) as string[];
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
  const [avatarIdx, setAvatarIdx] = useState(0);
  const [touchX, setTouchX] = useState<number | null>(null);
  const [hovered, setHovered] = useState(false);
  const [slideDirection, setSlideDirection] = useState<1 | -1>(1);
  const avatarCandidates = avatarUrlCandidates(avatarUrl);
  const avatarSrc = avatarCandidates[avatarIdx] || "";

  // A small per-card offset so the cards don't all advance in lock-step, which
  // would look mechanical. Fixed after mount (SSR-safe: 0 on the first render).
  const offsetRef = useRef(0);
  useEffect(() => {
    offsetRef.current = Math.floor(Math.random() * 2200);
  }, []);

  // Auto-advance the slideshow gently and continuously; pause while hovered so
  // the visitor can look, zoom, and use the controls.
  useEffect(() => {
    if (count <= 1 || hovered) return;
    let interval: ReturnType<typeof setInterval> | undefined;
    const kickoff = setTimeout(() => {
      setSlideDirection(1);
      setIndex((i) => (i + 1) % count);
      interval = setInterval(() => {
        setSlideDirection(1);
        setIndex((i) => (i + 1) % count);
      }, 5200);
    }, 4800 + offsetRef.current);
    return () => {
      clearTimeout(kickoff);
      if (interval) clearInterval(interval);
    };
  }, [count, hovered]);

  const current = works[Math.min(index, count - 1)];
  const step = (delta: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setSlideDirection(delta < 0 ? -1 : 1);
    setIndex((i) => (i + delta + count) % count);
  };
  const jump = (i: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setSlideDirection(i < index ? -1 : 1);
    setIndex(i);
  };

  return (
    <div
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="glass-panel group rounded-3xl p-4 cursor-pointer border border-white/80 hover:border-blue-200 transition-all duration-300 hover:shadow-2xl hover:shadow-blue-500/15 hover:-translate-y-1.5 flex flex-col justify-between space-y-4 bg-white/90 animate-in fade-in slide-in-from-bottom-3 duration-500"
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
                  if (Math.abs(dx) > 40) {
                    setSlideDirection(dx < 0 ? 1 : -1);
                    setIndex((i) => (i + (dx < 0 ? 1 : -1) + count) % count);
                  }
                  setTouchX(null);
                }
              : undefined
          }
        >
          <SlidePreview submission={current} zoom={hovered} direction={slideDirection} />

          {/* Soft zoom overlay to signal the preview is interactive on hover */}
          <div className="pointer-events-none absolute inset-0 z-10 rounded-2xl ring-0 group-hover:ring-2 group-hover:ring-blue-400/40 transition-all duration-300" />

          {/* Category badge (grade / subject) — coloured per category, kept short */}
          <div className="absolute top-2.5 left-2.5 right-12 z-20">
            <span className={`inline-block max-w-full align-top px-2.5 py-1 rounded-xl text-[10px] font-extrabold text-white backdrop-blur-md shadow-sm border leading-tight line-clamp-2 break-words ${badgeScheme(group.categoryValue)}`}>
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

              {/* Auto-advance progress bar — restarts each slide, hidden on hover */}
              {!hovered && (
                <div className="absolute bottom-0 left-0 right-0 h-1 z-20 bg-slate-900/10">
                  <div key={index} className="card-slide-progress h-full w-full bg-blue-500/80" />
                </div>
              )}
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
          {avatarSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarSrc}
              alt=""
              className="w-full h-full object-cover"
              onError={() => setAvatarIdx((i) => i + 1)}
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
function SlidePreview({
  submission,
  zoom,
  direction,
}: {
  submission: Submission;
  zoom?: boolean;
  direction: 1 | -1;
}) {
  const [displayedSubmission, setDisplayedSubmission] = useState(submission);
  const [incomingSubmission, setIncomingSubmission] = useState<Submission | null>(null);
  const [pendingCandidates, setPendingCandidates] = useState<Record<string, number>>({});
  const requestedCandidates = previewCandidates(submission);
  const pendingIndex = pendingCandidates[submission.id] || 0;
  const pendingThumb = requestedCandidates[pendingIndex] || "";
  const isPending = displayedSubmission.id !== submission.id;
  const loadedIncoming = incomingSubmission?.id === submission.id ? incomingSubmission : null;
  // A fallback has nothing to download, so it can enter immediately. Images
  // join only after the hidden one-at-a-time loader confirms they are ready.
  const activeIncoming = loadedIncoming || (isPending && !pendingThumb ? submission : null);
  const needsHiddenLoader = isPending && Boolean(pendingThumb) && !loadedIncoming;

  return (
    <>
      <PreviewVisual submission={displayedSubmission} zoom={zoom} />
      {activeIncoming && (
        <div
          key={`${activeIncoming.id}-${direction}`}
          aria-hidden="true"
          className={`absolute inset-0 z-[1] flex items-center justify-center will-change-transform ${
            direction < 0 ? "card-slide-enter-prev" : "card-slide-enter-next"
          }`}
          onAnimationEnd={() => {
            if (activeIncoming.id !== submission.id) return;
            setDisplayedSubmission(activeIncoming);
            setIncomingSubmission(null);
          }}
        >
          <PreviewVisual submission={activeIncoming} zoom={zoom} />
        </div>
      )}
      {needsHiddenLoader && (
        <Image
          src={pendingThumb}
          alt=""
          fill
          aria-hidden="true"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 25vw, 20vw"
          className="pointer-events-none invisible"
          onLoad={() => setIncomingSubmission(submission)}
          onError={() =>
            setPendingCandidates((current) => ({
              ...current,
              [submission.id]: (current[submission.id] || 0) + 1,
            }))
          }
        />
      )}
    </>
  );
}

/** The currently painted preview. It stays mounted while the requested next
 * image loads invisibly, so the card never flashes to an empty white page. */
function PreviewVisual({ submission, zoom }: { submission: Submission; zoom?: boolean }) {
  const isPdf = submission.fileType === "pdf";
  const candidates = previewCandidates(submission);
  // Store failures per submission. The component deliberately remains mounted
  // between slides so the browser can keep painting the old image while the
  // new, already-prefetched source is decoded.
  const [failedCandidates, setFailedCandidates] = useState<Record<string, number>>({});
  const thumbIndex = failedCandidates[submission.id] || 0;
  const thumb = candidates[thumbIndex] || "";

  if (thumb) {
    return (
      <Image
        src={thumb}
        alt={submission.projectTitle}
        fill
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 25vw, 20vw"
        className={`w-full h-full object-contain transition-transform ease-out will-change-transform ${
          zoom ? "scale-[1.12]" : "scale-100"
        }`}
        style={{ transitionDuration: "600ms" }}
        onError={() =>
          setFailedCandidates((current) => ({
            ...current,
            [submission.id]: (current[submission.id] || 0) + 1,
          }))
        }
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
