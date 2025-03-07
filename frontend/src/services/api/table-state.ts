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
  let lastError: any;
  let attempt = 0;
  
  while (attempt <= retries) {
    try {
      const response = await fetchFn();
      
      // For 502 Bad Gateway or 504 Gateway Timeout, retry
      if ((response.status === 502 || response.status === 504) && attempt < retries) {
        console.log(`Received ${response.status} status, retrying (${retries - attempt} retries left) after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        attempt++;
        delay *= 2; // Exponential backoff
        continue;
      }
      
      // For 404 Not Found, we'll handle it at a higher level
      // by trying to create the resource instead
      
      return response;
    } catch (error) {
      lastError = error;
      
      // If it's a network error (TypeError) or CORS error, retry
      const shouldRetry = 
        error instanceof TypeError || // Network error
        (error instanceof ApiError && (error.status === 502 || error.status === 504 || error.status === 0)); // Gateway errors or CORS
      
      if (!shouldRetry || attempt >= retries) break;
      
      console.log(`Retrying fetch (${retries - attempt} retries left) after ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      attempt++;
      delay *= 2; // Exponential backoff
    }
  }
  
  // If we've exhausted all retries, throw the last error
  throw lastError;
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
        credentials: 'include',
        body: JSON.stringify({
          id: tableId,
          name: tableName,
          data: tableData
        })
      }),
      5, // Increased to 5 retries
      3000 // Increased initial delay to 3 seconds
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
        credentials: 'include',
        body: JSON.stringify({
          data: tableData
        })
      }),
      5, // Increased to 5 retries
      3000 // Increased initial delay to 3 seconds
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
    
    const response = await retryFetch(
      () => fetch(`${API_ENDPOINTS.API_V1}/table-state/${tableId}`, {
        method: 'GET',
        headers: getAuthHeaders(),
        credentials: 'include'
      }),
      5, // 5 retries
      3000 // 3 seconds initial delay
    );
    
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
        credentials: 'include'
      }),
      5, // Increased to 5 retries
      3000 // Increased initial delay to 3 seconds
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
    
    const response = await retryFetch(
      () => fetch(`${API_ENDPOINTS.API_V1}/table-state/${tableId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        credentials: 'include'
      }),
      5, // 5 retries
      3000 // 3 seconds initial delay
    );
    
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
