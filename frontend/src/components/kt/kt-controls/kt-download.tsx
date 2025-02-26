import { Button } from "@mantine/core";
import { IconDownload } from "@tabler/icons-react";
import { isArray, isNil } from "lodash-es";
import { useStore } from "@config/store";
import { download } from "@utils/functions";

export const KtDownload = {
  Csv: () => {
    const handleDownload = () => {
      const data = useStore.getState().getTable();
      const columns = data.columns.map(col => col.entityType || "Unknown");

      let csvData = `Document,${columns.join(",")}\n`;

      for (const row of data.rows) {
        const documentName = row.sourceData?.document.name ?? "Unknown";

        const cellValues = data.columns.map(col => {
          const cell = row.cells[col.id];
          if (isNil(cell)) return "";
          else if (isArray(cell)) {
            return `"${cell.join(", ")}"`;
          } else {
            return String(cell);
          }
        });

        csvData += `"${documentName}",${cellValues.join(",")}\n`;
      }

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
