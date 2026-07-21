# Monorepo history import, 21 July 2026

## Status

The history-preserving import and its reachability repair are complete. The
destination is the private
[`tsowmi03/tenacity-platform`](https://github.com/tsowmi03/tenacity-platform)
repository.

The original import published the three application baselines, the active
mobile redesign branch, and three rollback tags. A Phase 1 audit then found 21
mapped commits that were present in the temporary rewritten mirrors but were
not reachable from the selected published refs. Seven minimal `archive/...`
refs were published atomically on 21 July 2026. All 672 commits mapped during
the import are now reachable from published destination refs.

Archive refs preserve history only. Do not branch new product work from them.

## Source checkpoints

| Component | Source repository | Source ref and commit | Rewritten commit |
| --- | --- | --- | --- |
| Mobile baseline | `tsowmi03/Tenacity` | `main` at `a4043cc9789f668ee4162ae78d6e444bbc82c6e2` | `305c2bf99061e81ced3e6f61b4ec6412f9f1ee10` |
| Mobile redesign checkpoint | `tsowmi03/Tenacity` | `redesign-v3` and rollback tag at `fc91b5fd3721d709d82c64784ce9f2751d89bfc0` | `11d98cd23d2ec836fa69b92ed550d2bd506947f5` |
| Admin portal | `tsowmi03/tenacity-web-portal` | `main` and rollback tag at `a855067724eba0567b25df4ea5d194d60ceea830` | `d3f74a0ab6aeaab72dfe71f94fdb8a3565039149` |
| Public website | `tsowmi03/tenacity-tutoring` | `main` and rollback tag at `09fbc0a55fd3d518e1f0a8d5936a4f148cb8f8f5` | `34ec52f9593fca4095799b31d3aebd33ad8554bc` |

The source mobile redesign branch later advanced to
`ebd363245343d3096ec455546f998981d8d57432` to record the completed import. Its
matching destination handoff commit is
`e92caa1c3d9c18106932e5364e984b1247b86ab8`.

## Published destination refs

| Destination ref | Commit | Purpose |
| --- | --- | --- |
| `main` | `addf7ca204e24d99e12e9e17726c243cdab8258e` | Combined application baseline |
| `feature/mobile/redesign-v3` | `0b4b39998d958dbd8dd2b95d8edefb21c972e0a5` initially, then `e92caa1c3d9c18106932e5364e984b1247b86ab8` | Active V3 mobile work and migration handoff |
| `mobile-pre-monorepo-20260721` | peels to `11d98cd23d2ec836fa69b92ed550d2bd506947f5` | Mobile rollback checkpoint |
| `portal-pre-monorepo-20260721` | peels to `d3f74a0ab6aeaab72dfe71f94fdb8a3565039149` | Portal rollback checkpoint |
| `website-pre-monorepo-20260721` | peels to `34ec52f9593fca4095799b31d3aebd33ad8554bc` | Website rollback checkpoint |

The annotated tag objects are:

| Repository | Source tag object | Destination tag object |
| --- | --- | --- |
| Mobile | `dd7fecb37f01dc02f1d34d6ec744e33c4918edc5` | `d6f30b5de7bb78324635739221665bcfcc56f7b0` |
| Admin portal | `b145ec61ad2d70c107dba55913303ac3a45a4354` | `46629a002db9f7b8c49d102790e205979298b62b` |
| Public website | `ecbfbb5ce78aeda51da644b7a3283f918b90546d` | `b2fda7437cf2691b27fef692bc675780690540b6` |

The two integration commits on `main` are:

- `6ad1db30ff58759ce12362dde12d3f69229c681d`, which imports the admin portal;
- `addf7ca204e24d99e12e9e17726c243cdab8258e`, which imports the public website.

## Reachability repair

The final `git-filter-repo` maps contained 446 mobile commits, 201 portal
commits, and 25 website commits. None were dropped during rewriting. The
initial selected destination refs reached 651 of those commits. The following
seven maximal branch tips cover all 21 remaining commits:

| Source branch tip | Source commit | Published archive ref | Rewritten commit |
| --- | --- | --- | --- |
| Mobile `notifications` | `86cb50891005d8e3fa8a06522ae28801232e362e` | `archive/mobile/notifications` | `453ac09082ecca5f56eb7694a15fd87ff7a62bcd` |
| Mobile `v1.1.1` | `737e5ca77ed529233c1aaebb1e0d09016c6e8ef6` | `archive/mobile/v1.1.1` | `2df842b58d43915e1dea21351b5f0721d529cacb` |
| Mobile `v1.3.3` | `00e14bfc84fdf6c2758fce117e344ddaad7b48b7` | `archive/mobile/v1.3.3` | `31bbca30540d10ad70fd9f1c979d403e4d53f2e6` |
| Mobile `v1.3.3-1` | `36050030a74da75f58d901cc0c3c5bad73f66a94` | `archive/mobile/v1.3.3-1` | `3330035a8b0f25037ee034be103d0ba81bbc5ba5` |
| Portal `feature/multi-child-admin-handoff` | `5b4283e9013a145716ce19a17583592e9202c0f8` | `archive/admin-portal/feature/multi-child-admin-handoff` | `2885fc639a918a19e396b4a6e8072de4a8422de0` |
| Portal `v1` | `3df05ee81004c6b3f2ab098e184d9b9ee65b376f` | `archive/admin-portal/v1` | `56799146fda5fb1a9e7784a10250f4132a3a1b43` |
| Portal `v1.3` | `e7965e531dc81e3acc475b72101e8149472b9746` | `archive/admin-portal/v1.3` | `c710d6dbdc086a162a22c784b03c51146328aa4a` |

The seven refs were pushed with one atomic operation. Remote read-back matched
every expected rewritten SHA. The archive refs increase reachable mapped source
history from 651 to 672 commits.

## Rewrite procedure

The final import used `git-filter-repo` 2.47.0. Each source repository was
cloned as a fresh mirror and rewritten into its application directory:

```bash
git -C "$migration_root/mobile.git" filter-repo \
  --to-subdirectory-filter apps/mobile \
  --tag-rename '':'mobile-' \
  --force

git -C "$migration_root/portal.git" filter-repo \
  --to-subdirectory-filter apps/admin-portal \
  --tag-rename '':'portal-' \
  --force

git -C "$migration_root/website.git" filter-repo \
  --to-subdirectory-filter apps/website \
  --tag-rename '':'website-' \
  --force
```

The rewritten baseline histories were combined with explicit merge commits:

```bash
git switch -c main mobile-import/main
git merge --no-ff --allow-unrelated-histories portal-import/main \
  -m 'Import admin portal history'
git merge --no-ff --allow-unrelated-histories website-import/main \
  -m 'Import public website history'

git switch -c feature/mobile/redesign-v3 main
git merge --no-ff mobile-import/redesign-v3 \
  -m 'Import mobile redesign-v3 branch'
```

The initial publication of `main`, the redesign branch, and the three tags was
atomic. The archive refs were later added in a separate atomic push, which did
not move an existing ref.

## Verification evidence

Exact source tree and destination subtree object IDs matched:

| Mapping | Matching tree object |
| --- | --- |
| Mobile `main` to `apps/mobile` | `ad2791b06915b5db98ff568194004b41f0e0ae22` |
| Mobile redesign checkpoint to `apps/mobile` | `2fb7076c63d242e97a2c949cfc7379ad7bef7336` |
| Portal checkpoint to `apps/admin-portal` | `8d1d7e7dc4b82b31bd09b735bb421ca67ad2327d` |
| Website checkpoint to `apps/website` | `9e905cba63ae6bb81f2b7b91bb887463869bfde2` |

The checkpoint and archive-tip source/rewritten commit pairs also matched on
author, author date, committer, committer date, subject, and body.
Representative `git log --follow` comparisons matched for:

- mobile `pubspec.yaml`, 47 commits;
- portal `package.json`, 6 commits; and
- website `package.json`, 4 commits.

The following checks passed:

- exact tree comparisons for each imported tip;
- imported-main and redesign ancestry checks;
- annotated tag object, message, tagger, and peeled-target checks;
- archive-ref coverage, with 21 newly reachable and zero uncovered mapped
  commits;
- remote ref read-back after both atomic pushes; and
- `git fsck --full`, with no output.

The current published closure contains 676 commits: 672 mapped source commits,
three import merge commits, and one post-import handoff commit.

## Deployment boundary

The import and reachability repair changed Git history and repository refs only.
They did not deploy an application, change a provider binding, change Firebase,
or enable a root GitHub Actions workflow. The original repositories remain the
production deployment owners until the reviewed no-op cutover.
