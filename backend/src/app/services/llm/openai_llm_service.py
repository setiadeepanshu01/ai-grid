"""OpenAI completion service implementation."""

import asyncio
import logging
import time
from typing import Any, Optional, Type

from openai import OpenAI
from pydantic import BaseModel

from app.core.config import Settings
from app.services.llm.base import CompletionService

logger = logging.getLogger(__name__)

# Default timeout for OpenAI API calls (in seconds)
DEFAULT_TIMEOUT = 60
# Maximum number of retries for OpenAI API calls
MAX_RETRIES = 3
# Initial backoff time for retries (in seconds)
INITIAL_BACKOFF = 1


class OpenAICompletionService(CompletionService):
    """OpenAI completion service implementation."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        if settings.openai_api_key:
            self.client = OpenAI(api_key=settings.openai_api_key)
        else:
            self.client = None  # type: ignore
            logger.warning(
                "OpenAI API key is not set. LLM features will be disabled."
            )

    async def generate_completion(
        self, prompt: str, response_model: Type[BaseModel], timeout: int = DEFAULT_TIMEOUT
    ) -> Optional[BaseModel]:
        """Generate a completion from the language model with timeout and retry logic."""
        if self.client is None:
            logger.warning(
                "OpenAI client is not initialized. Skipping generation."
            )
            return None

        # Implement retry logic with exponential backoff
        retries = 0
        backoff = INITIAL_BACKOFF
        last_error = None

        while retries <= MAX_RETRIES:
            try:
                # Use asyncio.wait_for to implement timeout
                start_time = time.time()
                logger.info(f"Attempt {retries + 1} to generate completion")
                
                # Create a task for the API call
                response_task = asyncio.create_task(
                    self._make_api_call(prompt, response_model)
                )
                
                # Wait for the task to complete with a timeout
                response = await asyncio.wait_for(response_task, timeout=timeout)
                
                # If we get here, the API call succeeded
                elapsed_time = time.time() - start_time
                logger.info(f"API call completed in {elapsed_time:.2f} seconds")
                
                if response is None:
                    logger.warning("Received None response from OpenAI")
                    return None
                
                parsed_response = response.choices[0].message.parsed
                logger.info(f"Generated response: {parsed_response}")

                if parsed_response is None:
                    logger.warning("Received None parsed response from OpenAI")
                    return None

                try:
                    validated_response = response_model(**parsed_response.model_dump())
                    if all(
                        value is None
                        for value in validated_response.model_dump().values()
                    ):
                        logger.info("All fields in the response are None")
                        return None
                    return validated_response
                except ValueError as e:
                    logger.error(f"Error validating response: {e}")
                    return None
                
            except asyncio.TimeoutError:
                retries += 1
                logger.warning(
                    f"Timeout occurred while waiting for OpenAI API response (attempt {retries}/{MAX_RETRIES + 1})"
                )
                last_error = "Timeout occurred while waiting for OpenAI API response"
                
                if retries <= MAX_RETRIES:
                    # Exponential backoff
                    wait_time = backoff * (2 ** (retries - 1))
                    logger.info(f"Retrying in {wait_time} seconds...")
                    await asyncio.sleep(wait_time)
                
            except Exception as e:
                retries += 1
                logger.error(f"Error generating completion: {str(e)}")
                last_error = str(e)
                
                if retries <= MAX_RETRIES:
                    # Exponential backoff
                    wait_time = backoff * (2 ** (retries - 1))
                    logger.info(f"Retrying in {wait_time} seconds...")
                    await asyncio.sleep(wait_time)
        
        # If we've exhausted all retries, raise an exception
        logger.error(f"Failed to generate completion after {MAX_RETRIES + 1} attempts: {last_error}")
        raise Exception(f"Failed to generate completion: {last_error}")
    
    async def _make_api_call(
        self, prompt: str, response_model: Type[BaseModel]
    ) -> Any:  # Use Any instead of the specific type
        """Make the actual API call to OpenAI."""
        return self.client.beta.chat.completions.parse(
            model=self.settings.llm_model,
            messages=[{"role": "user", "content": prompt}],
            response_format=response_model,
        )

    async def decompose_query(self, query: str) -> dict[str, Any]:
        """Decompose the query into smaller sub-queries."""
        if self.client is None:
            logger.warning(
                "OpenAI client is not initialized. Skipping decomposition."
            )
            return {"sub_queries": [query]}

        # TODO: Implement the actual decomposition logic here
        return {"sub_queries": [query]}
