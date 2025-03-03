import { useEffect, useRef } from "react";
import { useStore } from "@config/store";
import { debounce } from "lodash-es";
import { notifications } from "@utils/notifications";

/**
 * Component that automatically saves and loads table state
 * This component doesn't render anything, it just adds the auto-save functionality
 */
export function KtAutoPersistence() {
  const isAuthenticated = useStore(state => state.auth.isAuthenticated);
  const tableState = useStore(state => {
    try {
      const table = state.getTable();
      return {
        id: table.id,
        name: table.name,
        columns: table.columns,
        rows: table.rows,
        globalRules: table.globalRules,
        filters: table.filters,
        chunks: table.chunks,
        openedChunks: table.openedChunks,
      };
    } catch (e) {
      return null;
    }
  });
  
  // Track if this is the first load
  const isFirstLoad = useRef(true);
  
  // Load the latest table state when the component mounts and the user is authenticated
  useEffect(() => {
    if (isAuthenticated) {
      // Load the latest table state
      useStore.getState().loadLatestTableState()
        .then(() => {
          // No logs or notifications for normal operation
          isFirstLoad.current = false;
        })
        .catch((error) => {
          console.error('Error loading table state:', error);
          // Only show error notifications
          notifications.show({
            title: 'Load failed',
            message: 'Failed to load table state',
            color: 'red'
          });
        });
    }
  }, [isAuthenticated]);
  
  // Save the table state whenever it changes
  useEffect(() => {
    if (!isAuthenticated || !tableState) return;
    
    // Debounce the save operation to avoid too many saves
    const debouncedSave = debounce(() => {
      useStore.getState().saveTableState()
        .then(() => {
          // No logs or notifications for normal operation
        })
        .catch((error) => {
          console.error('Error saving table state:', error);
          // Only show error notifications
          notifications.show({
            title: 'Save failed',
            message: 'Failed to save table state',
            color: 'red'
          });
        });
    }, 2000); // Save after 2 seconds of inactivity
    
    debouncedSave();
    
    // Clean up the debounce function
    return () => {
      debouncedSave.cancel();
    };
  }, [isAuthenticated, tableState]);
  
  // This component doesn't render anything
  return null;
}
