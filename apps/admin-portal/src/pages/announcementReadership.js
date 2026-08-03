const AUDIENCE_ROLES = {
  all: new Set(["parent", "tutor", "admin"]),
  parent: new Set(["parent"]),
  tutor: new Set(["tutor"]),
  admin: new Set(["admin"]),
};

export const ANNOUNCEMENT_AUDIENCES = [
  { value: "all", label: "All users" },
  { value: "parent", label: "Parents" },
  { value: "tutor", label: "Tutors" },
  { value: "admin", label: "Admins" },
];

export function announcementAudienceLabel(audience) {
  return ANNOUNCEMENT_AUDIENCES.find((option) => option.value === audience)?.label || "All users";
}

export function userDisplayName(user) {
  const fullName = `${String(user?.firstName || "").trim()} ${String(user?.lastName || "").trim()}`.trim();
  return user?.displayName || fullName || user?.email || "Unknown user";
}

export function userKind(user) {
  const role = String(user?.role || "").toLowerCase();
  if (role === "parent") return "parents";
  if (role === "tutor") return "tutors";
  if (role === "admin") return "admins";
  return null;
}

function userKey(user) {
  return user?.uid || user?.id || null;
}

function compareUsers(a, b) {
  const aKey = `${String(a.lastName || "")} ${String(a.firstName || "")} ${userDisplayName(a)}`;
  const bKey = `${String(b.lastName || "")} ${String(b.firstName || "")} ${userDisplayName(b)}`;
  return aKey.localeCompare(bKey, "en-AU", { sensitivity: "base" });
}

export function buildAnnouncementReadership(announcement, users = []) {
  const announcementId = announcement?.id;
  const roles = AUDIENCE_ROLES[announcement?.audience] || AUDIENCE_ROLES.all;
  const uniqueUsers = new Map();

  users.forEach((user) => {
    const key = userKey(user);
    const role = String(user?.role || "").toLowerCase();
    if (key && roles.has(role)) uniqueUsers.set(key, user);
  });

  const eligible = [...uniqueUsers.values()]
    .sort(compareUsers)
    .map((user) => ({
      ...user,
      opened: Array.isArray(user.readAnnouncements)
        && typeof announcementId === "string"
        && user.readAnnouncements.includes(announcementId),
    }));

  return {
    eligible,
    opened: eligible.filter((user) => user.opened),
    notOpened: eligible.filter((user) => !user.opened),
  };
}
