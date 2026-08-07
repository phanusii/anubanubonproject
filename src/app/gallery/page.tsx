"use client";

import { useEffect } from "react";

/** Legacy route — the gallery now lives in the single-page shell at /#gallery. */
export default function GalleryRedirect() {
  useEffect(() => {
    window.location.replace("/#gallery");
  }, []);
  return null;
}
