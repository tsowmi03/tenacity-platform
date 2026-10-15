"use strict";

/**
 * Defers loading a module until the first call, then returns the same module
 * on every later call.
 *
 * Every function instance loads the whole bundle at startup, whichever
 * function it serves, so a library required at the top of any file costs
 * memory in all ~100 functions. The heavy ones (the AI SDKs, PostHog, Stripe,
 * Xero, SendGrid, the PDF and spreadsheet libraries) are loaded this way so
 * that only the functions that use them pay for them: startup dropped from
 * about 225 MiB to about 80 MiB, and a one-week swap had been failing on the
 * 256 MiB default (TP-37). `scripts/checkStartupMemory.js` keeps it there.
 *
 * Takes a loader rather than a module id so the `require` stays in the calling
 * file, which is where Node resolves it from.
 */
function lazyRequire(load) {
  let loaded = false;
  let value;
  return () => {
    if (!loaded) {
      value = load();
      loaded = true;
    }
    return value;
  };
}

module.exports = { lazyRequire };
