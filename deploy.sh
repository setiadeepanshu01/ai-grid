#!/bin/bash

# Script to deploy frontend and/or backend changes to Render via GitHub

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting deployment process...${NC}"

# Function to check for changes in a directory
check_changes() {
  if [[ -n "$(git status --porcelain -- "$1")" ]]; then
    echo -e "${YELLOW}Changes detected in ${1}${NC}"
    return 0 # Changes detected
  else
    echo -e "${GREEN}No changes detected in ${1}${NC}"
    return 1 # No changes
  fi
}

# Check for frontend changes
check_changes frontend
FRONTEND_CHANGED=$?

# Check for backend changes
check_changes backend
BACKEND_CHANGED=$?

# If no changes in frontend or backend, exit
if [[ $FRONTEND_CHANGED -ne 0 && $BACKEND_CHANGED -ne 0 ]]; then
  echo -e "${RED}No frontend or backend changes to deploy. Exiting.${NC}"
  exit 0
fi

# Show overall changes to be committed
echo -e "${YELLOW}Overall changes to be committed:${NC}"
git status -s

# Ask for confirmation
read -p "Do you want to commit and push these changes? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${RED}Deployment cancelled.${NC}"
  exit 1
fi

# Ask for commit message
echo -e "${YELLOW}Enter commit message:${NC}"
read -r commit_message

# Commit the changes
echo -e "${YELLOW}Committing changes...${NC}"
git add .
git commit -m "$commit_message"

# Push to GitHub
echo -e "${YELLOW}Pushing to GitHub...${NC}"
git push

# Check if push was successful
if [ $? -eq 0 ]; then
  echo -e "${GREEN}Changes pushed successfully!${NC}"
else
  echo -e "${RED}Failed to push changes to GitHub.${NC}"
  exit 1
fi

# Deploy frontend if changes detected
if [[ $FRONTEND_CHANGED -eq 0 ]]; then
  echo -e "${YELLOW}Deploying frontend...${NC}"
  # Assuming you have Render CLI configured or use a separate script for frontend deployment
  # Replace with your actual frontend deployment command
  echo -e "${GREEN}Frontend deployment triggered.${NC}" 
fi

# Deploy backend if changes detected
if [[ $BACKEND_CHANGED -eq 0 ]]; then
  echo -e "${YELLOW}Deploying backend...${NC}"
  # Assuming you have Render CLI configured or use a separate script for backend deployment
  # Replace with your actual backend deployment command
  echo -e "${GREEN}Backend deployment triggered.${NC}"
fi

echo -e "${YELLOW}Render will automatically deploy the changes.${NC}"
echo -e "${YELLOW}You can check the deployment status at: https://dashboard.render.com/${NC}"
echo -e "${GREEN}Deployment process completed!${NC}"
