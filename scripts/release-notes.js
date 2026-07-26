/**
 * scripts/release-notes.js
 * Auto-generate CHANGELOG entries from git log between two refs.
 */
const { execSync } = require('child_process');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

function run(cmd) {
  try { return execSync(cmd, { encoding: 'utf-8', cwd: ROOT }).trim(); } catch { return ''; }
}

function cat(msg) {
  const l = msg.toLowerCase();
  if (l.startsWith('feat') || l.startsWith('add')) return { t:'added', l:'### Added' };
  if (l.startsWith('fix')) return { t:'fixed', l:'### Fixed' };
  if (l.startsWith('docs')) return { t:'docs', l:'### Documentation' };
  if (l.startsWith('refactor')) return { t:'changed', l:'### Changed' };
  if (l.startsWith('perf')) return { t:'perf', l:'### Performance' };
  if (l.startsWith('revert') || l.startsWith('remove')) return { t:'removed', l:'### Removed' };
  if (l.startsWith('test')) return { t:'test', l:'### Testing' };
  if (l.startsWith('chore')) return { t:'chore', l:'### Chore' };
  return { t:'other', l:'### Other' };
}

function clean(m) {
  return m.replace(/^(feat|fix|docs|refactor|perf|chore|revert)(\([^)]+\))?:\s*/i, '').trim();
}

function main() {
  const a = process.argv.slice(2);
  if (a.length < 2) {
    console.error('Usage: node scripts/release-notes.js <from-ref> <to-ref> [ver]');
    process.exit(1);
  }
  const from = a[0], to = a[1], ver = a[2] || to;
  const date = run('git log -1 --format=%ad --date=short ' + to);
  const log = run('git log ' + from + '..' + to + ' --oneline --no-decorate');
  if (!log) { console.error('No commits: ' + from + '..' + to); process.exit(0); }
  const commits = log.split('\n').filter(Boolean);
  const g = {}; const d = [];
  for (const l of commits) {
    const m = l.match(/^([a-f0-9]+)\s+(.*)/);
    if (!m) continue;
    const h = m[1], msg = m[2], c = cat(msg);
    if (!g[c.t]) g[c.t] = [];
    g[c.t].push(msg); d.push({ h, msg, c });
  }
  const out = [];
  out.push('## [' + ver + '] - ' + date); out.push('');
  for (const k of ['added','fixed','changed','perf','removed','docs','test','chore','other']) {
    const items = g[k];
    if (!items || !items.length) continue;
    out.push(cat(k + ':').l); out.push('');
    for (const m of items) out.push('- ' + clean(m));
    out.push('');
  }
  out.push('### Commits'); out.push('');
  for (const { h, msg } of d) out.push('- ' + h + ' ' + msg);
  out.push('');
  console.log(out.join('\n'));
}
main();
