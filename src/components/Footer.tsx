"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { getTrainingSettings } from "@/lib/submission-service";
import { TrainingSettings } from "@/lib/types";
import { Building, Sparkles } from "lucide-react";

export default function Footer() {
  const [settings, setSettings] = useState<TrainingSettings | null>(null);

  useEffect(() => {
    async function loadSettings() {
      const s = await getTrainingSettings();
      setSettings(s);
    }
    loadSettings();
  }, []);

  return (
    <footer className="glass-panel border-t border-white/80 bg-white/70 backdrop-blur-md py-6 mt-12 text-slate-600 text-xs font-semibold">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {settings?.schoolLogoUrl ? (
            <div className="w-7 h-7 rounded-full overflow-hidden border border-slate-200 bg-white shrink-0 p-0.5">
              <Image
                src={settings.schoolLogoUrl}
                alt="School Logo"
                width={28}
                height={28}
                className="w-full h-full object-cover rounded-full"
              />
            </div>
          ) : (
            <div className="w-7 h-7 rounded-full ios-gradient-blue flex items-center justify-center text-white shrink-0">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
          )}
          <span>{settings?.schoolName || "โรงเรียนอนุบาลอุบลราชธานี"} &copy; {new Date().getFullYear()}</span>
        </div>

        <div className="flex items-center gap-1.5 text-slate-500">
          <Building className="w-3.5 h-3.5 text-blue-500" />
          <span>{settings?.educationalArea || "สำนักงานเขตพื้นที่การศึกษาประถมศึกษาอุบลราชธานี เขต 1"}</span>
        </div>
      </div>
    </footer>
  );
}
