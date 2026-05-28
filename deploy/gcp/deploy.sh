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

echo "Enabling necessary APIs (Cloud Run, Cloud Build, Artifact Registry, Resource Manager)..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com cloudresourcemanager.googleapis.com --quiet

echo "Configuring IAM permissions for Cloud Build..."
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

CLOUDBUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

# Grant the default compute service account permissions to read the uploaded source and write logs/images
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$COMPUTE_SA" \
    --role="roles/storage.objectAdmin" --condition=None --quiet > /dev/null

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$COMPUTE_SA" \
    --role="roles/artifactregistry.writer" --condition=None --quiet > /dev/null

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$COMPUTE_SA" \
    --role="roles/logging.logWriter" --condition=None --quiet > /dev/null

# Cloud Build needs permissions to create the repository on push
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$CLOUDBUILD_SA" \
    --role="roles/artifactregistry.repoAdmin" --condition=None --quiet > /dev/null

# Cloud Build needs permissions to deploy to Cloud Run
# For older projects, Cloud Build uses the legacy SA
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$CLOUDBUILD_SA" \
    --role="roles/run.admin" --condition=None --quiet > /dev/null

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$CLOUDBUILD_SA" \
    --role="roles/iam.serviceAccountUser" --condition=None --quiet > /dev/null

# For newer projects, Cloud Build uses the Compute Engine Default SA
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$COMPUTE_SA" \
    --role="roles/run.admin" --condition=None --quiet > /dev/null

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$COMPUTE_SA" \
    --role="roles/iam.serviceAccountUser" --condition=None --quiet > /dev/null

echo "Deploying from source..."
# We run from the project root so the Dockerfile can see all directories
cd "$PROJECT_ROOT"

echo "Ensuring Artifact Registry repository 'supershaker' exists..."
gcloud artifacts repositories create supershaker \
    --repository-format=docker \
    --location=$REGION \
    --description="SuperShaker Docker images" \
    --quiet || true

echo "Building and deploying container image using Cloud Build..."
# Use the cloudbuild.yaml to build, push, and deploy all at once.
# This ensures it uses the logging options and avoids the service_account bug.
gcloud builds submit --config cloudbuild.yaml --substitutions COMMIT_SHA=manual-$(date +%s) .

echo "========================================================"
echo "Deployment initiated/completed! Check the URL above."
echo "========================================================"
