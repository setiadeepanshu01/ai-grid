import { BoxProps, Button, Group, Text, Loader } from "@mantine/core";
import { IconEyeOff } from "@tabler/icons-react";
import { KtHiddenPill } from "./kt-hidden-pill";
import { KtClear } from "./kt-clear";
import { useStore } from "@config/store";

// Simplified version with fewer components to reduce pop-ups
export function KtControls(props: BoxProps) {
  const uploadingFiles = useStore(store => store.getTable().uploadingFiles);

  return (
    <Group gap="xs" {...props}>
      <Button
        leftSection={<IconEyeOff />}
        onClick={() => useStore.getState().toggleAllColumns(true)}
      >
        Hide all columns
      </Button>
      <KtHiddenPill />
      <KtClear />
      {uploadingFiles && (
        <Group>
          <Loader size="xs" />
          <Text>Uploading files...</Text>
        </Group>
      )}
    </Group>
  );
}
