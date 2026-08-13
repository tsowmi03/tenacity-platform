const RESOURCE_PORTAL_HOSTS = new Set([
  "resources.tenacitytutoring.com",
  "resources.tenacitytutoring.com.au",
]);

export function isResourcePortalHost(hostname = globalThis.window?.location?.hostname || "") {
  return RESOURCE_PORTAL_HOSTS.has(String(hostname).trim().toLowerCase());
}

export function landingPathForRole(role, { resourcePortal = false } = {}) {
  if (resourcePortal) return "/";
  return role === "tutor" ? "/resources" : "/";
}

export function resourcePortalHome({ resourcePortal = isResourcePortalHost() } = {}) {
  return resourcePortal ? "/" : "/resources";
}

export function adminPortalHome({ resourcePortal = isResourcePortalHost() } = {}) {
  return resourcePortal ? "https://admin.tenacitytutoring.com" : "/";
}
