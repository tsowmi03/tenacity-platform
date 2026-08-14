#!/usr/bin/env bash
# Provision the tenacity-production GitHub environment for the Tenacity monorepo.
#
# Creates the protected-main-only `tenacity-production` environment and its ten
# non-secret variables with arming DISABLED. It does NOT set secrets (their
# values are not available to automation) and does NOT move any workflow into
# .github/workflows or arm anything.
#
# The environment is a credential and branch-policy boundary, not an
# independent reviewer gate (see docs/operations/solo-production-authorization.md).
#
# Prerequisites: gh authenticated with admin on tsowmi03/tenacity-platform.
#
# Usage:
#   bash scripts/ci/provision-production-environment.sh            # dry run: prints commands
#   RUN=1 bash scripts/ci/provision-production-environment.sh      # execute
#
# After running, set the seven secrets yourself (values you hold):
#   VITE_FIREBASE_API_KEY VITE_FIREBASE_AUTH_DOMAIN VITE_FIREBASE_PROJECT_ID
#   VITE_FIREBASE_STORAGE_BUCKET VITE_FIREBASE_MESSAGING_SENDER_ID
#   VITE_FIREBASE_APP_ID VERCEL_TOKEN
# e.g.:  gh secret set VERCEL_TOKEN --env tenacity-production --repo "$REPO"

set -euo pipefail

REPO="tsowmi03/tenacity-platform"
ENVIRONMENT="tenacity-production"

# RUN=1 executes; otherwise every command is only printed for review.
run() {
  if [[ "${RUN:-0}" == "1" ]]; then
    echo "+ $*"
    "$@"
  else
    printf '%q ' "$@"; echo
  fi
}

echo "### 1. Create/update the environment, restricted to protected branches ###"
if [[ "${RUN:-0}" == "1" ]]; then
  gh api -X PUT "repos/${REPO}/environments/${ENVIRONMENT}" --input - <<'JSON'
{
  "deployment_branch_policy": {
    "protected_branches": true,
    "custom_branch_policies": false
  }
}
JSON
else
  echo "gh api -X PUT repos/${REPO}/environments/${ENVIRONMENT} --input - <<'JSON'"
  echo '{ "deployment_branch_policy": { "protected_branches": true, "custom_branch_policies": false } }'
  echo "JSON"
fi

echo "### 2. Non-secret variables ###"
set_var() {
  run gh variable set "$1" --env "$ENVIRONMENT" --repo "$REPO" --body "$2"
}
# The workflows compare each of these against a literal baked into the workflow
# itself, so a variable pointed at the wrong project fails the run before any
# provider call. Deploys are gated by manual dispatch, the typed confirmation,
# main-only + SHA match, and this protected environment.
set_var FIREBASE_DEPLOYMENT_TARGET "production"
set_var FIREBASE_PROJECT_ID "tenacity-tutoring-b8eb2"
set_var FIREBASE_STORAGE_BUCKET "tenacity-tutoring-b8eb2.firebasestorage.app"
set_var FIREBASE_STORAGE_TARGET "primary"
set_var FIREBASE_DATABASE_ID "(default)"
set_var FIREBASE_HOSTING_SITE "tenacity-tutoring-b8eb2"
set_var FIREBASE_HOSTING_TARGET "admin-portal"
# The resource portal is a second Hosting site in the same project. The deploy
# workflow checks the pair matching the surface it was asked to publish.
set_var FIREBASE_RESOURCE_HOSTING_SITE "tenacity-resources-b8eb2"
set_var FIREBASE_RESOURCE_HOSTING_TARGET "resource-portal"
set_var VERCEL_ORG_ID "team_1di6uZZn3ENj9oo4Porw8yF6"
set_var VERCEL_PROJECT_ID "prj_MVZzGI3naoD9yo9IrMbWQeChOWhk"

echo
echo "Done. Verify with:"
echo "  gh api repos/${REPO}/environments/${ENVIRONMENT} --jq '{name,deployment_branch_policy}'"
echo "  gh variable list --env ${ENVIRONMENT} --repo ${REPO}"
echo
echo "Then set the seven secrets yourself (NOT done by this script):"
echo "  for s in VITE_FIREBASE_API_KEY VITE_FIREBASE_AUTH_DOMAIN VITE_FIREBASE_PROJECT_ID \\"
echo "           VITE_FIREBASE_STORAGE_BUCKET VITE_FIREBASE_MESSAGING_SENDER_ID \\"
echo "           VITE_FIREBASE_APP_ID VERCEL_TOKEN; do"
echo "    gh secret set \"\$s\" --env ${ENVIRONMENT} --repo ${REPO}"
echo "  done"
