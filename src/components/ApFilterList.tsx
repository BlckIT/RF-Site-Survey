import React, { useMemo } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { SurveyPoint, ApMapping } from "@/lib/types";

interface ApFilterItem {
  bssid: string;
  displayName: string;
  band: number;
  channel: number;
  frequency: number;
  bestSignal: number;
  enabled: boolean;
}

interface ApFilterListProps {
  surveyPoints: SurveyPoint[];
  apMapping: ApMapping[];
  enabledBSSIDs: Set<string>;
  onToggle: (bssid: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
}

function getDisplayName(bssid: string, apMapping: ApMapping[]): string {
  const mapping = apMapping.find(
    (m) => m.macAddress.toLowerCase() === bssid.toLowerCase(),
  );
  return mapping ? mapping.apName : bssid;
}

export function ApFilterList({
  surveyPoints,
  apMapping,
  enabledBSSIDs,
  onToggle,
  onSelectAll,
  onSelectNone,
}: ApFilterListProps) {
  const apItems = useMemo(() => {
    const map = new Map<string, ApFilterItem>();

    for (const point of surveyPoints) {
      if (!point.scannedBSSList) continue;
      for (const bss of point.scannedBSSList) {
        const existing = map.get(bss.bssid);
        if (!existing) {
          map.set(bss.bssid, {
            bssid: bss.bssid,
            displayName: getDisplayName(bss.bssid, apMapping),
            band: bss.band,
            channel: bss.channel,
            frequency: bss.frequency,
            bestSignal: bss.signal,
            enabled: enabledBSSIDs.has(bss.bssid),
          });
        } else {
          if (bss.signal > existing.bestSignal) {
            existing.bestSignal = bss.signal;
          }
          existing.enabled = enabledBSSIDs.has(bss.bssid);
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.band !== b.band) return a.band - b.band;
      return b.bestSignal - a.bestSignal;
    });
  }, [surveyPoints, apMapping, enabledBSSIDs]);

  const bands = useMemo(() => {
    const grouped = new Map<number, ApFilterItem[]>();
    for (const item of apItems) {
      const band = item.band;
      if (!grouped.has(band)) grouped.set(band, []);
      grouped.get(band)!.push(item);
    }
    return Array.from(grouped.entries()).sort(([a], [b]) => a - b);
  }, [apItems]);

  if (apItems.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700">AP Filter</h3>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-6 px-2"
            onClick={onSelectAll}
          >
            All
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-6 px-2"
            onClick={onSelectNone}
          >
            None
          </Button>
        </div>
      </div>

      {bands.map(([band, items]) => (
        <div key={band} className="mb-2">
          <div className="text-xs font-medium text-gray-500 mb-1">
            {band} GHz
          </div>
          <div className="space-y-1">
            {items.map((item) => (
              <div
                key={item.bssid}
                className="flex items-center justify-between py-1 px-2 rounded hover:bg-gray-50 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Switch
                    checked={enabledBSSIDs.has(item.bssid)}
                    onCheckedChange={() => onToggle(item.bssid)}
                    className="scale-75"
                  />
                  <span className="truncate font-medium" title={item.bssid}>
                    {item.displayName}
                  </span>
                </div>
                <div className="flex gap-3 text-gray-500 shrink-0 ml-2">
                  <span>Ch {item.channel}</span>
                  <span>{item.bestSignal} dBm</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
