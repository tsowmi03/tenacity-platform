import { getAnnouncement, listAnnouncements } from "./announcementsApi";
import { listUsers } from "./usersApi";

export const ANNOUNCEMENT_REPORTING_CACHE_MS = 60_000;

let announcementList;
let announcementListFetchedAt = 0;
let announcementsById = new Map();
let announcementFetchedAt = new Map();
let users;
let usersFetchedAt = 0;

let announcementListRequest;
let usersRequest;
const announcementRequests = new Map();

function isFresh(fetchedAt) {
  return fetchedAt > 0 && Date.now() - fetchedAt < ANNOUNCEMENT_REPORTING_CACHE_MS;
}

function storeAnnouncementList(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const fetchedAt = Date.now();
  announcementList = safeRows;
  announcementListFetchedAt = fetchedAt;
  announcementsById = new Map(safeRows.map((row) => [row.id, row]));
  announcementFetchedAt = new Map(safeRows.map((row) => [row.id, fetchedAt]));
  return safeRows;
}

function storeAnnouncement(announcementId, row) {
  const fetchedAt = Date.now();
  announcementsById.set(announcementId, row);
  announcementFetchedAt.set(announcementId, fetchedAt);

  if (Array.isArray(announcementList)) {
    const existingIndex = announcementList.findIndex((item) => item.id === announcementId);
    if (row && existingIndex >= 0) {
      announcementList = announcementList.map((item, index) => index === existingIndex ? row : item);
    } else if (row) {
      announcementList = [row, ...announcementList];
    } else if (existingIndex >= 0) {
      announcementList = announcementList.filter((item) => item.id !== announcementId);
    }
  }

  return row;
}

export function getCachedAnnouncements() {
  return announcementList;
}

export function getCachedUsers() {
  return users;
}

export function getCachedAnnouncement(announcementId) {
  if (announcementsById.has(announcementId)) return announcementsById.get(announcementId);
  if (Array.isArray(announcementList)) return null;
  return undefined;
}

export function loadCachedAnnouncements({ force = false } = {}) {
  if (!force && Array.isArray(announcementList) && isFresh(announcementListFetchedAt)) {
    return Promise.resolve(announcementList);
  }
  if (announcementListRequest) return announcementListRequest;

  announcementListRequest = listAnnouncements()
    .then(storeAnnouncementList)
    .finally(() => {
      announcementListRequest = undefined;
    });
  return announcementListRequest;
}

export function loadCachedUsers({ force = false } = {}) {
  if (!force && Array.isArray(users) && isFresh(usersFetchedAt)) {
    return Promise.resolve(users);
  }
  if (usersRequest) return usersRequest;

  usersRequest = listUsers()
    .then((rows) => {
      users = Array.isArray(rows) ? rows : [];
      usersFetchedAt = Date.now();
      return users;
    })
    .finally(() => {
      usersRequest = undefined;
    });
  return usersRequest;
}

export function loadCachedAnnouncement(announcementId, { force = false } = {}) {
  const cached = getCachedAnnouncement(announcementId);
  const fetchedAt = announcementFetchedAt.get(announcementId) || announcementListFetchedAt;
  if (!force && cached !== undefined && isFresh(fetchedAt)) {
    return Promise.resolve(cached);
  }
  if (announcementRequests.has(announcementId)) return announcementRequests.get(announcementId);

  const request = getAnnouncement(announcementId)
    .then((row) => storeAnnouncement(announcementId, row))
    .finally(() => {
      announcementRequests.delete(announcementId);
    });
  announcementRequests.set(announcementId, request);
  return request;
}

export function loadAnnouncementReportingOverview(options = {}) {
  return Promise.all([
    loadCachedAnnouncements(options),
    loadCachedUsers(options),
  ]);
}

export function resetAnnouncementReportingCache() {
  announcementList = undefined;
  announcementListFetchedAt = 0;
  announcementsById = new Map();
  announcementFetchedAt = new Map();
  users = undefined;
  usersFetchedAt = 0;
  announcementListRequest = undefined;
  usersRequest = undefined;
  announcementRequests.clear();
}
