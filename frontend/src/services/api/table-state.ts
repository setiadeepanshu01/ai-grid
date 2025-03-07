import { API_ENDPOINTS, getAuthHeaders, ApiError } from '../../config/api';
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
 * Helper function to retry a fetch request with exponential backoff
 * @param fetchFn Function that performs the fetch operation
 * @param retries Number of retries
 * @param delay Initial delay in ms
 * @returns Promise with the fetch result
 */
const retryFetch = async (
  fetchFn: () => Promise<Response>,
  retries = 3,
  delay = 3000
): Promise<Response> => {
  try {
    return await fetchFn();
  } catch (error) {
    // Check if we should retry
    if (retries <= 0) throw error;
    
    // If it's a network error or 502 Bad Gateway, retry
    const shouldRetry = 
      error instanceof TypeError || // Network error
      (error instanceof ApiError && error.status === 502); // Bad Gateway
    
    if (!shouldRetry) throw error;
    
    console.log(`Retrying fetch (${retries} retries left) after ${delay}ms...`);
    
    // Wait before retrying
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Retry with exponential backoff
    return retryFetch(fetchFn, retries - 1, delay * 2);
  }
};

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
    
    // Log the API endpoint and headers for debugging
    const headers = getAuthHeaders();
    // console.log('Saving table state to:', `${API_ENDPOINTS.API_V1}/table-state/`);
    // console.log('With headers:', JSON.stringify(headers));
    
    const response = await retryFetch(
      () => fetch(`${API_ENDPOINTS.API_V1}/table-state/`, {
        method: 'POST',
        headers: headers,
        mode: 'cors',
        credentials: 'include',
        body: JSON.stringify({
          id: tableId,
          name: tableName,
          data: tableData
        })
      }),
      2, // 2 retries
      1000 // 1 second initial delay
    );
    
    console.log('Save table state response:', response.status, response.statusText);
    
    if (!response.ok) {
      let errorMessage = 'Failed to save table state';
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorMessage;
      } catch (e) {
        // If we can't parse the error response, just use the status text
        errorMessage = `Failed to save table state: ${response.statusText}`;
      }
      throw new TableStateError(errorMessage);
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
    
    // Log the API endpoint and headers for debugging
    const headers = getAuthHeaders();
    // console.log('Updating table state at:', `${API_ENDPOINTS.API_V1}/table-state/${tableId}`);
    // console.log('With headers:', JSON.stringify(headers));
    
    const response = await retryFetch(
      () => fetch(`${API_ENDPOINTS.API_V1}/table-state/${tableId}`, {
        method: 'PUT',
        headers: headers,
        mode: 'cors',
        credentials: 'include',
        body: JSON.stringify({
          data: tableData
        })
      }),
      2, // 2 retries
      1000 // 1 second initial delay
    );
    
    console.log('Update table state response:', response.status, response.statusText);
    
    if (!response.ok) {
      let errorMessage = 'Failed to update table state';
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorMessage;
      } catch (e) {
        // If we can't parse the error response, just use the status text
        errorMessage = `Failed to update table state: ${response.statusText}`;
      }
      throw new TableStateError(errorMessage);
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
      headers: getAuthHeaders(),
      mode: 'cors',
      credentials: 'include'
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
    
    // Log the API endpoint and headers for debugging
    const headers = getAuthHeaders();
    // console.log('Listing table states from:', `${API_ENDPOINTS.API_V1}/table-state/`);
    // console.log('With headers:', JSON.stringify(headers));
    
    const response = await retryFetch(
      () => fetch(`${API_ENDPOINTS.API_V1}/table-state/`, {
        method: 'GET',
        headers: headers,
        mode: 'cors',
        credentials: 'include'
      }),
      2, // 2 retries
      1000 // 1 second initial delay
    );
    
    console.log('List table states response:', response.status, response.statusText);
    
    if (!response.ok) {
      let errorMessage = 'Failed to list table states';
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorMessage;
      } catch (e) {
        // If we can't parse the error response, just use the status text
        errorMessage = `Failed to list table states: ${response.statusText}`;
      }
      throw new TableStateError(errorMessage);
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
      headers: getAuthHeaders(),
      mode: 'cors',
      credentials: 'include'
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
