try {
  await import('../api/generate.js');
  console.log("api/generate.js imported successfully!");
} catch (e) {
  console.error("api/generate.js import failed:", e.message);
  console.error(e.stack);
}

try {
  await import('../src/services/gemini.js');
  console.log("src/services/gemini.js imported successfully!");
} catch (e) {
  console.error("src/services/gemini.js import failed:", e.message);
  console.error(e.stack);
}
