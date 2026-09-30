#!/usr/bin/env bash
# Provision the two GitHub OIDC identities used by firebase-terms-staging-sync.
# Dry run by default. RUN=1 applies the reviewed commands.
set -euo pipefail

run() {
  if [[ "${RUN:-0}" == "1" ]]; then
    echo "+ $*"
    "$@"
  else
    printf '%q ' "$@"
    echo
  fi
}

run_with_retry() {
  local attempt
  for attempt in 1 2 3 4 5 6; do
    if run "$@"; then return 0; fi
    if [[ "$attempt" == "6" ]]; then return 1; fi
    sleep 5 # Newly created service accounts take a few seconds to propagate.
  done
}

provision() {
  local project="$1" number="$2" environment="$3" account="$4" role="$5" permissions="$6"
  local email="${account}@${project}.iam.gserviceaccount.com"
  local principal="principalSet://iam.googleapis.com/projects/${number}/locations/global/workloadIdentityPools/github/attribute.environment/${environment}"

  if [[ "${RUN:-0}" == "1" ]] && gcloud iam roles describe "$role" --project="$project" >/dev/null 2>&1; then
    echo "Existing role: projects/${project}/roles/${role}"
  else
    run gcloud iam roles create "$role" --project="$project" \
      --title="Tenacity term calendar sync ${environment}" \
      --permissions="$permissions" --stage=GA
  fi
  if [[ "${RUN:-0}" == "1" ]] && gcloud iam service-accounts describe "$email" --project="$project" >/dev/null 2>&1; then
    echo "Existing service account: $email"
  else
    run gcloud iam service-accounts create "$account" --project="$project" \
      --display-name="Tenacity term calendar sync ${environment}"
  fi
  run_with_retry gcloud projects add-iam-policy-binding "$project" \
    --member="serviceAccount:${email}" \
    --role="projects/${project}/roles/${role}" --condition=None --format=none
  run gcloud iam service-accounts add-iam-policy-binding "$email" \
    --project="$project" \
    --member="$principal" --role=roles/iam.workloadIdentityUser
}

# Firestore IAM permissions are project-scoped. The code further limits reads
# and writes to the terms collection; these identities cannot delete documents.
provision tenacity-tutoring-b8eb2 398065992407 tenacity-production \
  tenacity-prod-term-read tenacityProductionTermsReader \
  datastore.entities.get,datastore.entities.list

provision tenacity-tutoring-staging 354428033510 tenacity-staging \
  tenacity-stage-term-write tenacityStagingTermsWriter \
  datastore.entities.get,datastore.entities.list,datastore.entities.create,datastore.entities.update
