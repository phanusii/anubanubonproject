"use client";

const MIN_COMPRESS_BYTES = 1024 * 1024;
const MAX_PAGES_TO_COMPRESS = 60;
const MAX_RENDER_DIMENSION = 1600;
const JPEG_QUALITY = 0.78;
const MIN_SAVING_RATIO = 0.08;

/**
 * Reduces image-heavy PDFs entirely in the browser before upload.
 * The original file is returned whenever compression is unnecessary, unsafe,
 * or does not save at least 8%, so a failed conversion never blocks submission.
 */
export async function compressPdf(file: File): Promise<File> {
  if (file.size < MIN_COMPRESS_BYTES) return file;

  try {
    const [{ PDFDocument }, pdfjsLib] = await Promise.all([
      import("pdf-lib"),
      import("pdfjs-dist"),
    ]);
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

    const source = new Uint8Array(await file.arrayBuffer());
    const loadingTask = pdfjsLib.getDocument({ data: source.slice() });
    const sourcePdf = await loadingTask.promise;

    // Very long documents can consume too much memory on older phones.
    if (sourcePdf.numPages > MAX_PAGES_TO_COMPRESS) {
      await sourcePdf.destroy();
      return file;
    }

    const outputPdf = await PDFDocument.create();

    for (let pageNumber = 1; pageNumber <= sourcePdf.numPages; pageNumber += 1) {
      const page = await sourcePdf.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(
        2,
        MAX_RENDER_DIMENSION / Math.max(baseViewport.width, baseViewport.height)
      );
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Canvas is unavailable");

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport }).promise;

      const jpegBlob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
      );
      if (!jpegBlob) throw new Error("Could not encode PDF page");

      const image = await outputPdf.embedJpg(await jpegBlob.arrayBuffer());
      const outputPage = outputPdf.addPage([baseViewport.width, baseViewport.height]);
      outputPage.drawImage(image, {
        x: 0,
        y: 0,
        width: baseViewport.width,
        height: baseViewport.height,
      });

      page.cleanup();
      canvas.width = 1;
      canvas.height = 1;
    }

    await sourcePdf.destroy();
    const bytes = await outputPdf.save({ useObjectStreams: true });

    // Keep the searchable/vector original unless the size reduction is meaningful.
    if (bytes.byteLength >= file.size * (1 - MIN_SAVING_RATIO)) return file;

    return new File([bytes as BlobPart], file.name, {
      type: "application/pdf",
      lastModified: Date.now(),
    });
  } catch (error) {
    console.warn("PDF compression skipped:", error);
    return file;
  }
}
