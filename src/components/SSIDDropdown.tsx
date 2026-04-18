import { useState, useRef, useEffect } from "react";
import { GroupedNetwork } from "@/lib/groupNetworks";

/** Band-badges som små inline-taggar */
function BandBadges({ bands }: { bands: ("2.4" | "5")[] }) {
  return (
    <span className="inline-flex gap-1">
      {bands.map((b) => (
        <span
          key={b}
          className={
            b === "2.4"
              ? "bg-blue-100 text-blue-700 text-[10px] leading-tight px-1 py-0.5 rounded"
              : "bg-green-100 text-green-700 text-[10px] leading-tight px-1 py-0.5 rounded"
          }
        >
          {b === "2.4" ? "2.4 GHz" : "5 GHz"}
        </span>
      ))}
    </span>
  );
}

/** Signalstyrka som staplar */
function SignalBars({ strength }: { strength: number }) {
  const bars = Math.ceil(strength / 25);
  return (
    <span
      className="inline-flex gap-0.5 items-end h-3.5"
      title={`${strength}%`}
    >
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`inline-block w-1 rounded-sm ${i <= bars ? "bg-green-500" : "bg-gray-300"}`}
          style={{ height: `${i * 3 + 1}px` }}
        />
      ))}
    </span>
  );
}

interface SSIDDropdownProps {
  value: string;
  onChange: (ssid: string) => void;
  networks: GroupedNetwork[];
  placeholder?: string;
}

/**
 * Custom dropdown för Target SSID som visar band-badges och signalstyrka
 * per nätverk, istället för en native <select>.
 */
export default function SSIDDropdown({
  value,
  onChange,
  networks,
  placeholder = "Connected (auto)",
}: SSIDDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Stäng dropdown vid klick utanför
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Stäng vid Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const selected = networks.find((n) => n.ssid === value);

  return (
    <div className="relative w-full" ref={containerRef}>
      {/* Trigger-knapp som ser ut som ett input-fält */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center gap-2 border border-gray-200 rounded-sm p-1.5 text-sm text-left bg-white hover:bg-gray-50 focus:outline-none focus:ring focus:ring-blue-300 focus:border-blue-400 min-h-[34px]"
      >
        {value && selected ? (
          <>
            <span className="truncate font-medium">{selected.ssid}</span>
            <BandBadges bands={selected.bands} />
            <SignalBars strength={selected.signalStrength} />
          </>
        ) : value && !selected ? (
          <span className="truncate">{value}</span>
        ) : (
          <span className="text-gray-500">{placeholder}</span>
        )}
        <svg
          className="w-3 h-3 ml-auto shrink-0 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Dropdown-lista */}
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {/* Auto-alternativ */}
          <button
            type="button"
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 ${
              !value ? "bg-blue-50 font-medium" : ""
            }`}
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            <span className="text-gray-500">{placeholder}</span>
          </button>

          {networks.map((net) => (
            <button
              key={net.ssid}
              type="button"
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 ${
                value === net.ssid ? "bg-blue-50 font-medium" : ""
              }`}
              onClick={() => {
                onChange(net.ssid);
                setOpen(false);
              }}
            >
              <span className="truncate">{net.ssid}</span>
              <BandBadges bands={net.bands} />
              <SignalBars strength={net.signalStrength} />
            </button>
          ))}

          {networks.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-400">
              No networks found. Click scan to search.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
