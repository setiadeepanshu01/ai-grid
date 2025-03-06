"""Abstract base class for language model completion services."""

from abc import ABC, abstractmethod
from typing import Any, List, Optional


class CompletionService(ABC):
    """Abstract base class for language model completion services."""

    @abstractmethod
    async def generate_completion(
        self, prompt: str, response_model: Any, parent_run_id: str = None, timeout: int = None,
        task_id: str = None
    ) -> Any:
        """Generate a completion from the language model."""
        pass

    @abstractmethod
    async def decompose_query(self, query: str, parent_run_id: str = None) -> dict[str, Any]:
        """Decompose the query into smaller sub-queries."""
        pass
    
    def cancel_task(self, task_id: str) -> bool:
        """Cancel a specific task. Returns True if task was cancelled, False otherwise."""
        return False
    
    def cancel_all_tasks(self) -> int:
        """Cancel all active tasks. Returns the number of tasks cancelled."""
        return 0
