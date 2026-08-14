import { useEffect, useRef, useState } from "react";
import { fetchResourceJobPreview } from "../../backend/resourcesApi";

// Fetches a job's stored PDF preview into an object URL and manages its
// lifecycle: the URL is revoked on close/unmount, and a fetch that resolves
// after the modal was closed (or another preview opened) is discarded rather
// than leaking. Pair with ResourcePreviewModal.
export function useResourcePreview() {
  const [target, setTarget] = useState(null);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const seqRef = useRef(0);
  const urlRef = useRef("");

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    []
  );

  function revokeCurrent() {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = "";
    }
  }

  async function open(job) {
    const seq = ++seqRef.current;
    revokeCurrent();
    setTarget(job);
    setUrl("");
    setError("");
    setLoading(true);
    try {
      const blob = await fetchResourceJobPreview(job);
      const objectUrl = URL.createObjectURL(blob);
      if (seqRef.current !== seq) {
        URL.revokeObjectURL(objectUrl);
        return;
      }
      urlRef.current = objectUrl;
      setUrl(objectUrl);
    } catch (fetchError) {
      if (seqRef.current !== seq) return;
      setError(fetchError?.userMessage || fetchError?.message || "Could not fetch the preview.");
    } finally {
      if (seqRef.current === seq) setLoading(false);
    }
  }

  function close() {
    seqRef.current += 1;
    revokeCurrent();
    setTarget(null);
    setUrl("");
    setError("");
    setLoading(false);
  }

  return { target, url, loading, error, open, close };
}
