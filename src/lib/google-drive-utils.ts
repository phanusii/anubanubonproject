/**
 * Google Drive URL parsing & preview helper
 */

export function isGoogleDriveLink(url?: string): boolean {
  if (!url || typeof url !== "string") return false;
  return url.includes("drive.google.com") || url.includes("docs.google.com");
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
