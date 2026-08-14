# Tenacity Resource Portal

The teaching-resource generator, served at `resources.tenacitytutoring.com`.
Admins and tutors sign in here; nobody else can.

This is an independent Vite application. It shares the Firebase project, users,
role claims, Firestore data, Storage, and Functions with
[`apps/admin-portal`](../admin-portal), and shares **no code** with it.

## Separation from the admin portal

The two portals are separate applications, on separate origins, with separate
sessions and separate Hosting sites. There is no link, route, redirect, or
host-detection path between them in either direction. An admin who uses both
signs in to each one.

`src/portalSeparation.test.js` enforces this: it fails if anything here imports
from `apps/admin-portal`, links to `admin.tenacitytutoring.com`, or inspects
`location.hostname` to decide which portal it is. The admin portal has the
mirror-image test.

### What the separation is and is not

Admission is enforced in `AuthProvider`: an account whose role claim is not
`admin` or `tutor` is signed out before any protected UI renders, and the
reason survives the sign-out so the login screen can explain it.

That is an **application** boundary, not a data boundary. Tutor role claims
still carry the Firestore and Storage access the Flutter mobile app depends on
(`isStaff()` in `backend/firebase/rules/firestore.rules` covers attendance
writes, student reads, and feedback). Those grants are unchanged by the portal
split and must not be tightened without accounting for the mobile app. The real
authorization for resource actions lives in the callables and rules:

| Action | Admin | Tutor |
|---|---:|---:|
| Enter the resource portal | Yes | Yes |
| View/download shared resource history | Yes | Yes |
| Generate or regenerate resources | Yes | Yes |
| Cancel/retry jobs | Any job | Own jobs only |
| Delete completed/failed/cancelled jobs | Yes | No |
| Upload references | Own upload path | Own upload path |

## Duplicated shell — keep it in sync

The Firebase client, `AuthProvider`, login page, shared UI primitives, and
brand CSS are **copies** of the admin portal's, not a shared package. The repo
has no workspace tooling — each application has its own lockfile and CI
installs with `npm ci --prefix` — so a shared package would have cost more than
the duplication does.

The one thing that must not drift is the **client configuration contract**.
Both applications read the same `VITE_FIREBASE_*` variables and both are built
by `.github/workflows/firebase-hosting-production.yml`, which asserts them
once for both surfaces. If that set changes, it changes for both, in that
workflow.

## Local development

```bash
npm --prefix apps/resource-portal install
npm --prefix apps/resource-portal run dev
```

Create `.env` with at least `VITE_FIREBASE_API_KEY`,
`VITE_FIREBASE_AUTH_DOMAIN`, and `VITE_FIREBASE_PROJECT_ID`.

```bash
npm --prefix apps/resource-portal test
npm --prefix apps/resource-portal run build
```

## Exemplar PDFs

`public/resource-exemplars/*.pdf` are committed samples rendered from the same
DOCX builders as real generations, shown as "what does this resource type look
like?" previews. Regenerate them, and `src/components/resources/exemplarManifest.json`,
after changing any builder or fixture:

```bash
node backend/firebase/functions/scripts/renderResourceExemplars.js
```

## Firebase Hosting

- Named target: `resource-portal`
- Site: `tenacity-resources-b8eb2`
- Custom domain: `resources.tenacitytutoring.com`
- Public directory: `apps/resource-portal/dist`
- Single-page app rewrite: all routes serve `/index.html`

Both the custom domain **and** `tenacity-resources-b8eb2.web.app` must be in the
Firebase Authentication authorised-domain list — only the project's default
site is authorised automatically.

Preview channels are deployed with `--no-authorized-domains`, so sign-in is
deliberately impossible on a preview URL. Preview smoke tests are static only;
authenticated verification happens on the custom domain after promotion.

Deploy only through the guarded root workflow
(`.github/workflows/firebase-hosting-production.yml`, surface
`resource_portal`). The production orchestrator deploys this portal **before**
the admin portal, so tutors always have a verified surface first.
