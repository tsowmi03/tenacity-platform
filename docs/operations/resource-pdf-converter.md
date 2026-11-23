# Resource PDF converter

The resource generator stores a PDF preview next to every DOCX it builds. The
preview comes from `resource-pdf-converter`, a private Cloud Run service that
runs a stock [Gotenberg](https://gotenberg.dev) image (headless LibreOffice).
The functions call it through `RESOURCE_PDF_PREVIEW_URL`
(`backend/firebase/functions/.env.tenacity-tutoring-b8eb2`) and
`src/resources/pdfPreview.js`.

| Setting | Value |
| --- | --- |
| Project / region | `tenacity-tutoring-b8eb2` / `us-central1` |
| Image | `us-central1-docker.pkg.dev/tenacity-tutoring-b8eb2/dockerhub/gotenberg/gotenberg:8.40.0` |
| Port | 3000 |
| Resources | 1 CPU, 1 GiB, scale to zero, max 3 instances |
| Access | Private. Only the functions' runtime service account has `run.invoker`. |

Since RES-122 the same service also converts tutors' reference files that
aren't PDF, DOCX or text (PowerPoint, DOC, ODT, RTF, XLSX, XLS) to PDF before
they are read (`src/resources/referenceReader.js`). Spreadsheets are sent with
`singlePageSheets=true`, so each sheet is one page. Cloud Run caps a request at
32 MiB, so these uploads are limited to 30 MB.

Staging has no converter, so previews and Office reference files are off there
(`RESOURCE_PDF_PREVIEW_URL` is empty in the staging env file).

## Always pin an exact version

Never deploy a floating tag such as `:8`. Gotenberg 8.30–8.36 left out
LibreOffice's maths module, so every Word equation vanished from the preview
without any error (gotenberg/gotenberg#1644, RES-118). A floating tag picks up
a regression like that on any redeploy.

## Moving to a new version

1. Download a recent production maths DOCX (read-only), for example from
   `resources/output/<jobId>/` in the default bucket.
2. Deploy the new tag (see below).
3. Convert the DOCX through the service and check that the equations are
   there:

   ```bash
   U=https://resource-pdf-converter-398065992407.us-central1.run.app
   T=$(gcloud auth print-identity-token)
   curl -s -H "Authorization: Bearer $T" "$U/version"
   curl -s -o check.pdf -H "Authorization: Bearer $T" \
     -F "files=@job.docx;filename=job.docx" "$U/forms/libreoffice/convert"
   pdffonts check.pdf   # should list OpenSymbol and LiberationSerif
   ```

4. If the equations are missing, roll back to the previous revision:
   `gcloud run services update-traffic resource-pdf-converter --region us-central1 --project tenacity-tutoring-b8eb2 --to-revisions <previous>=100`.
5. Update the image row above.

## Deploy

```bash
gcloud run services update resource-pdf-converter \
  --region us-central1 --project tenacity-tutoring-b8eb2 \
  --image us-central1-docker.pkg.dev/tenacity-tutoring-b8eb2/dockerhub/gotenberg/gotenberg:8.40.0
```

`services update` changes only the image and keeps every other setting.
