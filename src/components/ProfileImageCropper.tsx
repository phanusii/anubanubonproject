"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";

type Props = {
  file: File;
  onCancel: () => void;
  onCrop: (file: File, previewUrl: string) => void;
};

export default function ProfileImageCropper({ file, onCancel, onCrop }: Props) {
  const source = useMemo(() => URL.createObjectURL(file), [file]);
  const [zoom, setZoom] = useState(1);
  const [x, setX] = useState(50);
  const [y, setY] = useState(50);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    return () => URL.revokeObjectURL(source);
  }, [source]);

  const crop = () => {
    const image = imageRef.current;
    if (!image?.naturalWidth || !image.naturalHeight) return;
    // Avatars are displayed at small sizes; 384px keeps them sharp on retina
    // screens while substantially reducing Drive usage and download time.
    const size = 384;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) return;

    const baseScale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
    const scale = baseScale * zoom;
    const drawnWidth = image.naturalWidth * scale;
    const drawnHeight = image.naturalHeight * scale;
    const overflowX = Math.max(0, drawnWidth - size);
    const overflowY = Math.max(0, drawnHeight - size);
    const drawX = -(overflowX * x) / 100;
    const drawY = -(overflowY * y) / 100;
    context.drawImage(image, drawX, drawY, drawnWidth, drawnHeight);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const output = new File([blob], `profile-${Date.now()}.jpg`, { type: "image/jpeg" });
      onCrop(output, URL.createObjectURL(blob));
    }, "image/jpeg", 0.82);
  };

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/60 backdrop-blur-sm p-4 flex items-center justify-center">
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div><h3 className="font-extrabold text-slate-900">ครอปรูปประจำตัว</h3><p className="text-xs text-slate-500">ปรับตำแหน่งและขยายรูป ระบบจะย่อไฟล์ให้อัตโนมัติ</p></div>
          <button type="button" onClick={onCancel} className="p-2 rounded-xl hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="mx-auto w-64 h-64 max-w-full overflow-hidden rounded-full bg-slate-100 ring-4 ring-blue-100 relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img ref={imageRef} src={source} alt="ตัวอย่างรูปที่ครอป" className="w-full h-full" style={{ objectFit: "cover", objectPosition: `${x}% ${y}%`, transform: `scale(${zoom})` }} />
          </div>
          <label className="block text-xs font-bold text-slate-700">ขยายรูป<input type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} className="w-full mt-2 accent-blue-600" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-bold text-slate-700">ซ้าย–ขวา<input type="range" min="0" max="100" value={x} onChange={(event) => setX(Number(event.target.value))} className="w-full mt-2 accent-blue-600" /></label>
            <label className="text-xs font-bold text-slate-700">บน–ล่าง<input type="range" min="0" max="100" value={y} onChange={(event) => setY(Number(event.target.value))} className="w-full mt-2 accent-blue-600" /></label>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button type="button" onClick={() => { setZoom(1); setX(50); setY(50); }} className="flex-1 px-4 py-3 rounded-xl border font-bold text-sm flex items-center justify-center gap-2"><RotateCcw className="w-4 h-4" />เริ่มใหม่</button>
            <button type="button" onClick={crop} className="flex-1 px-4 py-3 rounded-xl bg-blue-600 text-white font-extrabold text-sm flex items-center justify-center gap-2"><Check className="w-4 h-4" />ใช้รูปนี้</button>
          </div>
        </div>
      </div>
    </div>
  );
}
