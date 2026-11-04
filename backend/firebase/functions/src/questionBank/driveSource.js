"use strict";

// RES-56. Read-only access to the Tenacity Tutoring shared drive for the
// question bank. Requests run as a dedicated service account that has Viewer
// access to the shared drive and nothing else; the caller (a Function or an
// operator's gcloud login) impersonates it, so no key file exists.

const { GoogleAuth, Impersonated } = require("google-auth-library");

const { EXCLUDED_FOLDER } = require("./sourceRules");

const DRIVE_API_ROOT = "https://www.googleapis.com/drive/v3";
const DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
// Resources/Maths in the Tenacity Tutoring shared drive.
const MATHS_FOLDER_ID = "1ExbOl6WoAtz6Rg-ZhNp_nvU50coC_IHV";
const QUESTION_BANK_DRIVE_ACCOUNT = "question-bank-drive@tenacity-tutoring-b8eb2.iam.gserviceaccount.com";
const FILE_FIELDS = "id,name,mimeType,size,md5Checksum,modifiedTime";
const PAGE_SIZE = 1000;

/**
 * Access tokens for the question bank's Drive account, minted by
 * impersonating it with the caller's own credentials.
 */
function createImpersonatedTokenProvider({
  targetPrincipal = QUESTION_BANK_DRIVE_ACCOUNT,
  sourceAuth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] }),
} = {}) {
  let client;
  return async function getAccessToken() {
    if (!client) {
      client = new Impersonated({
        sourceClient: await sourceAuth.getClient(),
        targetPrincipal,
        targetScopes: [DRIVE_READONLY_SCOPE],
        lifetime: 3600,
      });
    }
    const { token } = await client.getAccessToken();
    if (!token) throw new Error(`No Drive access token for ${targetPrincipal}`);
    return token;
  };
}

function createDriveClient({ getAccessToken, fetchImpl = globalThis.fetch }) {
  if (typeof getAccessToken !== "function") throw new TypeError("createDriveClient requires getAccessToken");

  async function request(path, params = {}) {
    const url = new URL(`${DRIVE_API_ROOT}/${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${await getAccessToken()}` } });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Drive ${path} failed: ${response.status} ${detail.slice(0, 300)}`);
    }
    return response;
  }

  return {
    async listChildren(folderId) {
      const files = [];
      let pageToken;
      do {
        const response = await request("files", {
          q: `'${folderId}' in parents and trashed = false`,
          fields: `nextPageToken,files(${FILE_FIELDS})`,
          pageSize: PAGE_SIZE,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
          ...(pageToken ? { pageToken } : {}),
        });
        const body = await response.json();
        files.push(...(body.files || []));
        pageToken = body.nextPageToken;
      } while (pageToken);
      return files;
    },

    async download(fileId) {
      const response = await request(`files/${encodeURIComponent(fileId)}`, { alt: "media", supportsAllDrives: true });
      return Buffer.from(await response.arrayBuffer());
    },

    async exportPdf(fileId) {
      const response = await request(`files/${encodeURIComponent(fileId)}/export`, { mimeType: "application/pdf" });
      return Buffer.from(await response.arrayBuffer());
    },
  };
}

/**
 * Every file under a folder, with its path from that folder's parent (so files
 * under Resources/Maths come back as "Maths/..."). Student Docs folders are
 * not walked. Each level of folders is listed `concurrency` at a time: Maths
 * alone has over 1,200 folders, mostly from textbook CD-ROMs.
 */
async function listTree(drive, rootFolderId = MATHS_FOLDER_ID, rootName = "Maths", { concurrency = 8, onProgress = () => {} } = {}) {
  const files = [];
  let folders = 0;
  let level = [{ id: rootFolderId, path: rootName }];
  while (level.length) {
    const next = [];
    for (let start = 0; start < level.length; start += concurrency) {
      const listings = await Promise.all(level.slice(start, start + concurrency).map(async (folder) => ({
        folder,
        items: await drive.listChildren(folder.id),
      })));
      folders += listings.length;
      onProgress({ folders, files: files.length });
      for (const { folder, items } of listings) {
        for (const item of items) {
          const path = `${folder.path}/${item.name}`;
          if (item.mimeType === FOLDER_MIME_TYPE) {
            if (!EXCLUDED_FOLDER.test(item.name)) next.push({ id: item.id, path });
            continue;
          }
          files.push({
            id: item.id,
            name: item.name,
            path,
            mimeType: item.mimeType,
            bytes: item.size ? Number(item.size) : null,
            md5: item.md5Checksum || null,
            modifiedTime: item.modifiedTime || null,
          });
        }
      }
    }
    level = next;
  }
  return files;
}

module.exports = {
  DRIVE_READONLY_SCOPE,
  MATHS_FOLDER_ID,
  QUESTION_BANK_DRIVE_ACCOUNT,
  createDriveClient,
  createImpersonatedTokenProvider,
  listTree,
};
