#!/usr/bin/env bash
#
# Run the mobile app against one Firebase project, with --flavor and
# --dart-define=TENACITY_ENV set from a single argument so they cannot drift.
#
# The two have to agree. `--flavor` decides which GoogleService-Info.plist the
# iOS build phase bundles, and `--dart-define=TENACITY_ENV` decides which
# Firebase options Dart initialises with; set by hand, one can be changed
# without the other. AppEnvironment.assertFlavorMatchesEnvironment turns that
# into a crash in debug builds rather than a staging binary quietly writing to
# production — this script is how you avoid meeting it.
#
# Usage:
#   scripts/run.sh staging                 # run on the default device
#   scripts/run.sh prod -d <device-id>     # anything after the environment is
#   scripts/run.sh staging --release       # passed straight to flutter run
#
# Deliberately no default environment. "Which project am I about to write to"
# is not a question worth guessing at on the developer's behalf.
set -euo pipefail

readonly usage="Usage: scripts/run.sh <staging|prod> [flutter run args...]"

if [ $# -lt 1 ]; then
  echo "error: no environment given." >&2
  echo "$usage" >&2
  exit 2
fi

env_name="$1"
shift

case "$env_name" in
  staging|prod) ;;
  -h|--help)
    echo "$usage"
    exit 0
    ;;
  *)
    echo "error: unknown environment '$env_name'. Expected 'staging' or 'prod'." >&2
    echo "$usage" >&2
    exit 2
    ;;
esac

# Run from the Flutter project root whichever directory this was called from.
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [ "$env_name" = "prod" ]; then
  echo "Running against PRODUCTION Firebase. Real accounts, real payments."
fi

set -x
exec flutter run \
  --flavor "$env_name" \
  --dart-define="TENACITY_ENV=$env_name" \
  "$@"
