/**
 * API configuration for the frontend
 */
import { z } from 'zod';
// Get the API URL from environment variables or use a default
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
// Log the API URL for debugging
console.log('API URL:', API_URL);
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
 * Runs batch queries with improved handling for large batches.
 * This implementation supports both single batch mode and individual processing.
 * 
 * @param queries Array of query objects, each containing row, column, and globalRules
 * @param options Configuration options for batch processing
 * @returns Promise resolving to an array of query results in the same order as input
 */
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
        const response = await fetch(API_ENDPOINTS.QUERY, {
          method: 'POST',
          headers: getAuthHeaders(),
          mode: 'cors',
          credentials: 'include',
          body: JSON.stringify({
            document_id: query.document_id,
            prompt: query.prompt
          }),
        });
        
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
  
  // Process in batches
  const batches = [];
  for (let i = 0; i < formattedQueries.length; i += batchSize) {
    batches.push(formattedQueries.slice(i, i + batchSize));
  }
  
  console.log(`Running ${batches.length} batch queries with ${formattedQueries.length} total queries`);
  
  const results: any[] = new Array(formattedQueries.length);
  
  // Process each batch
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    
    try {
      console.log(`Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} queries`);
      
      const response = await fetch(API_ENDPOINTS.BATCH_QUERY, {
        method: 'POST',
        headers: getAuthHeaders(),
        mode: 'cors',
        credentials: 'include',
        body: JSON.stringify(batch.map(q => ({ document_id: q.document_id, prompt: q.prompt }))),
      });
      
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
      if (onBatchProgress) {
        onBatchProgress(batchResults, batchIndex, batches.length);
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
    'Origin': 'https://ai-grid.onrender.com',
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
