import { Button, Group, Tooltip } from "@mantine/core";
import { IconTable } from "@tabler/icons-react";

// CSV Upload component temporarily disabled for debugging
export function KtCsvUpload() {
  return (
    <Tooltip label="CSV import temporarily disabled for debugging">
      <Group>
        <Button
          variant="outline"
          leftSection={<IconTable size={16} />}
          disabled={true}
          color="blue"
        >
          Import CSV
        </Button>
      </Group>
    </Tooltip>
  );
}
