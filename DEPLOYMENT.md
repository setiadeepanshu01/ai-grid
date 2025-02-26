# Deploying AI Grid to Render with Milvus Lite

This guide provides step-by-step instructions for deploying the AI Grid application to Render using Milvus Lite as the vector database.

## Prerequisites

1. A [Render](https://render.com) account
2. An [OpenAI API key](https://platform.openai.com/api-keys)
3. Git repository with your AI Grid code

## Deployment Steps

### 1. Push Your Code to a Git Repository

If you haven't already, push your code to a Git repository (GitHub, GitLab, etc.):

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-repository-url>
git push -u origin main
```

### 2. Create a New Render Blueprint

1. Log in to your [Render Dashboard](https://dashboard.render.com/)
2. Click on "New" and select "Blueprint"
3. Connect your Git repository
4. Render will automatically detect the `render.yaml` file and set up the services

### 3. Configure Environment Variables

For the backend service, you'll need to set these environment variables:

- `OPENAI_API_KEY`: Your OpenAI API key
- `MILVUS_DB_URI`: This is already set to `/data/milvus_db.sqlite` in the render.yaml file

### 4. Deploy Your Services

1. Review the configuration
2. Click "Apply" to start the deployment process
3. Render will build and deploy your services according to the configuration in `render.yaml`

## Accessing Your Deployed Application

Once deployment is complete:

- Frontend: `https://ai-grid-frontend.onrender.com`
- Backend API: `https://ai-grid-backend.onrender.com`
- API Documentation: `https://ai-grid-backend.onrender.com/docs`

## Troubleshooting

- Check service logs in the Render dashboard
- Verify environment variables are set correctly
- Ensure the persistent disk is properly mounted and accessible
- Check that the Milvus Lite database file is being created in the `/data` directory

## Scaling

To scale your application:

1. Go to the service in your Render dashboard
2. Click on "Settings"
3. Adjust the plan and instance count as needed
