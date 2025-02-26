import { QueryClientProvider } from "@tanstack/react-query";
import { ActionIcon, Button, Divider, Group, MantineProvider, Modal } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { IconBug, IconMoon, IconSun } from "@tabler/icons-react";
import { useState } from "react";
import "@mantine/core/styles.css";
import "@mantine/dropzone/styles.css";
import "@silevis/reactgrid/styles.css";
import { queryClient } from "@config/query";
import { useTheme } from "@config/theme";
import { useStore } from "@config/store";
import { ErrorTest, KtTable, KTFileDrop, KtSwitch, KtControls } from "@components";
import "./app.css";

export function App() {
  const theme = useTheme();
  const colorScheme = useStore(store => store.colorScheme);
  const [errorTestOpen, setErrorTestOpen] = useState(false);
  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider theme={theme} forceColorScheme={colorScheme}>
        <ModalsProvider>
          <Group p="md" justify="space-between">
            <Group>
              <KtSwitch />
              <Button 
                variant="subtle" 
                leftSection={<IconBug size={16} />}
                onClick={() => setErrorTestOpen(true)}
              >
                Test Errors
              </Button>
            </Group>
            <ActionIcon onClick={useStore.getState().toggleColorScheme}>
              {colorScheme === "light" ? <IconSun /> : <IconMoon />}
            </ActionIcon>
          </Group>
          
          {/* Error Test Modal */}
          <Modal
            opened={errorTestOpen}
            onClose={() => setErrorTestOpen(false)}
            title="Error Testing"
            size="lg"
          >
            <ErrorTest />
          </Modal>
          <Divider />
          <KtControls mt="md" ml="md" />
          <KtTable mt="md" />
          <KTFileDrop />
        </ModalsProvider>
      </MantineProvider>
    </QueryClientProvider>
  );
}
