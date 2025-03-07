import React from 'react';
import { Progress, Text, Group, Box, Paper, ActionIcon } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { useStore } from '@config/store';
import { notifications } from '@utils/notifications';

// Minimal version that just shows progress when available
export function KtProgressBar() {
  const requestProgress = useStore(store => store.getTable().requestProgress);
  const [dismissed, setDismissed] = React.useState(false);
  
  // Reset dismissed state when a new progress operation starts
  React.useEffect(() => {
    if (requestProgress && requestProgress.inProgress) {
      setDismissed(false);
    }
  }, [requestProgress?.inProgress]);
  
  // Track previous inProgress state to detect completion
  const prevInProgressRef = React.useRef<boolean | undefined>(undefined);
  
  // Show notification only when progress transitions from in-progress to complete
  React.useEffect(() => {
    // Only show notification when transitioning from in-progress to complete
    const wasInProgress = prevInProgressRef.current;
    const isNowComplete = requestProgress && !requestProgress.inProgress && requestProgress.completed > 0 && !requestProgress.error;
    
    // Update the ref for next time
    prevInProgressRef.current = requestProgress?.inProgress;
    
    // Only show notification if we were previously in progress and now we're complete
    if (wasInProgress === true && isNowComplete) {
      try {
        // Make sure we don't show "0 requests" in the notification
        const completedCount = requestProgress.completed > 0 ? requestProgress.completed : requestProgress.total;
        
        notifications.show({
          title: 'Processing complete',
          message: `Successfully processed all ${completedCount} requests.`,
          color: 'green',
          autoClose: 5000
        });
      } catch (error) {
        console.error('Error showing notification:', error);
      }
    }
  }, [requestProgress?.inProgress, requestProgress?.completed, requestProgress?.total]);
  
  // Don't render if no progress data or dismissed
  if (!requestProgress || dismissed) {
    return null;
  }
  
  // Only show progress bar if there's actual progress to show
  if (requestProgress.total === 0) {
    return null;
  }
  
  const total = requestProgress.total || 0;
  // Ensure completed is never displayed as 0 when processing is complete
  const completed = !requestProgress.inProgress && requestProgress.completed === 0 && total > 0 
    ? total 
    : (requestProgress.completed || 0);
  const inProgress = requestProgress.inProgress || false;
  const error = requestProgress.error || false;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  
  // Determine the status message - only show "Processing failed" if there's an actual error
  const statusMessage = !inProgress 
    ? (error ? "Processing failed" : "Processing complete") 
    : "Processing requests";
  
  return (
    <Paper 
      shadow="md" 
      p="md" 
      withBorder 
      style={{ 
        position: 'fixed', 
        bottom: 80,
        right: 20, 
        zIndex: 999, // Lower z-index to not interfere with context menus
        width: 300,
        backgroundColor: 'white',
        borderLeft: `4px solid ${error ? '#fa5252' : '#228be6'}`,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
        pointerEvents: 'auto' // Ensure clicks work
      }}
    >
      <Box>
        <Group justify="space-between" mb={5}>
          <Text size="sm" fw={500}>{statusMessage}</Text>
          <Group gap="xs">
            <Text size="sm" c="dimmed">
              {completed} / {total}
            </Text>
            <ActionIcon 
              size="xs" 
              variant="subtle" 
              onClick={() => setDismissed(true)}
              aria-label="Close progress bar"
            >
              <IconX size={14} />
            </ActionIcon>
          </Group>
        </Group>
        <Progress 
          value={percentage} 
          size="md" 
          radius="xl" 
          color={error ? "red" : "blue"}
          striped={inProgress}
          animated={inProgress}
        />
        <Text size="xs" ta="center" mt={5} c="dimmed">
          {percentage}% complete
        </Text>
      </Box>
    </Paper>
  );
}
