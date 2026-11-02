# Designer in the loop

Explicitly invoked Agent Skills exchange work orders and portable HTML prototype deliveries through a separate private GitHub repository. The designer keeps accumulated numbered versions and chooses what to send. Final delivery reassesses the agreed work and records the designer's completion decision. Developer inbox verifies each delivery and preserves its history.

## Get started by pasting a prompt

Open your project folder in your agent, then copy and paste the full [designer setup prompt](prompts/start-designer.md) or [developer setup prompt](prompts/start-developer.md). The agent checks prerequisites, installs the skills for your role, and guides you through setup. You may need to approve operating-system prompts and complete GitHub sign-in in your browser. If a collaborator sent you a join prompt, paste that into your agent instead.

Alternatively, install the skills and human guide first from an interactive terminal with Node 22.20+ and Git:

```text
npx --yes github:paalagain/ditl-workspace
```

Choose the project folder and role, then select your agent platforms and installation scope in the installer. Optional `--project PATH` and `--role designer` (or `developer`) prefill the first two choices. After installation, open the generated `HUMAN-README.md` and continue with a setup or join prompt. [Project setup](protocols/setup.md) retains your choices and guides connection to the separate private transport.

| Category | Action | Role | Result |
| --- | --- | --- | --- |
| Collaboration | `inbox` | Both | Start/resume incoming work, check only when requested, or receive verified deliveries. |
| Collaboration | `order` | Developer | Create a work order, linked feedback or cancellation request. |
| Collaboration | `send` | Designer | Deliver a chosen portable version as unfinished work. |
| Collaboration | `send-final` | Designer | Reassess agreed tasks, record completion, deliver and close the order. |
| Toolbox | `new-version` | Designer | Create a numbered working version by copying, importing or starting empty. |

Collaboration skills exchange work between the designer and developer. Toolbox skills help manage the local prototype design. Categories describe purpose; roles determine which skills each participant needs.

Use the full installation command above to choose **Designer** or **Developer** and create `HUMAN-README.md` in your selected project folder. It selects the complete skill set for your role.

For advanced, skill-only installation, `npx skills add paalagain/ditl-workspace` shows selectable, collapsible **Collaboration Skills** and **Toolbox Skills** groups from the repository's [category manifest](.claude-plugin/marketplace.json). This command skips the role choice and does not create the project's `HUMAN-README.md`. If you used it and need the complete installation, run `npx --yes github:paalagain/ditl-workspace` and select the same project folder.

Use `/name` in Claude Code and `$name` in Codex. Each action requires explicit invocation. Design edits happen in the designer's prototype files. Every delivery opens directly from its own files with local assets, no build step and no runtime network dependencies.

Designer Inbox continues the eligible active order or starts the only available order. When several choices remain, it asks once. `inbox check only` reviews observations without starting work. A first work entry creates an empty prototype when no versions exist. Missing project configuration asks for the project folder separately from the understood order. Existing installations should follow [the role update and legacy Start migration](protocols/setup.md#retire-the-former-start-skill-during-an-update).

## Human onboarding guide

The [human guide template](templates/HUMAN-README.md) starts with installation steps for each role, with prompt and terminal options, then explains the shared workflow. The installer uses your selected role to include only your installation section in the generated guide. The full installer above places it in the selected project's root `HUMAN-README.md`; this source repository uses its normal `README.md`. Reruns update only the marked section while preserving existing human content. Agent instruction files and the project's existing `README.md` remain unchanged. Invalid UTF-8, malformed or duplicate markers, and linked human readmes are preserved and reported.

The agent creates the guide during prompt-first setup. Open it for setup, joining, and everyday commands.

The [current specification](docs/specification.md), [architecture](docs/architecture/README.md), [contracts](docs/architecture/contracts.md) and [recovery rules](docs/architecture/recovery.md) describe the product. Canonical executable instructions live in `protocols/`; workflow declarations and bodies live in `workflows/`.

## Build and verify

With Node 22.20 or later:

```text
npm run build
npm run build:source
npm run check
npm run check:source
npm test
```

`build` creates independent role bundles under ignored `dist/`. `build:source` creates the tracked Git-discoverable distribution under `skills/`: five unique names, four designer actions and two developer actions. Each bundle has its complete transitive reference closure, the human guide and its installer helper, hashes, reference revisions and explicit-only metadata for both hosts. Canonical files use UTF-8 and LF. Regenerate and stage the distribution whenever canonical instructions change. The generator refuses stale or foreign output files; regenerate into a clean directory when the expected closure shrinks.

Configuration and manifests use format version 2. State, descriptors and pending records use version 1; final decisions use version 2. Preserve existing projects and packages with unsupported formats. Reconcile pending work under its producing installation before a deliberate upgrade; installing skills never resets records or rewrites historical ZIPs. Both participants must use compatible delivery formats.

## Installed-host trials

`npm run trial` discovers fixtures serially. Each live fixture is opt-in and retains its private repositories, local project, host logs and exact evidence. It does not delete repositories or credentials.

The installer regression tests use local source fixtures and temporary native state (`XDG_STATE_HOME`), then remove their owned fixtures. They do not change the user's remembered platform selections or global agent profiles.

| Fixture | Environment flag |
| --- | --- |
| Final delivery through developer reception | `DITL_LIVE_TRIAL=1` |
| Final delivery with acknowledged unchecked progress | `DITL_FINAL_EVIDENCE_TRIAL=1` |
| Both copied roles transferring a final delivery | `DITL_PRODUCT_TRIAL=1` |
| Direct-file portability | `DITL_PORTABILITY_TRIAL=1` |
| Project binding and record recovery | `DITL_PROJECT_TRIAL=1` |
| Interrupted capture/publication recovery | `DITL_LIVE_RECOVERY=1` |
| Published-source installation and updates | `DITL_INSTALLER_TRIAL=1` |
| Controlled setup/start/join | `DITL_SETUP_TRIAL=1` |
| Draft-creation uncertainty | `DITL_DRAFT_CREATE_TRIAL=1` |
| Work-order creation | `DITL_ORDER_TRIAL=1` |
| Nonfinal publication and reception | `DITL_SEND_TRIAL=1` |
| Observed cancellation | `DITL_CANCELLATION_TRIAL=1` |

Use a retained authenticated host home. Browser fixtures require `DITL_PLAYWRIGHT_MODULE` pointing to the installed Playwright entry. Record actual versions and observed limits with each run. Copied metadata, local tests and skipped live fixtures do not establish support across hosts or operating systems.

Historical live-trial reports are retained privately. Run the opt-in fixtures above to collect evidence for your own environment.

## License

[MIT](LICENSE). Copyright (c) 2026 paalagain.
