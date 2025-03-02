"""Document service."""

import asyncio
import logging
import os
import tempfile
import time
import uuid
from typing import Any, Dict, List, Optional

from langchain.schema import Document as LangchainDocument
from langchain.text_splitter import RecursiveCharacterTextSplitter

from app.core.config import Settings
from app.services.llm.base import CompletionService
from app.services.loaders.factory import LoaderFactory
from app.services.vector_db.base import VectorDBService

logger = logging.getLogger(__name__)


class DocumentService:
    """Document service."""

    def __init__(
        self,
        vector_db_service: VectorDBService,
        llm_service: CompletionService,
        settings: Settings,
    ):
        """Document service."""
        self.vector_db_service = vector_db_service
        self.llm_service = llm_service
        self.settings = settings
        self.loader_factory = LoaderFactory()
        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.settings.chunk_size,
            chunk_overlap=self.settings.chunk_overlap,
        )

    async def upload_document(
        self,
        filename: str,
        file_content: bytes,
    ) -> Optional[str]:
        """Upload a document."""
        try:
            # Generate a document ID
            document_id = self._generate_document_id()
            logger.info(f"Created document_id: {document_id}")

            # Create a directory to store uploaded documents
            documents_dir = os.path.join(tempfile.gettempdir(), "ai_grid_documents")
            os.makedirs(documents_dir, exist_ok=True)
            
            # Save the file with a name based on the document ID
            file_path = os.path.join(documents_dir, f"{document_id}{os.path.splitext(filename)[1]}")
            logger.info(f"Saving document to: {file_path}")
            
            with open(file_path, 'wb') as f:
                f.write(file_content)

            # Process the document
            try:
                chunks = await self._process_document(file_path)
                logger.info(f"Processed document into {len(chunks)} chunks")
                
                if not chunks:
                    logger.warning(f"No chunks were extracted from document: {filename}")
                    return document_id  # Return the ID even if no chunks were extracted
                
                # Log the first chunk for debugging
                if chunks:
                    logger.info(f"First chunk sample: {chunks[0].page_content[:100]}...")
                
                # Add the file path to the first chunk's metadata
                for chunk in chunks:
                    chunk.metadata["file_path"] = file_path
                
                prepared_chunks = await self.vector_db_service.prepare_chunks(
                    document_id, chunks
                )
                logger.info(f"Prepared {len(prepared_chunks)} chunks for vector storage")
                
                if not prepared_chunks:
                    logger.warning(f"No prepared chunks for document: {filename}")
                    return document_id  # Return the ID even if no prepared chunks
                
                # Add file_path to each prepared chunk
                for chunk in prepared_chunks:
                    chunk["file_path"] = file_path
                
                result = await self.vector_db_service.upsert_vectors(prepared_chunks)
                logger.info(f"Upsert result: {result}")
            except Exception as e:
                logger.error(f"Error processing document: {e}", exc_info=True)
                # Don't delete the file on error, so we can debug
                raise

            return document_id

        except Exception as e:
            logger.error(f"Error uploading document: {e}", exc_info=True)
            return None

    async def _process_document(
        self, file_path: str
    ) -> List[LangchainDocument]:
        """Process a document with optimized performance."""
        start_time = time.time()
        
        # Load the document
        docs = await self._load_document(file_path)
        load_time = time.time() - start_time
        logger.info(f"Document loading completed in {load_time:.2f} seconds")
        
        if not docs:
            logger.warning(f"No content loaded from document: {file_path}")
            # Create a single empty document to avoid downstream issues
            return [LangchainDocument(
                page_content="No content could be extracted from this document.",
                metadata={"page": 1, "source": file_path, "error": "Content extraction failed"}
            )]

        # Split the document into chunks using a thread pool to avoid blocking
        chunk_start = time.time()
        loop = asyncio.get_event_loop()
        
        # Process documents in batches for better performance
        batch_size = 10  # Process 10 documents at a time
        all_chunks = []
        
        for i in range(0, len(docs), batch_size):
            batch = docs[i:i+batch_size]
            # Run chunking in a thread pool
            batch_chunks = await loop.run_in_executor(
                None, 
                lambda b=batch: self.splitter.split_documents(b)
            )
            all_chunks.extend(batch_chunks)
        
        chunk_time = time.time() - chunk_start
        logger.info(f"Document chunking completed in {chunk_time:.2f} seconds, created {len(all_chunks)} chunks")
        
        if not all_chunks:
            logger.warning(f"Document was loaded but no chunks were created: {file_path}")
            # Create a single chunk with the original content to ensure we have something
            return [LangchainDocument(
                page_content="Document was processed but no meaningful chunks could be extracted.",
                metadata={"page": 1, "source": file_path, "error": "Chunking failed"}
            )]
        
        total_time = time.time() - start_time
        logger.info(f"Total document processing completed in {total_time:.2f} seconds")
        return all_chunks

    async def _load_document(self, file_path: str) -> List[LangchainDocument]:

        # Create a loader
        loader = self.loader_factory.create_loader(self.settings)

        if loader is None:
            raise ValueError(
                f"No loader available for configured loader type: {self.settings.loader}"
            )

        # Load the document
        try:
            return await loader.load(file_path)
        except Exception as e:
            logger.error(f"Loader failed: {e}. Unable to load document.")
            raise

    @staticmethod
    def _generate_document_id() -> str:
        return uuid.uuid4().hex

    async def delete_document(self, document_id: str) -> Dict[str, str]:
        """Delete a document."""
        try:
            result = await self.vector_db_service.delete_document(document_id)
            return result
        except Exception as e:
            logger.error(f"Error deleting document: {e}")
            raise

    async def get_document_chunks(self, document_id: str) -> List[Dict[str, Any]]:
        """Retrieve all chunks for a document from the vector database.
        
        This method queries the vector database for all chunks associated with
        the given document ID and returns them.
        
        Parameters
        ----------
        document_id : str
            The ID of the document to retrieve chunks for.
            
        Returns
        -------
        List[Dict[str, Any]]
            A list of document chunks, each containing text and metadata.
            
        Raises
        ------
        ValueError
            If the document is not found or if no chunks are available.
        """
        try:
            logger.info(f"Getting document chunks for document_id: {document_id}")
            
            # Query the vector database for all chunks with this document_id
            chunks = await self.vector_db_service.get_document_chunks(document_id)
            
            if not chunks:
                logger.warning(f"No chunks found for document_id: {document_id}")
                return []
                
            logger.info(f"Retrieved {len(chunks)} chunks for document_id: {document_id}")
            return chunks
            
        except Exception as e:
            logger.error(f"Error retrieving document chunks: {e}", exc_info=True)
            raise
