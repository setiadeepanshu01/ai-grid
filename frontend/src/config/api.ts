/**
 * API configuration for the frontend
 */
import { z } from 'zod';
// Get the API URL from environment variables or use a default
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
// Log the API URL for debugging
// console.log('API URL:', API_URL);
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
 * Runs batch queries with improved handling for large batches.
 * This implementation supports both single batch mode and individual processing.
 * 
 * @param queries Array of query objects, each containing row, column, and globalRules
 * @param options Configuration options for batch processing
 * @returns Promise resolving to an array of query results in the same order as input
 */
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
      
      // For 404 Not Found on table state, we'll handle it at a higher level
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

export const runBatchQueries = async (
  queries: Array<{ row: any; column: any; globalRules?: any[]; }>,
  options: {
    batchSize?: number;
    processIndividually?: boolean;
    onBatchProgress?: (results: any[], batchIndex: number, totalBatches: number) => void;
    onQueryProgress?: (result: any, index: number, total: number) => void;
  } = {}
): Promise<any[]> => {
  const {
    batchSize = 10,
    processIndividually = false,
    onBatchProgress,
    onQueryProgress
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
  
  // If processing individually, run each query separately and collect results
  if (processIndividually) {
    const results: any[] = new Array(formattedQueries.length);
    const promises = formattedQueries.map(async (query, index) => {
      try {
      const response = await retryFetch(
        () => fetch(API_ENDPOINTS.QUERY, {
          method: 'POST',
          headers: getAuthHeaders(),
          credentials: 'include',
          body: JSON.stringify({
            document_id: query.document_id,
            prompt: query.prompt
          }),
        }),
        2, // 2 retries
        1000 // 1 second initial delay
      );
        
        if (!response.ok) {
          throw new ApiError(`Query failed: ${response.statusText}`, response.status);
        }
        
        const result = await response.json();
        results[index] = result;
        
        // Call progress callback if provided
        if (onQueryProgress) {
          onQueryProgress(result, index, formattedQueries.length);
        }
        
        return result;
      } catch (error) {
        console.error(`Error running individual query ${index}:`, error);
        if (onQueryProgress) {
          onQueryProgress({ error }, index, formattedQueries.length);
        }
        throw error;
      }
    });
    
    await Promise.allSettled(promises);
    return results;
  }
  
  // Validate that we have at least one query before creating batches
  if (formattedQueries.length === 0) {
    console.warn("No queries to process, returning empty results");
    return [];
  }
  
  // Process in batches - ensure batchSize is at least 1
  const safeBatchSize = Math.max(1, batchSize);
  const batches = [];
  for (let i = 0; i < formattedQueries.length; i += safeBatchSize) {
    batches.push(formattedQueries.slice(i, i + safeBatchSize));
  }
  
  console.log(`Running ${batches.length} batch queries with ${formattedQueries.length} total queries`);
  
  // Initialize results array with the exact length needed
  const results: any[] = new Array(formattedQueries.length);
  
  // Process each batch
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    
    try {
      console.log(`Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} queries`);
      
      // Use fallback to individual queries if batch size is extremely large (more than 50 items)
      // This is a safety fallback only for very large batches
      if (batch.length > 50) {
        console.log(`Large batch detected (${batch.length} items), processing individually`);
        
        // Process each query individually but in parallel
        const individualResults = await Promise.allSettled(
          batch.map(query => 
            fetch(API_ENDPOINTS.QUERY, {
              method: 'POST',
              headers: getAuthHeaders(),
              credentials: 'include',
              body: JSON.stringify({ 
                document_id: query.document_id, 
                prompt: query.prompt 
              }),
            })
            .then(resp => {
              if (!resp.ok) {
                console.warn(`Individual query failed: ${resp.status} ${resp.statusText}`);
                return null;
              }
              return resp.json();
            })
            .catch(err => {
              console.error('Error in individual query:', err);
              return null;
            })
          )
        );
        
        // Process results from individual queries
        const batchResults = individualResults.map(result => 
          result.status === 'fulfilled' && result.value ? result.value : null
        );
        
        console.log(`Processed ${batchResults.filter(r => r !== null).length} of ${batch.length} queries individually`);
        
        // Map batch results to the correct positions in the final results array
        for (let resultIndex = 0; resultIndex < batch.length; resultIndex++) {
          try {
            const originalIndex = batch[resultIndex]._originalQuery.index;
            
            // Make sure the original index is within bounds
            if (originalIndex >= 0 && originalIndex < results.length && batchResults[resultIndex]) {
              results[originalIndex] = batchResults[resultIndex];
            }
          } catch (error) {
            console.error(`Error mapping individual result at index ${resultIndex}:`, error);
          }
        }
        
        // Call batch progress callback if provided
        if (onBatchProgress) {
          try {
            const safeResults = batchResults.filter(r => r !== null);
            onBatchProgress(safeResults, batchIndex, batches.length);
          } catch (error) {
            console.error("Error in batch progress callback:", error);
          }
        }
        
        // Skip the rest of the batch processing for this batch
        continue;
      }
      
      // For small batches, use the batch API as normal
      const response = await retryFetch(
        () => fetch(API_ENDPOINTS.BATCH_QUERY, {
          method: 'POST',
          headers: getAuthHeaders(),
          credentials: 'include',
          body: JSON.stringify(batch.map(q => ({ document_id: q.document_id, prompt: q.prompt }))),
        }),
        2, // 2 retries
        1000 // 1 second initial delay
      );
      
      if (!response.ok) {
        // Get more detailed error information
        try {
          const errorText = await response.text();
          console.error("Batch query error details:", errorText);
          
          // Try to parse as JSON for more detailed error info
          try {
            const errorJson = JSON.parse(errorText);
            throw new ApiError(`Batch query failed: ${errorJson.detail || response.statusText}`, response.status);
          } catch (jsonError) {
            // If JSON parsing fails, use the raw text
            throw new ApiError(`Batch query failed: ${errorText || response.statusText}`, response.status);
          }
        } catch (textError) {
          // If we can't even get the response text, fall back to status text
          throw new ApiError(`Batch query failed: ${response.statusText}`, response.status);
        }
      }
      
      let batchResults;
      try {
        batchResults = await response.json();
      } catch (error) {
        console.error('Error parsing batch response JSON:', error);
        throw new ApiError('Invalid JSON in batch response', response.status);
      }
      
      // Validate that batchResults is an array
      if (!Array.isArray(batchResults)) {
        console.error('Batch results is not an array:', batchResults);
        // Instead of throwing, create an empty array to avoid breaking the process
        batchResults = [];
      }
      
      // Ensure batchResults doesn't exceed batch length
      if (batchResults.length > batch.length) {
        console.warn(`Batch results length (${batchResults.length}) exceeds batch length (${batch.length}), truncating`);
        batchResults = batchResults.slice(0, batch.length);
      }
      
      // Map batch results to the correct positions in the final results array
      // Handle the case where batchResults.length might not match batch.length
      const validResultsLength = Math.min(batchResults.length, batch.length);
      
      for (let resultIndex = 0; resultIndex < validResultsLength; resultIndex++) {
        try {
          const originalIndex = batch[resultIndex]._originalQuery.index;
          
          // Make sure the original index is within bounds
          if (originalIndex >= 0 && originalIndex < results.length) {
            // Add safety check for malformed results
            try {
              // Validate that the result has the required structure
              if (!batchResults[resultIndex] || 
                  !batchResults[resultIndex].answer ||
                  typeof batchResults[resultIndex].answer !== 'object') {
                console.warn(`Invalid batch result at index ${resultIndex}, creating fallback`);
                // Create a fallback result with the right structure
                results[originalIndex] = {
                  answer: {
                    id: `fallback-${Math.random().toString(36).substring(2)}`,
                    document_id: batch[resultIndex].document_id,
                    prompt_id: batch[resultIndex].prompt.id,
                    answer: batch[resultIndex].prompt.type === 'bool' ? false :
                           batch[resultIndex].prompt.type === 'int' ? 0 :
                           batch[resultIndex].prompt.type.includes('array') ? [] : 
                           "Error: Failed to process query",
                    type: batch[resultIndex].prompt.type
                  },
                  chunks: [],
                  resolved_entities: []
                };
              } else {
                // Valid result, use it
                results[originalIndex] = batchResults[resultIndex];
              }
            } catch (validationError) {
              console.error(`Error validating batch result at index ${resultIndex}:`, validationError);
              // Create fallback for invalid results
              results[originalIndex] = {
                answer: {
                  id: `fallback-${Math.random().toString(36).substring(2)}`,
                  document_id: batch[resultIndex].document_id,
                  prompt_id: batch[resultIndex].prompt.id,
                  answer: "Error: Failed to process query",
                  type: batch[resultIndex].prompt.type
                },
                chunks: [],
                resolved_entities: []
              };
            }
          } else {
            console.error(`Invalid original index: ${originalIndex} for batch result ${resultIndex}`);
          }
        } catch (error) {
          console.error(`Error mapping batch result at index ${resultIndex}:`, error);
        }
      }
      
      // Call batch progress callback if provided
      if (onBatchProgress) {
        try {
          // Create a safe copy of the results for this batch
          const safeResults = batchResults.slice(0, batch.length);
          onBatchProgress(safeResults, batchIndex, batches.length);
        } catch (error) {
          console.error("Error in batch progress callback:", error);
        }
      }
      
    } catch (error) {
      console.error(`Error running batch ${batchIndex + 1}:`, error);
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
  
  // Health check
  HEALTH: `${API_URL}/ping`,
};
import { useStore } from './store';
// Function to get headers with authentication token
export const getAuthHeaders = () => {
  const token = useStore.getState().auth.token;
  
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    // Don't include Origin header as it can cause CORS issues
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
    // Don't include Origin header as it can cause CORS issues
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};
// File upload headers
export const UPLOAD_HEADERS = {
  'Accept': 'application/json',
};
// Request timeout in milliseconds
export const REQUEST_TIMEOUT = 30000;
