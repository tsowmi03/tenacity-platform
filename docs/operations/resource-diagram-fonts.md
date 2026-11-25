# Resource diagram label fonts

Drawn maths diagrams (not question-bank crops) are rendered by sharp from SVG,
with the fonts of the machine they run on.

| Where | How labels are drawn |
| --- | --- |
| Cloud Functions (`google-22-full` image) | fontconfig. Liberation Sans stands in for Arial. DejaVu Sans is not installed. |
| macOS (local renders) | Core Text. Arial. fontconfig settings are ignored. |

The Functions image has no font that places a combining mark over the letter
before it. The bar of x̄ printed beside the x and a recurring decimal's dot was
lost (RES-40). So DejaVu Sans ships with the functions:

- Fonts and licence: `backend/firebase/functions/src/resources/assets/fonts/`.
- `src/resources/diagramFonts.js` writes a fontconfig file to the temp
  directory when the diagram generator loads and sets `FONTCONFIG_FILE` to it.
  The file includes the system configuration, so the image's own fonts still
  apply. A `FONTCONFIG_FILE` that is already set is left alone.
- Ordinary labels keep `Arial, Liberation Sans, …`: every diagram's spacing was
  tuned with it, and DejaVu Sans is about 9% wider. Only a label that carries a
  combining mark is drawn in DejaVu Sans.

## Checking a change on the Functions image

Local renders prove nothing about the server. Run the check on the image the
functions use, as a one-off Cloud Build in the staging project (no deploy, no
model calls):

```bash
cd backend/firebase/functions
D=$(mktemp -d)
rsync -a --exclude node_modules --exclude test --exclude lib package.json package-lock.json src scripts "$D/"
cat > "$D/cloudbuild.yaml" <<'YAML'
steps:
- name: us-central1-docker.pkg.dev/serverless-runtimes/google-22-full/runtimes/nodejs22
  entrypoint: bash
  args:
  - -c
  - |
    export HOME=/tmp; mkdir -p /tmp/w && cp -r /workspace/. /tmp/w/ && cd /tmp/w
    npm ci --omit=dev --no-audit --no-fund 2>&1 | tail -2
    node scripts/checkDiagramLabelFonts.js /tmp/out --base64
timeout: 900s
YAML
gcloud builds submit --project tenacity-tutoring-staging --config "$D/cloudbuild.yaml" "$D" > build.log
```

Each `PNG:<name>:<base64>` line in `build.log` is one rendered diagram. Decode
them and look at the labels: x̄ has its bar over the x, 0.3̇ has its dot over
the 3, and ∪, ∩, θ and ξ are drawn.

To see the result without the bundled fonts, run the same script with
`FONTCONFIG_FILE=/etc/fonts/fonts.conf`.
