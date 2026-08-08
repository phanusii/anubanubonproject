"use client";

import { useState, useRef } from "react";
import { Upload, FileText, Image as ImageIcon, X, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { generatePdfThumbnail } from "@/lib/pdf-thumbnail";

// Kept at 12 MB until the chunk-aware Apps Script is live; raise to ~300 to allow
// big chunked uploads. Larger files use the Google Drive link fallback for now.
const DIRECT_UPLOAD_MAX_MB = 12;

/**
 * Shrink a raster image before upload: cap the longest side and re-encode as JPEG.
 * Returns the original file if it isn't an image or compression wouldn't help.
 */
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const MAX_DIM = 2000;
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82)
    );
    bitmap.close?.();
    // Keep the original if compression didn't actually shrink it.
    if (!blob || blob.size >= file.size) return file;
    const newName = file.name.replace(/\.(png|jpe?g|webp)$/i, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}

interface FileUploadPreviewProps {
  onFileSelect: (file: File | null, thumbnail: string) => void;
  uploadProgress?: number;
  isUploading?: boolean;
}

export default function FileUploadPreview({
  onFileSelect,
  uploadProgress = 0,
  isUploading = false,
}: FileUploadPreviewProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isGeneratingThumbnail, setIsGeneratingThumbnail] = useState<boolean>(false);
  const [compressionNote, setCompressionNote] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp"];

  const handleFileChange = async (rawFile: File | null) => {
    setErrorMessage("");
    setCompressionNote("");
    if (!rawFile) {
      setSelectedFile(null);
      setPreviewUrl("");
      onFileSelect(null, "");
      return;
    }

    // Check file type first
    const ext = rawFile.name.split(".").pop()?.toLowerCase();
    const isValidExt = ["pdf", "png", "jpg", "jpeg", "webp"].includes(ext || "");
    if (!ALLOWED_TYPES.includes(rawFile.type) && !isValidExt) {
      setErrorMessage("รองรับเฉพาะไฟล์ PDF, PNG, JPG, JPEG และ WEBP เท่านั้น");
      return;
    }

    const isImage = rawFile.type.startsWith("image/") || ["png", "jpg", "jpeg", "webp"].includes(ext || "");

    // Compress images before upload (PDFs can't be compressed in the browser).
    setIsGeneratingThumbnail(true);
    let file = rawFile;
    if (isImage) {
      const compressed = await compressImage(rawFile);
      if (compressed.size < rawFile.size) {
        file = compressed;
        setCompressionNote(
          `บีบอัดรูปแล้ว: ${(rawFile.size / 1048576).toFixed(1)} → ${(file.size / 1048576).toFixed(1)} MB`
        );
      }
    }

    // Direct upload has a size ceiling; larger files must use a Google Drive link.
    if (file.size > DIRECT_UPLOAD_MAX_MB * 1024 * 1024) {
      setIsGeneratingThumbnail(false);
      setSelectedFile(null);
      setPreviewUrl("");
      setCompressionNote("");
      onFileSelect(null, "");
      setErrorMessage(
        `ไฟล์นี้มีขนาด ${(file.size / 1048576).toFixed(1)} MB เกิน ${DIRECT_UPLOAD_MAX_MB} MB ` +
          `สำหรับการอัปโหลดตรง — กรุณาอัปโหลดไฟล์ขึ้น Google Drive ของท่านเอง ` +
          `แล้ววางลิงก์ที่แท็บ “Google Drive” ด้านบนแทน`
      );
      return;
    }

    setSelectedFile(file);

    let thumb = "";
    if (isImage) {
      thumb = URL.createObjectURL(file);
      setPreviewUrl(thumb);
    } else if (file.type === "application/pdf" || ext === "pdf") {
      thumb = await generatePdfThumbnail(file);
      setPreviewUrl(thumb);
    }

    setIsGeneratingThumbnail(false);
    onFileSelect(file, thumb);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const removeFile = () => {
    setSelectedFile(null);
    setPreviewUrl("");
    setErrorMessage("");
    setCompressionNote("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    onFileSelect(null, "");
  };

  return (
    <div className="w-full space-y-3">
      <label className="block text-sm font-semibold text-slate-700">
        อัปโหลดไฟล์ผลงาน <span className="text-red-500">*</span>
      </label>

      {!selectedFile ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-blue-200 hover:border-blue-500 bg-blue-50/40 rounded-3xl p-8 text-center cursor-pointer transition-all duration-200 group shadow-xs"
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            className="hidden"
          />
          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl ios-gradient-blue text-white flex items-center justify-center group-hover:scale-110 transition-transform shadow-md shadow-blue-500/20">
            <Upload className="w-7 h-7" />
          </div>
          <p className="text-sm font-extrabold text-slate-800">
            ลากและวางไฟล์ผลงานที่นี่ หรือ <span className="text-blue-600 underline">คลิกเพื่อเลือกไฟล์</span>
          </p>
          <p className="text-xs text-slate-500 mt-2 font-medium">
            รองรับ PDF, PNG, JPG, JPEG, WEBP · รูปภาพจะถูกบีบอัดอัตโนมัติ
          </p>
          <p className="text-[11px] text-amber-600 mt-1 font-semibold">
            ไฟล์ใหญ่เกิน {DIRECT_UPLOAD_MAX_MB} MB กรุณาใช้ลิงก์ Google Drive (แท็บด้านบน)
          </p>
        </div>
      ) : (
        <div
          className={`glass-panel p-4 rounded-3xl border space-y-3 bg-white transition-colors ${
            uploadProgress >= 100 ? "border-emerald-300 ring-2 ring-emerald-500/20" : "border-blue-200"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 font-bold">
                {selectedFile.type.includes("pdf") || selectedFile.name.endsWith(".pdf") ? (
                  <FileText className="w-5 h-5" />
                ) : (
                  <ImageIcon className="w-5 h-5" />
                )}
              </div>
              <div className="truncate">
                <p className="text-sm font-bold text-slate-800 truncate">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-slate-500 font-medium">
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                </p>
                {compressionNote && (
                  <p className="text-[11px] text-emerald-600 font-bold">{compressionNote}</p>
                )}
              </div>
            </div>

            {!isUploading && uploadProgress < 100 && (
              <button
                type="button"
                onClick={removeFile}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Preview Image or PDF canvas thumbnail */}
          {isGeneratingThumbnail ? (
            <div className="h-36 rounded-2xl skeleton-loading flex items-center justify-center text-xs text-slate-500 font-medium">
              กำลังสร้างรูปตัวอย่าง (Thumbnail)...
            </div>
          ) : previewUrl ? (
            <div className="relative rounded-2xl overflow-hidden bg-slate-50 max-h-48 flex items-center justify-center border border-slate-200 p-1">
              <img
                src={previewUrl}
                alt="File Preview"
                className="max-h-44 object-contain rounded-xl"
              />

              {/* Uploading spinner overlay */}
              {isUploading && uploadProgress < 100 && (
                <div className="absolute inset-0 bg-slate-900/25 backdrop-blur-[1px] flex items-center justify-center">
                  <Loader2 className="w-9 h-9 text-white animate-spin" />
                </div>
              )}

              {/* Success check overlay */}
              {uploadProgress >= 100 && (
                <div className="absolute inset-0 bg-emerald-500/15 flex items-center justify-center animate-in fade-in zoom-in-95">
                  <span className="p-2.5 rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/40">
                    <CheckCircle2 className="w-8 h-8" />
                  </span>
                </div>
              )}
            </div>
          ) : null}

          {/* Upload status: stage-aware progress + success */}
          {(isUploading || uploadProgress >= 100) && (
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between items-center text-xs font-bold">
                <span
                  className={`flex items-center gap-1.5 ${
                    uploadProgress >= 100 ? "text-emerald-600" : "text-slate-600"
                  }`}
                >
                  {uploadProgress >= 100 ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>อัปโหลดสำเร็จ พร้อมส่งแล้ว!</span>
                    </>
                  ) : uploadProgress < 20 ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>กำลังเตรียมไฟล์...</span>
                    </>
                  ) : uploadProgress < 85 ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>กำลังอัปโหลด...</span>
                    </>
                  ) : (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>กำลังบันทึกลง Google Drive...</span>
                    </>
                  )}
                </span>
                <span className={uploadProgress >= 100 ? "text-emerald-600" : "text-slate-600"}>
                  {uploadProgress}%
                </span>
              </div>
              <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 rounded-full ${
                    uploadProgress >= 100 ? "bg-emerald-500" : "ios-gradient-blue"
                  }`}
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>

              {/* Large files take a while over Google Drive — reassure, don't look frozen. */}
              {isUploading && uploadProgress >= 85 && uploadProgress < 100 && (
                <p className="text-[11px] text-amber-600 font-semibold flex items-start gap-1 pt-0.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    ไฟล์ขนาดใหญ่กำลังบันทึกลง Google Drive อาจใช้เวลาถึง 1–2 นาที
                    กรุณาอย่าปิดหรือรีเฟรชหน้านี้จนกว่าจะเสร็จ
                  </span>
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-2 p-3 rounded-2xl bg-red-50 text-red-600 text-sm border border-red-200 font-semibold">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}
