"use client";

export interface PdfCompressionResult {
  file: File;
  processed: boolean;
  compressed: boolean;
}

/**
 * Rewrites every PDF with compressed object streams without rasterising pages.
 * Page dimensions, vectors, text and embedded-image resolution remain intact.
 * If an already-optimised PDF becomes larger, the smaller original is kept.
 */
export async function compressPdf(file: File): Promise<PdfCompressionResult> {
  try {
    const { PDFDocument } = await import("pdf-lib");
    const pdf = await PDFDocument.load(await file.arrayBuffer());
    const bytes = await pdf.save({
      useObjectStreams: true,
      addDefaultPage: false,
      updateFieldAppearances: false,
    });

    if (bytes.byteLength >= file.size) {
      return { file, processed: true, compressed: false };
    }

    return {
      file: new File([bytes as BlobPart], file.name, {
        type: "application/pdf",
        lastModified: Date.now(),
      }),
      processed: true,
      compressed: true,
    };
  } catch (error) {
    console.warn("PDF lossless compression skipped:", error);
    return { file, processed: false, compressed: false };
  }
}
