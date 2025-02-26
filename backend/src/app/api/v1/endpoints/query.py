"""Query router."""

import asyncio
import logging
import uuid
from typing import Dict, Any

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_llm_service, get_vector_db_service
from app.schemas.query_api import (
    QueryAnswer,
    QueryAnswerResponse,
    QueryRequestSchema,
    QueryResult,
)
from app.services.llm.base import CompletionService
from app.services.query_service import (
    decomposition_query,
    hybrid_query,
    inference_query,
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

        # response_data = QueryResponseSchema(
        #     id=str(uuid.uuid4()),
        #     document_id=request.document_id,
        #     prompt_id=request.prompt.id,
        #     type=request.prompt.type,
        #     answer=query_response.answer,
        #     chunks=query_response.chunks,
        # )

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
            resolved_entities=query_response.resolved_entities,  # Add this line
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
