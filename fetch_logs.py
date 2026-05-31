import google.auth
import google.auth.transport.requests
import requests
import sys

try:
    credentials, project = google.auth.default()
    auth_req = google.auth.transport.requests.Request()
    credentials.refresh(auth_req)

    url = "https://cloudbuild.googleapis.com/v1/projects/supershaker/locations/global/builds/af33f5f8-de2e-4bec-bda0-94ff5dc0ccbf"
    headers = {"Authorization": f"Bearer {credentials.token}"}
    
    resp = requests.get(url, headers=headers)
    resp.raise_for_status()
    build = resp.json()
    
    log_url = build.get('logsBucket', '')
    print(f"Log URL info: {log_url}")
    print(f"Build status: {build.get('status')}")
    
    # Cloud Build stores logs in a Google Cloud Storage bucket
    # URL format: gs://project_id_cloudbuild/logs/...
    # But we can also just fetch the steps results
    for step in build.get('steps', []):
        print(f"Step {step.get('id')} status: {step.get('status')}")
        if step.get('status') == 'FAILURE':
            print(f"FAILED STEP: {step}")

except Exception as e:
    print(f"Error: {e}")
