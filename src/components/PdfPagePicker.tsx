"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { getPdfPageCount, pdfPageThumbnail } from "@/lib/pdfToImage";

interface PdfPagePickerProps {
  pdfFile: File;
  onConfirm: (selectedPages: number[]) => void;
  onCancel: () => void;
}

/**
 * Modal som visar thumbnails av alla sidor i en PDF.
 * Användaren markerar vilka sidor som ska importeras som våningar.
 */
export default function PdfPagePicker({
  pdfFile,
  onConfirm,
  onCancel,
}: PdfPagePickerProps) {
  const [pageCount, setPageCount] = useState(0);
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  // Ladda sidantal och thumbnails
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const count = await getPdfPageCount(pdfFile);
        if (cancelled) return;
        setPageCount(count);

        // Om bara en sida, importera direkt utan att visa picker
        if (count === 1) {
          onConfirm([1]);
          return;
        }

        // Ladda thumbnails progressivt
        for (let i = 1; i <= count; i++) {
          if (cancelled) return;
          const dataUrl = await pdfPageThumbnail(pdfFile, i, 180);
          if (cancelled) return;
          setThumbnails((prev) => new Map(prev).set(i, dataUrl));
        }
      } catch (err) {
        console.error("Failed to load PDF pages:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [pdfFile, onConfirm]);

  const togglePage = (page: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(page)) {
        next.delete(page);
      } else {
        next.add(page);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    const sorted = Array.from(selected).sort((a, b) => a - b);
    onConfirm(sorted);
  };

  // Visa ingenting medan en-sidors PDF auto-importeras
  if (pageCount === 1) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-md shadow-xl max-w-3xl w-full mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold">Select pages to import</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {pdfFile.name} — {pageCount} pages. Each selected page becomes a
              separate floor.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (selected.size === pageCount) {
                  setSelected(new Set());
                } else {
                  setSelected(
                    new Set(Array.from({ length: pageCount }, (_, i) => i + 1)),
                  );
                }
              }}
            >
              {selected.size === pageCount ? "Deselect all" : "Select all"}
            </Button>
          </div>
        </div>

        {/* Thumbnail-grid med scroll */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && thumbnails.size === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">
              Loading pages...
            </p>
          )}
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((page) => {
              const thumb = thumbnails.get(page);
              const isSelected = selected.has(page);
              return (
                <button
                  key={page}
                  type="button"
                  onClick={() => togglePage(page)}
                  className={`relative rounded-md border-2 overflow-hidden transition-all ${
                    isSelected
                      ? "border-blue-500 ring-2 ring-blue-200"
                      : "border-gray-200 hover:border-gray-400"
                  }`}
                >
                  {thumb ? (
                    <img
                      src={thumb}
                      alt={`Page ${page}`}
                      className="w-full h-auto"
                    />
                  ) : (
                    <div className="w-full aspect-[3/4] bg-gray-100 flex items-center justify-center">
                      <span className="text-xs text-gray-400">Loading...</span>
                    </div>
                  )}
                  {/* Sidnummer */}
                  <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                    {page}
                  </span>
                  {/* Checkmark */}
                  {isSelected && (
                    <span className="absolute top-1 right-1 bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 bg-gray-50 rounded-b-md">
          <span className="text-sm text-gray-600">
            {selected.size} page{selected.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={selected.size === 0}
            >
              Import {selected.size > 0 ? `(${selected.size})` : ""}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
