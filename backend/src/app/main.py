"""Main module for the AI Grid API service with optimized service initialization."""

import logging
from typing import Any, Dict

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.api import api_router
from app.core.config import Settings, get_settings
from app.services.document_service import DocumentService
from app.services.embedding.factory import EmbeddingServiceFactory
from app.services.llm.factory import CompletionServiceFactory
from app.services.vector_db.factory import VectorDBFactory

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

settings = get_settings()

app = FastAPI(
    title=settings.project_name,
    openapi_url=f"{settings.api_v1_str}/openapi.json",
)

# Configure CORS with specific settings
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://ai-grid.onrender.com", "http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept", "Origin", "X-Requested-With"],
    expose_headers=["Content-Length", "Content-Range"],
    max_age=600,  # Cache preflight requests for 10 minutes
)

# Include the API router
app.include_router(api_router, prefix=settings.api_v1_str)


@app.on_event("startup")
async def startup_event():
    """Initialize services once at application startup."""
    logger.info("Initializing application services...")
    
    # Initialize embedding service
    logger.info(f"Creating embedding service for provider: {settings.embedding_provider}")
    app.state.embedding_service = EmbeddingServiceFactory.create_service(settings)
    if app.state.embedding_service is None:
        raise ValueError(f"Failed to create embedding service for provider: {settings.embedding_provider}")
    
    # Initialize LLM service
    logger.info(f"Creating LLM service for provider: {settings.llm_provider}")
    app.state.llm_service = CompletionServiceFactory.create_service(settings)
    if app.state.llm_service is None:
        raise ValueError(f"Failed to create LLM service for provider: {settings.llm_provider}")
    
    # Initialize vector database service
    logger.info(f"Creating vector database service for provider: {settings.vector_db_provider}")
    app.state.vector_db_service = VectorDBFactory.create_vector_db_service(
        app.state.embedding_service, 
        app.state.llm_service, 
        settings
    )
    if app.state.vector_db_service is None:
        raise ValueError(f"Failed to create vector database service for provider: {settings.vector_db_provider}")
    
    # Initialize document service
    logger.info("Creating document service")
    app.state.document_service = DocumentService(
        app.state.vector_db_service,
        app.state.llm_service,
        settings
    )
    
    logger.info("All application services initialized successfully")


@app.get("/ping")
async def pong(settings: Settings = Depends(get_settings)) -> Dict[str, Any]:
    """Ping the API to check if it's running."""
    return {
        "ping": "pong!",
        "environment": settings.environment,
        "testing": settings.testing,
    }
