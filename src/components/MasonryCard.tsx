"use client";

import { useState } from "react";
import { Submission } from "@/lib/types";
import { FileText, Image as ImageIcon, User, School, ExternalLink, HardDrive } from "lucide-react";
import { isGoogleDriveLink } from "@/lib/google-drive-utils";
import { gradeLabel } from "@/lib/format";

interface MasonryCardProps {
  submission: Submission;
  onClick: () => void;
}

export default function MasonryCard({ submission, onClick }: MasonryCardProps) {
  const isPdf = submission.fileType === "pdf";
  const isDrive = submission.fileType === "drive" || isGoogleDriveLink(submission.fileURL);
  const [imgError, setImgError] = useState(false);

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
            <span className="px-2.5 py-1 rounded-xl text-[10px] font-extrabold bg-blue-600/90 backdrop-blur-md text-white shadow-xs">
              {submission.subjectGroup}
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
            {submission.projectTitle}
          </h3>
          {submission.description && (
            <p className="text-xs text-slate-500 line-clamp-2 font-medium">
              {submission.description}
            </p>
          )}
        </div>
      </div>

      {/* Author & School Metadata */}
      <div className="pt-3 border-t border-slate-100 space-y-1 text-xs text-slate-600 font-semibold">
        <div className="flex items-center gap-1.5 text-slate-900 font-bold truncate">
          <User className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span className="truncate">{submission.fullName}</span>
          <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md shrink-0">
            {submission.position}
          </span>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span className="truncate flex items-center gap-1">
            <School className="w-3 h-3 text-slate-400 shrink-0" />
            <span className="truncate">{submission.school}</span>
          </span>
          <span className="shrink-0 text-slate-400">{submission.uploadDate ? submission.uploadDate.split(" ")[0] : ""}</span>
        </div>
      </div>
    </div>
  );
}
