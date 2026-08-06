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
