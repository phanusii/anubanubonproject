"use client";

import { useEffect } from "react";

/** Legacy route — the submit form now lives in the single-page shell at /#submit. */
export default function SubmitRedirect() {
  useEffect(() => {
    window.location.replace("/#submit");
  }, []);
  return null;
}
