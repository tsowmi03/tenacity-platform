"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applicationDefaultCredentialsMessage = exports.isApplicationDefaultCredentialsReauthError = exports.errorText = void 0;
function errorText(error) {
    if (error instanceof Error) {
        const cause = "cause" in error ? error.cause : undefined;
        return [error.message, cause ? errorText(cause) : ""]
            .filter(Boolean)
            .join("\n");
    }
    try {
        return JSON.stringify(error);
    }
    catch (_a) {
        return String(error);
    }
}
exports.errorText = errorText;
function isApplicationDefaultCredentialsReauthError(error) {
    const text = errorText(error);
    return text.includes("invalid_rapt") ||
        text.includes("invalid_grant") ||
        text.includes("reauth related error");
}
exports.isApplicationDefaultCredentialsReauthError = isApplicationDefaultCredentialsReauthError;
function applicationDefaultCredentialsMessage(projectId) {
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
exports.applicationDefaultCredentialsMessage = applicationDefaultCredentialsMessage;
