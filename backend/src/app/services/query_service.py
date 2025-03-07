"""Query service."""

import asyncio
import logging
import re
import time
from typing import Any, Awaitable, Callable, Dict, List, Optional, Union

from app.models.query_core import Chunk, FormatType, QueryType, Rule
from app.schemas.query_api import (
    QueryResult,
    ResolvedEntitySchema,
    SearchResponse,
)
from app.services.llm_service import (
    CompletionService,
    generate_inferred_response,
    generate_response,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SearchMethod = Callable[[str, str, List[Rule]], Awaitable[SearchResponse]]

# Concurrency control - limit to 5 concurrent queries to avoid overwhelming the system
# This can be adjusted based on server capacity
MAX_CONCURRENT_QUERIES = 5
QUERY_SEMAPHORE = asyncio.Semaphore(MAX_CONCURRENT_QUERIES)

# Retry configuration
MAX_RETRIES = 2
RETRY_DELAY = 1.0  # seconds


def get_search_method(
    query_type: QueryType, vector_db_service: Any
) -> SearchMethod:
    """Get the search method based on the query type."""
    if query_type == "decomposition":
        return vector_db_service.decomposed_search
    elif query_type == "hybrid":
        return vector_db_service.hybrid_search
    else:  # simple_vector
        return lambda q, d, r: vector_db_service.vector_search([q], d)


def extract_chunks(search_response: SearchResponse) -> List[Chunk]:
    """Extract chunks from the search response."""
    return (
        search_response["chunks"]
        if isinstance(search_response, dict)
        else search_response.chunks
    )


def replace_keywords(
    text: Union[str, List[str]], keyword_replacements: Dict[str, str]
) -> tuple[
    Union[str, List[str]], Dict[str, Union[str, List[str]]]
]:  # Changed return type
    """Replace keywords in text and return both the modified text and transformation details."""
    if not text or not keyword_replacements:
        return text, {
            "original": text,
            "resolved": text,
        }  # Return dict instead of TransformationDict

    # Handle list of strings
    if isinstance(text, list):
        original_text = text.copy()
        result = []
        modified = False

        # Create a single regex pattern for all keywords
        pattern = "|".join(map(re.escape, keyword_replacements.keys()))
        regex = re.compile(f"\\b({pattern})\\b")

        for item in text:
            # Single pass replacement for all keywords
            new_item = regex.sub(
                lambda m: keyword_replacements[m.group()], item
            )
            result.append(new_item)
            if new_item != item:
                modified = True

        if modified:
            return result, {"original": original_text, "resolved": result}
        return result, {"original": original_text, "resolved": result}

    # Handle single string
    return replace_keywords_in_string(text, keyword_replacements)


def replace_keywords_in_string(
    text: str, keyword_replacements: Dict[str, str]
) -> tuple[str, Dict[str, Union[str, List[str]]]]:  # Changed return type
    """Keywords for single string."""
    if not text:
        return text, {"original": text, "resolved": text}

    # Create a single regex pattern for all keywords
    pattern = "|".join(map(re.escape, keyword_replacements.keys()))
    regex = re.compile(f"\\b({pattern})\\b")

    # Single pass replacement
    result = regex.sub(lambda m: keyword_replacements[m.group()], text)

    # Only return transformation if something changed
    if result != text:
        return result, {"original": text, "resolved": result}
    return text, {"original": text, "resolved": text}


async def process_query_with_retry(
    query_type: QueryType,
    query: str,
    document_id: str,
    rules: List[Rule],
    format: FormatType,
    llm_service: CompletionService,
    vector_db_service: Any,
    retries: int = MAX_RETRIES,
) -> QueryResult:
    """Process a query with retry logic for resilience."""
    last_exception = None
    
    for attempt in range(retries + 1):
        try:
            # Use the semaphore to limit concurrency
            async with QUERY_SEMAPHORE:
                logger.info(f"Processing query (attempt {attempt+1}/{retries+1}): {query[:50]}...")
                start_time = time.time()
                
                result = await process_query(
                    query_type,
                    query,
                    document_id,
                    rules,
                    format,
                    llm_service,
                    vector_db_service,
                )
                
                elapsed = time.time() - start_time
                logger.info(f"Query processed successfully in {elapsed:.2f}s")
                return result
                
        except Exception as e:
            last_exception = e
            logger.warning(f"Query attempt {attempt+1} failed: {str(e)}")
            
            if attempt < retries:
                # Add jitter to retry delay to prevent thundering herd
                jitter = RETRY_DELAY * (0.5 + 0.5 * (attempt + 1))
                await asyncio.sleep(jitter)
            else:
                logger.error(f"All {retries+1} attempts failed for query: {query[:50]}...")
    
    # If we get here, all retries failed
    logger.error(f"Query failed after {retries+1} attempts: {str(last_exception)}")
    
    # Return a fallback result based on the expected format
    if format == "int":
        fallback = 0
    elif format == "bool":
        fallback = False
    elif format == "int_array":
        fallback = []
    elif format == "str_array":
        fallback = []
    else:
        fallback = ""
        
    return QueryResult(
        answer=fallback,
        chunks=[],
        resolved_entities=[]
    )


async def process_query(
    query_type: QueryType,
    query: str,
    document_id: str,
    rules: List[Rule],
    format: FormatType,
    llm_service: CompletionService,
    vector_db_service: Any,
) -> QueryResult:
    """Process the query based on the specified type."""
    search_method = get_search_method(query_type, vector_db_service)

    # Step 1: Get search response
    search_response = await search_method(query, document_id, rules)
    chunks = extract_chunks(search_response)
    concatenated_chunks = " ".join(chunk.content for chunk in chunks)

    # Step 2: Generate response from LLM
    answer = await generate_response(
        llm_service, query, concatenated_chunks, rules, format
    )
    answer_value = answer["answer"]

    transformations: Dict[str, Union[str, List[str]]] = {
        "original": "",
        "resolved": "",
    }

    result_chunks = []

    if format in ["str", "str_array"]:
        # Extract and apply keyword replacements from all resolve_entity rules
        resolve_entity_rules = [
            rule for rule in rules if rule.type == "resolve_entity"
        ]

        result_chunks = (
            []
            if answer_value in ("not found", None)
            and query_type != "decomposition"
            else chunks
        )

        # First populate the replacements dictionary
        replacements: Dict[str, str] = {}
        if resolve_entity_rules and answer_value:
            for rule in resolve_entity_rules:
                if rule.options:
                    rule_replacements = dict(
                        option.split(":") for option in rule.options
                    )
                    replacements.update(rule_replacements)

            # Then apply the replacements if we have any
            if replacements:
                print(f"Resolving entities in answer: {answer_value}")
                if isinstance(answer_value, list):
                    transformed_list, transform_dict = replace_keywords(
                        answer_value, replacements
                    )
                    transformations = transform_dict
                    answer_value = transformed_list
                else:
                    transformed_value, transform_dict = replace_keywords(
                        answer_value, replacements
                    )
                    transformations = transform_dict
                    answer_value = transformed_value

    return QueryResult(
        answer=answer_value,
        chunks=result_chunks[:10],
        resolved_entities=(
            [
                ResolvedEntitySchema(
                    original=transformations["original"],
                    resolved=transformations["resolved"],
                    source={"type": "column", "id": "some-id"},
                    entityType="some-type",
                )
            ]
            if transformations["original"] or transformations["resolved"]
            else None
        ),
    )


async def process_queries_in_parallel(
    queries: List[Dict[str, Any]],
    llm_service: CompletionService,
    vector_db_service: Any,
) -> List[QueryResult]:
    """
    Process multiple queries in parallel with controlled concurrency and retries.
    
    Parameters
    ----------
    queries : List[Dict[str, Any]]
        List of query parameters, each containing:
        - query_type: QueryType
        - query: str
        - document_id: str
        - rules: List[Rule]
        - format: FormatType
    llm_service : CompletionService
        The language model service.
    vector_db_service : Any
        The vector database service.
        
    Returns
    -------
    List[QueryResult]
        List of query results in the same order as the input queries.
    """
    logger.info(f"Processing {len(queries)} queries in parallel with controlled concurrency")
    
    # Create tasks for each query with retry logic
    tasks = [
        process_query_with_retry(
            q["query_type"],
            q["query"],
            q["document_id"],
            q["rules"],
            q["format"],
            llm_service,
            vector_db_service,
        )
        for q in queries
    ]
    
    # Process queries with controlled concurrency
    results = []
    
    # Process in batches to avoid overwhelming the system
    batch_size = MAX_CONCURRENT_QUERIES
    for i in range(0, len(tasks), batch_size):
        batch = tasks[i:i+batch_size]
        logger.info(f"Processing batch {i//batch_size + 1}/{(len(tasks) + batch_size - 1)//batch_size} with {len(batch)} queries")
        
        # Execute batch with individual error handling
        batch_results = await asyncio.gather(*batch, return_exceptions=True)
        
        # Process results, converting exceptions to fallback values
        for j, result in enumerate(batch_results):
            query_index = i + j
            q = queries[query_index]
            
            if isinstance(result, Exception):
                logger.error(f"Query {query_index} failed: {str(result)}")
                # Create fallback result
                if q["format"] == "int":
                    fallback_answer = 0
                elif q["format"] == "bool":
                    fallback_answer = False
                elif q["format"] == "int_array":
                    fallback_answer = []
                elif q["format"] == "str_array":
                    fallback_answer = []
                else:
                    fallback_answer = ""
                
                results.append(QueryResult(
                    answer=fallback_answer,
                    chunks=[],
                    resolved_entities=[]
                ))
            else:
                results.append(result)
    
    return results


# Convenience functions for specific query types
async def decomposition_query(
    query: str,
    document_id: str,
    rules: List[Rule],
    format: FormatType,
    llm_service: CompletionService,
    vector_db_service: Any,
) -> QueryResult:
    """Process the query based on the decomposition type."""
    return await process_query_with_retry(
        "decomposition",
        query,
        document_id,
        rules,
        format,
        llm_service,
        vector_db_service,
    )


async def hybrid_query(
    query: str,
    document_id: str,
    rules: List[Rule],
    format: FormatType,
    llm_service: CompletionService,
    vector_db_service: Any,
) -> QueryResult:
    """Process the query based on the hybrid type."""
    return await process_query_with_retry(
        "hybrid",
        query,
        document_id,
        rules,
        format,
        llm_service,
        vector_db_service,
    )


async def simple_vector_query(
    query: str,
    document_id: str,
    rules: List[Rule],
    format: FormatType,
    llm_service: CompletionService,
    vector_db_service: Any,
) -> QueryResult:
    """Process the query based on the simple vector type."""
    return await process_query_with_retry(
        "simple_vector",
        query,
        document_id,
        rules,
        format,
        llm_service,
        vector_db_service,
    )


async def inference_query(
    query: str,
    rules: List[Rule],
    format: FormatType,
    llm_service: CompletionService,
) -> QueryResult:
    """Generate a response, no need for vector retrieval."""
    # Since we are just answering this query based on data provided in the query,
    # there is no need to retrieve any chunks from the vector database.
    
    try:
        # Use the semaphore to limit concurrency even for inference queries
        async with QUERY_SEMAPHORE:
            answer = await generate_inferred_response(
                llm_service, query, rules, format
            )
            answer_value = answer["answer"]
            
            # Add logging for debugging answer value and format
            logger.info(f"Raw answer from LLM: answer={repr(answer_value)}")
            
            # ===== ENHANCED ARRAY HANDLING =====
            # Special handling for array types to ensure correct formatting
            if format.endswith("_array"):
                logger.info(f"Array type detected ({format}), performing special handling")
                
                # Check if this is a tag or category query - use empty arrays for errors
                is_tag_query = any(keyword in query.lower() for keyword in 
                                ["tag", "categor", "injur", "type", "list"])
                
                if is_tag_query:
                    logger.info("TAG QUERY DETECTED - Using empty arrays for errors")
                
                # If we got a string that looks like a list, try to parse it
                if isinstance(answer_value, str):
                    logger.info(f"Answer is string but should be array: {answer_value}")
                    # Check for common array patterns in the string
                    cleaned_value = answer_value.strip()
                    
                    # Try to parse as a Python list expression
                    try:
                        import ast
                        # Handle common json patterns like ['item1', 'item2'] or ["item1", "item2"]
                        parsed_value = ast.literal_eval(cleaned_value)
                        if isinstance(parsed_value, list):
                            logger.info(f"Successfully parsed string to list: {parsed_value}")
                            answer_value = parsed_value
                    except (ValueError, SyntaxError) as e:
                        logger.warning(f"Failed to parse as Python list: {e}")
                        
                        # If that fails, try more aggressive parsing
                        if cleaned_value.startswith('[') and cleaned_value.endswith(']'):
                            # Strip brackets and split by commas
                            items = cleaned_value[1:-1].split(',')
                            items = [item.strip().strip('\'"') for item in items]
                            
                            if format == 'int_array':
                                # Try to convert to integers
                                try:
                                    int_items = [int(item) for item in items if item]
                                    logger.info(f"Parsed as integer list: {int_items}")
                                    answer_value = int_items 
                                except ValueError:
                                    logger.warning("Failed to convert to integers, using default")
                                    answer_value = [0] if not is_tag_query else []  # Empty for tag queries
                            else:
                                # For string arrays
                                logger.info(f"Parsed as string list: {items}")
                                answer_value = items if any(items) else []
                
                # Final validation that we have a list
                if not isinstance(answer_value, list):
                    logger.warning(f"Answer is not a list after processing: {type(answer_value).__name__}")
                    # Set appropriate defaults by type
                    if format == 'int_array':
                        answer_value = [0] if not is_tag_query else []
                    else:
                        answer_value = []
            
            # ===== END ARRAY HANDLING =====
            
            # Extract and apply keyword replacements from all resolve_entity rules
            resolve_entity_rules = [
                rule for rule in rules if rule.type == "resolve_entity"
            ]

            if resolve_entity_rules and answer_value:
                # Combine all replacements from all resolve_entity rules
                replacements = {}
                for rule in resolve_entity_rules:
                    if rule.options:
                        rule_replacements = dict(
                            option.split(":") for option in rule.options
                        )
                        replacements.update(rule_replacements)

                if replacements:
                    logger.info(f"Resolving entities in answer: {answer_value}")
                    # Handle array and non-array types differently
                    if isinstance(answer_value, list):
                        transformed_value, transform_dict = replace_keywords(answer_value, replacements)
                        answer_value = transformed_value
                    else:
                        transformed_value, transform_dict = replace_keywords_in_string(str(answer_value), replacements)
                        answer_value = transformed_value
            
            logger.info(f"Processed response: {answer_value}")
            return QueryResult(answer=answer_value, chunks=[])
        
    except Exception as e:
        logger.error(f"Error in inference query: {str(e)}")
        # Check if this is a tag query
        is_tag_query = False
        if format.endswith('_array'):
            is_tag_query = any(keyword in query.lower() for keyword in 
                           ["tag", "categor", "injur", "type", "list"])
        
        # Create a type-appropriate fallback based on the format
        if format == 'int':
            fallback_value = 0
        elif format == 'bool':
            fallback_value = False
        elif format == 'int_array':
            fallback_value = [] if is_tag_query else [0]
        elif format == 'str_array':
            # For string arrays, always use empty arrays for tag queries
            fallback_value = []
        else:
            # String format - use empty string for tags
            if "tag" in query.lower() or "categor" in query.lower():
                fallback_value = ""
            else:
                fallback_value = ""  # Empty string instead of error
            
        return QueryResult(
            answer=fallback_value,
            chunks=[]
        )
