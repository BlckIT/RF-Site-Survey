/**
 * useSyncPolling — hook som pollar servern var 3:e sekund
 * och triggar en callback när fjärrdata har ändrats.
 *
 * Jämför lastModified-timestamp från servern med lokalt känt värde.
 * Undviker att trigga reload om klienten just sparade (grace period).
 */
"use client";

import { useEffect, useRef, useCallback } from "react";

const POLL_INTERVAL_MS = 3000;
const SAVE_GRACE_MS = 2000; // Ignorera poll-svar kort efter lokal sparning

interface SyncState {
  lastModified: number;
  totalPoints: number;
}

export function useSyncPolling(siteName: string, onRemoteChange: () => void) {
  const knownState = useRef<SyncState | null>(null);
  const lastSaveTime = useRef<number>(0);
  const activeRef = useRef(true);

  // Anropas av SettingsProvider efter varje lokal sparning
  const notifyLocalSave = useCallback(() => {
    lastSaveTime.current = Date.now();
  }, []);

  useEffect(() => {
    activeRef.current = true;

    if (!siteName) return;

    async function poll() {
      if (!activeRef.current) return;

      // Hoppa över poll om vi nyss sparade (undvik falsk reload)
      if (Date.now() - lastSaveTime.current < SAVE_GRACE_MS) return;

      try {
        const res = await fetch(
          `/api/settings/poll?name=${encodeURIComponent(siteName)}`,
        );
        if (!res.ok) return;

        const remote: SyncState = await res.json();

        if (knownState.current === null) {
          // Första poll — sätt baseline utan att trigga reload
          knownState.current = remote;
          return;
        }

        const changed =
          remote.lastModified > knownState.current.lastModified ||
          remote.totalPoints !== knownState.current.totalPoints;

        if (changed) {
          knownState.current = remote;
          onRemoteChange();
        }
      } catch {
        // Nätverksfel — tyst, försök igen nästa intervall
      }
    }

    // Starta polling
    poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      activeRef.current = false;
      clearInterval(timer);
      knownState.current = null;
    };
  }, [siteName, onRemoteChange]);

  return { notifyLocalSave };
}
