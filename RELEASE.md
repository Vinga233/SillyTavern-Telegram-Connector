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

`ash
node scripts/release-notes.js <prev-tag> HEAD <new-version>
`

Example:
`ash
node scripts/release-notes.js v1.8.0-history-chat-stable HEAD v1.8.1
`

Preview output, then append to CHANGELOG.md:
`ash
node scripts/release-notes.js v1.8.0-history-chat-stable HEAD v1.8.1 >> CHANGELOG.md
`

### Step 2: Commit CHANGELOG.md

`ash
git add CHANGELOG.md
git commit -m "docs: add v1.8.1 changelog"
`

### Step 3: Create tag

`ash
git tag -a <version> <commit-hash> -m "<message>"
`

Examples:
`ash
# Stable release
git tag -a v1.8.1 HEAD -m "Bug fixes and minor improvements"

# Feature release with suffix
git tag -a v1.8.0-history-chat-stable a255afc -m "Stable version: Telegram history chat support"
`

### Step 4: Push

`ash
# Push commits
git push origin master

# Push tag
git push origin <tag-name>
`

## Tag Naming Rules

| Purpose | Pattern | Example |
|---------|---------|---------|
| Major feature | v<major>.0.0-<feature> | v1.8.0-history-chat-stable |
| Bug fix | v<major>.<minor>.<patch> | v1.8.1 |
| Hotfix | v<major>.<minor>.<patch>+hotfix | v1.8.2+hotfix |
| Pre-release | v<major>.<minor>.<patch>-rc<N> | v1.9.0-rc1 |

## Files

- CHANGELOG.md — Full version history (manual + auto-generated)
- scripts/release-notes.js — Auto-generate changelog section from git log
- scripts/test-smoke.js — Basic smoke test for verification
