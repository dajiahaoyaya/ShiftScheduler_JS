const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const BUG_DIR = path.resolve(ROOT, 'artifacts', 'bugs');

const CASES = [
  { caseId: 'TC-P0-01..05', file: 'p0-main-flow-bugs.json' },
  { caseId: 'TC-P1-01', file: 'p1-random-5rounds-bugs.json' },
  { caseId: 'TC-P1-02', file: 'p1-vacation-conflict-guard-bugs.json' },
  { caseId: 'TC-P1-03', file: 'p1-vacation-conflict-random-5rounds-bugs.json' },
  { caseId: 'TC-P1-04', file: 'p1-vacation-conflict-continuous-guard-bugs.json' }
];

function readIssuesCount(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.issues)) {
      return parsed.issues.length;
    }
    return 0;
  } catch (error) {
    return null;
  }
}

let totalIssues = 0;
let foundFiles = 0;

console.log('[Regression Summary] bug artifacts');
CASES.forEach((entry) => {
  const fullPath = path.join(BUG_DIR, entry.file);
  const issues = readIssuesCount(fullPath);
  if (issues === null) {
    console.log(`- [MISS] ${entry.caseId} -> ${entry.file}`);
    return;
  }
  foundFiles += 1;
  totalIssues += issues;
  const status = issues === 0 ? 'PASS' : 'FAIL';
  console.log(`- [${status}] ${entry.caseId} issues=${issues} -> ${entry.file}`);
});

console.log(
  `[Regression Summary] files=${foundFiles}/${CASES.length}, totalIssues=${totalIssues}, dir=${BUG_DIR}`
);
