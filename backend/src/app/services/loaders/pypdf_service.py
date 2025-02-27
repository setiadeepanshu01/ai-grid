"""PyPDF loader service."""

import logging
import os
from typing import List, Union

from langchain.schema import Document as LangchainDocument
from langchain_community.document_loaders import PyPDFLoader, TextLoader

from app.services.loaders.base import LoaderService

logger = logging.getLogger(__name__)

# Try to import UnstructuredPDFLoader, but don't fail if it's not available
try:
    from langchain_community.document_loaders import UnstructuredPDFLoader
    UNSTRUCTURED_AVAILABLE = True
except ImportError:
    UNSTRUCTURED_AVAILABLE = False
    logger.warning("unstructured package not found, please install it with `pip install unstructured`")

class PDFLoader(LoaderService):
    """PDF and Text loader service."""

    async def load(self, file_path: str) -> List[LangchainDocument]:
        """Load document from file path."""
        file_extension = os.path.splitext(file_path)[1].lower()
        logger.info(f"Loading file with extension: {file_extension}")

        if file_extension == ".pdf":
            try:
                # First try with PyPDFLoader
                logger.info(f"Attempting to load PDF with PyPDFLoader: {file_path}")
                loader = PyPDFLoader(file_path)
                documents = loader.load()
                
                # Check if we got any text content
                if documents and any(doc.page_content.strip() for doc in documents):
                    logger.info(f"Successfully loaded PDF with PyPDFLoader: {len(documents)} pages")
                    return documents
                else:
                    # Check if unstructured is available before trying to use it
                    if UNSTRUCTURED_AVAILABLE:
                        logger.warning("PyPDFLoader returned empty content. Trying UnstructuredPDFLoader as fallback.")
                        
                        # If PyPDFLoader didn't extract any text, try UnstructuredPDFLoader
                        try:
                            logger.info(f"Attempting to load PDF with UnstructuredPDFLoader: {file_path}")
                            unstructured_loader = UnstructuredPDFLoader(file_path)
                            unstructured_documents = unstructured_loader.load()
                            
                            if unstructured_documents:
                                logger.info(f"Successfully loaded PDF with UnstructuredPDFLoader: {len(unstructured_documents)} elements")
                                return unstructured_documents
                            else:
                                logger.warning("UnstructuredPDFLoader also returned empty content.")
                                # Return empty list as last resort
                                return []
                        except Exception as e:
                            logger.error(f"Error using UnstructuredPDFLoader: {str(e)}")
                            # Return whatever we got from PyPDFLoader, even if empty
                            return documents
                    else:
                        logger.warning("Unstructured package not available. Returning results from PyPDFLoader.")
                        return documents
            except Exception as e:
                logger.error(f"Error using PyPDFLoader: {str(e)}")
                
                # Check if unstructured is available before trying to use it as fallback
                if UNSTRUCTURED_AVAILABLE:
                    # Try UnstructuredPDFLoader as fallback
                    try:
                        logger.info(f"Attempting to load PDF with UnstructuredPDFLoader after PyPDFLoader failed: {file_path}")
                        unstructured_loader = UnstructuredPDFLoader(file_path)
                        unstructured_documents = unstructured_loader.load()
                        
                        if unstructured_documents:
                            logger.info(f"Successfully loaded PDF with UnstructuredPDFLoader: {len(unstructured_documents)} elements")
                            return unstructured_documents
                        else:
                            logger.warning("UnstructuredPDFLoader returned empty content.")
                            return []
                    except Exception as unstructured_error:
                        logger.error(f"Error using UnstructuredPDFLoader: {str(unstructured_error)}")
                        # Both loaders failed
                        logger.error("All PDF loaders failed. Returning empty document list.")
                        return []
                else:
                    logger.warning("Unstructured package not available. Cannot use fallback loader.")
                    logger.error("PDF loading failed. Returning empty document list.")
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
