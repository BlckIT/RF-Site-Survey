import React, { useCallback, useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  ColumnDef,
  flexRender,
  VisibilityState,
} from "@tanstack/react-table";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApMapping, SurveyPoint, SurveyPointActions } from "@/lib/types";
import { Switch } from "./ui/switch";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { rssiToPercentage } from "@/lib/utils";
import { AlertDialogModal } from "./AlertDialogModal";
import { PopoverHelper } from "./PopoverHelpText";

type FlattenedSurveyPoint = {
  id: string;
  x: number;
  y: number;
  ssid: string;
  bssid: string;
  rssi: number;
  channel: number;
  security: string;
  txRate: number;
  phyMode: string;
  channelWidth: number;
  band: string;
  tcpDownloadMbps: number;
  tcpUploadMbps: number;
  udpDownloadMbps: number;
  udpUploadMbps: number;
  timestamp: string;
  isEnabled: boolean;
  origPoint: SurveyPoint; // to remember the original point
};

interface SurveyPointsTableProps {
  data: SurveyPoint[];
  surveyPointActions: SurveyPointActions;
  // onDelete: (ids: string[]) => void;
  // updateDatapoint: (id: string, data: Partial<SurveyPoint>) => void;
  apMapping: ApMapping[];
}

const SurveyPointsTable: React.FC<SurveyPointsTableProps> = ({
  data,
  surveyPointActions,
  apMapping,
}) => {
  const myUpdate = surveyPointActions.update;
  const myDelete = surveyPointActions.delete;

  const [rowSelection, setRowSelection] = useState({});
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    select: true,
    id: true,
    signalQuality: true,
    bssid: true,
    band: true,
    tcpDownloadMbps: true,
    tcpUploadMbps: true,
    timestamp: true,
    disable: true,
    rssi: false,
    ssid: false,
    security: false,
    txRate: false,
    phyMode: false,
    channelWidth: false,
    channel: false,
    x: false,
    y: false,
  });

  const columns: ColumnDef<FlattenedSurveyPoint>[] = useMemo(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(!!value)
            }
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "id",
        header: "ID",
      },
      {
        id: "disable",
        header: () => (
          <>
            Disable
            <span className="ml-1 relative -top-0.5">
              <PopoverHelper text="Disabling a point will prevent it from being used in the heatmap." />
            </span>
          </>
        ),
        cell: ({ row }) => (
          <Switch
            checked={row.original.isEnabled}
            onCheckedChange={(value) => {
              myUpdate(row.original.origPoint, {
                isEnabled: value,
              });
            }}
          />
        ),
        accessorKey: "isEnabled",
        enableSorting: true,
      },
      {
        accessorKey: "rssi",
        header: "RSSI [dBm]",
      },
      {
        accessorKey: "signalQuality",
        header: "Signal Quality [%]",
      },
      {
        accessorKey: "bssid",
        header: "BSSID",
      },
      {
        accessorKey: "band",
        header: "Band",
      },
      {
        accessorKey: "channel",
        header: "Channel",
      },
      {
        accessorKey: "tcpDownloadMbps",
        header: "TCP Down [Mbps]",
      },
      {
        accessorKey: "tcpUploadMbps",
        header: "TCP Up [Mbps]",
      },
      {
        accessorKey: "udpDownloadMbps",
        header: "UDP Down [Mbps]",
      },
      {
        accessorKey: "udpUploadMbps",
        header: "UDP Up [Mbps]",
      },
      {
        accessorKey: "timestamp",
        header: "Timestamp",
      },
      {
        accessorKey: "ssid",
        header: "SSID",
      },
      {
        accessorKey: "security",
        header: "Security",
      },
      {
        accessorKey: "txRate",
        header: "TX Rate",
      },
      {
        accessorKey: "phyMode",
        header: "PHY Mode",
      },
      {
        accessorKey: "channelWidth",
        header: "Channel Width",
      },

      {
        accessorKey: "x",
        header: "X",
      },
      {
        accessorKey: "y",
        header: "Y",
      },
    ],
    [myUpdate],
  );

  const convertToMbps = (bitsPerSecond: number) => {
    return Math.round((bitsPerSecond / 1000000) * 100) / 100;
  };

  const flattenedData: FlattenedSurveyPoint[] = useMemo(() => {
    return data.map((point) => {
      let bssid = point.wifiData.bssid;
      if (apMapping.length > 0) {
        const mappedName = apMapping.find(
          (ap) => ap.macAddress === point.wifiData.bssid,
        )?.apName;
        if (mappedName) {
          bssid = `${mappedName} (${point.wifiData.bssid})`;
        }
      }
      return {
        origPoint: point,
        ...point,
        ...point.wifiData,
        bssid,
        tcpDownloadMbps: convertToMbps(
          point.iperfData.tcpDownload.bitsPerSecond,
        ),
        tcpUploadMbps: convertToMbps(point.iperfData.tcpUpload.bitsPerSecond),
        udpDownloadMbps: convertToMbps(
          point.iperfData.udpDownload.bitsPerSecond,
        ),
        udpUploadMbps: convertToMbps(point.iperfData.udpUpload.bitsPerSecond),
        // we take the signal strength from the wifi scanner if available, otherwise we use the rssi
        signalQuality:
          point.wifiData.signalStrength ||
          rssiToPercentage(point.wifiData.rssi),
        band: `${point.wifiData.band} GHz`,
        timestamp: new Date(point.timestamp).toLocaleString(),
      };
    });
  }, [data, apMapping]);

  const table = useReactTable({
    data: flattenedData,
    columns,
    state: {
      rowSelection,
      globalFilter,
      columnVisibility,
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const handleDelete = useCallback(() => {
    const selectedPoints = Object.keys(rowSelection).map(
      (index) => flattenedData[parseInt(index)].origPoint,
    );
    myDelete(selectedPoints);
  }, [rowSelection, flattenedData, myDelete]);

  const toggleDisableSelected = useCallback(() => {
    const selectedPoints = Object.keys(rowSelection).map(
      (index) => flattenedData[parseInt(index)].origPoint,
    );
    const allHidden = selectedPoints.every(
      (allPoints) =>
        flattenedData.find((point) => point.id === allPoints.id)?.isEnabled,
    );
    selectedPoints.forEach((id) => {
      myUpdate(id, { isEnabled: !allHidden });
    });
  }, [rowSelection, flattenedData, myUpdate]);

  return (
    <div className="space-y-2">
      {/* Search — full width */}
      <div>
        <Input
          placeholder="Search..."
          value={globalFilter ?? ""}
          onChange={(event) => setGlobalFilter(event.target.value)}
          className="w-full text-xs h-8"
        />
        <div className="text-xs text-gray-500 mt-1">
          {Object.keys(rowSelection).length} of {flattenedData.length} selected
        </div>
      </div>

      {/* Action buttons — compact wrapped grid */}
      <div className="flex flex-wrap gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="text-xs h-7 px-2">
              Columns <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => {
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) =>
                      column.toggleVisibility(!!value)
                    }
                  >
                    {column.columnDef.header?.toString() ?? column.id}
                  </DropdownMenuCheckboxItem>
                );
              })}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-7 px-2"
          onClick={() => table.toggleAllRowsSelected(true)}
        >
          All
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-7 px-2"
          onClick={() => table.toggleAllRowsSelected(false)}
          disabled={Object.keys(rowSelection).length === 0}
        >
          None
        </Button>
        <AlertDialogModal
          title="Delete Selected"
          description="Are you sure you want to delete the selected rows?"
          onConfirm={handleDelete}
          onCancel={() => {}}
          disabled={Object.keys(rowSelection).length === 0}
        >
          <Button
            variant="destructive"
            size="sm"
            className={`text-xs h-7 px-2 ${Object.keys(rowSelection).length === 0 ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            Delete
          </Button>
        </AlertDialogModal>
        <Button
          variant="secondary"
          size="sm"
          className="text-xs h-7 px-2"
          onClick={toggleDisableSelected}
          disabled={Object.keys(rowSelection).length === 0}
        >
          Toggle
        </Button>
      </div>

      {/* Compact table */}
      <div className="rounded-md border text-xs">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="px-1 py-1 text-xs">
                    {header.isPlaceholder ? null : (
                      <div
                        {...{
                          className: `${
                            header.column.getCanSort()
                              ? "cursor-pointer select-none"
                              : ""
                          } flex items-center justify-center whitespace-nowrap`,
                          onClick: header.column.getToggleSortingHandler(),
                        }}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        {{
                          asc: <ChevronUp className="ml-2 h-4 w-4" />,
                          desc: <ChevronDown className="ml-2 h-4 w-4" />,
                        }[header.column.getIsSorted() as string] ??
                          (header.column.getCanSort() ? (
                            <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                          ) : null)}
                      </div>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row, i) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className={`${
                    row.getIsSelected()
                      ? "bg-primary/10"
                      : i % 2 === 0
                        ? "bg-muted/50"
                        : ""
                  }`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className="text-center px-1 py-1 text-xs"
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between py-2">
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-7 px-2"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          Prev
        </Button>
        <span className="text-xs text-gray-500">
          {table.getState().pagination.pageIndex + 1}/{table.getPageCount()}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-7 px-2"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          Next
        </Button>
      </div>
    </div>
  );
};

export default SurveyPointsTable;
