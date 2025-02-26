"""PyMuPDF loader service."""

import logging
import os
from typing import List

from langchain.schema import Document as LangchainDocument
from langchain_community.document_loaders import PyMuPDFLoader, TextLoader

from app.services.loaders.base import LoaderService

logger = logging.getLogger(__name__)

class PyMuPDFLoaderService(LoaderService):
    """PDF loader service using PyMuPDF."""

    async def load(self, file_path: str) -> List[LangchainDocument]:
        """Load document from file path."""
        file_extension = os.path.splitext(file_path)[1].lower()
        logger.info(f"Loading file with extension: {file_extension}")

        if file_extension == ".pdf":
            try:
                logger.info(f"Attempting to load PDF with PyMuPDFLoader: {file_path}")
                loader = PyMuPDFLoader(file_path)
                documents = loader.load()
                
                # Check if we got any text content
                if documents and any(doc.page_content.strip() for doc in documents):
                    logger.info(f"Successfully loaded PDF with PyMuPDFLoader: {len(documents)} pages")
                    return documents
                else:
                    logger.warning("PyMuPDFLoader returned empty content.")
                    return []
            except Exception as e:
                logger.error(f"Error using PyMuPDFLoader: {str(e)}")
                return []
                
        elif file_extension == ".txt":
            try:
                logger.info(f"Loading text file: {file_path}")
                loader = TextLoader(file_path)
                documents = loader.load()
                logger.info(f"Successfully loaded text file: {len(documents)} documents")
                return documents
            except Exception as e:
                logger.error(f"Error loading text file: {str(e)}")
                return []
        else:
            error_msg = f"Unsupported file type: {file_path}"
            logger.error(error_msg)
            raise ValueError(error_msg)
