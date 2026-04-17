import { useSettings } from "@/components/GlobalSettings";
import { Button } from "@/components/ui/button";

/**
 * FloorSelector — compact floor switcher for Survey and Report tabs.
 * Shows horizontal tabs when there are multiple floors.
 */
export default function FloorSelector() {
  const { settings, setActiveFloor } = useSettings();

  if (settings.site.floors.length <= 1) return null;

  return (
    <div className="flex items-center gap-1 mb-3 flex-wrap">
      <span className="text-xs font-semibold text-gray-500 mr-1">Floor:</span>
      {settings.site.floors.map((floor, idx) => (
        <Button
          key={idx}
          variant="outline"
          size="sm"
          onClick={() => setActiveFloor(idx)}
          className={`px-2.5 py-1 text-xs rounded-md h-auto ${
            idx === settings.site.activeFloorIndex
              ? "bg-white font-semibold border-gray-400 text-black shadow-sm"
              : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100 hover:text-gray-700"
          }`}
        >
          {floor.name}
        </Button>
      ))}
    </div>
  );
}
