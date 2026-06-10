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
        } catch {
        }
        objStart = -1;
      }
    }
  }

  return objects;
}

const chunks = [
  '[\n',
  '  { "id": 1 },\n',
  '  { "id": 2 },\n',
  '  { "id": 3 },\n',
  '  { "id": 4 },\n',
  '  { "id": 5 }\n]'
];

let acc = '';
for (const chunk of chunks) {
    acc += chunk;
    console.log("Extracted:", extractCompleteObjects(acc).length);
}
