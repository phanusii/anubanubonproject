"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SubmitSection from "@/components/sections/SubmitSection";
import GallerySection from "@/components/sections/GallerySection";
import PersonWorksView from "@/components/sections/PersonWorksView";
import StatsSection from "@/components/sections/StatsSection";

type View = "gallery" | "submit" | "person" | "stats";

function parseHash(): { view: View; param: string } {
  if (typeof window === "undefined") return { view: "gallery", param: "" };
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw) return { view: "gallery", param: "" };
  const slash = raw.indexOf("/");
  const head = slash >= 0 ? raw.slice(0, slash) : raw;
  const rest = slash >= 0 ? raw.slice(slash + 1) : "";
  if (head === "submit") return { view: "submit", param: "" };
  if (head === "stats") return { view: "stats", param: "" };
  if (head === "person") return { view: "person", param: decodeURIComponent(rest) };
  // "gallery", "home" (legacy), and anything else land on the work gallery.
  return { view: "gallery", param: "" };
}

/**
 * Single-page public shell. The teacher work gallery is the landing view;
 * submit / person / stats are swapped client-side via the URL hash — no full
 * page reload. Admin (/admin/*) stays on its own separate routes.
 */
export default function PublicShell() {
  const [{ view, param }, setState] = useState<{ view: View; param: string }>({
    view: "gallery",
    param: "",
  });

  useEffect(() => {
    const update = () => {
      setState(parseHash());
      window.scrollTo({ top: 0, behavior: "auto" });
    };
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  const openPerson = (name: string) => {
    window.location.hash = "person/" + encodeURIComponent(name);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex-1 w-full flex flex-col">
        {view === "gallery" && <GallerySection onOpenPerson={openPerson} />}
        {view === "submit" && <SubmitSection />}
        {view === "stats" && <StatsSection />}
        {view === "person" && <PersonWorksView name={param} />}
      </div>
      <Footer />
    </div>
  );
}
