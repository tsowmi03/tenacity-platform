"use strict";

// Firebase deploys from package.json#main (`lib/index.js`). Keep this bridge so
// legacy local imports of functions/index.js use the same migrated entrypoint.
module.exports = require("./lib/index");
