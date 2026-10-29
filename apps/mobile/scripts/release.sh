#!/usr/bin/env bash
# Releases the app to the App Store and Google Play from the command line
# (MOB-67). The store work is in fastlane/Fastfile; this checks the branch, the
# version and the notes first, so a release always comes from `main`.
#
#   scripts/release.sh status                 # latest build on each store, next free number
#   scripts/release.sh bump 3.5.0             # pubspec -> 3.5.0+<next free>; PR it to main
#   scripts/release.sh ship --notes "..."     # from main: build, upload, submit both stores
#
# ship options:
#   --notes "..."     What's new, shown in both stores (required, max 500 characters)
#   --ios | --android One store only, e.g. to finish a release that stopped half way
#   --rollout 0.2     Android staged rollout to 20% instead of everyone
#   --no-submit       iOS: upload the build but don't submit it for review. A
#                     later `ship --ios` submits that build without rebuilding.
#   --build-only      Build and sign without uploading. Allowed off main.
#
# Credentials stay outside the repo: ~/.appstoreconnect/config.env
# (ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH) and ~/.play/tenacity-play.json.

set -euo pipefail

readonly usage="Usage: scripts/release.sh <status|bump <version>|ship --notes \"...\" [--ios|--android] [--rollout 0.2] [--no-submit] [--build-only]>"

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# fastlane refuses to run reliably without a UTF-8 locale.
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
export FASTLANE_SKIP_UPDATE_CHECK=1 FASTLANE_HIDE_CHANGELOG=1 FASTLANE_SKIP_DOCS=1
# The Fastfile hands this back to `flutter build`; see flutter_build there.
export RELEASE_ORIGINAL_PATH="$PATH"

asc_config="$HOME/.appstoreconnect/config.env"
if [ ! -f "$asc_config" ]; then
  echo "error: $asc_config is missing (ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH)." >&2
  exit 2
fi
set -a
# shellcheck source=/dev/null
. "$asc_config"
set +a

command -v fastlane >/dev/null || { echo "error: fastlane is not installed (brew install fastlane)." >&2; exit 2; }

store_status() {
  local out
  out="$(mktemp)"
  fastlane status out:"$out" >&2
  cat "$out"
  rm -f "$out"
}

json_field() {
  # $1 = JSON, $2 = key
  printf '%s' "$1" | /usr/bin/ruby -rjson -e "puts JSON.parse(STDIN.read).fetch('$2')"
}

cmd="${1:-}"
[ $# -gt 0 ] && shift

case "$cmd" in
  status)
    fastlane status
    ;;

  bump)
    version="${1:-}"
    if ! [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      echo "error: bump needs a version like 3.5.0." >&2
      echo "$usage" >&2
      exit 2
    fi
    status_json="$(store_status)"
    next="$(json_field "$status_json" next)"
    sed -i '' -E "s/^version: .*/version: ${version}+${next}/" pubspec.yaml
    echo "pubspec.yaml is now ${version}+${next}. Merge it to main with a log.md entry, then run ship."
    ;;

  ship)
    notes=""
    stores="ios android"
    rollout=""
    submit="true"
    build_only="false"
    while [ $# -gt 0 ]; do
      case "$1" in
        --notes) notes="${2:-}"; shift 2 ;;
        --ios) stores="ios"; shift ;;
        --android) stores="android"; shift ;;
        --rollout) rollout="${2:-}"; shift 2 ;;
        --no-submit) submit="false"; shift ;;
        --build-only) build_only="true"; shift ;;
        *) echo "error: unknown option '$1'." >&2; echo "$usage" >&2; exit 2 ;;
      esac
    done

    if [ "$build_only" = "false" ]; then
      if [ -z "$notes" ]; then
        echo "error: --notes is required: it is the \"What's new\" text in both stores." >&2
        exit 2
      fi
      # Google Play's limit; the App Store allows more.
      if [ "${#notes}" -gt 500 ]; then
        echo "error: --notes is ${#notes} characters; Google Play allows 500." >&2
        exit 2
      fi
      if [ -n "$rollout" ] && ! [[ "$rollout" =~ ^0?\.[0-9]+$ ]]; then
        echo "error: --rollout is a fraction below 1, e.g. 0.2." >&2
        exit 2
      fi

      branch="$(git rev-parse --abbrev-ref HEAD)"
      if [ "$branch" != "main" ]; then
        echo "error: releases ship from main; this checkout is on '$branch'." >&2
        exit 2
      fi
      if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
        echo "error: the working tree has uncommitted changes; a release must match main exactly." >&2
        exit 2
      fi
      git fetch --quiet origin main
      if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
        echo "error: this checkout is not at origin/main. Pull first." >&2
        exit 2
      fi
    fi

    lane_args=()
    [ "$build_only" = "true" ] && lane_args+=("upload:false")
    [ -n "$notes" ] && lane_args+=("notes:$notes")

    for store in $stores; do
      store_args=(${lane_args[@]+"${lane_args[@]}"})
      if [ "$store" = "ios" ]; then
        [ "$submit" = "false" ] && store_args+=("submit:false")
      elif [ -n "$rollout" ]; then
        store_args+=("rollout:$rollout")
      fi
      echo "==> $store"
      if ! fastlane "$store" ${store_args[@]+"${store_args[@]}"}; then
        echo "error: the $store release stopped. Anything uploaded before it is kept;" >&2
        echo "       rerun with --$store once it's fixed (an iOS build that already" >&2
        echo "       reached App Store Connect is submitted, not rebuilt)." >&2
        exit 1
      fi
    done
    if [ "$build_only" = "true" ]; then
      echo "Built and signed; nothing was uploaded."
    else
      echo "Done. Apple and Google review the release; iOS goes live automatically on approval."
    fi
    ;;

  -h|--help)
    echo "$usage"
    ;;

  *)
    echo "error: unknown command '${cmd}'." >&2
    echo "$usage" >&2
    exit 2
    ;;
esac
