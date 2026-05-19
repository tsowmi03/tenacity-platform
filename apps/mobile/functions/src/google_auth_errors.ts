export function errorText(error: unknown): string {
  if (error instanceof Error) {
    const cause = "cause" in error ? (error as { cause?: unknown }).cause : undefined;
    return [error.message, cause ? errorText(cause) : ""]
      .filter(Boolean)
      .join("\n");
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function isApplicationDefaultCredentialsReauthError(error: unknown): boolean {
  const text = errorText(error);
  return text.includes("invalid_rapt") ||
    text.includes("invalid_grant") ||
    text.includes("reauth related error");
}

export function applicationDefaultCredentialsMessage(projectId?: string): string {
  const projectArg = projectId ? ` --project=${projectId}` : "";
  return [
    "Google Application Default Credentials need to be refreshed before this script can read Firestore.",
    "",
    "Run:",
    `  gcloud auth application-default login${projectArg}`,
    "",
    "If that still fails, reset the local ADC token first:",
    "  gcloud auth application-default revoke",
    `  gcloud auth application-default login${projectArg}`,
    "",
    "Then retry:",
    "  npm run backfill:attendance-dates",
  ].join("\n");
}
