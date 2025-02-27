#!/bin/bash

# AI Grid Deployment Script for Render
# This script helps deploy the application to Render with the correct service name

echo "=== AI Grid Deployment to Render ==="

# Check if render-cli is installed
if ! command -v render &> /dev/null; then
    echo "Render CLI not found. Installing..."
    npm install -g @render/cli
fi

# Check if we're logged in to Render
render whoami &> /dev/null
if [ $? -ne 0 ]; then
    echo "Please log in to Render:"
    render login
fi

# Check if the services already exist
echo "Checking for existing services..."
FRONTEND_EXISTS=$(render get service ai-grid-frontend 2>/dev/null)
BACKEND_EXISTS=$(render get service ai-grid-backend 2>/dev/null)

# If the frontend service exists with the old name, delete it
if [ ! -z "$FRONTEND_EXISTS" ]; then
    echo "Found existing frontend service with old name. Deleting..."
    render delete service ai-grid-frontend --confirm
fi

# Apply the blueprint
echo "Applying Render blueprint..."
render blueprint apply render-blueprint.yaml

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Your application should now be available at:"
echo "- Frontend: https://ai-grid.onrender.com"
echo "- Backend API: https://ai-grid-backend.onrender.com"
echo ""
echo "Note: It may take a few minutes for the services to build and deploy."

# Make the script executable
chmod +x deploy-to-render.sh
