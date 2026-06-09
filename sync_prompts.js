import fs from 'fs';
import process from 'process';

const apiContent = fs.readFileSync('api/generate.js', 'utf8');
const match = apiContent.match(/if \(normSubject === 'chemistry'\) \{\s+subjectSpecificInstructions = `([\s\S]*?)`;/);

if (!match) {
  console.log("Could not find chem block in api/generate.js");
  process.exit(1);
}

const chemPrompt = match[1];

let geminiContent = fs.readFileSync('src/services/gemini.js', 'utf8');

// There are two occurrences in src/services/gemini.js (one for generate, one for batch)
const regex = /if \(normSubject === 'chemistry'\) \{\s+subjectContext = `[\s\S]*?`;\n {4}\}/g;

geminiContent = geminiContent.replace(regex, () => `if (normSubject === 'chemistry') {\n        subjectContext = \`${chemPrompt}\`;\n    }`);

fs.writeFileSync('src/services/gemini.js', geminiContent);
