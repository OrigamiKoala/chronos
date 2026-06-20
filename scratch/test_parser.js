/* eslint-disable */

function escapeLiteralNewlines(jsonStr) {
  let result = '';
  let inString = false;
  let escape = false;

  for (let i = 0; i < jsonStr.length; i++) {
    const ch = jsonStr.charAt(i);

    if (inString) {
      if (escape) {
        result += ch;
        escape = false;
      } else if (ch === '\\') {
        result += ch;
        escape = true;
      } else if (ch === '"') {
        result += ch;
        inString = false;
      } else if (ch === '\n') {
        result += '\\n';
      } else if (ch === '\r') {
        result += '\\r';
      } else {
        result += ch;
      }
    } else {
      if (ch === '"') {
        inString = true;
      }
      result += ch;
    }
  }
  return result;
}

function parseJSONResponse(text) {
  if (!text) return null;
  
  let cleanText = text.trim();

  // Helper to try parsing a string after escaping literal newlines
  const tryParse = (str) => {
    try {
      const escaped = escapeLiteralNewlines(str.trim());
      return JSON.parse(escaped);
    } catch (e) {
      return null;
    }
  };

  // 1. Try parsing the whole thing directly
  let parsed = tryParse(cleanText);
  if (parsed) return parsed;

  // 2. Try to find content inside ```json ... ```
  const jsonMatch = cleanText.match(/```json\s*([\s\S]*?)\s*```/i);
  if (jsonMatch) {
    parsed = tryParse(jsonMatch[1]);
    if (parsed) return parsed;
  }

  // 3. Try to find content inside ``` ... ```
  const codeMatch = cleanText.match(/```\s*([\s\S]*?)\s*```/i);
  if (codeMatch) {
    parsed = tryParse(codeMatch[1]);
    if (parsed) return parsed;
  }

  // 4. Try to find the outermost curly braces { ... }
  const firstBrace = cleanText.indexOf('{');
  const lastBrace = cleanText.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = cleanText.substring(firstBrace, lastBrace + 1);
    parsed = tryParse(candidate);
    if (parsed) return parsed;
  }

  return null;
}

function extractExplanationFallback(text) {
  // Try to find "explanation" key
  const keyIndex = text.indexOf('"explanation"');
  if (keyIndex === -1) return text; // fall back to entire text

  // Find the start of the string value after the colon
  const afterKey = text.substring(keyIndex + '"explanation"'.length);
  const colonIndex = afterKey.indexOf(':');
  if (colonIndex === -1) return text;

  const afterColon = afterKey.substring(colonIndex + 1).trim();
  if (!afterColon.startsWith('"')) return text;

  // Extract the string value, respecting escaped quotes
  let val = '';
  let escape = false;
  for (let i = 1; i < afterColon.length; i++) {
    const ch = afterColon.charAt(i);
    if (escape) {
      if (ch === 'n') val += '\n';
      else if (ch === 'r') val += '\r';
      else if (ch === 't') val += '\t';
      else val += ch;
      escape = false;
    } else if (ch === '\\') {
      escape = true;
    } else if (ch === '"') {
      // End of string value
      return val;
    } else {
      val += ch;
    }
  }
  return val || text;
}

function extractShouldRemarkCorrectFallback(text) {
  const match = text.match(/"shouldRemarkCorrect"\s*:\s*(true|false)/i);
  if (match) {
    return match[1].toLowerCase() === 'true';
  }
  return false;
}

// TEST CASES

const test1 = `
{
  "explanation": "This is a test with a literal\\nnewline inside standard JSON",
  "shouldRemarkCorrect": true
}
`;

const test2 = `
{
  "explanation": "This is a test with a literal
newline inside standard JSON",
  "shouldRemarkCorrect": true
}
`;

const test3 = `
Here is your JSON response:
\`\`\`json
{
  "explanation": "This is a test with a literal
newline inside a markdown-wrapped JSON",
  "shouldRemarkCorrect": false
}
\`\`\`
Hope this helps!
`;

const test4 = `
{
  "explanation": "Malformed JSON with "escaped" quote sequence in the middle but incomplete braces
`;

console.log("--- TEST 1 (Standard JSON) ---");
const p1 = parseJSONResponse(test1);
console.log("Parsed:", p1);
console.log("Explanation matches?", p1 && p1.explanation.includes("literal\nnewline"));

console.log("\n--- TEST 2 (Literal Newline JSON) ---");
const p2 = parseJSONResponse(test2);
console.log("Parsed:", p2);
console.log("Explanation matches?", p2 && p2.explanation.includes("literal\nnewline"));

console.log("\n--- TEST 3 (Markdown + Literal Newline JSON) ---");
const p3 = parseJSONResponse(test3);
console.log("Parsed:", p3);
console.log("Explanation matches?", p3 && p3.explanation.includes("markdown-wrapped"));

console.log("\n--- TEST 4 (Malformed/Incomplete JSON Fallback) ---");
const p4 = parseJSONResponse(test4);
console.log("Parsed (should be null):", p4);
const f4_exp = extractExplanationFallback(test4);
const f4_rem = extractShouldRemarkCorrectFallback(test4);
console.log("Fallback Explanation:", JSON.stringify(f4_exp));
console.log("Fallback ShouldRemarkCorrect:", f4_rem);
