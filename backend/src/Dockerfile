# syntax=docker/dockerfile:1.4
# Enable BuildKit features

# Build stage
FROM python:3.12.1-slim-bookworm AS builder

# Set working directory
WORKDIR /usr/src/app

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system dependencies - only what's needed for building wheels
RUN --mount=type=cache,target=/var/cache/apt \
    apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip setuptools wheel

# Copy only the requirements-related files first
COPY pyproject.toml ./

# Create a requirements.txt file with only the essential dependencies
RUN pip install tomli && \
    python -c "import tomli; import json; f = open('pyproject.toml', 'rb'); data = tomli.load(f); essential = [d for d in data['project']['dependencies'] if any(pkg in d.lower() for pkg in ['fastapi', 'uvicorn', 'pydantic', 'langchain', 'openai', 'pymilvus', 'pypdf', 'python-multipart'])]; print('\n'.join(essential))" > requirements.txt

# Install only essential dependencies to create wheels
RUN --mount=type=cache,target=/root/.cache/pip \
    pip wheel --no-deps --wheel-dir /usr/src/app/wheels -r requirements.txt

# Copy source code
COPY src ./src

# Create wheel for the project
RUN --mount=type=cache,target=/root/.cache/pip \
    pip wheel --no-deps --wheel-dir /usr/src/app/wheels -e .

# Final stage
FROM python:3.12.1-slim-bookworm

# Create a non-root user
RUN useradd -m appuser

# Set working directory
WORKDIR /usr/src/app

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Copy wheels and install dependencies
COPY --from=builder /usr/src/app/wheels /wheels
COPY --from=builder /usr/src/app/src ./src
COPY pyproject.toml ./

# Install dependencies with conflict resolution
RUN pip install --no-cache-dir --no-deps /wheels/* && \
    pip install --no-cache-dir pydantic==2.10.6 pydantic-core==2.27.2

# Install additional system dependencies for unstructured - only what's needed for PDF processing
RUN --mount=type=cache,target=/var/cache/apt \
    apt-get update && apt-get install -y --no-install-recommends \
    poppler-utils \
    libmagic1 \
    && rm -rf /var/lib/apt/lists/*

# Install the project and unstructured PDF dependencies
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -e . && \
    pip install "unstructured[pdf]" langchain-unstructured

# Download the spaCy English language model - only if absolutely needed
RUN --mount=type=cache,target=/root/.cache/pip \
    python -m spacy download en_core_web_sm --no-deps

# Change ownership of the app directory
RUN chown -R appuser:appuser /usr/src/app

# Switch to non-root user
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/ping || exit 1

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
