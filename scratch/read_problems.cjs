const fs = require('fs');

const path = '/Users/carlliu/stress-sandbox/scratch/lint_output.txt';
if (fs.existsSync(path)) {
  const content = fs.readFileSync(path, 'utf8');
  console.log("lint_output.txt length:", content.length);
  if (content.toLowerCase().includes("lani5")) {
    console.log("FOUND LaNi5 in lint_output.txt!");
    // find lines
    const lines = content.split('\n');
    lines.forEach((l, i) => {
      if (l.toLowerCase().includes("lani5")) {
        console.log(`Line ${i}: ${l.slice(0, 100)}`);
      }
    });
  } else {
    console.log("lani5 not found in lint_output.txt");
  }
} else {
  console.log("lint_output.txt does not exist");
}
