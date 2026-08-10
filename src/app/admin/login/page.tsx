"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { auth } from "@/lib/firebase";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { ShieldCheck, Lock, Mail, AlertCircle, ArrowRight } from "lucide-react";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setLoading(true);

    try {
      // Authenticate strictly against Firebase Auth. No client-side password fallback.
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const adminEmail = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || "18403p@gmail.com").toLowerCase();
      if (credential.user.email?.toLowerCase() !== adminEmail) {
        await signOut(auth);
        throw new Error("User is not an administrator");
      }
      router.replace("/admin/dashboard");
    } catch (err) {
      console.warn("Admin login failed:", err);
      setErrorMessage("อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือบัญชีนี้ยังไม่มีสิทธิ์ผู้ดูแลระบบ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md glass-panel p-8 rounded-3xl border border-white shadow-xl space-y-6 bg-white">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 mx-auto rounded-2xl ios-gradient-blue text-white flex items-center justify-center shadow-lg shadow-blue-500/30">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900">
              เข้าสู่ระบบ Admin
            </h1>
            <p className="text-xs font-semibold text-slate-500">
              ระบบผู้ดูแลจัดการการอบรมและการส่งผลงาน โรงเรียนอนุบาลอุบลราชธานี
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                อีเมล Admin
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                <input
                  type="email"
                  required
                  placeholder="อีเมลผู้ดูแลระบบ"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50/50 text-slate-900 text-sm font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                รหัสผ่าน
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                <input
                  type="password"
                  required
                  placeholder="รหัสผ่าน"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50/50 text-slate-900 text-sm font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-2xl bg-red-50 text-red-600 text-xs border border-red-200 flex items-center gap-2 font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-2xl ios-gradient-blue text-white font-extrabold text-sm shadow-md shadow-blue-500/25 transition-all flex items-center justify-center gap-2 hover:scale-[1.02]"
            >
              <span>{loading ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบผู้ดูแล"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="text-center pt-2 border-t border-slate-100">
            <p className="text-[11px] text-slate-500 font-medium">
              เฉพาะผู้ดูแลระบบที่ได้รับสิทธิ์เท่านั้น หากลืมรหัสผ่านโปรดติดต่อผู้ดูแลระบบหลัก
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
