"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { auth } from "@/lib/firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
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

    const targetEmail = "18403p@gmail.com";
    const targetPassword = "1234";

    try {
      // Try Firebase Auth login first
      await signInWithEmailAndPassword(auth, email.trim(), password);
      if (typeof window !== "undefined") {
        localStorage.setItem("admin_session", "active");
      }
      router.push("/admin/dashboard");
    } catch (err: any) {
      console.warn("Firebase Auth login failed, checking passcode fallback:", err);
      // Admin credential check for 18403p@gmail.com / 1234
      if ((email.trim().toLowerCase() === targetEmail || email.trim() === "admin") && password === targetPassword) {
        if (typeof window !== "undefined") {
          localStorage.setItem("admin_session", "active");
        }
        router.push("/admin/dashboard");
      } else {
        setErrorMessage("อีเมลหรือรหัสผ่าน Admin ไม่ถูกต้อง (ใช้อีเมล 18403p@gmail.com / รหัสผ่าน 1234)");
      }
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
                  placeholder="18403p@gmail.com"
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
                  placeholder="1234"
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
              อีเมลสำหรับเข้าสู่ระบบผู้ดูแล: <code className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md font-bold">18403p@gmail.com</code> / รหัสผ่าน: <code className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md font-bold">1234</code>
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
