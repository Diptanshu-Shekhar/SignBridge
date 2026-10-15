// Deletes all rows for one or more signs from browser_landmarks.csv so they
// can be collected again. A backup copy is always made first.
//
// Usage (from the server folder):
//   node deletesign.js A S O          -> deletes A, S and O
//   node deletesign.js A S --dry-run  -> only shows what would be deleted
//
// Backups go to D:\aMajorProject\backups\<date-time>\
const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, 'browser_landmarks.csv');
const BACKUP_ROOT = path.join(__dirname, '..', 'backups');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const signsToDelete = args.filter(a => a !== '--dry-run').map(s => s.trim().toUpperCase());

if (signsToDelete.length === 0) {
  console.log('Usage: node deletesign.js A S O  (add --dry-run to only preview)');
  process.exit(1);
}

if (!fs.existsSync(CSV_PATH)) {
  console.log('CSV file not found');
  process.exit(1);
}

const content = fs.readFileSync(CSV_PATH, 'utf8');
const lines = content.trim().split('\n');
const header = lines[0];
const dataLines = lines.slice(1);

const getLabel = line => {
  const parts = line.split(',');
  return parts[parts.length - 1].trim();
};

// Count rows per sign before deleting
const counts = {};
dataLines.forEach(line => {
  const label = getLabel(line);
  counts[label] = (counts[label] || 0) + 1;
});

const deleteSet = new Set(signsToDelete);
const filteredLines = dataLines.filter(line => !deleteSet.has(getLabel(line)));

console.log('Rows that will be deleted:');
signsToDelete.forEach(sign => console.log(`  ${sign}: ${counts[sign] || 0}`));
console.log(`Rows before: ${dataLines.length}, rows after: ${filteredLines.length}`);

if (dryRun) {
  console.log('Dry run - nothing was changed');
  process.exit(0);
}

// Back up the file before changing it
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(BACKUP_ROOT, stamp);
fs.mkdirSync(backupDir, { recursive: true });
const backupPath = path.join(backupDir, 'server_browser_landmarks.csv');
fs.copyFileSync(CSV_PATH, backupPath);
if (fs.statSync(backupPath).size !== fs.statSync(CSV_PATH).size) {
  console.log('Backup failed - nothing was deleted');
  process.exit(1);
}
console.log(`Backup saved to ${backupPath}`);

const newContent = [header, ...filteredLines].join('\n') + '\n';
fs.writeFileSync(CSV_PATH, newContent);

console.log(`Deleted all rows for: ${signsToDelete.join(', ')}`);
console.log('Collect them again at localhost:3000/datacollection, then copy this file to ai-service/model/ and retrain');
