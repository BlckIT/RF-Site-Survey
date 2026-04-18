"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

interface NewToastProps {
  onClose: () => void;
  toastIsReady: () => void;
}

/**
 * NewToast — mätnings-statuskort som visas under pågående survey.
 * Standardiserad Tailwind-design som matchar resten av appen.
 */
export default function NewToast({ onClose, toastIsReady }: NewToastProps) {
  const [toastHeader, setToastHeader] = useState("");
  const [toastStatus, setToastStatus] = useState("");
  const [taskRunning, setTaskRunning] = useState(true);

  useEffect(() => {
    const eventSource = new EventSource("/api/events");

    eventSource.onmessage = (event: MessageEvent) => {
      try {
        const data: { status: string; type: string; header: string } =
          JSON.parse(event.data);

        if (data.type === "ready") {
          toastIsReady();
          return;
        }
        if (data.type === "update") {
          setToastHeader(data.header);
          setToastStatus(data.status);
        }

        if (data.type === "done") {
          setToastHeader(data.header);
          setToastStatus(data.status);
          eventSource.close();
          setTimeout(() => {
            setTaskRunning(false);
            onClose();
          }, 3000);
        }
      } catch (error) {
        console.error("Error parsing SSE message:", error);
      }
    };

    eventSource.onerror = (error: Event) => {
      console.error("SSE error:", error);
      eventSource.close();
    };

    const handleUnload = () => {
      eventSource.close();
    };

    window.addEventListener("beforeunload", handleUnload);
    window.addEventListener("unload", handleUnload);

    return () => {
      eventSource.close();
      window.removeEventListener("beforeunload", handleUnload);
      window.removeEventListener("unload", handleUnload);
    };
  }, [onClose, toastIsReady]);

  const handleCancel = async () => {
    await fetch("/api/start-task?action=stop", { method: "POST" });
    setToastStatus("Task Canceled");
    setToastHeader("Canceled");
    setTaskRunning(false);
    setTimeout(() => onClose(), 3000);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 bg-white border border-gray-200 rounded-md shadow-lg overflow-hidden">
      <div className="flex items-center justify-between bg-gray-50 px-3 py-2 border-b border-gray-200">
        <span className="text-sm font-semibold text-gray-800">
          {toastHeader || "Measuring..."}
        </span>
        {taskRunning && (
          <Button variant="destructive" size="sm" onClick={handleCancel}>
            Cancel
          </Button>
        )}
      </div>
      <div className="px-3 py-2">
        {toastStatus.split("\n").map((line, index) => (
          <p key={index} className="text-sm text-gray-700 leading-relaxed">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
