/**
 * Google Drive URL parsing & preview helper
 */

export function isGoogleDriveLink(url?: string): boolean {
  if (!url || typeof url !== "string") return false;
  return url.includes("drive.google.com") || url.includes("docs.google.com");
}

/**
 * Ordered list of URLs to try for a teacher's profile picture. A single stored
 * URL (a Drive thumbnail, a googleusercontent link, or a Firebase Storage URL)
 * can fail intermittently — Drive thumbnails get rate-limited and some size
 * variants aren't served — so we fall through the original plus a couple of
 * Drive-id-derived alternates before giving up to the placeholder. `photoFileId`
 * (when known) yields the most reliable alternates.
 */
export function avatarUrlCandidates(url?: string, photoFileId?: string): string[] {
  const out: string[] = [];
  const push = (u?: string | null) => {
    if (u && !out.includes(u)) out.push(u);
  };
  if (url) {
    // A smaller variant of the given URL (cheap for a tiny avatar), then the original.
    push(url.replace(/=w\d+(-h\d+)?$/i, "=w200").replace(/([?&]sz=)w\d+/i, "$1w200"));
    push(url);
  }
  const id = photoFileId || url?.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] || (url ? extractGoogleDriveFileId(url) : null);
  if (id) {
    push(`https://lh3.googleusercontent.com/d/${id}=w200`);
    push(`https://drive.google.com/thumbnail?id=${id}&sz=w200`);
  }
  return out;
}

export function extractGoogleDriveFileId(url: string): string | null {
  if (!url || typeof url !== "string") return null;

  // Patterns:
  // https://drive.google.com/file/d/FILE_ID/view
  // https://drive.google.com/file/d/FILE_ID/edit
  // https://drive.google.com/open?id=FILE_ID
  // https://drive.google.com/uc?id=FILE_ID
  // https://drive.google.com/drive/folders/FOLDER_ID

  const fileDMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileDMatch && fileDMatch[1]) return fileDMatch[1];

  const idParamMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch && idParamMatch[1]) return idParamMatch[1];

  const folderMatch = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch && folderMatch[1]) return folderMatch[1];

  return null;
}

export function getGoogleDriveThumbnail(fileId: string): string {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
}

export function getGoogleDrivePreviewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

export function getGoogleDriveDownloadUrl(fileId: string, originalUrl?: string): string {
  if (originalUrl) return originalUrl;
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}
