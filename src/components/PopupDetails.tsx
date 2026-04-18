import React, { useState } from "react";
import { SurveyPoint, HeatmapSettings, SurveyPointActions } from "@/lib/types";
import { formatMacAddress } from "@/lib/utils";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { X, Trash2 } from "lucide-react";
import { AlertDialogModal } from "@/components/AlertDialogModal";

interface PopupDetailsProps {
  point: SurveyPoint | null;
  settings: HeatmapSettings;
  surveyPointActions: SurveyPointActions;
  onClose: () => void;
}

/**
 * PopupDetails — visas vid klick på en mätpunkt.
 * Visar RSSI (dBm), SNR, noise floor, kanal, band, interface, och dual-band data.
 */
const PopupDetails: React.FC<PopupDetailsProps> = ({
  point,
  settings,
  surveyPointActions,
  onClose,
}) => {
  if (!point) return null;

  const [isEnabled, setIsEnabled] = useState(point.isEnabled);

  const toMbps = (bps: number) => `${(bps / 1e6).toFixed(1)} Mbps`;

  // Grundläggande rader — alltid dBm som primärt signalvärde
  const rows: { label: string; value: string | number | undefined }[] = [
    { label: "ID", value: point.id },
    { label: "SSID", value: point.wifiData?.ssid },
    { label: "RSSI", value: `${point.wifiData.rssi} dBm` },
  ];

  // Noise floor och SNR om tillgängligt
  if (point.wifiData.noiseFloor != null) {
    rows.push({
      label: "Noise Floor",
      value: `${point.wifiData.noiseFloor} dBm`,
    });
  }
  if (point.wifiData.snr != null) {
    rows.push({ label: "SNR", value: `${point.wifiData.snr} dB` });
  }
  if (point.wifiData.channelUtilization != null) {
    rows.push({
      label: "Channel Utilization",
      value: `${point.wifiData.channelUtilization}%`,
    });
  }

  rows.push({ label: "Channel", value: point.wifiData?.channel });

  // Band visas bara om inga bandMeasurements finns (annars visas per-band nedan)
  if (!point.bandMeasurements || point.bandMeasurements.length === 0) {
    rows.push({ label: "Band", value: `${point.wifiData?.band} GHz` });
  }

  rows.push({
    label: "BSSID",
    value: formatMacAddress(point.wifiData?.bssid || ""),
  });

  // AP-namn från mapping
  const apName = settings.apMapping.find(
    (ap) => ap.macAddress === point.wifiData?.bssid,
  )?.apName;
  if (apName) {
    rows.push({ label: "AP Name", value: apName });
  }

  // WiFi interface om tillgängligt
  if (settings.wifiInterface) {
    rows.push({ label: "Interface", value: settings.wifiInterface });
  }

  // TCP/UDP — visa varje metric en gång
  if (point.iperfData) {
    if (point.iperfData.tcpDownload.bitsPerSecond > 0) {
      rows.push({
        label: "TCP Download",
        value: toMbps(point.iperfData.tcpDownload.bitsPerSecond),
      });
    }
    if (point.iperfData.tcpUpload.bitsPerSecond > 0) {
      rows.push({
        label: "TCP Upload",
        value: toMbps(point.iperfData.tcpUpload.bitsPerSecond),
      });
    }
    if (point.iperfData.udpDownload.bitsPerSecond > 0) {
      rows.push({
        label: "UDP Download",
        value: toMbps(point.iperfData.udpDownload.bitsPerSecond),
      });
    }
    if (point.iperfData.udpUpload.bitsPerSecond > 0) {
      rows.push({
        label: "UDP Upload",
        value: toMbps(point.iperfData.udpUpload.bitsPerSecond),
      });
    }
  }

  // Dual-band sektion — tydlig per-band visning utan felaktig "(connected)"
  if (point.bandMeasurements && point.bandMeasurements.length > 0) {
    rows.push({ label: "── Per Band ──", value: "" });
    for (const bm of point.bandMeasurements) {
      rows.push({
        label: `${bm.band} GHz`,
        value: `${bm.signal} dBm`,
      });
      if (bm.tcpDown != null || bm.tcpUp != null) {
        rows.push({
          label: `  TCP ↓/↑`,
          value: `${(bm.tcpDown ?? 0).toFixed(1)} / ${(bm.tcpUp ?? 0).toFixed(1)} Mbps`,
        });
      }
      if (bm.udpDown != null || bm.udpUp != null) {
        rows.push({
          label: `  UDP ↓/↑`,
          value: `${(bm.udpDown ?? 0).toFixed(1)} / ${(bm.udpUp ?? 0).toFixed(1)} Mbps`,
        });
      }
    }
  }

  rows.push({ label: "Position", value: `X: ${point.x}, Y: ${point.y}` });
  rows.push({
    label: "Created",
    value: new Date(point.timestamp).toLocaleString(),
  });

  const handleToggle = () => {
    setIsEnabled((prev) => {
      const newState = !prev;
      surveyPointActions.update(point, { isEnabled: newState });
      return newState;
    });
  };

  const handleDelete = (p: SurveyPoint) => {
    surveyPointActions.delete([p]);
    onClose();
  };

  return (
    <div className="bg-white border border-gray-200 rounded-md shadow-lg text-xs overflow-hidden">
      <div className="flex justify-between items-center bg-gray-50 px-2 py-1">
        <h3 className="font-semibold text-sm">Measurement Details</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 h-6 w-6 p-0"
        >
          <X size={16} />
        </Button>
      </div>
      <Table>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow
              key={`${row.label}-${index}`}
              className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}
            >
              <TableCell className="py-1 px-2 font-medium">
                {row.label}
              </TableCell>
              <TableCell className="py-1 px-2">{row.value}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex justify-between items-center px-2 py-2 bg-gray-50">
        <div className="flex items-center space-x-2">
          <Switch checked={isEnabled} onCheckedChange={handleToggle} />
          <span>Enabled</span>
        </div>
        <AlertDialogModal
          title="Delete Measurement?"
          description="Are you sure you want to delete this measurement?"
          onCancel={() => {}}
          onConfirm={() => handleDelete(point)}
        >
          <Button
            variant="destructive"
            size="sm"
            className="flex items-center space-x-1"
          >
            <Trash2 size={14} />
            <span>Delete</span>
          </Button>
        </AlertDialogModal>
      </div>
    </div>
  );
};

export default PopupDetails;
