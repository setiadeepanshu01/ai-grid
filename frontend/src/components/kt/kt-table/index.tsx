import { useMemo, useState } from "react";
import { Column, ReactGrid, Row } from "@silevis/reactgrid";
import { BoxProps, ScrollArea } from "@mantine/core";
import {
  Cell,
  handleCellChange,
  handleContextMenu,
  HEADER_ROW_ID,
  SOURCE_COLUMN_ID
} from "./index.utils";
import {
  KtCell,
  KtCellTemplate,
  KtColumnCell,
  KtColumnCellTemplate,
  KtRowCellTemplate
} from "./kt-cells";
import { useStore } from "@config/store";
import { cn } from "@utils/functions";
import classes from "./index.module.css";

export function KtTable(props: BoxProps) {
  const table = useStore(store => store.getTable());
  const columns = table.columns;
  const rows = table.rows;
  // Use a custom property on the table to store the Document column width
  // @ts-ignore - Adding a custom property to the table object
  const sourceColumnWidth = table.sourceColumnWidth || 350; // Increased default width
  const visibleColumns = useMemo(
    () => columns.filter(column => !column.hidden),
    [columns]
  );
  const visibleRows = useMemo(() => rows.filter(row => !row.hidden), [rows]);

  const gridColumns = useMemo<Column[]>(
    () => [
      { columnId: SOURCE_COLUMN_ID, width: sourceColumnWidth, resizable: true },
      ...visibleColumns.map(column => ({
        columnId: column.id,
        width: column.width,
        resizable: true
      }))
    ],
    [visibleColumns, sourceColumnWidth]
  );

  const gridRows = useMemo<Row<Cell>[]>(
    () => [
      {
        rowId: HEADER_ROW_ID,
        cells: [
          { type: "header", text: "Document" },
          ...visibleColumns.map<KtColumnCell>((column, index) => ({
            type: "kt-column",
            column,
            columnIndex: index
          }))
        ]
      },
      ...visibleRows.map<Row<Cell>>(row => ({
        rowId: row.id,
        height: 48,
        cells: [
          { type: "kt-row", row },
          ...visibleColumns.map<KtCell>(column => ({
            type: "kt-cell",
            column,
            row,
            cell: row.cells[column.id]
          }))
        ]
      }))
    ],
    [visibleRows, visibleColumns]
  );

  return (
    <ScrollArea
      {...props}
      pb="md"
      className={cn(classes.reactGridWrapper, props.className)}
    >
      <ReactGrid
        enableRangeSelection
        enableColumnSelection
        enableRowSelection
        minColumnWidth={100}
        columns={gridColumns}
        rows={gridRows}
        onContextMenu={handleContextMenu}
        onCellsChanged={handleCellChange}
        onColumnResized={(columnId, width) => {
          if (columnId === SOURCE_COLUMN_ID) {
            // Update the custom property in the store
            useStore.getState().editActiveTable({
              // @ts-ignore - Adding a custom property to the table object
              sourceColumnWidth: width
            });
          } else {
            useStore.getState().editColumn(String(columnId), { width });
          }
        }}
        customCellTemplates={{
          "kt-cell": new KtCellTemplate(),
          "kt-column": new KtColumnCellTemplate(),
          "kt-row": new KtRowCellTemplate()
        }}
      />
    </ScrollArea>
  );
}
