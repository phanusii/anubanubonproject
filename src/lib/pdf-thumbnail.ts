"use client";

/**
 * Renders page 1 of a PDF File or ArrayBuffer onto an HTML Canvas and returns Data URL thumbnail
 */
export async function generatePdfThumbnail(file: File): Promise<string> {
  return new Promise((resolve) => {
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const typedarray = new Uint8Array(e.target?.result as ArrayBuffer);
          
          // Import pdfjs dynamically client-side
          const pdfjsLib = await import("pdfjs-dist");
          // Serve the worker locally (bundled into /public) instead of an external CDN,
          // so thumbnail generation does not depend on unpkg availability.
          pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

          const loadingTask = pdfjsLib.getDocument({ data: typedarray });
          const pdf = await loadingTask.promise;
          const page = await pdf.getPage(1);

          // Downscale so the stored thumbnail stays small (target ~600px wide).
          const baseViewport = page.getViewport({ scale: 1.0 });
          const MAX_THUMB_WIDTH = 600;
          const scale = Math.min(1.0, MAX_THUMB_WIDTH / baseViewport.width);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");

          if (!context) {
            resolve("");
            return;
          }

          canvas.height = viewport.height;
          canvas.width = viewport.width;

          const renderContext: any = {
            canvasContext: context,
            viewport: viewport,
            canvas: canvas,
          };

          await page.render(renderContext).promise;
          const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
          resolve(dataUrl);
        } catch (err) {
          console.warn("Failed to render PDF thumbnail with pdfjs:", err);
          resolve("");
        }
      };
      reader.onerror = () => resolve("");
      reader.readAsArrayBuffer(file);
    } catch (err) {
      console.warn("Error reading PDF file:", err);
      resolve("");
    }
  });
}
