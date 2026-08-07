// Categories that are not teaching "สายชั้น" and shouldn't get the "ครูสายชั้น" prefix.
const NON_HOMEROOM = ["ผู้บริหาร", "ผู้บริหารสถานศึกษา"];

/**
 * Display label for a grade level. Teaching lines read "ครูสายชั้นป.1",
 * but administrator lines just read "ผู้บริหาร".
 */
export function gradeLabel(name: string): string {
  if (!name) return "";
  if (NON_HOMEROOM.includes(name.trim())) return name;
  return `ครูสายชั้น ${name}`;
}

/** Submit verb by round kind: training → "ส่งงาน", project (default) → "ส่งผลงาน". */
export function submitVerb(kind?: string): string {
  return kind === "training" ? "ส่งงาน" : "ส่งผลงาน";
}

/** Noun for a submitted item: training → "งาน", project (default) → "ผลงาน". */
export function workNoun(kind?: string): string {
  return kind === "training" ? "งาน" : "ผลงาน";
}

/**
 * Canonical sort rank for a grade line, used everywhere so ordering is consistent:
 * ผู้บริหาร → อนุบาล (อ.1–3) → ประถม (ป.1–6) → มัธยม → AP → EP → อื่นๆ.
 */
export function gradeOrder(name: string): number {
  const n = (name || "").trim();
  if (n.includes("บริหาร")) return 0;
  const anuban = n.match(/อ\.?\s*([1-3])/);
  if (anuban) return 10 + parseInt(anuban[1], 10);
  const prathom = n.match(/ป\.?\s*([1-6])/);
  if (prathom) return 20 + parseInt(prathom[1], 10);
  const matthayom = n.match(/ม\.?\s*([1-6])/);
  if (matthayom) return 30 + parseInt(matthayom[1], 10);
  if (/\bAP\b|Advance|เอพี|ห้องเรียนพิเศษ/i.test(n)) return 40;
  if (/\bEP\b|English|อีพี/i.test(n)) return 41;
  return 50;
}

/** Sort a list of grade-level options in place-safe (copy) canonical order. */
export function sortGrades<T extends { name: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => gradeOrder(a.name) - gradeOrder(b.name));
}
