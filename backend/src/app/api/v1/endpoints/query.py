"""Query router."""

import asyncio
import logging
import uuid
from typing import Dict, Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.core.dependencies import get_llm_service, get_vector_db_service
from app.schemas.query_api import (
    QueryAnswer,
    QueryAnswerResponse,
    QueryRequestSchema,
    QueryResult,
)

# Schema for cancel request
class CancelRequestSchema(BaseModel):
    """Schema for cancellation requests."""
    task_ids: Optional[List[str]] = None
    cancel_all: bool = False

from app.services.llm.base import CompletionService
from app.services.query_service import (
    decomposition_query,
    hybrid_query,
    inference_query,
    process_queries_in_parallel,
    simple_vector_query,
)
from app.services.vector_db.base import VectorDBService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter(tags=["query"])
logger.info("Query router initialized")


@router.post("", response_model=QueryAnswerResponse)
async def run_query(
    request: QueryRequestSchema,
    llm_service: CompletionService = Depends(get_llm_service),
    vector_db_service: VectorDBService = Depends(get_vector_db_service),
) -> QueryAnswerResponse:
    """
    Run a query and generate a response.

    This endpoint processes incoming query requests, determines the appropriate
    query type, and executes the corresponding query function. It supports
    vector, hybrid, and decomposition query types.

    Parameters
    ----------
    request : QueryRequestSchema
        The incoming query request.
    llm_service : CompletionService
        The language model service.
    vector_db_service : VectorDBService
        The vector database service.

    Returns
    -------
    QueryResponseSchema
        The generated response to the query.

    Raises
    ------
    HTTPException
        If there's an error processing the query.
    """
    if request.document_id == "00000000000000000000000000000000":
        query_response = await inference_query(
            request.prompt.query,
            request.prompt.rules,
            request.prompt.type,
            llm_service,
        )

        if not isinstance(query_response, QueryResult):
            query_response = QueryResult(**query_response)

        answer = QueryAnswer(
            id=uuid.uuid4().hex,
            document_id=request.document_id,
            prompt_id=request.prompt.id,
            answer=query_response.answer,
            type=request.prompt.type,
        )
        response_data = QueryAnswerResponse(
            answer=answer, chunks=query_response.chunks
        )

        return response_data

    try:
        logger.info(f"Received query request: {request.model_dump()}")

        # Determine query type
        query_type = (
            "hybrid"
            if request.prompt.rules or request.prompt.type == "bool"
            else "vector"
        )

        query_functions = {
            "decomposed": decomposition_query,
            "hybrid": hybrid_query,
            "vector": simple_vector_query,
        }

        query_response = await query_functions[query_type](
            request.prompt.query,
            request.document_id,
            request.prompt.rules,
            request.prompt.type,
            llm_service,
            vector_db_service,
        )

        if not isinstance(query_response, QueryResult):
            query_response = QueryResult(**query_response)

        answer = QueryAnswer(
            id=uuid.uuid4().hex,
            document_id=request.document_id,
            prompt_id=request.prompt.id,
            answer=query_response.answer,
            type=request.prompt.type,
        )
        # Include resolved_entities in the response
        response_data = QueryAnswerResponse(
            answer=answer,
            chunks=query_response.chunks,
            resolved_entities=query_response.resolved_entities,
        )

        return response_data

    except asyncio.TimeoutError:
        logger.error("Timeout occurred while processing the query")
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Request timed out while waiting for a response from the language model"
        )
    except ValueError as e:
        logger.error(f"Invalid input: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid input: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error processing query: {str(e)}")
        error_detail = str(e) if str(e) else "Internal server error"
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=error_detail
        )


@router.post("/batch", response_model=List[QueryAnswerResponse])
async def run_batch_queries(
    requests: List[QueryRequestSchema],
    llm_service: CompletionService = Depends(get_llm_service),
    vector_db_service: VectorDBService = Depends(get_vector_db_service),
) -> List[QueryAnswerResponse]:
    """
    Run multiple queries in parallel and generate responses.

    This endpoint processes multiple query requests in parallel, improving performance
    when multiple queries need to be executed at once.

    Parameters
    ----------
    requests : List[QueryRequestSchema]
        The list of query requests to process in parallel.
    llm_service : CompletionService
        The language model service.
    vector_db_service : VectorDBService
        The vector database service.

    Returns
    -------
    List[QueryAnswerResponse]
        A list of query responses in the same order as the input requests.

    Raises
    ------
    HTTPException
        If there's an error processing the queries.
    """
    try:
        logger.info(f"Received batch query request with {len(requests)} queries")
        
        # Separate inference queries from vector queries
        inference_requests = []
        vector_requests = []
        
        for req in requests:
            if req.document_id == "00000000000000000000000000000000":
                inference_requests.append(req)
            else:
                vector_requests.append(req)
        
        # Process inference queries in parallel
        inference_tasks = []
        for req in inference_requests:
            task = inference_query(
                req.prompt.query,
                req.prompt.rules,
                req.prompt.type,
                llm_service,
            )
            inference_tasks.append(task)
        
        # Process vector queries in parallel
        vector_query_params = []
        for req in vector_requests:
            query_type = (
                "hybrid"
                if req.prompt.rules or req.prompt.type == "bool"
                else "vector"
            )
            
            vector_query_params.append({
                "query_type": query_type,
                "query": req.prompt.query,
                "document_id": req.document_id,
                "rules": req.prompt.rules,
                "format": req.prompt.type,
            })
        
        # Execute all queries in parallel
        results = []
        
        if inference_tasks:
            inference_results = await asyncio.gather(*inference_tasks)
            results.extend(inference_results)
        
        if vector_query_params:
            vector_results = await process_queries_in_parallel(
                vector_query_params, llm_service, vector_db_service
            )
            results.extend(vector_results)
        
        # Convert results to response format
        responses = []
        for i, result in enumerate(results):
            req = inference_requests[i] if i < len(inference_requests) else vector_requests[i - len(inference_requests)]
            
            if not isinstance(result, QueryResult):
                result = QueryResult(**result)
            
            answer = QueryAnswer(
                id=uuid.uuid4().hex,
                document_id=req.document_id,
                prompt_id=req.prompt.id,
                answer=result.answer,
                type=req.prompt.type,
            )
            
            response = QueryAnswerResponse(
                answer=answer,
                chunks=result.chunks,
                resolved_entities=result.resolved_entities,
            )
            
            responses.append(response)
        
        return responses
        
    except asyncio.TimeoutError:
        logger.error("Timeout occurred while processing batch queries")
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Request timed out while waiting for responses from the language model"
        )
    except ValueError as e:
        logger.error(f"Invalid input in batch request: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid input in batch request: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error processing batch queries: {str(e)}")
        error_detail = str(e) if str(e) else "Internal server error"
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=error_detail
        )


@router.post("/cancel", response_model=Dict[str, Any])
async def cancel_queries(
    request: CancelRequestSchema,
    llm_service: CompletionService = Depends(get_llm_service),
) -> Dict[str, Any]:
    """
    Cancel running queries.
    
    This endpoint allows cancelling specific queries by their task IDs or all running queries.
    
    Parameters
    ----------
    task_ids : List[str], optional
        The IDs of the tasks to cancel. If not provided and cancel_all is False, no tasks will be cancelled.
    cancel_all : bool, optional
        Whether to cancel all running tasks. Defaults to False.
        
    Returns
    -------
    Dict[str, Any]
        A message indicating the number of tasks cancelled.
    """
    cancelled_count = 0
    
    if request.cancel_all:
        # Cancel all running tasks
        cancelled_count = llm_service.cancel_all_tasks()
        return {
            "success": True,
            "message": f"Cancelled all tasks ({cancelled_count} tasks)",
            "cancelled_count": cancelled_count
        }
    elif request.task_ids:
        # Cancel specific tasks
        for task_id in request.task_ids:
            if llm_service.cancel_task(task_id):
                cancelled_count += 1
        
        return {
            "success": True,
            "message": f"Cancelled {cancelled_count}/{len(request.task_ids)} tasks",
            "cancelled_count": cancelled_count
        }
    else:
        return {
            "success": False,
            "message": "No tasks to cancel. Provide task_ids or set cancel_all=true",
            "cancelled_count": 0
        }


@router.get("/test-error", response_model=Dict[str, Any])
async def test_error(error_type: str = "timeout") -> Dict[str, Any]:
    """
    Test endpoint to simulate different types of errors.
    
    This endpoint is useful for testing error handling in the frontend.
    
    Parameters
    ----------
    error_type : str
        The type of error to simulate. Options: "timeout", "validation", "server".
        
    Returns
    -------
    Dict[str, Any]
        A message indicating the error was simulated.
        
    Raises
    ------
    HTTPException
        The simulated error.
    """
    if error_type == "timeout":
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Simulated timeout error"
        )
    elif error_type == "validation":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Simulated validation error"
        )
    elif error_type == "server":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Simulated server error"
        )
    else:
        return {"message": f"Unknown error type: {error_type}"}
