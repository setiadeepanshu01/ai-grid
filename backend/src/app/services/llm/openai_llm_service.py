"""OpenAI completion service implementation."""

import asyncio
import logging
import time
from typing import Any, Optional, Type

from langsmith import traceable
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
        
        # Task tracking for cancellation support
        self.active_tasks = {}  # Maps request_id to asyncio.Task
        self._next_task_id = 0
    
    def get_next_task_id(self) -> str:
        """Generate a unique task ID."""
        task_id = f"task_{self._next_task_id}"
        self._next_task_id += 1
        return task_id
    
    def register_task(self, task_id: str, task: asyncio.Task) -> None:
        """Register a task for potential cancellation."""
        self.active_tasks[task_id] = task
        logger.info(f"Registered task {task_id}, active tasks: {len(self.active_tasks)}")
    
    def unregister_task(self, task_id: str) -> None:
        """Unregister a completed task."""
        if task_id in self.active_tasks:
            del self.active_tasks[task_id]
            logger.info(f"Unregistered task {task_id}, active tasks: {len(self.active_tasks)}")
    
    def cancel_task(self, task_id: str) -> bool:
        """Cancel a running task by its ID."""
        if task_id in self.active_tasks:
            task = self.active_tasks[task_id]
            if not task.done():
                task.cancel()
                logger.info(f"Cancelled task {task_id}")
                return True
        logger.warning(f"Task {task_id} not found or already completed")
        return False
    
    def cancel_all_tasks(self) -> int:
        """Cancel all running tasks."""
        cancelled_count = 0
        for task_id, task in list(self.active_tasks.items()):
            if not task.done():
                task.cancel()
                cancelled_count += 1
        logger.info(f"Cancelled {cancelled_count} tasks")
        return cancelled_count

    @traceable(run_type="llm")
    async def generate_completion(
        self, prompt: str, response_model: Type[BaseModel], parent_run_id: str = None, timeout: int = DEFAULT_TIMEOUT,
        task_id: str = None
    ) -> Optional[BaseModel]:
        """Generate a completion from the language model with timeout and retry logic."""
        if self.client is None:
            logger.warning(
                "OpenAI client is not initialized. Skipping generation."
            )
            return None

        # Generate a task ID if not provided
        if task_id is None:
            task_id = self.get_next_task_id()
            
        # Implement retry logic with exponential backoff
        retries = 0
        backoff = INITIAL_BACKOFF
        last_error = None

        while retries <= MAX_RETRIES:
            try:
                # Use asyncio.wait_for to implement timeout
                start_time = time.time()
                logger.info(f"Attempt {retries + 1} to generate completion for task {task_id}")
                
                # Create a task for the API call
                response_task = asyncio.create_task(
                    self._make_api_call(prompt, response_model, parent_run_id)
                )
                
                # Register the task for potential cancellation
                self.register_task(task_id, response_task)
                
                try:
                    # Wait for the task to complete with a timeout
                    response = await asyncio.wait_for(response_task, timeout=timeout)
                finally:
                    # Unregister the task when it's done (whether successful or not)
                    self.unregister_task(task_id)
                
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
    
    @traceable(name="llm_api_call", run_type="llm")
    async def _make_api_call(
        self, prompt: str, response_model: Type[BaseModel], parent_run_id: str = None
    ) -> Any:  # Use Any instead of the specific type
        """Make the actual API call to OpenAI."""
        return self.client.beta.chat.completions.parse(
            model=self.settings.llm_model,
            messages=[{"role": "user", "content": prompt}],
            response_format=response_model,
        )

    @traceable(name="query_decomposition", run_type="chain")
    async def decompose_query(self, query: str, parent_run_id: str = None) -> dict[str, Any]:
        """Decompose the query into smaller sub-queries."""
        if self.client is None:
            logger.warning(
                "OpenAI client is not initialized. Skipping decomposition."
            )
            return {"sub_queries": [query]}

        # TODO: Implement the actual decomposition logic here
        return {"sub_queries": [query]}
