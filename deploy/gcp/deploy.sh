#!/bin/bash
set -e

PROJECT_ID="supershaker"
REGION="us-central1"
SERVICE_NAME="supershaker"

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
# The project root is one level up from deploy/gcp/
PROJECT_ROOT="$( cd "$SCRIPT_DIR/../.." && pwd )"

echo "========================================================"
echo "Deploying SuperShaker to Google Cloud Run"
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "========================================================"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "Error: gcloud CLI could not be found. Please install it to continue."
    exit 1
fi

echo "Setting gcloud project..."
gcloud config set project $PROJECT_ID --quiet

echo "Enabling necessary APIs (Cloud Run, Cloud Build, Artifact Registry)..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --quiet

echo "Configuring IAM permissions for Cloud Build..."
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Grant the default compute service account permissions to read the uploaded source and write logs/images
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$COMPUTE_SA" \
    --role="roles/storage.objectAdmin" --quiet > /dev/null

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$COMPUTE_SA" \
    --role="roles/artifactregistry.writer" --quiet > /dev/null

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$COMPUTE_SA" \
    --role="roles/logging.logWriter" --quiet > /dev/null

echo "Deploying from source..."
# We run from the project root so the Dockerfile can see all directories
cd "$PROJECT_ROOT"

gcloud run deploy $SERVICE_NAME \
    --source . \
    --dockerfile deploy/gcp/Dockerfile \
    --region $REGION \
    --allow-unauthenticated \
    --port 8080 \
    --min-instances 0 \
    --max-instances 10 \
    --quiet

echo "========================================================"
echo "Deployment initiated/completed! Check the URL above."
echo "========================================================"
