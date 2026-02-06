# @uluops/cli — API Coverage Tasks

> Auto-generated from CLI completeness audit. Updated as commands are implemented.
>
> **Overall**: ~90/114 SDK methods wired (79%)
> **Ops SDK**: ~64/83 (77%) | **Registry SDK**: 26/31 (84%)

## Legend
- [ ] Not started
- [x] Complete (command + test)

---

## High Priority — Core User Workflows

### Issues (Ops SDK)
- [x] `ulu issues create` — Manually file issues (`client.issues.create`)
- [x] `ulu issues edit` — Update issue metadata: title, severity, file_path, etc. (`client.issues.edit`)
- [x] `ulu issues restore` — Restore soft-deleted issues (`client.issues.restore`)
- [x] `ulu issues bulk-update` — Batch status changes (`client.issues.bulkUpdateStatus`)
- [x] `ulu issues by-fingerprint` — Lookup by fingerprint (`client.issues.getByFingerprint`)
- [x] `ulu issues update-by-fingerprint` — Status update by fingerprint (`client.issues.updateStatusByFingerprint`)

### Runs (Ops SDK)
- [x] `ulu runs update` — Post-hoc metadata update: tokens, scores (`client.runs.update` / `updateById`)
- [x] `ulu runs delete` — Remove bad runs (`client.runs.delete`)

### Projects (Ops SDK)
- [x] `ulu projects rename` — Rename a project (`client.projects.rename`)
- [x] `ulu projects merge-issues` — Merge duplicate issues (`client.projects.mergeIssues`)
- [ ] `ulu projects bulk-update-issues` — Batch issue status via project (`client.projects.bulkUpdateIssueStatus`)

### Taxonomy (Ops SDK)
- [x] `ulu taxonomy get` — Inspect failure taxonomy schema (`client.taxonomy.get`)

---

## Medium Priority — Registry Feature Completeness

### Versions
- [x] `ulu versions list <type> <name>` — List version history (`client.versions.list`)
- [x] `ulu versions diff <type> <name> <from> <to>` — Compare versions (`client.versions.diff`)

### Validation
- [x] `ulu definitions validate <type> -f <file>` — Pre-submission YAML validation (`client.validation.validate`)

### Render
- [x] `ulu render get <type> <name> <version>` — View rendered markdown (`client.render.get`)
- [x] `ulu render preview <type> -f <file>` — Preview YAML as markdown (`client.render.preview`)

### Dependencies
- [x] `ulu deps get <type> <name> <version>` — Show dependency graph (`client.dependencies.get`)
- [x] `ulu deps dependents <type> <name> <version>` — Show dependents (`client.dependencies.getDependents`)

### Forks
- [x] `ulu forks list <type> <name> <version>` — List forks (`client.forks.list`)
- [x] `ulu forks create <type> <name> <version> --fork-name <name>` — Create fork (`client.forks.create`)
- [x] `ulu forks check <type> <name> <version>` — Check forkability (`client.forks.checkForkable`)
- [x] `ulu forks lineage <type> <name> <version>` — Fork lineage chain (`client.forks.getLineage`)

---

## Lower Priority — Nice-to-Have

### Auth (Ops SDK)
- [ ] `ulu auth register` — Self-registration (`client.auth.register`)
- [ ] `ulu auth forgot-password` — Request password reset (`client.auth.forgotPassword`)
- [ ] `ulu auth reset-password` — Reset with token (`client.auth.resetPassword`)
- [ ] `ulu auth change-password` — Change current password (`client.auth.changePassword`)
- [ ] `ulu auth profile` — View profile (`client.auth.getProfile`)
- [ ] `ulu auth update-profile` — Update profile fields (`client.auth.updateProfile`)
- [ ] `ulu auth sessions list` — List user sessions (`client.auth.listSessions`)
- [ ] `ulu auth sessions revoke <id>` — Revoke session (`client.auth.revokeSession`)

### Executions (Registry SDK)
- [ ] `ulu executions record <type> <name> <version>` — Record execution (`client.executions.record`)
- [ ] `ulu executions stats <type> <name> <version>` — Execution statistics (`client.executions.getStats`)

### Translation (Registry SDK)
- [ ] `ulu translation version` — Get translator version (`client.translation.getVersion`)
- [ ] `ulu translation retranslate <type> <name> <version>` — Re-translate definition (`client.translation.retranslate`)
- [ ] `ulu translation upgrade -f <file>` — Upgrade legacy YAML (`client.translation.upgrade`)

### Analytics (Ops SDK)
- [ ] `ulu analytics taxonomy` — Taxonomy distribution (`client.analytics.getTaxonomyDistribution`)
- [ ] `ulu analytics full-taxonomy` — Full taxonomy breakdown (`client.analytics.getFullTaxonomy`)
- [ ] `ulu analytics trends` — Generic trend summary (`client.analytics.getTrendSummary`)

### Admin (Ops SDK)
- [ ] `ulu admin users bulk-deactivate` — Bulk deactivation (`client.admin.bulkDeactivate`)

### Infrastructure
- [ ] `ulu config` — Profile/settings management
- [ ] Shell completions (`ulu completion bash/zsh/fish`)

---

## Completed Commands (pre-existing)

### Ops SDK
- [x] `ulu auth login`
- [x] `ulu auth logout`
- [x] `ulu auth whoami`
- [x] `ulu auth api-keys list`
- [x] `ulu auth api-keys create`
- [x] `ulu auth api-keys revoke`
- [x] `ulu projects list`
- [x] `ulu projects get`
- [x] `ulu projects create`
- [x] `ulu projects delete`
- [x] `ulu projects restore`
- [x] `ulu projects summary`
- [x] `ulu projects trends`
- [x] `ulu runs list`
- [x] `ulu runs get`
- [x] `ulu runs latest`
- [x] `ulu runs details`
- [x] `ulu runs save`
- [x] `ulu runs validate`
- [x] `ulu runs diff`
- [x] `ulu runs archive`
- [x] `ulu issues list`
- [x] `ulu issues get`
- [x] `ulu issues search`
- [x] `ulu issues update`
- [x] `ulu issues close`
- [x] `ulu issues add-note`
- [x] `ulu issues history`
- [x] `ulu issues undo`
- [x] `ulu issues create`
- [x] `ulu issues edit`
- [x] `ulu issues restore`
- [x] `ulu issues bulk-update`
- [x] `ulu issues by-fingerprint`
- [x] `ulu issues update-by-fingerprint`
- [x] `ulu runs update`
- [x] `ulu runs delete`
- [x] `ulu projects rename`
- [x] `ulu projects merge-issues`
- [x] `ulu taxonomy get`
- [x] `ulu analytics validators`
- [x] `ulu analytics reliability`
- [x] `ulu analytics hotspots`
- [x] `ulu analytics burndown`
- [x] `ulu analytics velocity`
- [x] `ulu analytics discovery`
- [x] `ulu analytics matrix`
- [x] `ulu analytics resolution`
- [x] `ulu admin stats`
- [x] `ulu admin users list`
- [x] `ulu admin users get`
- [x] `ulu admin users create`
- [x] `ulu admin users update`
- [x] `ulu admin users deactivate`
- [x] `ulu admin users reactivate`
- [x] `ulu admin users reset-password`
- [x] `ulu admin sessions list`
- [x] `ulu admin sessions terminate`
- [x] `ulu admin sessions terminate-user`
- [x] `ulu admin keys list`
- [x] `ulu admin keys revoke`

### Registry SDK
- [x] `ulu definitions list`
- [x] `ulu definitions get`
- [x] `ulu definitions create`
- [x] `ulu definitions update`
- [x] `ulu definitions publish`
- [x] `ulu definitions deprecate`
- [x] `ulu definitions delete`
- [x] `ulu definitions validate`
- [x] `ulu versions list`
- [x] `ulu versions diff`
- [x] `ulu render get`
- [x] `ulu render preview`
- [x] `ulu deps get`
- [x] `ulu deps dependents`
- [x] `ulu forks list`
- [x] `ulu forks create`
- [x] `ulu forks check`
- [x] `ulu forks lineage`
- [x] `ulu models list`
- [x] `ulu models get`
- [x] `ulu models providers`
- [x] `ulu models aliases`
- [x] `ulu models resolve`
- [x] `ulu models sync`
