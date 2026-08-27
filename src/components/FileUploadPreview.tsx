"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { Upload, FileText, Image as ImageIcon, X, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { generatePdfThumbnail } from "@/lib/pdf-thumbnail";
import { compressPdf } from "@/lib/pdf-compression";

// Large files upload in chunks (resumable) so the ceiling is high; only truly huge
// files need the Google Drive link fallback.
const DIRECT_UPLOAD_MAX_MB = 30;

interface ImageCompressionResult {
  file: File;
  processed: boolean;
  compressed: boolean;
  width?: number;
  height?: number;
}

/** Re-encode every raster image without changing its pixel dimensions. WebP
 * keeps transparency and usually reduces PNG/JPEG uploads substantially. */
async function compressImage(file: File): Promise<ImageCompressionResult> {
  try {
    const bitmap = await createImageBitmap(file);
    const width = bitmap.width;
    const height = bitmap.height;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return { file, processed: false, compressed: false, width, height };
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.88)
    );
    bitmap.close?.();
    // The file was still processed; keep whichever representation consumes
    // less Storage and transfer quota.
    if (!blob || blob.size >= file.size) {
      return { file, processed: true, compressed: false, width, height };
    }
    const newName = file.name.replace(/\.(png|jpe?g|webp)$/i, "") + ".webp";
    return {
      file: new File([blob], newName, { type: "image/webp", lastModified: Date.now() }),
      processed: true,
      compressed: true,
      width,
      height,
    };
  } catch (error) {
    console.warn("Image compression skipped:", error);
    return { file, processed: false, compressed: false };
  }
}

interface FileUploadPreviewProps {
  onFileSelect: (file: File | null, thumbnail: string) => void;
  onProcessingChange?: (processing: boolean) => void;
  uploadProgress?: number;
  isUploading?: boolean;
}

export default function FileUploadPreview({
  onFileSelect,
  onProcessingChange,
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
      onProcessingChange?.(false);
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
    const isPdf = rawFile.type === "application/pdf" || ext === "pdf";

    // Every supported file passes through compression, regardless of size.
    // The original is retained only when it is already the smaller file.
    onProcessingChange?.(true);
    setIsGeneratingThumbnail(true);
    let file = rawFile;
    if (isImage) {
      const result = await compressImage(rawFile);
      file = result.file;
      const dimensions = result.width && result.height ? ` · ${result.width}×${result.height} px เท่าเดิม` : "";
      if (result.compressed) {
        setCompressionNote(
          `บีบอัดรูปแล้ว: ${(rawFile.size / 1048576).toFixed(2)} → ${(file.size / 1048576).toFixed(2)} MB${dimensions}`
        );
      } else if (result.processed) {
        setCompressionNote(`ตรวจและบีบอัดรูปแล้ว${dimensions} · ไฟล์ต้นฉบับเล็กกว่า จึงใช้ไฟล์เดิม`);
      } else {
        setCompressionNote("ไม่สามารถบีบอัดรูปนี้ได้ จึงใช้ไฟล์ต้นฉบับโดยไม่ลดความละเอียด");
      }
    } else if (isPdf) {
      const result = await compressPdf(rawFile);
      file = result.file;
      if (result.compressed) {
        setCompressionNote(
          `บีบอัด PDF แล้ว: ${(rawFile.size / 1048576).toFixed(2)} → ${(file.size / 1048576).toFixed(2)} MB · ไม่ลดความละเอียด`
        );
      } else if (result.processed) {
        setCompressionNote("ตรวจและบีบอัด PDF แล้ว · ไม่ลดความละเอียด · ไฟล์ต้นฉบับเล็กกว่า จึงใช้ไฟล์เดิม");
      } else {
        setCompressionNote("ไม่สามารถบีบอัด PDF นี้ได้ จึงใช้ไฟล์ต้นฉบับโดยไม่ลดความละเอียด");
      }
    }

    // Direct upload has a size ceiling; larger files must use a Google Drive link.
    if (file.size > DIRECT_UPLOAD_MAX_MB * 1024 * 1024) {
      onProcessingChange?.(false);
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
    } else if (isPdf) {
      thumb = await generatePdfThumbnail(file);
      setPreviewUrl(thumb);
    }

    setIsGeneratingThumbnail(false);
    onFileSelect(file, thumb);
    onProcessingChange?.(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const removeFile = () => {
    onProcessingChange?.(false);
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
            รองรับ PDF, PNG, JPG, JPEG, WEBP · ไฟล์ใหญ่อัปโหลดแบบแบ่งส่วนได้ · PDF และรูปภาพบีบอัดอัตโนมัติ
          </p>
          <p className="text-[11px] text-amber-600 mt-1 font-semibold">
            ไฟล์ใหญ่มาก (เกิน {DIRECT_UPLOAD_MAX_MB} MB) แนะนำใช้ลิงก์ Google Drive (แท็บด้านบน)
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
                {!isGeneratingThumbnail && !isUploading && uploadProgress < 100 && (
                  <p className="text-[11px] text-blue-600 font-extrabold flex items-center gap-1 mt-0.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    ไฟล์พร้อมส่ง — กดปุ่มส่งงานด้านล่างได้เลย
                  </p>
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
              กำลังบีบอัดโดยคงความละเอียดและสร้างรูปตัวอย่าง...
            </div>
          ) : previewUrl ? (
            <div className="relative rounded-2xl overflow-hidden bg-slate-50 max-h-48 flex items-center justify-center border border-slate-200 p-1">
              <Image
                src={previewUrl}
                alt="File Preview"
                width={800}
                height={600}
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
                  ) : uploadProgress < 5 ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>กำลังเตรียมไฟล์...</span>
                    </>
                  ) : uploadProgress < 95 ? (
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

              {/* Large files upload in chunks and take a while — reassure throughout. */}
              {isUploading &&
                uploadProgress < 100 &&
                selectedFile &&
                selectedFile.size > 8 * 1024 * 1024 && (
                  <p className="text-[11px] text-amber-600 font-semibold flex items-start gap-1 pt-0.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      ไฟล์ขนาดใหญ่ ({(selectedFile.size / 1048576).toFixed(0)} MB) อัปโหลดแบบแบ่งส่วน
                      อาจใช้เวลาหลายนาที — แถบ % เดินตามจริง กรุณาอย่าปิดหรือรีเฟรชหน้านี้จนกว่าจะเสร็จ
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
