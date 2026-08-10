"use client";

import { useEffect, useState } from "react";
import { getDriveRevisions, restoreDriveRevision, DriveRevision } from "@/lib/submission-service";
import { X, History, RotateCcw, Loader2, ExternalLink, AlertCircle, CheckCircle2 } from "lucide-react";

interface RevisionModalProps {
  fileId: string;
  title: string;
  fileURL?: string;
  onClose: () => void;
}

function fmtSize(bytes?: number): string {
  if (!bytes) return "-";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function fmtTime(iso?: string): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("th-TH");
  } catch {
    return iso;
  }
}

/** Admin dialog: view a Drive file's version history and restore an older version. */
export default function RevisionModal({ fileId, title, fileURL, onClose }: RevisionModalProps) {
  const [revisions, setRevisions] = useState<DriveRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const revs = await getDriveRevisions(fileId);
      setRevisions(revs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดเวอร์ชันไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Loading is asynchronous; state changes occur after the Drive request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  const handleRestore = async (rev: DriveRevision) => {
    if (!confirm(`กู้คืนเวอร์ชันวันที่ ${fmtTime(rev.modifiedTime)} ให้เป็นไฟล์ปัจจุบัน?\n(เวอร์ชันปัจจุบันจะถูกเก็บไว้ในประวัติ ไม่หายไป)`)) return;
    setRestoringId(rev.id);
    setMessage("");
    setError("");
    try {
      await restoreDriveRevision(fileId, rev.id);
      setMessage("กู้คืนเวอร์ชันเรียบร้อยแล้ว ✓");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "กู้คืนไม่สำเร็จ");
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg max-h-[85vh] glass-panel rounded-3xl shadow-2xl border border-white flex flex-col overflow-hidden bg-white">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white/80">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-9 h-9 rounded-2xl bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
              <History className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-extrabold text-slate-900 truncate">ประวัติเวอร์ชันไฟล์</h2>
              <p className="text-[11px] text-slate-500 font-medium truncate">{title}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {message && (
            <div className="flex items-center gap-2 p-3 rounded-2xl bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{message}</span>
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-2xl bg-red-50 text-red-600 text-xs font-semibold border border-red-200">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center text-sm font-bold text-slate-500 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> กำลังโหลดเวอร์ชัน...
            </div>
          ) : revisions.length === 0 ? (
            <div className="py-12 text-center text-sm font-bold text-slate-500">ไม่พบประวัติเวอร์ชัน</div>
          ) : (
            revisions.map((rev, idx) => {
              const isCurrent = idx === 0;
              return (
                <div
                  key={rev.id}
                  className={`flex items-center justify-between gap-3 p-3 rounded-2xl border ${
                    isCurrent ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-slate-800">
                        {isCurrent ? "เวอร์ชันปัจจุบัน" : `เวอร์ชันที่ ${revisions.length - idx}`}
                      </span>
                      {isCurrent && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                          ล่าสุด
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium">
                      {fmtTime(rev.modifiedTime)} · {fmtSize(rev.size)}
                    </div>
                  </div>
                  {isCurrent ? (
                    <span className="text-[11px] font-bold text-emerald-600 shrink-0">ใช้อยู่</span>
                  ) : (
                    <button
                      onClick={() => handleRestore(rev)}
                      disabled={restoringId !== null}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-500 text-white text-xs font-bold hover:bg-violet-600 disabled:opacity-50 transition-colors shrink-0"
                    >
                      {restoringId === rev.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3.5 h-3.5" />
                      )}
                      <span>กู้คืน</span>
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between">
          <p className="text-[11px] text-slate-400 font-medium">Google Drive เก็บประวัติให้อัตโนมัติ</p>
          {fileURL && (
            <a
              href={fileURL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              เปิดไฟล์
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
