# Sourced by firebase-functions-production.yml. Not executable on its own.
#
# Google's Cloud Functions list API intermittently answers a production
# deploy with "Failed to list functions for <project>". Both `firebase deploy`
# (which lists before it changes anything) and `firebase functions:list` hit
# it, and a single occurrence used to stop the batch loop partway, leaving
# production on mixed versions until someone reran the job (TP-45).
#
# Deploys are retried only on that transient error: any other deploy failure
# still returns its exit status on the first attempt, so a real failure stops
# the run exactly as before. The list call is read-only and retries any
# failure.
#
# Requires FIREBASE_PROJECT_ID. FIREBASE_RETRY_DELAYS is the space-separated
# list of seconds to wait before each retry; its length is the retry count.
# Compatible with bash 3.2 so the tests also run on a stock macOS shell.

FIREBASE_RETRY_DELAYS="${FIREBASE_RETRY_DELAYS:-30 60}"

firebase_list_error() {
  printf 'Failed to list functions for %s' "$FIREBASE_PROJECT_ID"
}

# firebase_functions_list OUTPUT_FILE
# `firebase functions:list --json` into OUTPUT_FILE. It is read-only, so any
# failure is retried. Returns the last exit status.
firebase_functions_list() {
  local output="$1" attempt=1 status=0 delay
  local delays=($FIREBASE_RETRY_DELAYS)
  while :; do
    status=0
    firebase functions:list \
      --project "$FIREBASE_PROJECT_ID" \
      --json > "$output" || status=$?
    [ "$status" -eq 0 ] && return 0
    # On failure --json prints an error object, never the inventory, so the
    # message is safe to surface.
    grep -o '"error": *"[^"]*"' "$output" >&2 || true
    if [ "$attempt" -gt "${#delays[@]}" ]; then
      echo "::error::firebase functions:list failed on all $attempt attempts (last exit $status)." >&2
      return "$status"
    fi
    delay="${delays[$((attempt - 1))]}"
    echo "::warning::firebase functions:list failed (attempt $attempt, exit $status); retrying in ${delay}s." >&2
    sleep "$delay"
    attempt=$((attempt + 1))
  done
}

# firebase_deploy LOG_FILE DEPLOY_ARGS...
# `firebase deploy DEPLOY_ARGS...`, output shown and copied to LOG_FILE.
# Retried only when the output contains the transient list error; any other
# failure returns its exit status immediately. LOG_FILE holds the last
# attempt's output, so callers can inspect it as before.
firebase_deploy() {
  local log="$1" attempt=1 status=0 delay
  shift
  local delays=($FIREBASE_RETRY_DELAYS)
  while :; do
    status=0
    {
      firebase deploy "$@" 2>&1 | tee "$log"
      status="${PIPESTATUS[0]}"
    } || true
    [ "$status" -eq 0 ] && return 0
    if ! grep -qF "$(firebase_list_error)" "$log"; then
      return "$status"
    fi
    if [ "$attempt" -gt "${#delays[@]}" ]; then
      echo "::error::firebase deploy hit \"$(firebase_list_error)\" on all $attempt attempts." >&2
      return "$status"
    fi
    delay="${delays[$((attempt - 1))]}"
    echo "::warning::firebase deploy hit \"$(firebase_list_error)\" (attempt $attempt); retrying in ${delay}s." >&2
    sleep "$delay"
    attempt=$((attempt + 1))
  done
}
