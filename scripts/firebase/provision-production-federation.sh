#!/usr/bin/env bash
# Provision production federation resources for the Tenacity monorepo.
#
# Creates the keyless workload-identity-federation resources that the five
# inert Firebase production workflow templates reference. It mirrors the proven
# staging model (see docs/operations/firebase-staging-rehearsal.md) against the
# separate PRODUCTION project.
#
# This is a PRODUCTION IAM change. Review every command before running. It
# creates no key, arms nothing, and moves no workflow into .github/workflows.
# Run it under the readiness record described in
# docs/operations/solo-production-authorization.md.
#
# Prerequisites: gcloud authenticated as an identity with, on the production
# project, iam.workloadIdentityPoolAdmin, iam.serviceAccountAdmin,
# iam.roleAdmin, and resourcemanager.projectIamAdmin (owner satisfies all).
#
# Usage:
#   bash scripts/firebase/provision-production-federation.sh            # dry run: prints commands
#   RUN=1 bash scripts/firebase/provision-production-federation.sh      # execute

set -euo pipefail

PROJECT_ID="tenacity-tutoring-b8eb2"
PROJECT_NUMBER="398065992407"
REPO="tsowmi03/tenacity-platform"
ENVIRONMENT="tenacity-production"
POOL="github"
PROVIDER="tenacity-platform"
ISSUER="https://token.actions.githubusercontent.com"

# Impersonation is allowed only for jobs running in the protected
# tenacity-production GitHub environment.
PRINCIPAL_SET="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.environment/${ENVIRONMENT}"
SUBJECT_PRINCIPAL="principal://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/subject/repo:${REPO}:environment:${ENVIRONMENT}"

sa_email() { echo "tenacity-production-$1@${PROJECT_ID}.iam.gserviceaccount.com"; }

# RUN=1 executes; otherwise every command is only printed for review.
run() {
  if [[ "${RUN:-0}" == "1" ]]; then
    echo "+ $*"
    "$@"
  else
    printf '%q ' "$@"; echo
  fi
}

echo "### 1. Custom single-permission roles (mirror the staging roles) ###"
run gcloud iam roles create tenacityProductionProjectGet \
  --project="$PROJECT_ID" \
  --title="Tenacity Production Project Get" \
  --description="Single permission for Firebase CLI project resolution by production deploy identities" \
  --permissions=firebase.projects.get \
  --stage=GA

run gcloud iam roles create tenacityProductionRulesetTest \
  --project="$PROJECT_ID" \
  --title="Tenacity Production Ruleset Test" \
  --description="Single permission allowing Firebase CLI rules pre-compilation during index deploys" \
  --permissions=firebaserules.rulesets.test \
  --stage=GA

echo "### 2. Four least-privilege service accounts ###"
run gcloud iam service-accounts create tenacity-production-rules \
  --project="$PROJECT_ID" --display-name="Tenacity production Rules deploy"
run gcloud iam service-accounts create tenacity-production-indexes \
  --project="$PROJECT_ID" --display-name="Tenacity production index deploy"
run gcloud iam service-accounts create tenacity-production-functions \
  --project="$PROJECT_ID" --display-name="Tenacity production Functions deploy"
run gcloud iam service-accounts create tenacity-production-hosting \
  --project="$PROJECT_ID" --display-name="Tenacity production Hosting deploy"

echo "### 3a. Rules identity roles (PROVEN in staging) ###"
for role in \
  "roles/firebaserules.admin" \
  "roles/firebasestorage.viewer" \
  "roles/serviceusage.serviceUsageConsumer" \
  "projects/${PROJECT_ID}/roles/tenacityProductionProjectGet"; do
  run gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$(sa_email rules)" --role="$role" --condition=None
done

echo "### 3b. Index identity roles (PROVEN in staging) ###"
for role in \
  "roles/datastore.indexAdmin" \
  "roles/serviceusage.serviceUsageConsumer" \
  "projects/${PROJECT_ID}/roles/tenacityProductionProjectGet" \
  "projects/${PROJECT_ID}/roles/tenacityProductionRulesetTest"; do
  run gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$(sa_email indexes)" --role="$role" --condition=None
done

echo "### 3c. Functions identity roles (PROVISIONAL - never rehearsed) ###"
# Gen-2 Functions deploy touches Cloud Run, Artifact Registry, Cloud Build, and
# must actAs the runtime service account. Start here, then run once and add only
# any named missing permission the deploy reports. Do not broaden to editor.
for role in \
  "roles/cloudfunctions.developer" \
  "roles/run.admin" \
  "roles/artifactregistry.writer" \
  "roles/cloudbuild.builds.editor" \
  "roles/iam.serviceAccountUser" \
  "roles/serviceusage.serviceUsageConsumer" \
  "projects/${PROJECT_ID}/roles/tenacityProductionProjectGet"; do
  run gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$(sa_email functions)" --role="$role" --condition=None
done

echo "### 3d. Hosting identity roles (PROVISIONAL - never rehearsed) ###"
for role in \
  "roles/firebasehosting.admin" \
  "roles/serviceusage.serviceUsageConsumer" \
  "projects/${PROJECT_ID}/roles/tenacityProductionProjectGet"; do
  run gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$(sa_email hosting)" --role="$role" --condition=None
done

echo "### 4. Workload identity pool + GitHub OIDC provider (production) ###"
run gcloud iam workload-identity-pools create "$POOL" \
  --project="$PROJECT_ID" --location=global \
  --display-name="GitHub Actions"

run gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
  --project="$PROJECT_ID" --location=global \
  --workload-identity-pool="$POOL" \
  --display-name="tenacity-platform repo" \
  --issuer-uri="$ISSUER" \
  --attribute-condition="assertion.repository == '${REPO}'" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.environment=assertion.environment"

echo "### 5. Bind impersonation to the tenacity-production environment only ###"
for sa in rules indexes functions hosting; do
  for member in "$PRINCIPAL_SET" "$SUBJECT_PRINCIPAL"; do
    run gcloud iam service-accounts add-iam-policy-binding "$(sa_email "$sa")" \
      --project="$PROJECT_ID" \
      --role="roles/iam.workloadIdentityUser" \
      --member="$member"
  done
done

echo
echo "Done. Verify with:"
echo "  gcloud iam workload-identity-pools providers describe ${PROVIDER} \\"
echo "    --project=${PROJECT_ID} --location=global --workload-identity-pool=${POOL}"
