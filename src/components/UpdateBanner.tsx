"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Download, Loader2, CheckCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UpdateInfo {
  updateAvailable: boolean;
  currentCommit: string;
  latestCommit: string;
  behindCount: number;
  commits: string[];
}

type UpdatePhase =
  | "idle"
  | "pulling"
  | "installing"
  | "building"
  | "restarting"
  | "done"
  | "error";

const PHASE_LABELS: Record<UpdatePhase, string> = {
  idle: "",
  pulling: "Pulling latest changes...",
  installing: "Installing dependencies...",
  building: "Building application...",
  restarting: "Restarting — page will reload shortly...",
  done: "Update complete!",
  error: "Update failed",
};

const POLL_INTERVAL = 5 * 60 * 1000; // 5 minuter

export default function UpdateBanner() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [phase, setPhase] = useState<UpdatePhase>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // Kolla om bannern är dismissad i sessionStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      setDismissed(sessionStorage.getItem("update-dismissed") === "true");
    }
  }, []);

  // Hämta uppdateringsstatus
  const checkForUpdates = useCallback(async () => {
    try {
      const res = await fetch("/api/system/update");
      if (!res.ok) return;
      const data: UpdateInfo = await res.json();
      setInfo(data);
      // Rensa dismiss om ny uppdatering (annan commit)
      if (typeof window !== "undefined") {
        const prevLatest = sessionStorage.getItem("update-dismissed-commit");
        if (data.updateAvailable && data.latestCommit !== prevLatest) {
          setDismissed(false);
          sessionStorage.removeItem("update-dismissed");
        }
      }
    } catch {
      // Tyst — bannern visas inte vid nätverksfel
    }
  }, []);

  // Polling var 5:e minut
  useEffect(() => {
    checkForUpdates();
    const id = setInterval(checkForUpdates, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [checkForUpdates]);

  // Kör uppdatering
  const runUpdate = async () => {
    setPhase("pulling");
    setErrorMsg("");
    try {
      // Simulera faser med timeout — POST gör allt sekventiellt
      const phaseTimer = setTimeout(() => setPhase("installing"), 3000);
      const phaseTimer2 = setTimeout(() => setPhase("building"), 15000);

      const res = await fetch("/api/system/update", { method: "POST" });
      clearTimeout(phaseTimer);
      clearTimeout(phaseTimer2);

      if (!res.ok) {
        const data = await res.json();
        setPhase("error");
        setErrorMsg(data.error || data.message || "Unknown error");
        return;
      }

      setPhase("restarting");
      // Appen startar om — vänta och ladda om sidan
      setTimeout(() => {
        window.location.reload();
      }, 5000);
    } catch {
      // Anslutningen bröts — troligen pga pm2 restart, det är förväntat
      setPhase("restarting");
      // Försök ladda om efter en stund
      const retryReload = () => {
        fetch("/")
          .then(() => window.location.reload())
          .catch(() => setTimeout(retryReload, 3000));
      };
      setTimeout(retryReload, 5000);
    }
  };

  const dismiss = () => {
    setDismissed(true);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("update-dismissed", "true");
      if (info?.latestCommit) {
        sessionStorage.setItem("update-dismissed-commit", info.latestCommit);
      }
    }
  };

  // Visa inte om: ingen uppdatering, dismissad, eller under idle utan data
  const isUpdating = phase !== "idle" && phase !== "error";
  const showBanner =
    (info?.updateAvailable && !dismissed) || isUpdating || phase === "error";

  if (!showBanner) return null;

  return (
    <div
      className={`w-full px-4 py-2 flex items-center justify-between text-sm ${
        phase === "error"
          ? "bg-red-100 text-red-900 border-b border-red-200"
          : isUpdating
            ? "bg-blue-100 text-blue-900 border-b border-blue-200"
            : "bg-amber-100 text-amber-900 border-b border-amber-200"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {phase === "error" ? (
          <>
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">
              Update failed: {errorMsg || "Unknown error"}
            </span>
          </>
        ) : isUpdating ? (
          <>
            {phase === "restarting" || phase === "done" ? (
              <CheckCircle className="h-4 w-4 flex-shrink-0" />
            ) : (
              <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin" />
            )}
            <span>{PHASE_LABELS[phase]}</span>
          </>
        ) : (
          <>
            <Download className="h-4 w-4 flex-shrink-0" />
            <span>
              Update available &mdash; {info!.behindCount} new commit
              {info!.behindCount !== 1 ? "s" : ""}
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
        {phase === "idle" && (
          <>
            <Button size="sm" onClick={runUpdate}>
              Update now
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={dismiss}
              aria-label="Dismiss"
              className="h-7 w-7 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        )}
        {phase === "error" && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setPhase("idle")}
          >
            Dismiss
          </Button>
        )}
      </div>
    </div>
  );
}
