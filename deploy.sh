#!/bin/bash

# AI Grid Deployment Script for Render
# This script helps prepare your project for deployment to Render

echo "=== AI Grid Deployment Preparation ==="
echo "This script will help you prepare your project for deployment to Render."

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo "Error: Git is not installed. Please install Git first."
    exit 1
fi

# Check if we're in a git repository
if [ ! -d .git ]; then
    echo "Initializing Git repository..."
    git init
    
    # Create .gitignore if it doesn't exist
    if [ ! -f .gitignore ]; then
        echo "Creating .gitignore file..."
        cat > .gitignore << EOF
# Environment variables
.env
*.env

# Node modules
node_modules/
dist/
build/

# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
env/
venv/
ENV/
env.bak/
venv.bak/
.pytest_cache/

# OS specific
.DS_Store
Thumbs.db
EOF
    fi
fi

# Check for .env file in backend
if [ ! -f backend/.env ]; then
    echo "Creating .env file from .env.example..."
    if [ -f backend/.env.example ]; then
        cp backend/.env.example backend/.env
        echo "Please edit backend/.env to add your API keys and other configuration."
    else
        echo "Warning: No .env.example file found. Please create backend/.env manually."
    fi
fi

# Ensure render.yaml exists
if [ ! -f render.yaml ]; then
    echo "Error: render.yaml not found. This file is required for Render deployment."
    exit 1
fi

# Check for Milvus Lite configuration
if grep -q "VECTOR_DB_PROVIDER=milvus" backend/.env 2>/dev/null; then
    echo "Milvus Lite configuration detected."
    echo "Ensuring persistent disk is configured in render.yaml..."
    
    if ! grep -q "disk:" render.yaml || ! grep -q "mountPath: /data" render.yaml; then
        echo "Warning: Persistent disk configuration for Milvus Lite may be missing in render.yaml."
        echo "Please ensure the backend service has a disk configuration with mountPath: /data"
    else
        echo "Persistent disk configuration for Milvus Lite found in render.yaml."
    fi
fi

echo ""
echo "=== Deployment Preparation Complete ==="
echo ""
echo "Next steps:"
echo "1. Edit backend/.env to add your API keys"
echo "2. Commit your changes: git add . && git commit -m 'Prepare for deployment'"
echo "3. Create a repository on GitHub/GitLab"
echo "4. Add remote: git remote add origin <your-repository-url>"
echo "5. Push your code: git push -u origin main"
echo "6. Go to Render.com and create a new Blueprint using your repository"
echo ""
echo "For more detailed instructions, see DEPLOYMENT.md"

# Make the script executable
chmod +x deploy.sh
