import { useState, useEffect, useCallback } from "react";
import { useSettings } from "@/components/GlobalSettings";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { PopoverHelper } from "@/components/PopoverHelpText";
import MediaDropdown from "./MediaDropdown";
import { listSurveys } from "@/lib/fileHandler";
import { AlertDialogModal } from "./AlertDialogModal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const inputClass =
  "w-full border border-gray-200 rounded-sm p-1.5 text-sm focus:outline-none focus:ring focus:ring-blue-300 focus:border-blue-400";

/**
 * SiteManager — site/project and floor management panel.
 * Replaces the old FloorPlanSelector with full site + multi-floor support.
 */
export default function SiteManager() {
  const {
    settings,
    loadSite,
    createSite,
    deleteSite,
    renameSite,
    addFloor,
    removeFloor,
    setActiveFloor,
    renameFloor,
    updateFloorImage,
  } = useSettings();

  const [surveys, setSurveys] = useState<string[]>([]);
  const [showNewSiteDialog, setShowNewSiteDialog] = useState(false);
  const [showRenameSiteDialog, setShowRenameSiteDialog] = useState(false);
  const [showAddFloorDialog, setShowAddFloorDialog] = useState(false);
  const [showRenameFloorDialog, setShowRenameFloorDialog] = useState(false);
  const [renameFloorIndex, setRenameFloorIndex] = useState<number>(0);
  const [newName, setNewName] = useState("");
  const [newFloorName, setNewFloorName] = useState("");
  const [newFloorImage, setNewFloorImage] = useState("");

  const fetchSurveys = useCallback(async () => {
    const list = await listSurveys();
    setSurveys(list);
  }, []);

  useEffect(() => {
    fetchSurveys();
  }, [fetchSurveys]);

  const handleCreateSite = () => {
    if (!newName.trim()) return;
    createSite(newName.trim());
    setShowNewSiteDialog(false);
    setNewName("");
    // Refresh survey list after a short delay
    setTimeout(fetchSurveys, 500);
  };

  const handleRenameSite = () => {
    if (!newName.trim()) return;
    renameSite(newName.trim());
    setShowRenameSiteDialog(false);
    setNewName("");
    setTimeout(fetchSurveys, 500);
  };

  const handleDeleteSite = async () => {
    const siteName = settings.site.name;
    await deleteSite(siteName);
    // Load default after deletion
    loadSite("Planritning_nybyggnad");
    setTimeout(fetchSurveys, 500);
  };

  const handleAddFloor = () => {
    if (!newFloorName.trim()) return;
    addFloor(newFloorName.trim(), newFloorImage);
    setShowAddFloorDialog(false);
    setNewFloorName("");
    setNewFloorImage("");
  };

  const handleRenameFloor = () => {
    if (!newName.trim()) return;
    renameFloor(renameFloorIndex, newName.trim());
    setShowRenameFloorDialog(false);
    setNewName("");
  };

  const activeFloor = settings.site.floors[settings.site.activeFloorIndex];

  return (
    <div className="space-y-4">
      {/* ── Site Selector ── */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold">
          Site / Project&nbsp;
          <PopoverHelper text="Select an existing site or create a new one. Each site can contain multiple floors." />
        </Label>
        <div className="flex items-center gap-2">
          <select
            className={`flex-1 ${inputClass}`}
            value={settings.site.name}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "__new__") {
                setNewName("");
                setShowNewSiteDialog(true);
              } else {
                loadSite(val);
              }
            }}
          >
            {surveys.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            <option value="__new__">+ New Site...</option>
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setNewName(settings.site.name);
              setShowRenameSiteDialog(true);
            }}
            title="Rename site"
          >
            Rename
          </Button>
          <AlertDialogModal
            title="Delete Site"
            description={`Are you sure you want to delete "${settings.site.name}"? This cannot be undone.`}
            onConfirm={handleDeleteSite}
            onCancel={() => {}}
          >
            <Button variant="destructive" size="sm" title="Delete site">
              Delete
            </Button>
          </AlertDialogModal>
        </div>
      </div>

      {/* ── Floor Tabs ── */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold">
          Floors&nbsp;
          <PopoverHelper text="Each floor has its own floor plan image, walls, and survey points. Click a tab to switch floors." />
        </Label>
        <div className="flex items-center gap-1 flex-wrap">
          {settings.site.floors.map((floor, idx) => (
            <Button
              key={idx}
              variant="outline"
              size="sm"
              onClick={() => setActiveFloor(idx)}
              onDoubleClick={() => {
                setRenameFloorIndex(idx);
                setNewName(floor.name);
                setShowRenameFloorDialog(true);
              }}
              className={`px-3 py-1.5 text-sm rounded-t-md border-b-0 h-auto ${
                idx === settings.site.activeFloorIndex
                  ? "bg-white font-semibold border-gray-400 text-black"
                  : "bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-50"
              }`}
              title={`Switch to ${floor.name}. Double-click to rename.`}
            >
              {floor.name}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setNewFloorName(`Floor ${settings.site.floors.length + 1}`);
              setNewFloorImage("");
              setShowAddFloorDialog(true);
            }}
            className="text-gray-500 hover:text-gray-700"
            title="Add a new floor"
          >
            + Add
          </Button>
          {settings.site.floors.length > 1 && (
            <AlertDialogModal
              title="Remove Floor"
              description={`Remove "${activeFloor?.name}"? All walls and survey points on this floor will be lost.`}
              onConfirm={() => removeFloor(settings.site.activeFloorIndex)}
              onCancel={() => {}}
            >
              <Button
                variant="ghost"
                size="sm"
                className="text-red-400 hover:text-red-600"
                title="Remove active floor"
              >
                Remove
              </Button>
            </AlertDialogModal>
          )}
        </div>
      </div>

      {/* ── Floor Plan Image ── */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold">
          Floor Plan Image&nbsp;
          <PopoverHelper text="Choose or upload a floor plan image for the active floor." />
        </Label>
        <div className="min-w-[280px] max-w-[400px]">
          <MediaDropdown
            defaultValue={activeFloor?.floorplanImageName || ""}
            onChange={(val) =>
              updateFloorImage(settings.site.activeFloorIndex, val)
            }
          />
        </div>
      </div>

      {/* ── New Site Dialog ── */}
      <Dialog open={showNewSiteDialog} onOpenChange={setShowNewSiteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Site</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Site Name</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Office Building"
              onKeyDown={(e) => e.key === "Enter" && handleCreateSite()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowNewSiteDialog(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateSite} disabled={!newName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Rename Site Dialog ── */}
      <Dialog
        open={showRenameSiteDialog}
        onOpenChange={setShowRenameSiteDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Site</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs font-semibold">New Name</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRenameSite()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRenameSiteDialog(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleRenameSite} disabled={!newName.trim()}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Floor Dialog ── */}
      <Dialog open={showAddFloorDialog} onOpenChange={setShowAddFloorDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Floor</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Floor Name</Label>
              <Input
                value={newFloorName}
                onChange={(e) => setNewFloorName(e.target.value)}
                placeholder="e.g. Ground Floor"
                onKeyDown={(e) => e.key === "Enter" && handleAddFloor()}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Floor Plan Image</Label>
              <MediaDropdown
                defaultValue={newFloorImage}
                onChange={(val) => setNewFloorImage(val)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddFloorDialog(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleAddFloor} disabled={!newFloorName.trim()}>
              Add Floor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Rename Floor Dialog ── */}
      <Dialog
        open={showRenameFloorDialog}
        onOpenChange={setShowRenameFloorDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Floor</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs font-semibold">New Name</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRenameFloor()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRenameFloorDialog(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleRenameFloor} disabled={!newName.trim()}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
