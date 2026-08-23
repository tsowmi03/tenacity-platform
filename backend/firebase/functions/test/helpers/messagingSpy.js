"use strict";

const messagingModule = require("firebase-admin/messaging");

/**
 * Capture what the notification layer sends, without a real FCM connection.
 *
 * Production code calls `getMessaging()` lazily inside each send rather than
 * at module load, so replacing the module's export is enough to intercept
 * every send made after `install()`.
 *
 * By default every token succeeds. `failTokens` marks specific tokens as
 * failed with a given FCM error code, which is how the dead-token pruning
 * path is exercised — pass a code like
 * `messaging/registration-token-not-registered` to have that token treated
 * as permanently gone.
 *
 * Always call `restore()` in `after()`. The patch is module-global, so a
 * spy left installed leaks into every later test file in the run.
 */
function installMessagingSpy({ failTokens = {} } = {}) {
  const sent = [];
  const original = messagingModule.getMessaging;

  messagingModule.getMessaging = () => ({
    sendEachForMulticast: async (message) => {
      sent.push(message);
      const tokens = message.tokens || [];
      const responses = tokens.map((token) => {
        const code = failTokens[token];
        return code
          ? { success: false, error: { code } }
          : { success: true };
      });
      return {
        successCount: responses.filter((r) => r.success).length,
        failureCount: responses.filter((r) => !r.success).length,
        responses,
      };
    },
  });

  return {
    sent,
    reset: () => {
      sent.length = 0;
    },
    failToken: (token, code = "messaging/registration-token-not-registered") => {
      failTokens[token] = code;
    },
    restore: () => {
      messagingModule.getMessaging = original;
    },
  };
}

module.exports = { installMessagingSpy };
