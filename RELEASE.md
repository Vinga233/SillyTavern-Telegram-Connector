# Release Workflow

## Version Convention

Tags use semantic versioning with optional feature suffix:

v<major>.<minor>.<patch>[-<feature-suffix>]

Examples:
- v1.8.0-history-chat-stable
- v1.8.1
- v1.9.0

## Creating a Release

### Step 1: Generate release notes

```bash
node scripts/release-notes.js <prev-tag> HEAD <new-version>
```

Example:
```bash
node scripts/release-notes.js v1.8.0-history-chat-stable HEAD v1.8.1
```

Preview output, then append to CHANGELOG.md:
```bash
node scripts/release-notes.js v1.8.0-history-chat-stable HEAD v1.8.1 >> CHANGELOG.md
```

### Step 2: Commit CHANGELOG.md

```bash
git add CHANGELOG.md
git commit -m "docs: add v1.8.1 changelog"
```

### Step 3: Create tag

```bash
git tag -a <version> <commit-hash> -m "<message>"
```

Examples:
```bash
# Stable release
git tag -a v1.8.1 HEAD -m "Bug fixes and minor improvements"

# Feature release with suffix
git tag -a v1.8.0-history-chat-stable a255afc -m "Stable version: Telegram history chat support"
```

### Step 4: Push

```bash
# Push commits
git push origin master

# Push tag
git push origin <tag-name>
```

## Tag Naming Rules

| Purpose | Pattern | Example |
|---------|---------|---------|
| Major feature | v<major>.0.0-<feature> | v1.8.0-history-chat-stable |
| Bug fix | v<major>.<minor>.<patch> | v1.8.1 |
| Hotfix | v<major>.<minor>.<patch>+hotfix | v1.8.2+hotfix |
| Pre-release | v<major>.<minor>.<patch>-rc<N> | v1.9.0-rc1 |

## Commit Convention

All commits should use Conventional Commits prefixes for auto-categorization in release notes:

| Prefix | Category |
|--------|----------|
| `feat:` | Added (new feature) |
| `fix:` | Fixed (bug fix) |
| `docs:` | Documentation |
| `refactor:` | Changed (code refactor, no functional change) |
| `perf:` | Performance (optimization) |
| `test:` | Testing |
| `chore:` | Chore (tooling, CI, config) |

Example commits:
```
feat: add telegram history chat menu
fix: prevent duplicate telegram message sending
docs: update release workflow
chore: standardize release workflow
```

## Release Checklist

Before tagging a new release, verify the following:

- [ ] `git status` is clean (no uncommitted changes)
- [ ] `npm install` completes without errors
- [ ] Connector server starts without errors
- [ ] SillyTavern extension loads correctly (check browser console)
- [ ] WebSocket connection established
- [ ] Telegram message send/receive works
- [ ] Streaming output works
- [ ] Character switch works
- [ ] History chat works
- [ ] CHANGELOG.md is updated with new version
- [ ] Tag is created and pushed to remote

## Files

- CHANGELOG.md — Full version history (manual + auto-generated)
- scripts/release-notes.js — Auto-generate changelog section from git log
- scripts/test-smoke.js — Basic smoke test for verification

