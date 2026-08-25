"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SubmitSection from "@/components/sections/SubmitSection";
import GallerySection from "@/components/sections/GallerySection";
import PersonWorksView from "@/components/sections/PersonWorksView";
import StatsSection from "@/components/sections/StatsSection";

type View = "gallery" | "submit" | "person" | "stats";

function parseHash(): { view: View; param: string; grade: string } {
  if (typeof window === "undefined") return { view: "gallery", param: "", grade: "" };
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw) return { view: "gallery", param: "", grade: "" };
  const slash = raw.indexOf("/");
  const head = slash >= 0 ? raw.slice(0, slash) : raw;
  const rest = slash >= 0 ? raw.slice(slash + 1) : "";
  if (head === "submit") return { view: "submit", param: "", grade: "" };
  if (head === "stats") return { view: "stats", param: "", grade: "" };
  if (head === "person") {
    // person/<name>/<grade> — name and grade are each encodeURIComponent'd, so
    // splitting on "/" is safe even when a value contains its own slashes.
    const parts = rest.split("/");
    return {
      view: "person",
      param: decodeURIComponent(parts[0] || ""),
      grade: parts[1] ? decodeURIComponent(parts[1]) : "",
    };
  }
  // "gallery", "home" (legacy), and anything else land on the work gallery.
  return { view: "gallery", param: "", grade: "" };
}

/**
 * Single-page public shell. The teacher work gallery is the landing view;
 * submit / person / stats are swapped client-side via the URL hash — no full
 * page reload. Admin (/admin/*) stays on its own separate routes.
 */
export default function PublicShell() {
  const [{ view, param, grade }, setState] = useState<{ view: View; param: string; grade: string }>({
    view: "gallery",
    param: "",
    grade: "",
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

  const openPerson = (name: string, personGrade: string) => {
    window.location.hash = "person/" + encodeURIComponent(name) + "/" + encodeURIComponent(personGrade || "");
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex-1 w-full flex flex-col">
        {view === "gallery" && <GallerySection onOpenPerson={openPerson} />}
        {view === "submit" && <SubmitSection />}
        {view === "stats" && <StatsSection />}
        {view === "person" && <PersonWorksView name={param} grade={grade} />}
      </div>
      <Footer />
    </div>
  );
}
