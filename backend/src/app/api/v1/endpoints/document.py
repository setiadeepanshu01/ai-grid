"""Document router with optimized performance."""

import asyncio
import logging
import time
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.core.dependencies import get_document_service
from app.models.document import Document
from app.schemas.document_api import (
    DeleteDocumentResponseSchema,
    DocumentResponseSchema,
    BatchUploadResponseSchema,
)
from app.services.document_service import DocumentService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Document"])


@router.post(
    "",
    response_model=DocumentResponseSchema,
    status_code=status.HTTP_201_CREATED,
)
async def upload_document_endpoint(
    file: UploadFile = File(...),
    document_service: DocumentService = Depends(get_document_service),
) -> DocumentResponseSchema:
    """
    Upload a document and process it.

    Parameters
    ----------
    file : UploadFile
        The file to be uploaded and processed.
    document_service : DocumentService
        The document service for processing the file.

    Returns
    -------
    DocumentResponse
        The processed document information.

    Raises
    ------
    HTTPException
        If the file name is missing or if an error occurs during processing.
    """
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File name is missing",
        )

    logger.info(
        f"Endpoint received file: {file.filename}, content type: {file.content_type}"
    )

    start_time = time.time()
    try:
        # Read file content
        file_content = await file.read()
        read_time = time.time() - start_time
        logger.info(f"File read completed in {read_time:.2f} seconds")
        
        # Process document
        process_start = time.time()
        document_id = await document_service.upload_document(
            file.filename, file_content
        )
        process_time = time.time() - process_start
        logger.info(f"Document processing completed in {process_time:.2f} seconds")

        if document_id is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="An error occurred while processing the document",
            )

        # TODO: Fetch actual document details from a database
        document = Document(
            id=document_id,
            name=file.filename,
            author="author_name",  # TODO: Determine this dynamically
            tag="document_tag",  # TODO: Determine this dynamically
            page_count=10,  # TODO: Determine this dynamically
        )
        
        total_time = time.time() - start_time
        logger.info(f"Total upload time: {total_time:.2f} seconds")
        return DocumentResponseSchema(**document.model_dump())

    except ValueError as ve:
        logger.error(f"ValueError in upload_document_endpoint: {str(ve)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve)
        )
    except Exception as e:
        logger.error(f"Unexpected error in upload_document_endpoint: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e)
        )


@router.post(
    "/batch",
    response_model=BatchUploadResponseSchema,
    status_code=status.HTTP_201_CREATED,
)
async def batch_upload_documents_endpoint(
    files: List[UploadFile] = File(...),
    document_service: DocumentService = Depends(get_document_service),
) -> BatchUploadResponseSchema:
    """
    Upload multiple documents in parallel and process them.

    Parameters
    ----------
    files : List[UploadFile]
        The files to be uploaded and processed.
    document_service : DocumentService
        The document service for processing the files.

    Returns
    -------
    BatchUploadResponseSchema
        Information about the processed documents.

    Raises
    ------
    HTTPException
        If an error occurs during processing.
    """
    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No files provided",
        )

    logger.info(f"Batch upload endpoint received {len(files)} files")
    start_time = time.time()

    # Process files in parallel
    async def process_file(file: UploadFile):
        if not file.filename:
            return None
        
        try:
            file_content = await file.read()
            document_id = await document_service.upload_document(
                file.filename, file_content
            )
            
            if document_id:
                return Document(
                    id=document_id,
                    name=file.filename,
                    author="author_name",
                    tag="document_tag",
                    page_count=10,
                )
            return None
        except Exception as e:
            logger.error(f"Error processing file {file.filename}: {str(e)}")
            return None

    # Process all files in parallel
    tasks = [process_file(file) for file in files]
    results = await asyncio.gather(*tasks)
    
    # Filter out None results
    documents = [doc for doc in results if doc is not None]
    
    total_time = time.time() - start_time
    logger.info(f"Batch upload completed in {total_time:.2f} seconds, processed {len(documents)} documents")
    
    return BatchUploadResponseSchema(
        documents=[DocumentResponseSchema(**doc.model_dump()) for doc in documents],
        total_files=len(files),
        successful_files=len(documents),
        failed_files=len(files) - len(documents),
    )


@router.delete("/{document_id}", response_model=DeleteDocumentResponseSchema)
async def delete_document_endpoint(
    document_id: str,
    document_service: DocumentService = Depends(get_document_service),
) -> DeleteDocumentResponseSchema:
    """
    Delete a document.

    Parameters
    ----------
    document_id : str
        The ID of the document to be deleted.
    document_service : DocumentService
        The document service for deleting the document.

    Returns
    -------
    DeleteDocumentResponse
        A response containing the deletion status and message.

    Raises
    ------
    HTTPException
        If an error occurs during the deletion process.
    """
    try:
        result = await document_service.delete_document(document_id)
        if result:
            return DeleteDocumentResponseSchema(
                id=document_id,
                status="success",
                message="Document deleted successfully",
            )
        else:
            return DeleteDocumentResponseSchema(
                id=document_id,
                status="error",
                message="Failed to delete document",
            )
    except ValueError as ve:
        logger.error(f"ValueError in delete_document_endpoint: {ve}")
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Unexpected error in delete_document_endpoint: {e}")
        raise HTTPException(
            status_code=500, detail="An unexpected error occurred"
        )
