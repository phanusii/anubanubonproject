"use client";

import { useState } from "react";
import { Submission } from "@/lib/types";
import { X, Download, User, Building, MapPin, Tag, BookOpen, Calendar, ExternalLink, ZoomIn, HardDrive } from "lucide-react";
import { extractGoogleDriveFileId, getGoogleDrivePreviewUrl, getGoogleDriveDownloadUrl } from "@/lib/google-drive-utils";
import { gradeLabel } from "@/lib/format";

interface SubmissionModalProps {
  submission: Submission | null;
  onClose: () => void;
}

export default function SubmissionModal({ submission, onClose }: SubmissionModalProps) {
  const [zoomImage, setZoomImage] = useState(false);

  if (!submission) return null;

  const isDrive = submission.fileType === "drive" || submission.submissionMethod === "drive" || !!submission.driveLink;
  const driveId = submission.driveFileId || (isDrive ? extractGoogleDriveFileId(submission.fileURL) : null);

  const isPdf = !isDrive && (submission.fileType === "pdf" || submission.fileURL.endsWith(".pdf"));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl max-h-[90vh] glass-panel rounded-3xl shadow-2xl border border-white flex flex-col overflow-hidden bg-white">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white/80">
          <div className="flex items-center gap-2 max-w-xl truncate">
            {isDrive && (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 flex items-center gap-1 shrink-0">
                <HardDrive className="w-3 h-3" />
                <span>Google Drive</span>
              </span>
            )}
            <h2 className="font-extrabold text-lg text-slate-900 truncate">
              {submission.projectTitle}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={isDrive && driveId ? getGoogleDriveDownloadUrl(driveId, submission.fileURL) : submission.fileURL}
              target="_blank"
              rel="noopener noreferrer"
              download={!isDrive}
              className="flex items-center gap-2 px-4 py-2 rounded-xl ios-gradient-blue text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all"
            >
              {isDrive ? <ExternalLink className="w-4 h-4" /> : <Download className="w-4 h-4" />}
              <span>{isDrive ? "เปิดใน Google Drive" : "ดาวน์โหลด"}</span>
            </a>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body Grid */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-12 gap-0">
          {/* File / Drive Preview (Left Col - Light Clean Background) */}
          <div className="md:col-span-7 bg-slate-100/90 border-r border-slate-200/60 p-4 flex flex-col items-center justify-center min-h-[350px]">
            {isDrive && driveId ? (
              <div className="w-full h-full min-h-[450px] flex flex-col items-center justify-center">
                <iframe
                  src={getGoogleDrivePreviewUrl(driveId)}
                  className="w-full h-[450px] rounded-2xl border border-slate-200/80 bg-white shadow-sm"
                  title="Google Drive Preview"
                />
                <a
                  href={submission.fileURL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 flex items-center gap-2 text-xs font-bold text-emerald-600 hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>เปิดไฟล์นี้โดยตรงบน Google Drive</span>
                </a>
              </div>
            ) : isPdf ? (
              <div className="w-full flex flex-col">
                {/* Native scrollable PDF viewer (page navigation, zoom, scroll) */}
                <iframe
                  src={submission.fileURL}
                  className="w-full h-[72vh] min-h-[420px] rounded-2xl border border-slate-200/80 bg-white shadow-sm"
                  title="PDF Preview"
                />
                <a
                  href={submission.fileURL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 self-center flex items-center gap-2 text-xs font-bold text-blue-600 hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>เปิด PDF เต็มหน้าจอ (ถ้าเลื่อนดูในนี้ไม่ได้ เช่นบนมือถือ)</span>
                </a>
              </div>
            ) : (
              <div className="relative w-full h-full flex flex-col items-center justify-center group">
                <img
                  src={submission.fileURL}
                  alt={submission.projectTitle}
                  className={`max-h-[500px] object-contain rounded-2xl border border-slate-200/60 bg-white p-1 shadow-sm transition-transform duration-300 ${
                    zoomImage ? "scale-125 cursor-zoom-out" : "cursor-zoom-in"
                  }`}
                  onClick={() => setZoomImage(!zoomImage)}
                />
                <p className="mt-2 text-[11px] text-slate-500 font-semibold flex items-center gap-1">
                  <ZoomIn className="w-3 h-3" />
                  <span>คลิกรูปเพื่อ {zoomImage ? "ย่อ" : "ขยาย"}</span>
                </p>
              </div>
            )}
          </div>

          {/* Details (Right Col - Clean White) */}
          <div className="md:col-span-5 p-6 bg-white flex flex-col justify-between space-y-6">
            <div className="space-y-5">
              <div>
                <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-600 border border-blue-100 mb-2">
                  ข้อมูลผู้ส่งผลงาน
                </span>
                <h3 className="text-xl font-extrabold text-slate-900">
                  {submission.fullName}
                </h3>
              </div>

              <div className="space-y-3 text-sm text-slate-700">
                <div className="flex items-start gap-3">
                  <User className="w-4 h-4 text-blue-500 mt-1 shrink-0" />
                  <div>
                    <span className="text-xs text-slate-400 block font-semibold">ตำแหน่ง</span>
                    <span className="font-bold text-slate-900">{submission.position || "-"}</span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Tag className="w-4 h-4 text-amber-500 mt-1 shrink-0" />
                  <div>
                    <span className="text-xs text-slate-400 block font-semibold">สายชั้นที่สอน</span>
                    <span className="font-bold text-slate-900">{gradeLabel(submission.gradeLevel)}</span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <BookOpen className="w-4 h-4 text-purple-500 mt-1 shrink-0" />
                  <div>
                    <span className="text-xs text-slate-400 block font-semibold">กลุ่มสาระการเรียนรู้</span>
                    <span className="font-bold text-slate-900">{submission.subjectGroup}</span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Building className="w-4 h-4 text-sky-500 mt-1 shrink-0" />
                  <div>
                    <span className="text-xs text-slate-400 block font-semibold">โรงเรียน / หน่วยงาน</span>
                    <span className="font-bold text-slate-900">{submission.school}</span>
                  </div>
                </div>

                {submission.province && (
                  <div className="flex items-start gap-3">
                    <MapPin className="w-4 h-4 text-emerald-500 mt-1 shrink-0" />
                    <div>
                      <span className="text-xs text-slate-400 block font-semibold">จังหวัด</span>
                      <span className="font-medium text-slate-800">{submission.province}</span>
                    </div>
                  </div>
                )}
              </div>

              {submission.description && (
                <div className="pt-3 border-t border-slate-100">
                  <span className="text-xs text-slate-400 block mb-1 font-semibold">รายละเอียดผลงาน</span>
                  <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                    {submission.description}
                  </p>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400 font-semibold">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>วันที่ส่ง: {submission.uploadDate}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
