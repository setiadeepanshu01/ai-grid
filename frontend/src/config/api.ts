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
 * Advanced batch query executor with robust error handling and retry logic
 * 
 * This implementation uses a sophisticated approach to batch processing:
 * 1. It uses a queue system to manage batch processing
 * 2. It tracks the status of each query and retries failed queries
 * 3. It provides immediate UI updates as results come in
 * 4. It handles network errors and timeouts gracefully
 * 
 * @param queries Array of query objects, each containing row, column, and globalRules
 * @param options Configuration options for batch processing
 * @returns Promise resolving to an array of query results in the same order as input
 */
export const runBatchQueries = async (
  queries: Array<{ row: any; column: any; globalRules?: any[]; }>,
  options: {
    batchSize?: number;
    maxRetries?: number;
    retryDelay?: number;
    onBatchProgress?: (results: any[], batchIndex: number, totalBatches: number) => void;
    onQueryProgress?: (result: any, index: number, total: number) => void;
  } = {}
): Promise<any[]> => {
  console.log(`Starting batch query execution for ${queries.length} queries`);
  
  // Default options with reasonable values
  const {
    batchSize = 20,  // Default to a larger batch size for efficiency
    maxRetries = 3,  // Maximum number of retries for failed queries
    retryDelay = 1000,  // Delay between retries in milliseconds
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
  
  // If no queries, return empty array
  if (formattedQueries.length === 0) {
    console.warn("No queries to process, returning empty results");
    return [];
  }
  
  // Initialize results array with the exact length needed
  const results: any[] = new Array(formattedQueries.length);
  
  // Create batches with the specified batch size
  const batches = createBatches(formattedQueries, batchSize);
  console.log(`Created ${batches.length} batches with batch size ${batchSize}`);
  
  // Track failed queries for retry
  const failedQueries: { query: any; retryCount: number; }[] = [];
  
  // Process each batch
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    console.log(`Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} queries`);
    
    try {
      // Try to process the entire batch
      const batchResults = await processBatch(batch);
      
      // Update results array
      updateResultsFromBatch(batch, batchResults, results);
      
      // Call progress callback if provided
      if (onBatchProgress) {
        try {
          onBatchProgress(batchResults, batchIndex, batches.length);
        } catch (error) {
          console.error("Error in batch progress callback:", error);
        }
      }
      
      // Call individual progress callbacks
      if (onQueryProgress) {
        for (let i = 0; i < batchResults.length; i++) {
          const originalIndex = batch[i]._originalQuery.index;
          try {
            onQueryProgress(batchResults[i], originalIndex, formattedQueries.length);
          } catch (error) {
            console.error(`Error in query progress callback for index ${originalIndex}:`, error);
          }
        }
      }
    } catch (error) {
      console.error(`Error processing batch ${batchIndex + 1}:`, error);
      
      // Add all queries in this batch to the failed queries list
      batch.forEach(query => {
        failedQueries.push({ query, retryCount: 0 });
      });
    }
  }
  
  // Process failed queries with retries
  if (failedQueries.length > 0) {
    console.log(`Processing ${failedQueries.length} failed queries with retries`);
    await processFailedQueries(failedQueries, results, maxRetries, retryDelay, onQueryProgress);
  }
  
  // Fill any missing results with fallbacks
  fillMissingResults(formattedQueries, results);
  
  return results;
};

/**
 * Process failed queries with retry logic
 */
async function processFailedQueries(
  failedQueries: { query: any; retryCount: number; }[],
  results: any[],
  maxRetries: number,
  retryDelay: number,
  onQueryProgress?: (result: any, index: number, total: number) => void
): Promise<void> {
  // Process in smaller batches to avoid overwhelming the server
  const batchSize = 5;
  const batches = createBatches(failedQueries, batchSize);
  
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    console.log(`Processing retry batch ${batchIndex + 1}/${batches.length} with ${batch.length} queries`);
    
    // Process each query in the batch
    const batchPromises = batch.map(async ({ query, retryCount }) => {
      // Skip if we've exceeded max retries
      if (retryCount >= maxRetries) {
        console.log(`Query ${query._originalQuery.index} exceeded max retries`);
        return;
      }
      
      // Add jitter to retry delay to prevent thundering herd
      const jitter = Math.random() * 0.5 + 0.75; // 0.75-1.25
      const delay = retryDelay * jitter * (retryCount + 1);
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
      
      try {
        // Process the query individually
        console.log(`Retry attempt ${retryCount + 1}/${maxRetries} for query ${query._originalQuery.index}`);
        const result = await processIndividualQuery(query);
        
        // Update results array
        const originalIndex = query._originalQuery.index;
        results[originalIndex] = result;
        
        // Call progress callback if provided
        if (onQueryProgress) {
          try {
            onQueryProgress(result, originalIndex, results.length);
          } catch (error) {
            console.error(`Error in query progress callback for index ${originalIndex}:`, error);
          }
        }
        
        return { success: true, query };
      } catch (error) {
        console.error(`Retry attempt ${retryCount + 1} failed for query ${query._originalQuery.index}:`, error);
        
        // If we haven't exceeded max retries, add back to failed queries with incremented retry count
        if (retryCount + 1 < maxRetries) {
          return { success: false, query, retryCount: retryCount + 1 };
        }
        
        // Create fallback result for max retries exceeded
        const fallbackResult = createFallbackResult(query);
        const originalIndex = query._originalQuery.index;
        results[originalIndex] = fallbackResult;
        
        // Call progress callback with fallback
        if (onQueryProgress) {
          try {
            onQueryProgress(fallbackResult, originalIndex, results.length);
          } catch (error) {
            console.error(`Error in query progress callback for index ${originalIndex}:`, error);
          }
        }
        
        return { success: true, query }; // Mark as "success" to remove from retry queue
      }
    });
    
    // Wait for all queries in this batch to complete
    const batchResults = await Promise.all(batchPromises);
    
    // Collect queries that still need retrying
    const queriesToRetry = batchResults
      .filter((result): result is { success: false; query: any; retryCount: number } => 
        result !== undefined && !result.success)
      .map(result => ({ query: result.query, retryCount: result.retryCount }));
    
    // Add queries that need retrying to the next batch
    if (queriesToRetry.length > 0) {
      console.log(`Adding ${queriesToRetry.length} queries to retry queue`);
      failedQueries.push(...queriesToRetry);
    }
  }
}

/**
 * Process a single query
 */
async function processIndividualQuery(query: any): Promise<any> {
  console.log(`Processing individual query for index ${query._originalQuery.index}`);
  
  const startTime = performance.now();
  
  const response = await fetch(API_ENDPOINTS.QUERY, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    mode: 'cors',
    body: JSON.stringify({
      document_id: query.document_id,
      prompt: query.prompt
    }),
    signal: AbortSignal.timeout(45000) // 45 second timeout for individual queries
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Individual query failed with status ${response.status}:`, errorText);
    throw new ApiError(`Query failed: ${response.statusText}`, response.status);
  }
  
  const result = await response.json();
  
  const totalTime = performance.now() - startTime;
  console.log(`Individual query completed in ${Math.round(totalTime)}ms`);
  
  return result;
}

/**
 * Process a batch of queries using the batch API endpoint
 */
async function processBatch(batch: any[]): Promise<any[]> {
  // Calculate an appropriate timeout based on batch size
  // Larger batches need more time (base: 30s, +5s per query)
  const timeoutMs = Math.min(60000, 30000 + (batch.length * 5000));
  
  console.log(`Processing batch of ${batch.length} queries with ${timeoutMs}ms timeout`);
  
  // Add performance tracking
  const startTime = performance.now();
  
  try {
    const response = await fetch(API_ENDPOINTS.BATCH_QUERY, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      mode: 'cors',
      body: JSON.stringify(batch.map(q => ({ 
        document_id: q.document_id, 
        prompt: q.prompt 
      }))),
      signal: AbortSignal.timeout(timeoutMs)
    });
    
    // Log performance metrics
    const endTime = performance.now();
    console.log(`Batch query network time: ${Math.round(endTime - startTime)}ms`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Batch query failed with status ${response.status}:`, errorText);
      throw new ApiError(`Batch query failed: ${response.statusText}`, response.status);
    }
    
    const batchResults = await response.json();
    
    // Log total time including JSON parsing
    const totalTime = performance.now();
    console.log(`Batch query total time: ${Math.round(totalTime - startTime)}ms`);
    
    if (!Array.isArray(batchResults)) {
      console.error('Batch results is not an array:', batchResults);
      throw new Error('Invalid batch response format');
    }
    
    return batchResults;
  } catch (error) {
    // Log detailed error information
    console.error(`Batch query failed after ${Math.round(performance.now() - startTime)}ms:`, error);
    
    // Rethrow with more context
    if (error instanceof Error) {
      throw new Error(`Batch query failed: ${error.message} (batch size: ${batch.length})`);
    }
    throw error;
  }
}

/**
 * Create a fallback result for a failed query
 */
function createFallbackResult(query: any): any {
  return {
    answer: {
      id: `fallback-${Math.random().toString(36).substring(2)}`,
      document_id: query.document_id,
      prompt_id: query.prompt.id,
      answer: query.prompt.type === 'bool' ? false :
             query.prompt.type === 'int' ? 0 :
             query.prompt.type.includes('array') ? [] : 
             "Query failed to process",
      type: query.prompt.type
    },
    chunks: [],
    resolved_entities: []
  };
}

/**
 * Create batches from an array of queries
 */
function createBatches<T>(items: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * Update results array from batch results
 */
function updateResultsFromBatch(batch: any[], batchResults: any[], results: any[]): void {
  // Ensure batchResults doesn't exceed batch length
  const validResultsLength = Math.min(batchResults.length, batch.length);
  
  for (let resultIndex = 0; resultIndex < validResultsLength; resultIndex++) {
    try {
      const originalIndex = batch[resultIndex]._originalQuery.index;
      
      // Make sure the original index is within bounds
      if (originalIndex >= 0 && originalIndex < results.length) {
        // Validate that the result has the required structure
        if (!batchResults[resultIndex] || 
            !batchResults[resultIndex].answer ||
            typeof batchResults[resultIndex].answer !== 'object') {
          console.warn(`Invalid batch result at index ${resultIndex}, skipping`);
          continue;
        }
        
        // Valid result, use it
        results[originalIndex] = batchResults[resultIndex];
      }
    } catch (error) {
      console.error(`Error mapping batch result at index ${resultIndex}:`, error);
    }
  }
}

/**
 * Fill any missing results with fallbacks and ensure UI updates
 */
function fillMissingResults(queries: any[], results: any[]): void {
  let missingCount = 0;
  
  for (let i = 0; i < queries.length; i++) {
    if (!results[i]) {
      const query = queries[i];
      missingCount++;
      
      // Create fallback based on prompt type
      results[i] = createFallbackResult(query);
    }
  }
  
  if (missingCount > 0) {
    console.log(`Created ${missingCount} fallbacks for missing results`);
  }
}

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
