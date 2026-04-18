"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pdfToImage } from "@/lib/pdfToImage";
import PdfPagePicker from "./PdfPagePicker";

type MediaDropdownProps = {
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Callback för att importera flera sidor som separata floors */
  onMultiPageImport?: (
    pages: { imageName: string; pageNumber: number }[],
  ) => void;
  /** Begränsa fillistan till dessa filnamn (+ uppladdade). Om undefined visas alla. */
  allowedFiles?: string[];
};

export default function MediaDropdown({
  defaultValue,
  onChange,
  onMultiPageImport,
  allowedFiles,
}: MediaDropdownProps) {
  const [files, setFiles] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // PDF page picker state
  const [pendingPdf, setPendingPdf] = useState<File | null>(null);

  const fetchFiles = async () => {
    try {
      const res = await fetch("/api/media");
      if (!res.ok) throw new Error("Failed to fetch files");
      const data = await res.json();
      const imageFiles: string[] = data.files.filter((name: string) =>
        /\.(jpe?g|png|pdf)$/i.test(name),
      );
      // Filtrera bort .png-filer som har en matchande .pdf (visa bara ursprungsformatet)
      const pdfBaseNames = new Set(
        imageFiles
          .filter((n: string) => /\.pdf$/i.test(n))
          .map((n: string) => n.replace(/\.pdf$/i, "").toLowerCase()),
      );
      const dedupedFiles = imageFiles.filter((n: string) => {
        if (/\.png$/i.test(n)) {
          const base = n.replace(/\.png$/i, "").toLowerCase();
          return !pdfBaseNames.has(base);
        }
        return true;
      });
      setFiles(dedupedFiles);
      if (defaultValue) {
        if (/\.png$/i.test(defaultValue)) {
          const pdfName = defaultValue.replace(/\.png$/i, ".pdf");
          if (dedupedFiles.includes(pdfName)) {
            setSelected(pdfName);
          } else if (dedupedFiles.includes(defaultValue)) {
            setSelected(defaultValue);
          }
        } else if (dedupedFiles.includes(defaultValue)) {
          setSelected(defaultValue);
        }
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  useEffect(() => {
    if (defaultValue) {
      if (/\.png$/i.test(defaultValue)) {
        const pdfName = defaultValue.replace(/\.png$/i, ".pdf");
        if (files.includes(pdfName)) {
          setSelected(pdfName);
          return;
        }
      }
      setSelected(defaultValue);
    }
  }, [defaultValue, files]);

  const handleSelect = async (value: string) => {
    if (value.toLowerCase().endsWith(".pdf")) {
      setUploading(true);
      setError(null);
      try {
        const res = await fetch(`/media/${value}`);
        const blob = await res.blob();
        const file = new File([blob], value, { type: "application/pdf" });
        const { blob: pngBlob, filename } = await pdfToImage(file);

        const formData = new FormData();
        formData.append(
          "file",
          new File([pngBlob], filename, { type: "image/png" }),
        );
        const uploadRes = await fetch("/api/media", {
          method: "POST",
          body: formData,
        });
        const data = await uploadRes.json();

        if (uploadRes.ok && data.name) {
          await fetchFiles();
          setSelected(data.name);
          onChange?.(data.name);
        } else {
          setError(data.error || "PDF conversion failed");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setError(`PDF conversion failed: ${msg}`);
      } finally {
        setUploading(false);
      }
      return;
    }

    requestAnimationFrame(() => {
      setSelected(value);
      onChange?.(value);
    });
  };

  /** Konvertera och ladda upp valda PDF-sidor */
  const handlePdfPagesConfirm = useCallback(
    async (pages: number[]) => {
      const pdfFile = pendingPdf;
      setPendingPdf(null);
      if (!pdfFile || pages.length === 0) return;

      setUploading(true);
      setError(null);

      try {
        // Ladda upp original-PDF:en
        const pdfFormData = new FormData();
        pdfFormData.append("file", pdfFile);
        await fetch("/api/media", { method: "POST", body: pdfFormData });

        const imported: { imageName: string; pageNumber: number }[] = [];

        for (const pageNum of pages) {
          const { blob, filename } = await pdfToImage(pdfFile, 2.0, pageNum);
          const formData = new FormData();
          formData.append(
            "file",
            new File([blob], filename, { type: "image/png" }),
          );
          const res = await fetch("/api/media", {
            method: "POST",
            body: formData,
          });
          const data = await res.json();
          if (res.ok && data.name) {
            imported.push({ imageName: data.name, pageNumber: pageNum });
          }
        }

        await fetchFiles();

        if (imported.length > 0) {
          // Om multi-page callback finns och flera sidor valdes, skapa floors
          if (onMultiPageImport && imported.length > 1) {
            onMultiPageImport(imported);
          } else {
            // En sida — välj den som aktiv planritning
            setSelected(imported[0].imageName);
            onChange?.(imported[0].imageName);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setError(`PDF import failed: ${msg}`);
      } finally {
        setUploading(false);
      }
    },
    [pendingPdf, onChange, onMultiPageImport],
  );

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // PDF → visa page picker
    if (
      file.name.toLowerCase().endsWith(".pdf") ||
      file.type === "application/pdf"
    ) {
      setPendingPdf(file);
      e.target.value = "";
      return;
    }

    // Vanlig bild — ladda upp direkt
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/media", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (res.ok && data.name) {
        await fetchFiles();
        handleSelect(data.name);
      } else {
        setError(data.error || "Upload failed");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(`Upload failed: ${msg}`);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  // Filtrera på söktext + begränsa till projektets filer om allowedFiles anges
  const filteredFiles = files.filter((f) => {
    if (allowedFiles) {
      // Visa filen om den matchar allowedFiles (eller dess .pdf-variant)
      const base = f.replace(/\.(png|jpe?g)$/i, "").toLowerCase();
      const match = allowedFiles.some((a) => {
        const aBase = a.replace(/\.(png|jpe?g|pdf)$/i, "").toLowerCase();
        return f === a || base === aBase;
      });
      if (!match) return false;
    }
    return f.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="w-full">
      <DropdownMenu.Root onOpenChange={() => setSearch("")}>
        <DropdownMenu.Trigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between text-base"
          >
            <span className="truncate">{selected || "Select a file..."}</span>
            <span className="ml-auto">▾</span>
          </Button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Content
          sideOffset={5}
          className="z-50 bg-white border rounded shadow-md py-1 min-w-[200px]"
        >
          <div className="px-2 pb-2">
            <Input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-2 py-1 text-sm border rounded"
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          <div className="max-h-[50vh] overflow-y-auto">
            {filteredFiles.map((item) => (
              <DropdownMenu.Item
                key={item}
                className={`flex items-center px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-100 outline-none ${item === selected ? "bg-blue-50 font-medium" : ""}`}
                onSelect={() => handleSelect(item)}
              >
                <span className="w-5 text-blue-600">
                  {item === selected ? "✓" : ""}
                </span>
                <span>{item}</span>
              </DropdownMenu.Item>
            ))}
          </div>

          <DropdownMenu.Separator className="bg-gray-200 h-px my-1" />

          <DropdownMenu.Item
            onSelect={() => fileInputRef.current?.click()}
            className="flex items-center px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-100 outline-none"
          >
            <span className="w-4" />
            <span className="italic">
              {uploading ? "Converting…" : "Upload an image or PDF…"}
            </span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>

      <input
        type="file"
        ref={fileInputRef}
        accept=".png,.jpg,.jpeg,.pdf"
        onChange={handleFileUpload}
        className="hidden"
      />

      {error && <div className="text-red-600 mt-2 text-sm">Error: {error}</div>}

      {/* PDF Page Picker modal */}
      {pendingPdf && (
        <PdfPagePicker
          pdfFile={pendingPdf}
          onConfirm={handlePdfPagesConfirm}
          onCancel={() => setPendingPdf(null)}
        />
      )}
    </div>
  );
}
