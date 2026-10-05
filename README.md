# Git Sky

A local desktop companion for beginner-friendly Git Flow. Built with Electron, React, and TypeScript for macOS, Windows, and Linux.

## Run

Install Node.js 22 (the version in `.nvmrc`) and Git, then:

```sh
npm install
npm start
```

Git must be available on the application's PATH. Configure your Git identity and SSH keys or credential helper outside the app. Git Sky does not collect hosting credentials. It uses the `origin` remote.

## Workflow

Open or clone a repository, confirm production (`main`, or existing `master`) and integration (`develop`) branches, then start work:

| Type | Starts from | Merge destinations |
| --- | --- | --- |
| `feature/*` | develop | develop |
| `fix/*` | develop | develop |
| `release/*` | develop | main, then develop |
| `hotfix/*` | main | main, then develop |

Production and development branch names are configurable. Without an origin remote, setup creates a missing development branch from local production, preserving your current branch, staging, and working files. You can create working branches and commit locally; add origin later to publish. With origin configured, missing development branches can be created and pushed during setup, and starting work fetches origin and fast-forwards the base. A base with local unpublished commits must be synchronized externally first.

Review whole files, confirm the exact commit selection, commit, and push. The commit confirmation explicitly replaces existing staging with the selected whole files; partial staging is not preserved. Working files are never discarded. Existing staged files are selected when opening a repository.

Open pull requests through the hosting website. Merge completion is **confirmed by the user**, not verified against hosting APIs. Confirmations are tied to the branch and current commit. Keep release and hotfix source branches until both merges finish, then create the suggested version tag at the production merge commit on the website. The app never merges, tags, deletes branches, or force-pushes.

Conflicts, unfinished Git operations, detached HEAD, and divergent histories are handed off to an editor or terminal. The editor shortcut uses VS Code's `code` command; Open folder works with other editors. The Linux terminal shortcut uses `x-terminal-emulator`.

## Checks and packaging

```sh
npm run typecheck
npm test
npm run make
```

`npm run smoke` launches a temporary Electron window, verifies the real renderer and preload against a disposable repository, saves `out/smoke.png`, and closes. It requires a desktop session. Node 22 or 24 is required for packaging; Node 26 was observed exiting Forge without an artifact.

`npm run make` creates an unsigned ZIP application for the current platform under `out/make`. The GitHub Actions matrix runs checks and builds ZIPs on macOS, Windows, and Linux. Cross-platform checks require those runners; a local macOS build does not verify Windows or Linux behavior. Signing, installers, and auto-update distribution are not configured.

Git integration tests create disposable local repositories and bare remotes. They do not access your project repositories or hosting account.

## Architecture

- `src/main`: Git operations, local settings, serialized IPC, native dialogs and shortcuts.
- `src/renderer`: React interface; no direct Node.js or Git access.
- `src/shared.ts`: typed requests, repository snapshots, and branch workflow rules.

Electron uses a sandboxed, context-isolated preload and validates the IPC sender. Git runs with argument arrays without a shell. Diffs disable external diff drivers and text conversion. Repository content is rendered as text. Git hooks and configured credential helpers still run as they normally do in Git; use trusted repositories.

Recent repositories, workflow settings, and confirmations are stored in Electron's user data directory. Git Sky has no application server, account, analytics, or cloud storage.

Supported v1 repositories have an initial commit. An origin remote is required only for remote operations. Submodule management, worktree management, empty-repository initialization, hosting API authentication, in-app conflict resolution, and automated version bumps are outside this release.

Implementation references: [Electron context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation), [Electron security](https://www.electronjs.org/docs/latest/tutorial/security), and [Electron Forge makers](https://www.electronforge.io/config/makers).
