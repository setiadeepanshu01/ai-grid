/**
 * API configuration for the frontend
 */
import { z } from 'zod';
// Get the API URL from environment variables or use a default
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
// API error class
export class ApiError extends Error {
  status: number;
  
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}
// API schemas
export const chunkSchema = z.object({
  id: z.string(),
  text: z.string(),
  content: z.string(),
  page: z.number(),
  metadata: z.record(z.any()).optional(),
});
export const documentSchema = z.object({
  id: z.string(),
  name: z.string(),
  page_count: z.number().optional(),
  author: z.string().optional(),
  tag: z.string().optional(),
  chunks: z.array(chunkSchema).optional(),
});
export const answerSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.array(z.number()),
  z.object({
    text: z.string(),
    chunks: z.array(chunkSchema).optional(),
    resolvedEntities: z.array(z.any()).optional(),
  })
]);
// API functions
export const uploadFile = async (file: File): Promise<any> => {
  const formData = new FormData();
  formData.append('file', file);
  
  console.log('Uploading file to:', API_ENDPOINTS.DOCUMENT_UPLOAD);
  
  try {
    const response = await fetch(API_ENDPOINTS.DOCUMENT_UPLOAD, {
      method: 'POST',
      body: formData,
      mode: 'cors',
      credentials: 'include',
      headers: getUploadHeaders()
    });
    
    if (!response.ok) {
      throw new ApiError(`Failed to upload file: ${response.statusText}`, response.status);
    }
    
    return response.json();
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
};
export const uploadFiles = async (files: File[]): Promise<any> => {
  const formData = new FormData();
  
  // Append each file with the same field name
  files.forEach(file => {
    formData.append('files', file);
  });
  
  console.log(`Uploading ${files.length} files in batch to:`, API_ENDPOINTS.BATCH_DOCUMENT_UPLOAD);
  
  try {
    const response = await fetch(API_ENDPOINTS.BATCH_DOCUMENT_UPLOAD, {
      method: 'POST',
      body: formData,
      mode: 'cors',
      credentials: 'include',
      headers: getUploadHeaders()
    });
    
    if (!response.ok) {
      throw new ApiError(`Failed to upload files: ${response.statusText}`, response.status);
    }
    
    return response.json();
  } catch (error) {
    console.error('Error uploading files:', error);
    throw error;
  }
};
export const runQuery = async (row: any, column: any, globalRules: any = []): Promise<any> => {
  // Get document ID from the row's sourceData
  const documentId = row?.sourceData?.document?.id || "00000000000000000000000000000000";
  
  // Create a unique prompt ID if not provided
  const promptId = column?.id || Math.random().toString(36).substring(2, 15);
  
  // Combine column rules with global rules
  const rules = [...(column?.rules || []), ...(globalRules || [])];
  
  console.log('Running query to:', API_ENDPOINTS.QUERY);
  
  try {
    const response = await fetch(API_ENDPOINTS.QUERY, {
      method: 'POST',
      headers: getAuthHeaders(),
      mode: 'cors',
      credentials: 'include',
      body: JSON.stringify({
        document_id: documentId,
        prompt: {
          id: promptId,
          entity_type: column?.entityType || "",
          query: column?.query || "",
          type: column?.type || "str",
          rules: rules
        }
      }),
    });
    
    if (!response.ok) {
      throw new ApiError(`Query failed: ${response.statusText}`, response.status);
    }
    
    return response.json();
  } catch (error) {
    console.error('Error running query:', error);
    throw error;
  }
};
/**
 * Run multiple queries in parallel using the batch endpoint
 * @param queries Array of query objects, each containing row, column, and globalRules
 * @returns Array of query results in the same order as the input queries
 */
export const fetchDocumentPreview = async (documentId: string): Promise<string> => {
  console.log(`Fetching document preview for ID: ${documentId}`);
  console.log(`Preview URL: ${API_ENDPOINTS.DOCUMENT_PREVIEW(documentId)}`);
  
  try {
    const response = await fetch(API_ENDPOINTS.DOCUMENT_PREVIEW(documentId), {
      method: 'GET',
      headers: getAuthHeaders(),
      mode: 'cors',
      credentials: 'include',
    });
    
    console.log(`Preview response status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      console.error(`Error response from preview endpoint: ${response.status} ${response.statusText}`);
      throw new ApiError(`Failed to fetch document preview: ${response.statusText}`, response.status);
    }
    
    const data = await response.json();
    console.log(`Preview response data:`, data);
    
    if (!data || !data.content) {
      console.error('No content in preview response:', data);
      return '';
    }
    
    return data.content;
  } catch (error) {
    console.error('Error fetching document preview:', error);
    throw error;
  }
};
/**
 * Interface defining options for batch query processing
 */
export interface BatchQueryOptions {
  batchSize?: number;
  processIndividually?: boolean;
  onBatchProgress?: (results: any[], batchIndex: number, totalBatches: number) => void;
  onQueryProgress?: (result: any, index: number, total: number) => void;
  cancelSignal?: { isCancelled: boolean };
}

/**
 * Cancels all active queries by calling the backend cancellation endpoint.
 * 
 * @returns Promise resolving to the cancellation result from the server
 */
export const cancelAllQueries = async (): Promise<any> => {
  try {
    const response = await fetch(API_ENDPOINTS.CANCEL_QUERIES, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        cancel_all: true
      })
    });
    
    if (!response.ok) {
      throw new ApiError(`Failed to cancel queries: ${response.statusText}`, response.status);
    }
    
    return response.json();
  } catch (error) {
    console.error('Error cancelling queries:', error);
    throw error;
  }
};

/**
 * Runs batch queries with improved handling for large batches.
 * This implementation supports both single batch mode and individual processing.
 * 
 * @param queries Array of query objects, each containing row, column, and globalRules
 * @param options Configuration options for batch processing
 * @returns Promise resolving to an array of query results in the same order as input
 */
export const runBatchQueries = async (
  queries: Array<{ row: any; column: any; globalRules?: any[]; }>,
  options: BatchQueryOptions = {}
): Promise<any[]> => {
  const {
    batchSize = 10,
    processIndividually = false,
    onBatchProgress,
    onQueryProgress,
    cancelSignal
  } = options;
  
  // Format the queries for the batch endpoint
  const formattedQueries = queries.map(({ row, column, globalRules = [] }) => {
    const documentId = row?.sourceData?.document?.id || "00000000000000000000000000000000";
    const promptId = column?.id || Math.random().toString(36).substring(2, 15);
    const rules = [...(column?.rules || []), ...(globalRules || [])];
    
    return {
      document_id: documentId,
      prompt: {
        id: promptId,
        entity_type: column?.entityType || "",
        query: column?.query || "",
        type: column?.type || "str",
        rules: rules
      },
      // Store original query info for callbacks
      _originalQuery: { row, column, index: 0 } 
    };
  });
  // Update the index information
  formattedQueries.forEach((query, index) => {
    query._originalQuery.index = index;
  });
  
  // Check if operation is cancelled before starting
  if (cancelSignal?.isCancelled) {
    console.log('Operation cancelled before starting');
    return new Array(formattedQueries.length); // Return empty results array
  }
  
  // If processing individually, run each query separately and collect results
  if (processIndividually) {
    const results: any[] = new Array(formattedQueries.length);
    const controllers: AbortController[] = formattedQueries.map(() => new AbortController());
    
    // Setup a checker to abort pending requests if cancelSignal becomes true
    const checkCancellation = setInterval(() => {
      if (cancelSignal?.isCancelled) {
        console.log('Cancelling all pending individual requests');
        controllers.forEach(controller => controller.abort());
        clearInterval(checkCancellation);
      }
    }, 100); // Check every 100ms
    
    try {
      const promises = formattedQueries.map(async (query, index) => {
        // Check for cancellation before each query
        if (cancelSignal?.isCancelled) {
          throw new ApiError('Operation cancelled by user', 499);
        }
        
        try {
          const response = await fetch(API_ENDPOINTS.QUERY, {
            method: 'POST',
            headers: getAuthHeaders(),
            mode: 'cors',
            credentials: 'include',
            body: JSON.stringify({
              document_id: query.document_id,
              prompt: query.prompt
            }),
            signal: controllers[index].signal,
          });
          
          // Check for cancellation after response but before processing
          if (cancelSignal?.isCancelled) {
            throw new ApiError('Operation cancelled by user', 499);
          }
          
          if (!response.ok) {
            throw new ApiError(`Query failed: ${response.statusText}`, response.status);
          }
          
          const result = await response.json();
          results[index] = result;
          
          // Call progress callback if provided
          if (onQueryProgress && !cancelSignal?.isCancelled) {
            onQueryProgress(result, index, formattedQueries.length);
          }
          
          return result;
        } catch (error: unknown) {
          // Check if this is an AbortError
          if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
            console.log(`Request ${index} aborted due to user cancellation`);
            throw new ApiError('Operation cancelled by user', 499);
          }
          
          console.error(`Error running individual query ${index}:`, error);
          if (onQueryProgress && !cancelSignal?.isCancelled) {
            onQueryProgress({ error }, index, formattedQueries.length);
          }
          throw error;
        }
      });
      
      await Promise.allSettled(promises);
    } finally {
      // Clean up the interval regardless of outcome
      clearInterval(checkCancellation);
    }
    
    return results;
  }
  
  // Process in batches
  const batches = [];
  for (let i = 0; i < formattedQueries.length; i += batchSize) {
    batches.push(formattedQueries.slice(i, i + batchSize));
  }
  
  console.log(`Running ${batches.length} batch queries with ${formattedQueries.length} total queries`);
  
  const results: any[] = new Array(formattedQueries.length);
  
  // Process each batch
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    // Check for cancellation before each batch
    if (cancelSignal?.isCancelled) {
      console.log('Operation cancelled - skipping all remaining batches');
      // End immediately by returning partially filled results
      return results;
    }
    
    const batch = batches[batchIndex];
    
    try {
      console.log(`Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} queries`);
      
      // Create an AbortController for this batch that can be cancelled
      const controller = new AbortController();
      
      // Setup a checker that will abort the request if cancelSignal becomes true
      const checkCancellation = setInterval(() => {
        if (cancelSignal?.isCancelled) {
          clearInterval(checkCancellation);
          controller.abort();
        }
      }, 100); // Check every 100ms
      
      try {
        const response = await fetch(API_ENDPOINTS.BATCH_QUERY, {
          method: 'POST',
          headers: getAuthHeaders(),
          mode: 'cors',
          credentials: 'include',
          body: JSON.stringify(batch.map(q => ({ document_id: q.document_id, prompt: q.prompt }))),
          signal: controller.signal,
        });
        
        // Clear the interval since we don't need it anymore
        clearInterval(checkCancellation);
        
        // Check for cancellation after response but before processing
        if (cancelSignal?.isCancelled) {
          throw new ApiError('Operation cancelled by user', 499);
        }
        
        if (!response.ok) {
          throw new ApiError(`Batch query failed: ${response.statusText}`, response.status);
        }
        
        const batchResults = await response.json();
        
        // Map batch results to the correct positions in the final results array
        batchResults.forEach((result: any, resultIndex: number) => {
          const originalIndex = batch[resultIndex]._originalQuery.index;
          results[originalIndex] = result;
        });
        
        // Call batch progress callback if provided
        if (onBatchProgress && !cancelSignal?.isCancelled) {
          onBatchProgress(batchResults, batchIndex, batches.length);
        }
      } catch (fetchError: unknown) {
        // Clear the interval if there was an error
        clearInterval(checkCancellation);
        
        // Handle abort error from fetch specifically
        if (fetchError && typeof fetchError === 'object' && 'name' in fetchError && fetchError.name === 'AbortError') {
          console.log('Request aborted due to user cancellation');
          throw new ApiError('Operation cancelled by user', 499);
        }
        
        // Rethrow the original error
        throw fetchError;
      }
      
    } catch (error) {
      console.error(`Error running batch ${batchIndex + 1}:`, error);
      
      // Check if this is a cancellation error and break out of the loop
      if (error instanceof ApiError && error.status === 499) {
        console.log('Cancelling all remaining batches');
        throw error;  // Re-throw to exit the outer loop
      }
      
      // Re-throw other errors
      throw error;
    }
  }
  
  return results;
};
// API endpoints
export const API_ENDPOINTS = {
  // Base API URL
  BASE_URL: API_URL,
  
  // API version path
  API_V1: `${API_URL}/api/v1`,
  
  // Document endpoints
  DOCUMENTS: `${API_URL}/api/v1/document`,
  DOCUMENT_UPLOAD: `${API_URL}/api/v1/document`,
  BATCH_DOCUMENT_UPLOAD: `${API_URL}/api/v1/document/batch`,
  DOCUMENT_PROCESS: `${API_URL}/api/v1/document/process`,
  DOCUMENT_PREVIEW: (id: string) => `${API_URL}/api/v1/document/${id}/preview`,
  
  // Graph endpoints
  GRAPHS: `${API_URL}/api/v1/graphs`,
  GRAPH_CREATE: `${API_URL}/api/v1/graphs/create`,
  
  // Query endpoints
  QUERY: `${API_URL}/api/v1/query`,
  BATCH_QUERY: `${API_URL}/api/v1/query/batch`,
  CANCEL_QUERIES: `${API_URL}/api/v1/query/cancel`,
  
  // Health check
  HEALTH: `${API_URL}/ping`,
};
import { useStore } from './store';
// Function to get headers with authentication token
export const getAuthHeaders = () => {
  const token = useStore.getState().auth.token;
  
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};
// Default request headers
export const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
};
// Function to get upload headers with authentication token
export const getUploadHeaders = () => {
  const token = useStore.getState().auth.token;
  
  return {
    'Accept': 'application/json',
    'Origin': 'https://ai-grid.onrender.com',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};
// File upload headers
export const UPLOAD_HEADERS = {
  'Accept': 'application/json',
  'Origin': 'https://ai-grid.onrender.com',
};
// Request timeout in milliseconds
export const REQUEST_TIMEOUT = 30000;
