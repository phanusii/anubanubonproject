// Categories that are not teaching "สายชั้น" and shouldn't get the "ครูสายชั้น" prefix.
const NON_HOMEROOM = ["ผู้บริหาร", "ผู้บริหารสถานศึกษา"];

/**
 * Display label for a grade level. Teaching lines read "ครูสายชั้นป.1",
 * but administrator lines just read "ผู้บริหาร".
 */
export function gradeLabel(name: string): string {
  if (!name) return "";
  if (NON_HOMEROOM.includes(name.trim())) return name;
  return `ครูสายชั้น${name}`;
}

/** Submit verb by round kind: training → "ส่งงาน", project (default) → "ส่งผลงาน". */
export function submitVerb(kind?: string): string {
  return kind === "training" ? "ส่งงาน" : "ส่งผลงาน";
}

/** Noun for a submitted item: training → "งาน", project (default) → "ผลงาน". */
export function workNoun(kind?: string): string {
  return kind === "training" ? "งาน" : "ผลงาน";
}
