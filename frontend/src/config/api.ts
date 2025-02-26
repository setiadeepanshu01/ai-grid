import { z } from "zod";
import {
  isArray,
  isNil,
  isPlainObject,
  isString,
  mapValues,
  omit
} from "lodash-es";
import {
  AnswerTableColumn,
  AnswerTableGlobalRule,
  AnswerTableRow
} from "./store";

// Simple in-memory cache for API responses
const apiCache = new Map<string, {
  data: any;
  timestamp: number;
  expiresIn: number;
}>();

// Cache configuration
const CACHE_CONFIG = {
  // Default cache expiration time in milliseconds (5 minutes)
  DEFAULT_EXPIRATION: 5 * 60 * 1000,
  
  // Cache expiration for different request types
  EXPIRATION: {
    QUERY: 5 * 60 * 1000, // 5 minutes for query results
    DOCUMENT: 30 * 60 * 1000 // 30 minutes for document metadata
  }
};

// Request batching for similar requests
const requestBatches = new Map<string, {
  promise: Promise<any>;
  timestamp: number;
}>();

// Batch configuration
const BATCH_CONFIG = {
  // How long to wait for similar requests before processing (in milliseconds)
  BATCH_WINDOW: 50,
  
  // Maximum time a request can be batched (in milliseconds)
  MAX_BATCH_TIME: 200
};

// Custom error class for API errors
export class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

// Helper function to handle API responses
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch (e) {
      errorData = { message: 'Unknown error' };
    }
    
    const errorMessage = errorData.message || `API error: ${response.status} ${response.statusText}`;
    throw new ApiError(errorMessage, response.status, errorData);
  }
  
  return response.json() as Promise<T>;
}

// Helper function for API requests with retry logic, caching, and batching
async function fetchWithRetry(
  url: string, 
  options: RequestInit, 
  retries = 3, 
  backoff = 300,
  cacheKey?: string,
  cacheTime?: number
): Promise<Response> {
  // Check cache if a cache key is provided
  if (cacheKey && apiCache.has(cacheKey)) {
    const cachedData = apiCache.get(cacheKey)!;
    const now = Date.now();
    
    // If the cached data is still valid, return it
    if (now - cachedData.timestamp < cachedData.expiresIn) {
      console.log(`Cache hit for ${cacheKey}`);
      // Return a mock response with the cached data
      return new Response(JSON.stringify(cachedData.data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      // Remove expired cache entry
      apiCache.delete(cacheKey);
    }
  }
  
  // Check if there's an existing batch for this request
  if (cacheKey && requestBatches.has(cacheKey)) {
    const batch = requestBatches.get(cacheKey)!;
    const now = Date.now();
    
    // If the batch is still valid, return its promise
    if (now - batch.timestamp < BATCH_CONFIG.MAX_BATCH_TIME) {
      console.log(`Batch hit for ${cacheKey}`);
      return batch.promise.then(data => {
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      });
    } else {
      // Remove expired batch
      requestBatches.delete(cacheKey);
    }
  }
  
  // Create a new request promise
  const fetchPromise = new Promise<Response>(async (resolve, reject) => {
    try {
      // Add a small delay to allow for batching similar requests
      if (cacheKey) {
        await new Promise(r => setTimeout(r, BATCH_CONFIG.BATCH_WINDOW));
      }
      
      const response = await fetch(url, options);
      
      // If the request was rate limited, wait and retry
      if (response.status === 429 && retries > 0) {
        // Get retry-after header or use exponential backoff
        const retryAfter = response.headers.get('retry-after');
        const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : backoff;
        
        console.log(`Rate limited. Retrying in ${waitTime}ms...`);
        await new Promise(r => setTimeout(r, waitTime));
        
        const retryResponse = await fetchWithRetry(url, options, retries - 1, backoff * 2, cacheKey, cacheTime);
        resolve(retryResponse);
        return;
      }
      
      // If the response is successful and we have a cache key, cache the response
      if (response.ok && cacheKey) {
        // Clone the response so we can read it twice
        const clonedResponse = response.clone();
        const data = await clonedResponse.json();
        
        // Cache the response
        apiCache.set(cacheKey, {
          data,
          timestamp: Date.now(),
          expiresIn: cacheTime || CACHE_CONFIG.DEFAULT_EXPIRATION
        });
      }
      
      resolve(response);
    } catch (error) {
      // Network errors or other exceptions
      if (retries > 0) {
        console.log(`Request failed. Retrying in ${backoff}ms...`);
        await new Promise(r => setTimeout(r, backoff));
        try {
          const retryResponse = await fetchWithRetry(url, options, retries - 1, backoff * 2, cacheKey, cacheTime);
          resolve(retryResponse);
        } catch (retryError) {
          reject(retryError);
        }
      } else {
        reject(new ApiError(
          `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          0
        ));
      }
    }
  });
  
  // If we have a cache key, store this promise in the batch map
  if (cacheKey) {
    requestBatches.set(cacheKey, {
      promise: fetchPromise.then(async response => {
        const clonedResponse = response.clone();
        return clonedResponse.json();
      }),
      timestamp: Date.now()
    });
  }
  
  return fetchPromise as Promise<Response>;
}

// Upload file

export const documentSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    author: z.string(),
    tag: z.string(),
    page_count: z.number()
  })
  .strict();

export async function uploadFile(file: File) {
  try {
    const formData = new FormData();
    formData.append("file", file);
    
    // File uploads shouldn't be cached
    const response = await fetchWithRetry("http://localhost:8000/api/v1/document", {
      method: "POST",
      body: formData
    });
    
    const data = await handleResponse(response);
    return documentSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Validation error:', error.errors);
      throw new ApiError('Invalid response format from server', 0, error.errors);
    }
    
    if (error instanceof ApiError) {
      throw error;
    }
    
    throw new ApiError(
      `Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      0
    );
  }
}

// Delete document

export async function deleteDocument(id: string) {
  try {
    const response = await fetchWithRetry(`http://localhost:8000/api/v1/document/${id}`, {
      method: "DELETE"
    });
    
    await handleResponse(response);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    
    throw new ApiError(
      `Failed to delete document: ${error instanceof Error ? error.message : 'Unknown error'}`,
      0
    );
  }
}

// Run query

export const chunkSchema = z
  .object({
    content: z.string(),
    page: z.number()
  })
  .strict();

export const answerSchema = z.union([
  z.null(),
  z.number(),
  z.string(),
  z.boolean(),
  z.array(z.number()),
  z.array(z.string())
]);

export const resolvedEntitySchema = z.object({
  original: z.union([z.string(), z.array(z.string())]),
  resolved: z.union([z.string(), z.array(z.string())]),
  source: z.object({
    type: z.string(),
    id: z.string()
  }),
  entityType: z.string()
});

// Update the resolved entities schema to match backend format
export const resolvedEntitiesSchema = z.union([
  z.array(resolvedEntitySchema),
  z.null(),
  z.undefined()
]);

// Update the query response schema
const queryResponseSchema = z.object({
  answer: z.object({ answer: answerSchema }),
  chunks: z.array(chunkSchema),
  resolved_entities: resolvedEntitiesSchema
});

// Update the runQuery function to transform the data format with caching
export async function runQuery(
  row: AnswerTableRow,
  column: AnswerTableColumn,
  globalRules: AnswerTableGlobalRule[]
) {
  try {
    if (!column.entityType.trim() || !column.generate) {
      throw new Error(
        "Row or column doesn't allow running query (missing row source data or column is empty or has generate set to false)"
      );
    }
    
    const rules = [
      ...column.rules,
      ...globalRules
        .filter(rule => rule.entityType.trim() === column.entityType.trim())
        .map(r => omit(r, "id", "entityType"))
    ];
    
    const requestBody = {
      document_id: row.sourceData?.document?.id
        ? row.sourceData.document.id
        : "00000000000000000000000000000000",
      prompt: {
        id: column.id,
        entity_type: column.entityType,
        query: column.query,
        type: column.type,
        rules
      }
    };
    
    // Create a cache key based on the request parameters
    const cacheKey = `query_${requestBody.document_id}_${column.id}_${column.entityType}_${column.query}_${column.type}`;
    
    console.log('Query Request:', requestBody);
    
    const response = await fetchWithRetry(
      "http://localhost:8000/api/v1/query", 
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
      },
      3, // retries
      300, // backoff
      cacheKey, // cache key
      CACHE_CONFIG.EXPIRATION.QUERY // cache expiration
    );
    
    const data = await handleResponse(response);
    console.log('Raw API Response:', data);
    
    const parsed = queryResponseSchema.parse(data);
    console.log('Parsed Response:', parsed);
    
    // Update resolved entities transformation to handle the new format
    const resolvedEntities = parsed.resolved_entities?.map(entity => ({
      original: entity.original,
      resolved: entity.resolved,
      source: entity.source,
      entityType: entity.entityType,
      fullAnswer: parsed.answer.answer as string
    })) ?? null;
    
    console.log('Transformed Resolved Entities:', resolvedEntities);
  
    return {
      answer: parsed.answer,
      chunks: parsed.chunks,
      resolvedEntities
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Validation error:', error.errors);
      throw new ApiError('Invalid response format from server', 0, error.errors);
    }
    
    if (error instanceof ApiError) {
      throw error;
    }
    
    throw new ApiError(
      `Failed to run query: ${error instanceof Error ? error.message : 'Unknown error'}`,
      0
    );
  }
}

// Export triples

export async function exportTriples(tableData: any) {
  try {
    function stringifyDeep(value: any): any {
      if (isNil(value)) {
        return "";
      } else if (isString(value)) {
        return value;
      } else if (isArray(value)) {
        return value.map(stringifyDeep);
      } else if (isPlainObject(value)) {
        return mapValues(value, stringifyDeep);
      } else {
        return String(value);
      }
    }
  
    const response = await fetchWithRetry("http://localhost:8000/api/v1/graph/export-triples", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(stringifyDeep(tableData))
    });
    
    if (!response.ok) {
      const errorData = await response.text();
      throw new ApiError(
        `Failed to export triples: ${response.status} ${response.statusText}`,
        response.status,
        errorData
      );
    }
    
    return response.blob();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    
    throw new ApiError(
      `Failed to export triples: ${error instanceof Error ? error.message : 'Unknown error'}`,
      0
    );
  }
}
