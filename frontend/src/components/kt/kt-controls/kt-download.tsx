import { Button } from "@mantine/core";
import { IconDownload } from "@tabler/icons-react";
import { isArray, isNil } from "lodash-es";
import { useStore } from "@config/store";
import { download } from "@utils/functions";

export const KtDownload = {
  Csv: () => {
    const handleDownload = () => {
      const data = useStore.getState().getTable();
      
      // Filter out columns that don't have meaningful data
      const validColumns = data.columns.filter(col => {
        // Check if this column has any non-empty data in any row
        return data.rows.some(row => {
          const cell = row.cells[col.id];
          return !isNil(cell) && (isArray(cell) ? cell.length > 0 : String(cell).trim() !== '');
        });
      });
      
      // Use better column names - use entityType or fall back to id
      const columnNames = validColumns.map(col => col.entityType || col.id || "Column");

      let csvData = `Document,${columnNames.join(",")}\n`;

      // Process rows and filter out those with unknown document names
      const processedRows = data.rows.map(row => {
        // Handle different source data types
        let documentName = "";
        if (row.sourceData?.type === "document") {
          documentName = row.sourceData.document.name;
        } else if (row.sourceData?.type === "loading") {
          documentName = `Loading: ${row.sourceData.name}`;
        } else if (row.sourceData?.type === "error") {
          documentName = `Error: ${row.sourceData.name}`;
        }

        // Skip rows with empty document names
        if (!documentName) {
          return null;
        }

        const cellValues = validColumns.map(col => {
          const cell = row.cells[col.id];
          if (isNil(cell)) return '""';
          else if (isArray(cell)) {
            return `"${cell.join(", ")}"`;
          } else {
            // Escape any quotes in the cell value and wrap in quotes
            const cellStr = String(cell).replace(/"/g, '""');
            return `"${cellStr}"`;
          }
        });

        return {
          documentName,
          cellValues
        };
      }).filter(Boolean); // Remove null entries

      // Add rows to CSV data
      processedRows.forEach(row => {
        if (row) {
          csvData += `"${row.documentName}",${row.cellValues.join(",")}\n`;
        }
      });

      download("ai-grid-data.csv", {
        mimeType: "text/csv",
        content: csvData
      });
    };

    return (
      <Button leftSection={<IconDownload />} onClick={handleDownload}>
        Download CSV
      </Button>
    );
  }
};
