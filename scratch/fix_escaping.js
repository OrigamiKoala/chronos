import fs from 'fs';

let content = fs.readFileSync('api/generate.js', 'utf8');

// Normalize all triple backtick sequences to exactly three escaped backticks: \`\`\`
// This regex matches three backticks, each with any number of preceding backslashes.
const normalized = content.replace(/\\*`\\*`\\*`/g, '\\`\\`\\`');

fs.writeFileSync('api/generate.js', normalized, 'utf8');
console.log('Normalized triple backtick escaping in api/generate.js successfully!');
