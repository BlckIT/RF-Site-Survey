"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { pdfToImage } from "@/lib/pdfToImage";

type MediaDropdownProps = {
  defaultValue?: string;
  onChange?: (value: string) => void;
};

export default function MediaDropdown({
  defaultValue,
  onChange,
}: MediaDropdownProps) {
  const [files, setFiles] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchFiles = async () => {
    try {
      const res = await fetch("/api/media");
      if (!res.ok) throw new Error("Failed to fetch files");
      const data = await res.json();
      const imageFiles = data.files.filter((name: string) =>
        /\.(jpe?g|png)$/i.test(name),
      );
      setFiles(imageFiles);
      if (defaultValue && imageFiles.includes(defaultValue)) {
        setSelected(defaultValue);
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
      setSelected(defaultValue);
    }
  }, [defaultValue]);

  const handleSelect = (value: string) => {
    requestAnimationFrame(() => {
      setSelected(value);
      onChange?.(value);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      let uploadFile: File = file;

      // Convert PDF to PNG client-side
      if (file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf") {
        const { blob, filename } = await pdfToImage(file);
        uploadFile = new File([blob], filename, { type: "image/png" });
      }

      const formData = new FormData();
      formData.append("file", uploadFile);

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

  const filteredFiles = files.filter((f) =>
    f.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="w-full">
      <DropdownMenu.Root onOpenChange={() => setSearch("")}>
        <DropdownMenu.Trigger asChild>
          <Button variant="outline" className="w-full justify-between text-base">
            <span className="truncate">{selected || "Select a file..."}</span>
            <span className="ml-auto">▾</span>
          </Button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Content
          sideOffset={5}
          className="z-50 bg-white border rounded shadow-md py-1 min-w-[200px]"
        >
          <div className="px-2 pb-2">
            <input
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
    </div>
  );
}
