function extractCompleteObjects(jsonStr) {
  const objects = [];
  let depth = 0;
  let inString = false;
  let escape = false;
  let objStart = -1;

  for (let i = 0; i < jsonStr.length; i++) {
    const ch = jsonStr.charAt(i);

    if (escape) {
      escape = false;
      continue;
    }

    if (inString) {
      if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && objStart !== -1) {
        try {
          objects.push(JSON.parse(jsonStr.substring(objStart, i + 1)));
        } catch (e) {
          console.log("PARSE ERROR ON", jsonStr.substring(objStart, i + 1));
        }
        objStart = -1;
      }
    }
  }
  return objects;
}

const input = `[
  { "id": "1", "val": "abc" },
  { "id": "2", "val": "def" },
  { "id": "3", "val": "ghi" },
  { "id": "4", "val": "jkl" },
  { "id": "5", "val": "mno" }
]`;

console.log(extractCompleteObjects(input));
