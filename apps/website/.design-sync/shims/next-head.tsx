// Design-sync preview shim for `next/head` — the real component teleports
// its children into document.head via Next's server/client machinery, which
// doesn't exist in the bundled preview runtime. next/head never renders
// anything into the visible tree either, so a no-op is a faithful stand-in.
export default function Head() {
  return null;
}
