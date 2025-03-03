import { API_ENDPOINTS, DEFAULT_HEADERS } from '../../config/api';
import { useStore } from '../../config/store';

// Error class for table state API errors
export class TableStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TableStateError';
  }
}

// Interface for table state data
export interface TableState {
  id: string;
  name: string;
  data: any;
  created_at: string;
  updated_at: string;
}

// Interface for table state list response
export interface TableStateListResponse {
  items: TableState[];
}

/**
 * Save the current table state to the backend
 * @param tableId The ID of the table to save
 * @param tableName The name of the table
 * @param tableData The table data to save
 * @returns The saved table state
 */
export async function saveTableState(tableId: string, tableName: string, tableData: any): Promise<TableState> {
  try {
    const token = useStore.getState().auth.token;
    
    if (!token) {
      throw new TableStateError('Authentication required');
    }
    
    const response = await fetch(`${API_ENDPOINTS.API_V1}/table-state/`, {
      method: 'POST',
      headers: {
        ...DEFAULT_HEADERS,
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        id: tableId,
        name: tableName,
        data: tableData
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new TableStateError(errorData.detail || 'Failed to save table state');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error saving table state:', error);
    throw error instanceof TableStateError 
      ? error 
      : new TableStateError(error instanceof Error ? error.message : 'Unknown error');
  }
}

/**
 * Update an existing table state
 * @param tableId The ID of the table to update
 * @param tableData The updated table data
 * @returns The updated table state
 */
export async function updateTableState(tableId: string, tableData: any): Promise<TableState> {
  try {
    const token = useStore.getState().auth.token;
    
    if (!token) {
      throw new TableStateError('Authentication required');
    }
    
    const response = await fetch(`${API_ENDPOINTS.API_V1}/table-state/${tableId}`, {
      method: 'PUT',
      headers: {
        ...DEFAULT_HEADERS,
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        data: tableData
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new TableStateError(errorData.detail || 'Failed to update table state');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error updating table state:', error);
    throw error instanceof TableStateError 
      ? error 
      : new TableStateError(error instanceof Error ? error.message : 'Unknown error');
  }
}

/**
 * Get a table state by ID
 * @param tableId The ID of the table to get
 * @returns The table state
 */
export async function getTableState(tableId: string): Promise<TableState> {
  try {
    const token = useStore.getState().auth.token;
    
    if (!token) {
      throw new TableStateError('Authentication required');
    }
    
    const response = await fetch(`${API_ENDPOINTS.API_V1}/table-state/${tableId}`, {
      method: 'GET',
      headers: {
        ...DEFAULT_HEADERS,
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new TableStateError('Table state not found');
      }
      
      const errorData = await response.json();
      throw new TableStateError(errorData.detail || 'Failed to get table state');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error getting table state:', error);
    throw error instanceof TableStateError 
      ? error 
      : new TableStateError(error instanceof Error ? error.message : 'Unknown error');
  }
}

/**
 * List all table states
 * @returns A list of table states
 */
export async function listTableStates(): Promise<TableStateListResponse> {
  try {
    const token = useStore.getState().auth.token;
    
    if (!token) {
      throw new TableStateError('Authentication required');
    }
    
    const response = await fetch(`${API_ENDPOINTS.API_V1}/table-state/`, {
      method: 'GET',
      headers: {
        ...DEFAULT_HEADERS,
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new TableStateError(errorData.detail || 'Failed to list table states');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error listing table states:', error);
    throw error instanceof TableStateError 
      ? error 
      : new TableStateError(error instanceof Error ? error.message : 'Unknown error');
  }
}

/**
 * Delete a table state by ID
 * @param tableId The ID of the table to delete
 */
export async function deleteTableState(tableId: string): Promise<void> {
  try {
    const token = useStore.getState().auth.token;
    
    if (!token) {
      throw new TableStateError('Authentication required');
    }
    
    const response = await fetch(`${API_ENDPOINTS.API_V1}/table-state/${tableId}`, {
      method: 'DELETE',
      headers: {
        ...DEFAULT_HEADERS,
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new TableStateError(errorData.detail || 'Failed to delete table state');
    }
  } catch (error) {
    console.error('Error deleting table state:', error);
    throw error instanceof TableStateError 
      ? error 
      : new TableStateError(error instanceof Error ? error.message : 'Unknown error');
  }
}
