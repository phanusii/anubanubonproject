"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SubmitSection from "@/components/sections/SubmitSection";
import GallerySection from "@/components/sections/GallerySection";
import PersonWorksView from "@/components/sections/PersonWorksView";
import StatsSection from "@/components/sections/StatsSection";

type View = "gallery" | "submit" | "person" | "stats";

type PersonField = "grade" | "subject";

function parseHash(): { view: View; param: string; field: PersonField; value: string } {
  const base = { view: "gallery" as View, param: "", field: "grade" as PersonField, value: "" };
  if (typeof window === "undefined") return base;
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw) return base;
  const slash = raw.indexOf("/");
  const head = slash >= 0 ? raw.slice(0, slash) : raw;
  const rest = slash >= 0 ? raw.slice(slash + 1) : "";
  if (head === "submit") return { ...base, view: "submit" };
  if (head === "stats") return { ...base, view: "stats" };
  if (head === "person") {
    // person/<name>/<field>/<value> — each part is encodeURIComponent'd, so
    // splitting on "/" is safe even when a value contains its own slashes.
    // Legacy form person/<name>/<grade> (no field keyword) still resolves to a
    // grade filter for backward-compatible links.
    const parts = rest.split("/");
    const name = decodeURIComponent(parts[0] || "");
    if (parts[1] === "grade" || parts[1] === "subject") {
      return { ...base, view: "person", param: name, field: parts[1], value: parts[2] ? decodeURIComponent(parts[2]) : "" };
    }
    return { ...base, view: "person", param: name, field: "grade", value: parts[1] ? decodeURIComponent(parts[1]) : "" };
  }
  // "gallery", "home" (legacy), and anything else land on the work gallery.
  return base;
}

/**
 * Single-page public shell. The teacher work gallery is the landing view;
 * submit / person / stats are swapped client-side via the URL hash — no full
 * page reload. Admin (/admin/*) stays on its own separate routes.
 */
export default function PublicShell() {
  const [{ view, param, field, value }, setState] = useState<{ view: View; param: string; field: PersonField; value: string }>({
    view: "gallery",
    param: "",
    field: "grade",
    value: "",
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

  const openPerson = (name: string, personField: PersonField, personValue: string) => {
    window.location.hash =
      "person/" + encodeURIComponent(name) + "/" + personField + "/" + encodeURIComponent(personValue || "");
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex-1 w-full flex flex-col">
        {view === "gallery" && <GallerySection onOpenPerson={openPerson} />}
        {view === "submit" && <SubmitSection />}
        {view === "stats" && <StatsSection />}
        {view === "person" && <PersonWorksView name={param} field={field} value={value} />}
      </div>
      <Footer />
    </div>
  );
}
