import { useSettings } from "@/components/GlobalSettings";
import { Label } from "@/components/ui/label";
import { PopoverHelper } from "@/components/PopoverHelpText";
import MediaDropdown from "./MediaDropdown";

/**
 * FloorPlanSelector — legacy floor plan file picker.
 * Now delegates to the SiteManager's floor image update.
 * Kept for backward compatibility but SiteManager is the primary UI.
 */
export default function FloorPlanSelector() {
  const { settings, updateFloorImage } = useSettings();

  function handleNewImageFile(theFile: string): void {
    updateFloorImage(settings.site.activeFloorIndex, theFile);
  }

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <Label
        htmlFor="Files"
        className="text-xs font-semibold whitespace-nowrap"
      >
        Floor plan&nbsp;
        <PopoverHelper text="Choose a file to be used as a background image, or upload another PNG or JPEG file." />
      </Label>
      <div className="w-full max-w-sm flex-1">
        <MediaDropdown
          defaultValue={settings.floorplanImageName}
          onChange={(val) => handleNewImageFile(val)}
        />
      </div>
    </div>
  );
}
