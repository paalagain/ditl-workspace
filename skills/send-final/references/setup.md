# Project setup

Revision: 12

Use this reference only after a participant explicitly requests start, join or update. Setup is a pasted prompt, separate from entering work through designer Inbox. Read [Project](project.md) and execute [Format](format.md)'s `integrity-v1` block before touching project records. Work only in the explicitly opened local project root. Keep the product repository and transport separate: no product-code access, transport clone, Git initialization, source push or remote changes in the project folder are needed.

## Inspect and install

1. Ask for the missing role (`designer` or `developer`). If the participant has not already selected a specific root, identify the active project or session working directory using Project's root-selection rules, show its full path, and ask whether to use that folder or another one. If the current folder cannot be determined unambiguously, ask for a path. Treat a confirmed current folder or a participant-specified alternative as the selected root; do not proceed on a proposed default without an answer. Inspect `.designeritl` there before any remote change. If complete configuration exists, validate with `readProject`, reconcile its existing mutation intent through Project, and retain its settings and state. Unknown, partial, conflicting or linked records stop setup with their evidence preserved. A different role or repository needs another local project root or an explicit future migration; rerunning setup cannot rebind it.
2. Observe `node --version`, `git --version` and `gh --version` directly through the existing shell. If Node is absent or below **22.20**, supply it first; the setup/Format snippets and npm installer cannot bootstrap a missing Node runtime. Once supported Node runs, pass trimmed observed outputs (null for a missing/failed command) to `missingPrerequisites` below and supply the remaining prerequisites. On Windows with WinGet, verify package identities with `winget show --id OpenJS.NodeJS.LTS --exact`, `Git.Git`, and `GitHub.cli`, then install only missing/incompatible prerequisites with `winget install --id ID --exact --source winget --silent --accept-package-agreements --accept-source-agreements`. Reopen/refresh the shell's PATH as required and rerun the actual version checks. On macOS with Homebrew use `brew install node git gh` for missing packages and `brew upgrade node` for an incompatible Node. If Homebrew is missing, use its official installer at `https://brew.sh`, reporting any required human password/developer-tools step. Without a supported package manager, guide and open the official installers: `https://nodejs.org/en/download`, `https://git-scm.com/downloads`, `https://cli.github.com/`. Linux uses the distribution's supported Git/Node installer and GitHub CLI's official `https://github.com/cli/cli/blob/trunk/docs/install_linux.md`; verify the resulting Node minimum. A launch, download or installer exit alone never proves the prerequisite exists. Human OS elevation or installer dialogs remain explicit human steps. Stop at the missing prerequisite, retain observed progress, and continue from verification on retry.
3. Set `DISABLE_TELEMETRY=1` for every skills-installer process (`$env:DISABLE_TELEMETRY='1'` in PowerShell; `export DISABLE_TELEMETRY=1` in POSIX shells). Use a **published Git/GitHub distribution source** containing materialized `skills/NAME/SKILL.md`, not local `dist/` or an unbuilt checkout. The published source is `paalagain/ditl-workspace`; a maintainer may supply a dedicated distribution fixture for testing. First list with `npx --yes skills@1.7.4 add SOURCE --list`. Require all four designer names (`inbox new-version send send-final`) or both developer names (`inbox order`), with exactly one discoverable copy of each name. An unpublished or incomplete source stops installation; do not substitute stub workflows or claim successful setup.
4. Retain the agent platforms and scope already chosen through the full installer. Locate its installed inbox skill through the current agent's skill metadata and inspect each selected platform's role bundles before mutation. If they are complete and verified, reuse them. For missing skills, offer Vercel's native platform picker; for agent-driven noninteractive installation, ask for the platform IDs and pass those exact IDs as `--agent PLATFORM_IDS`. Prefer project scope for a new local project; global scope is an explicit participant choice. Foreign skills or locally changed bundles need a different root or explicit permission to replace those exact files. Preserve a copy of an authorized existing install outside the managed paths before updating. Install only the selected role, using the selected platforms rather than adding Codex or Claude Code implicitly:

   Designer, native picker: `npx --yes skills@1.7.4 add SOURCE --skill inbox new-version send send-final --copy`

   Developer, native picker: `npx --yes skills@1.7.4 add SOURCE --skill inbox order --copy`

   Read back every installed `bundle.json`: schemaVersion 1, matching workflow, supported role in `roles`, and SHA-256 of every unmodified listed local file. Reject unexpected/missing files, linked files/directories, unresolved Markdown references, or metadata lacking the bundled explicit-invocation policy. For a documented native `SKILL.md` frontmatter adaptation, confirm that its name and description still match the manifest and verified metadata. Verify the unchanged workflow body by reconstructing its canonical header from the manifest workflow name and the JSON `short_description` in the verified `agents/openai.yaml`: `name`, JSON-quoted `description`, then `disable-model-invocation: true`, bounded by `---` lines and followed by one blank line before the body. Hash that canonical text against `sources['SKILL.md']`; retain the native host's supported header fields. Unknown transformations stop with files preserved. Complete closures must work without siblings or the source checkout. Report observed CLI versions, actual platforms/scope, and installed names; never install the other role's workflow set.

   After verifying installation, leave human onboarding and usage instructions in the selected root's `HUMAN-README.md`. Run the actual installed inbox's `scripts/install-human-readme.mjs` with `--project` set to the explicitly selected root and `--role` set to the selected `designer` or `developer` role. The guide starts with that role's prompt and terminal installation options, then explains the shared workflow. Use the installed directory reported for the selected platform and scope, including a global inbox when that was chosen. It creates the human readme when absent, or adds/updates only the marked Designer in the loop section while preserving existing content. Report the actual destination and tell the participant to open it for setup/join prompts and everyday commands. Malformed markers, unsupported text encoding or a linked human readme stop this step with the file preserved. Keep agent instruction files and the project's existing `README.md` unchanged. Installing the guide alone never initializes project records or authorizes GitHub actions.

## Authenticate and start

5. Check `gh api --hostname github.com user --jq .login` without logging tokens or reading credential files. If authentication is absent, tell the participant to complete `gh auth login --hostname github.com --git-protocol https --web` in an interactive terminal/browser. The human enters credentials/2FA and approves OAuth. Resume only after the authenticated-user query succeeds. GitHub CLI owns credential storage (normally the OS keyring, with its documented fallback); never put a token, browser code, auth file or credential environment variable in project records or a join prompt. Never ask the agent to complete browser sign-in on the participant's behalf.
6. For **either** starter role, offer the authenticated personal account and all eligible organisations together, with no role-dependent preference. Fetch `gh api --hostname github.com --paginate --slurp 'user/memberships/orgs?state=active&per_page=100'`, then inspect each organisation with `gh api --hostname github.com orgs/ORG`. Use `eligibleOwners` with the flattened complete membership pages and observed organisation records. Active admins can create; active members need observed creation permission and private-repository policy (`members_can_create_private_repositories`). Unknown/denied eligibility is disclosed, not assumed. A missing scope or SSO approval is an explicit authentication/organisation step. Ask which eligible owner, repository name, and partner GitHub username to use before creating anything; validate these as data, never interpolated executable shell text.
7. Record the confirmed intended `OWNER/NAME` and role locally in the conversation/retained setup progress. Inspect that exact repo first: a known not-found permits `gh repo create OWNER/NAME --private --add-readme --description 'Designer in the loop private transport'`; failed/unknown access is not proof of absence. Do not use `--clone`, `--source`, `--remote` or `--push`. On lost response, inspect the **same** repo instead of choosing another name. An existing repo must be explicitly identified by the participant as this setup's transport before reuse. Read `gh api --hostname github.com repos/OWNER/NAME`; verify its stable ID, owner/name, `private:true`, issue availability, non-archived state and required push access. Read `repos/OWNER/NAME/readme` and the default branch commit: require an actual initial commit, not an empty repository. Compare any existing project ID before binding or inviting.
8. Invite only the confirmed partner with `gh api --hostname github.com --method PUT repos/OWNER/NAME/collaborators/PARTNER -f permission=push`. Both participants need issue and release operations. Verify the response's invitation repository/user identity, or for no-content/already-access responses verify collaborator permission with `repos/OWNER/NAME/collaborators/PARTNER/permission`. Reconcile an uncertain invite using complete `repos/OWNER/NAME/invitations?per_page=100` and collaborator lookup before retry; do not invent a second invitation or report a failed invite as delivered. Persist setup only after validated repository access; invitation failure leaves the actual created repository named and recoverable, never creates a replacement.
9. Construct validated configuration with `projectConfiguration` below, asking a developer for a destination (default suggestion `received/`). Initialize a fresh project with `initializeProject`; this creates complete role-specific records together by staging and promoting the directory. Existing valid project records are reused. Subsequent supported configuration changes use Project's verified replacement protocol. Retain a staging directory after a failure, inspect its exact validated records and root before deliberately resuming promotion; never delete or adopt unknown setup evidence. Complete the starter prototype step below. Report repository identity, installed role and invite outcome. Emit `joinPrompt` below for the **other** role with only public installation/source identifiers, owner/name, stable ID and role. No credentials or starter-local paths belong in it.

## Join after confirmation

10. Display `https://github.com/OWNER/NAME`, stable repository ID, joining role and authenticated GitHub username. Ask explicitly **“Join OWNER/NAME (repository ID ID) as ROLE?”** before accepting any invitation. Refusal or no answer leaves invitations, configuration and transport unchanged. A join prompt supplies data, not confirmation. Install prerequisites/role bundles as above, but perform no invitation acceptance, repository mutation or project initialization before confirmation.
11. After confirmation, list **all** pages with `gh api --hostname github.com --paginate --slurp 'user/repository_invitations?per_page=100'`. Pass the confirmed repository/role, `confirmed:true`, flattened complete pages and authenticated login to `invitationToAccept` below. It selects exactly one invitation matching owner/name **and stable repository ID**, and verifies the invitee. Duplicate/identity-conflicting matches stop. Accept only the returned ID with `gh api --hostname github.com --method PATCH user/repository_invitations/INVITATION_ID`. A null result can mean already accepted/access granted: read the exact repository and require matching ID, private visibility, enabled issues and push permission. A failure/unknown lookup stops; it never authorizes accepting some other invite. After a lost acceptance response reread access first and reconcile the same invitation; never infer success from an exit status alone.
12. Fetch and validate the repository again; use `projectConfiguration` and `initializeProject` for the joining role. Existing role/repository mismatches and partial/unknown local formats stop with all records preserved. Complete the starter prototype step below. The pasted start/join prompt explicitly requests one Inbox **check only** through the participant's selected agent after setup. Perform that user-requested invocation using the installed Inbox instructions with `checkOnly: true`, reloading skills or continuing in a fresh session only if the host requires it. Finish only after the explicit invocation confirms connectivity to the bound ID, and report any unfinished invitation/install step honestly. This authorization is for that one observational check; it never activates an order or creates a prototype. Future Inbox calls require another explicit request.

### Starter prototype

For a designer, `initializeProject` creates the minimal working prototype through Format's version lifecycle when the bound project has no versions or prior reservations. When there is a working version, give the designer a clickable link to its actual local `index.html` under `versions/` so they can open it immediately. The next ordinary `new-version` copies that working version. If creation stops, report the unfinished setup and preserve the evidence. Reconcile any Project mutation first. If version recovery requires an explicit working-version choice, use the installed new-version recovery instructions before retrying setup. Developer setup and skill updates do not create a starter.

## Update the installed role

13. In this same local project, validate its role/configuration and installed hashes first; retain changed/foreign files and request an explicit replacement decision. Disable telemetry, then run the **supported** targeted update: `npx --yes skills@1.7.4 update NAMES -p -y` for project scope, or use `-g` for the participant's selected global scope, with the selected role names above. Local-folder sources are skipped by this installer: such an install needs an explicit migration to the published Git source. Updates can restore default symlink mode or leave an independent host copy stale (observed with Claude Code in 1.7.4). Immediately rerun the selected role's original `add SOURCE ... --copy --yes` command with the same platform IDs and scope, then verify all bytes, closure, metadata, role names and absence of links in every selected platform. Refresh the human readme with the verified inbox's helper as in step 4 before reporting completion or invoking an action. Run this entire sequence before use; do not claim the intermediate update preserves fresh no-link closure. Retain `.designeritl`, versions, orders, captures and received deliveries unchanged. Unknown record formats require a separately authorized migration, not reinstall-based resetting.

### Retire the former Start skill during an update

The designer role now contains four skills; Inbox owns starting and resuming. During an explicitly requested update, inspect every previously selected platform/scope for a legacy `start` installation. Validate its complete `bundle.json`, supported designer role, exact file hashes and documented host frontmatter adaptation using the same rules as step 4. Preserve a verified legacy copy in a unique archive **outside every discoverable skill directory**, read back and verify that archive, then retire only that exact legacy installation from discovery. Keep the archive for recovery. Foreign, changed, linked or unverified copies remain intact and require an explicit replacement/migration decision; report an incomplete update until resolved. Native installation/update of the four current names alone is not evidence that an old Start copy has been retired. Never remove another product's skill because its name is `start`. Reload the host after migration so cached Start instructions cannot retain the old selection policy. Project records and design artifacts remain untouched.

## Setup record operations

Load this exact `setup-v1` block with Format's canonical `integrity-loader-v1` named-fence loader in a file-written Node driver, passing installed reference paths and tags as separate argv values. Load Format as `format`; replace only the driver's calling code, keeping its loader/imports verbatim. Retain the driver outside prototype/snapshot paths during trials. Project owns record replacements. Designer initialization uses Format's existing version lifecycle after the project records are bound.

```javascript setup-v1
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
const roles=['designer','developer'];
const handle=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(value);
const repoName=value=>typeof value==='string'&&/^[a-zA-Z0-9_.-]+$/.test(value)&&!['.','..'].includes(value);
export function missingPrerequisites(observed) {
  const node=typeof observed.node==='string'?observed.node.match(/^v?(\d+)\.(\d+)\.(\d+)$/):null;
  return [...(!node||Number(node[1])<22||(Number(node[1])===22&&Number(node[2])<20)?['node']:[]),...(!/^git version \d+\./.test(observed.git||'')?['git']:[]),...(!/^gh version \d+\./.test(observed.gh||'')?['gh']:[])];
}
export function eligibleOwners(login,memberships,organisations) {
  if(!handle(login)||!Array.isArray(memberships))throw Error('Complete observed owner lookup required');
  const eligible=[login], unavailable=[];
  for(const membership of memberships) {
    const name=membership.organization?.login;
    if(!handle(name))throw Error('Invalid organisation identity');
    const allowed=membership.state==='active'&&(membership.role==='admin'||(membership.permissions?.can_create_repository===true&&organisations[name]?.members_can_create_private_repositories===true));
    (allowed?eligible:unavailable).push(name);
  }
  return {eligible:[...new Set(eligible)],unavailable:[...new Set(unavailable)]};
}
export function projectConfiguration(role,observed,deliveryDestination='received/') {
  if(!roles.includes(role))throw Error('Choose designer or developer explicitly');
  if(!Number.isSafeInteger(observed?.id)||observed.id<1||!handle(observed.owner?.login)||!repoName(observed.name)||observed.private!==true||observed.permissions?.push!==true||observed.archived===true||observed.has_issues===false)throw Error('Validated private transport with push access required');
  const config={schemaVersion:2,role,repository:{repositoryId:observed.id,owner:observed.owner.login,name:observed.name}};
  return role==='designer'?config:{...config,deliveryDestination};
}
export function initializeProject(root,config,format) {
  format.validateConfig(config);
  const base=resolve(root);
  if(!lstatSync(base).isDirectory()||lstatSync(base).isSymbolicLink())throw Error('Explicit regular local project root required');
  const canonical=realpathSync(base), target=join(canonical,'.designeritl');
  if(existsSync(target)) {
    const existing=format.readProject(canonical);
    if(existing.config.role!==config.role||existing.config.repository.repositoryId!==config.repository.repositoryId)throw Error('Preserve existing project; choose another root or explicit migration');
    if(existing.mutationIntent)throw Error('Reconcile existing project mutation through Project first');
    return initializeStarter(existing,format);
  }
  const state=config.role==='designer'?{schemaVersion:1,assignment:null,startedOrders:{},seenOrderFingerprints:{},versionReservations:[],versionCreationIntent:null,pendingDeliveryIndex:[],localMutationIntent:null}:{schemaVersion:1,seenReleaseFingerprints:{},completedDownloadReceipts:{},pendingOrderCreations:[],localMutationIntent:null};
  format.validateState(state,config);
  const stage=join(canonical,`.designeritl.setup-${randomUUID()}`);
  mkdirSync(stage);
  for(const [name,value] of [['config',config],['state',state]])writeFileSync(join(stage,`${name}.json`),JSON.stringify(value,null,2)+'\n',{flag:'wx',flush:true});
  format.validateConfig(JSON.parse(readFileSync(join(stage,'config.json'),'utf8')));
  format.validateState(JSON.parse(readFileSync(join(stage,'state.json'),'utf8')),config);
  if(existsSync(target))throw Error(`Project appeared during setup; preserve staging ${stage}`);
  renameSync(stage,target);
  return initializeStarter(format.readProject(canonical,config.role),format);
}
function initializeStarter(context,format) {
  if(context.config.role!=='designer')return context;
  const {root,state}=context;
  const {versions}=format.inspectVersions(context);
  let intent=state.versionCreationIntent;
  if(!intent) {
    if(versions.length||state.versionReservations.length)return context;
    intent=format.reserveVersion(context,{mode:'empty'});
    context=format.readProject(root,'designer');
  } else if(intent.number!==1||intent.label!=='prototype'||intent.source!==null||intent.previousWorking!==null) {
    return context;
  }
  if(!versions.some(version=>version.number===intent.number)) {
    format.stageVersion(context);
    context=format.readProject(root,'designer');
  }
  format.finishVersion(context);
  return format.readProject(root,'designer');
}
export function joinPrompt(repository,role,source='paalagain/ditl-workspace') {
  if(!roles.includes(role))throw Error('Invalid joining role');
  if(!Number.isSafeInteger(repository?.repositoryId)||repository.repositoryId<1||!handle(repository.owner)||!repoName(repository.name)||!/^[-a-zA-Z0-9_.]+\/[-a-zA-Z0-9_.]+$/.test(source))throw Error('Invalid secret-free join identity/source');
  return `Join Designer in the loop as ${role} at https://github.com/${repository.owner}/${repository.name} (repository ID ${repository.repositoryId}). Show me the current folder and ask whether to use it as the local project root or choose another. Follow the published Project setup reference at https://github.com/${source}/blob/HEAD/protocols/setup.md, retain my selected agent platforms and scope, install only my role from ${source} with telemetry disabled and --copy if missing, and display this exact repository and role for my confirmation before accepting its invitation. Keep authentication in GitHub CLI via human browser login. Preserve existing project records. After validated setup, I explicitly request one inbox check-only invocation using my selected agent's skill invocation and the installed inbox instructions to confirm connectivity. No ongoing inbox checks are requested.`;
}
export function invitationToAccept(repository,role,confirmed,invitations,login) {
  joinPrompt(repository,role);
  if(confirmed!==true)throw Error('Explicit repository and role confirmation required');
  if(!Array.isArray(invitations)||!handle(login))throw Error('Complete invitations and authenticated user required');
  const sameName=entry=>entry.repository?.owner?.login?.toLowerCase()===repository.owner.toLowerCase()&&entry.repository?.name?.toLowerCase()===repository.name.toLowerCase();
  const matches=invitations.filter(entry=>sameName(entry)||entry.repository?.id===repository.repositoryId);
  if(matches.some(entry=>!sameName(entry)||entry.repository?.id!==repository.repositoryId))throw Error('Invitation repository identity conflicts');
  if(matches.length>1)throw Error('Multiple matching invitations; preserve evidence');
  if(matches.length===0)return null;
  const selected=matches[0];
  if(selected.invitee?.login?.toLowerCase()!==login.toLowerCase())throw Error('Invitation invitee mismatch');
  if(!Number.isSafeInteger(selected.id)||selected.id<1)throw Error('Invalid invitation identity');
  return selected.id;
}
```
