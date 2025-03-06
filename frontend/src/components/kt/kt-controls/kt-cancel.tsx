import { Button, Modal, Text, Group, Badge, Tooltip, Box, Transition } from "@mantine/core";
import { IconPlayerStop } from "@tabler/icons-react";
import { useStore } from "../../../config/store/store";
import { useState, useEffect } from "react";

export function KtCancel() {
  const loadingCells = useStore(state => Object.keys(state.getTable().loadingCells).length);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  
  // Effect to handle visibility with animation
  useEffect(() => {
    if (loadingCells > 0) {
      setIsVisible(true);
    } else {
      // Delay hiding to allow for animation
      const timer = setTimeout(() => setIsVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [loadingCells]);
  
  // Don't render component at all if there are no loading cells and not visible
  if (loadingCells === 0 && !isVisible) return null;
  
  const handleCancel = async () => {
    try {
      setConfirmModalOpen(false);
      await useStore.getState().cancelRequests();
    } catch (error) {
      console.error('Error cancelling requests:', error);
    }
  };
  
  return (
    <Transition mounted={isVisible} transition="fade" duration={200}>
      {(styles) => (
        <Box style={styles}>
          <Tooltip label={`Cancel ${loadingCells} pending operations`} position="bottom">
            <Button
              leftSection={<IconPlayerStop size={16} />}
              rightSection={loadingCells > 0 && <Badge size="sm" circle>{loadingCells}</Badge>}
              color="red"
              variant={loadingCells > 10 ? "filled" : "light"}
              onClick={() => setConfirmModalOpen(true)}
              title="Cancel all pending operations"
              px={16}
            >
              Cancel Operations
            </Button>
          </Tooltip>
          
          <Modal
            opened={confirmModalOpen}
            onClose={() => setConfirmModalOpen(false)}
            title="Cancel Operations"
            centered
          >
            <Text mb={20}>Are you sure you want to cancel all pending operations? This cannot be undone.</Text>
            <Group justify="flex-end">
              <Button variant="outline" onClick={() => setConfirmModalOpen(false)}>
                No, continue processing
              </Button>
              <Button color="red" onClick={handleCancel}>
                Yes, cancel operations
              </Button>
            </Group>
          </Modal>
        </Box>
      )}
    </Transition>
  );
}