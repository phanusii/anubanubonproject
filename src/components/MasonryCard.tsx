"use client";

import { useState } from "react";
import { Submission } from "@/lib/types";
import { FileText, Image as ImageIcon, ExternalLink, HardDrive, Smile } from "lucide-react";
import { isGoogleDriveLink } from "@/lib/google-drive-utils";
import { displayWorkTitle, gradeLabel } from "@/lib/format";

interface MasonryCardProps {
  submission: Submission;
  onClick: () => void;
  avatarUrl?: string;
}

export default function MasonryCard({ submission, onClick, avatarUrl }: MasonryCardProps) {
  const isPdf = submission.fileType === "pdf";
  const isDrive = submission.fileType === "drive" || isGoogleDriveLink(submission.fileURL);
  const [imgError, setImgError] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  return (
    <div
      onClick={onClick}
      className="glass-panel group rounded-3xl p-4 cursor-pointer border border-white hover:border-blue-200 transition-all duration-300 hover:shadow-xl hover:-translate-y-1.5 flex flex-col justify-between space-y-4 bg-white/90"
    >
      <div className="space-y-3">
        {/* Preview Thumbnail Container — A4 portrait to fit PDF-page thumbnails */}
        <div className="relative aspect-[210/297] rounded-2xl overflow-hidden bg-white border border-slate-100 flex items-center justify-center group-hover:shadow-md transition-all">
          {submission.thumbnail && !imgError ? (
            <img
              src={submission.thumbnail}
              alt={submission.projectTitle}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
              onError={() => setImgError(true)}
            />
          ) : isPdf ? (
            <div className="flex flex-col items-center justify-center p-6 text-red-500 space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center shadow-xs">
                <FileText className="w-7 h-7" />
              </div>
              <span className="text-[11px] font-extrabold tracking-wider text-red-600 bg-red-100/80 px-2.5 py-0.5 rounded-full uppercase">
                PDF DOCUMENT
              </span>
            </div>
          ) : isDrive ? (
            <div className="flex flex-col items-center justify-center p-6 text-emerald-600 space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center shadow-xs">
                <HardDrive className="w-7 h-7" />
              </div>
              <span className="text-[11px] font-extrabold tracking-wider text-emerald-700 bg-emerald-100/80 px-2.5 py-0.5 rounded-full uppercase">
                GOOGLE DRIVE
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-6 text-blue-500 space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center shadow-xs">
                <ImageIcon className="w-7 h-7" />
              </div>
              <span className="text-[11px] font-extrabold tracking-wider text-blue-600 bg-blue-100/80 px-2.5 py-0.5 rounded-full uppercase">
                IMAGE FILE
              </span>
            </div>
          )}

          {/* Badges Overlay */}
          <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5 z-10">
            <span className="px-2.5 py-1 rounded-xl text-[10px] font-extrabold bg-white/90 backdrop-blur-md text-slate-800 shadow-xs border border-white">
              {gradeLabel(submission.gradeLevel)}
            </span>
          </div>

          <div className="absolute bottom-2.5 right-2.5 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <span className="p-2 rounded-xl bg-white/90 backdrop-blur-md text-blue-600 shadow-md block">
              <ExternalLink className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>

        {/* Project Title */}
        <div className="space-y-1">
          <h3 className="font-extrabold text-sm text-slate-900 leading-snug line-clamp-2 group-hover:text-blue-600 transition-colors">
            {displayWorkTitle(submission.projectTitle)}
          </h3>
        </div>
      </div>

      {/* Author & School Metadata */}
      <div className="pt-3 border-t border-slate-100 space-y-1 text-xs text-slate-600 font-semibold">
        <div className="flex items-center gap-1.5 text-slate-900 font-bold truncate">
          <span className="w-5 h-5 rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-gradient-to-br from-pink-200 via-purple-200 to-blue-200 border border-white shadow-2xs">
            {avatarUrl && !avatarError ? (
              <img
                src={avatarUrl}
                alt=""
                loading="lazy"
                className="w-full h-full object-cover"
                onError={() => setAvatarError(true)}
              />
            ) : (
              <Smile className="w-3 h-3 text-purple-500" />
            )}
          </span>
          <span className="truncate">{submission.fullName}</span>
        </div>

        <div className="text-[11px] font-semibold text-slate-500 truncate">{submission.position || "-"}</div>
        <div className="text-[11px] text-slate-400">วันที่ส่ง {submission.uploadDate ? submission.uploadDate.split(" ")[0] : "-"}</div>
      </div>
    </div>
  );
}
