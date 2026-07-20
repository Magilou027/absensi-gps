const fs = require('fs');
const p = 'g:/Kampus/- DigiTalent/Absensi-gps/src/style.css';
let lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);

// Remove lines 2186 to 2450
lines.splice(2185, 265);

fs.writeFileSync(p, lines.join('\n'), 'utf8');
console.log('Removed 265 lines starting from line 2186.');
