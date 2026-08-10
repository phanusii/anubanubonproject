"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

const ADMIN_EMAIL = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || "phanu9818@anubanubon.ac.th").toLowerCase();

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/admin/login";
  const [ready, setReady] = useState(isLogin);

  useEffect(() => onAuthStateChanged(auth, (user) => {
    const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL;
    if (!isLogin && !isAdmin) {
      router.replace("/admin/login");
      return;
    }
    if (isLogin && isAdmin) {
      router.replace("/admin/dashboard");
      return;
    }
    setReady(true);
  }), [isLogin, router]);

  if (!ready) return null;
  return children;
}
