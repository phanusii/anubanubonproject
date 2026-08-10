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

/** Compact subject label for dense admin tables without changing stored values. */
export function shortSubject(name: string): string {
  return (name || "")
    .replace(/^กลุ่มสาระการเรียนรู้/, "")
    .replace(/^กลุ่มสาระ/, "")
    .trim();
}

/** Hide the file-format hint from work titles without changing stored slot names. */
export function displayWorkTitle(name: string): string {
  return (name || "").replace(/\s*\(\s*ไฟล์\s*PDF\s*\)\s*$/i, "").trim();
}

/** Compact Thai date for dense cards, e.g. 2026-08-10 → 10 ส.ค. 69. */
export function shortThaiDate(value?: string): string {
  if (!value) return "-";
  const match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return value.split(" ")[0];
  const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const year = Number(match[1]);
  const buddhistYear = year < 2400 ? year + 543 : year;
  return `${Number(match[3])} ${months[Number(match[2]) - 1]} ${String(buddhistYear).slice(-2)}`;
}

/** Budget year with transparent support for legacy academicYear documents. */
export function budgetYearOf(value?: { budgetYear?: string; academicYear?: string }): string {
  return value?.budgetYear || value?.academicYear || "-";
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
