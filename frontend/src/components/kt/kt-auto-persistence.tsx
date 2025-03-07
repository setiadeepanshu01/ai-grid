import { useEffect, useRef } from "react";
import { useStore } from "@config/store";
import { debounce } from "lodash-es";

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
  
  // Track the previous table state to detect changes
  const prevTableStateRef = useRef<any>(null);
  
  // Track the last save time
  const lastSaveTimeRef = useRef<number>(0);
  
  // Load the latest table state when the component mounts and the user is authenticated
  useEffect(() => {
    if (isAuthenticated) {
      // Load the latest table state
      useStore.getState().loadLatestTableState()
        .then(() => {
          // No logs or notifications for normal operation
          isFirstLoad.current = false;
          
          // Initialize the previous state reference after loading with the same format
          // as we'll use for change detection
          try {
            const table = useStore.getState().getTable();
            prevTableStateRef.current = {
              id: table.id,
              name: table.name,
              columnCount: table.columns.length,
              rowCount: table.rows.length,
              columnsHash: JSON.stringify(table.columns.map(c => ({ 
                id: c.id, 
                entityType: c.entityType,
                query: c.query,
                type: c.type,
                generate: c.generate,
                rules: c.rules
              }))),
              rowsHash: JSON.stringify(table.rows.map(r => ({
                id: r.id,
                hidden: r.hidden,
                sourceDataId: r.sourceData?.type === 'document' ? r.sourceData.document.id : null,
                cellCount: Object.keys(r.cells).length
              }))),
              globalRulesHash: JSON.stringify(table.globalRules),
              filtersHash: JSON.stringify(table.filters)
            };
          } catch (e) {
            prevTableStateRef.current = null;
          }
        })
        .catch((error) => {
          // Just log the error without showing notifications
          console.error('Error loading table state:', error);
        });
    }
  }, [isAuthenticated]);
  
  // Save the table state only when it actually changes
  useEffect(() => {
    if (!isAuthenticated || !tableState) return;
    
    // Skip the first render after loading
    if (isFirstLoad.current) return;
    
    // Check if there are actual changes by comparing with previous state
    // We only compare the important parts that would trigger a save
    const currentState = {
      id: tableState.id,
      name: tableState.name,
      // Only include the essential properties that would trigger a save
      // Exclude large objects like chunks that change frequently but don't need to be saved
      columnCount: tableState.columns.length,
      rowCount: tableState.rows.length,
      // Use a hash of the data instead of the full objects
      columnsHash: JSON.stringify(tableState.columns.map(c => ({ 
        id: c.id, 
        entityType: c.entityType,
        query: c.query,
        type: c.type,
        generate: c.generate,
        rules: c.rules
      }))),
      rowsHash: JSON.stringify(tableState.rows.map(r => ({
        id: r.id,
        hidden: r.hidden,
        // Only include the source data ID, not the full object
        sourceDataId: r.sourceData?.type === 'document' ? r.sourceData.document.id : null,
        // Count the cells instead of including all cell data
        cellCount: Object.keys(r.cells).length
      }))),
      globalRulesHash: JSON.stringify(tableState.globalRules),
      filtersHash: JSON.stringify(tableState.filters)
    };
    
    // Skip if there are no changes - use a fast string comparison first
    if (prevTableStateRef.current && 
        currentState.columnCount === prevTableStateRef.current.columnCount &&
        currentState.rowCount === prevTableStateRef.current.rowCount &&
        currentState.columnsHash === prevTableStateRef.current.columnsHash &&
        currentState.rowsHash === prevTableStateRef.current.rowsHash &&
        currentState.globalRulesHash === prevTableStateRef.current.globalRulesHash &&
        currentState.filtersHash === prevTableStateRef.current.filtersHash) {
      return;
    }
    
    // Update the previous state reference with a deep clone to avoid reference issues
    prevTableStateRef.current = { ...currentState };
    
    // Check if we've saved recently (minimum 10 seconds between saves)
    const currentTime = Date.now();
    if (currentTime - lastSaveTimeRef.current < 10000) {
      return;
    }
    
    // Debounce the save operation to avoid too many saves
    const debouncedSave = debounce(() => {
      // Update the last save time
      lastSaveTimeRef.current = Date.now();
      
      // Try to save to the backend without showing errors to the user
      useStore.getState().saveTableState()
        .then(() => {
          // No logs or notifications for normal operation
        })
        .catch((error) => {
          // Just log the error without showing notifications
          console.error('Error saving table state:', error);
        });
    }, 5000); // Save after 5 seconds of inactivity
    
    debouncedSave();
    
    // Clean up the debounce function
    return () => {
      debouncedSave.cancel();
    };
  }, [isAuthenticated, tableState]);
  
  // This component doesn't render anything
  return null;
}
