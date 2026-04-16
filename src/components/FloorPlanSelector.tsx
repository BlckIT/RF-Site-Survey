import { useSettings } from "@/components/GlobalSettings";
import { Label } from "@/components/ui/label";
import { PopoverHelper } from "@/components/PopoverHelpText";
import MediaDropdown from "./MediaDropdown";
import { sanitizeFilename } from "@/lib/utils";

/**
 * FloorPlanSelector — floor plan file picker.
 * Renders the floor plan file picker and data-path hint.
 */
export default function FloorPlanSelector() {
  const { settings, readNewSettingsFromFile } = useSettings();

  function handleNewImageFile(theFile: string): void {
    readNewSettingsFromFile(theFile);
  }

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <Label htmlFor="Files" className="font-bold text-lg whitespace-nowrap">
        Floor plan&nbsp;
        <PopoverHelper text="Choose a file to be used as a background image, or upload another PNG or JPEG file." />
      </Label>
      <div className="min-w-[280px] max-w-[400px] flex-1">
        <MediaDropdown
          defaultValue={settings.floorplanImageName}
          onChange={(val) => handleNewImageFile(val)}
        />
        {settings.floorplanImageName && (
          <p className="text-xs text-gray-500 mt-1">
            Data: data/surveys/
            {sanitizeFilename(settings.floorplanImageName)}.json
          </p>
        )}
      </div>
    </div>
  );
}
