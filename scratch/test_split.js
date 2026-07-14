const text = 'A 0.500 g sample of a pure solid metal hydride, MH_2, is reacted with excess water, evolving hydrogen gas via the reaction:\\n\\n$$MH_2(s) + 2 H_2O(l) \\\\longrightarrow M(OH)_2(aq) + 2 H_2(g)$$\\n\\nThe hydrogen gas is collected over water';

// Split FIRST, without sanitizing the entire string
const parts = text.split(/(\$\$[\s\S]*?\$\$|\$[^$]+?\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\\\\begin\{[a-zA-Z]+\*?\}[\s\S]*?\\\\end\{[a-zA-Z]+\*?\}|```xml[\s\S]*?<\/svg>[\s\S]*?```|\[\[SVG:[\s\S]*?\]\]|<svg[\s\S]*?<\/svg>|<smiles>[\s\S]*?<\/smiles>|\*\*[^*]+\*\*|\*[^*]+\*)/gi);

parts.forEach((part, index) => {
  console.log(`Part ${index} (original):`, JSON.stringify(part));
  if (part.startsWith('$$') || part.startsWith('$')) {
    console.log('  -> is math block (do not replace)');
  } else {
    // Replace any sequence of backslashes followed by n with a real newline
    const cleanPart = part.replace(/\\+n/g, '\n');
    console.log(`  -> cleanPart:`, JSON.stringify(cleanPart));
    const tokens = cleanPart.split(/(\s+)/);
    console.log('  -> Tokens:', tokens.map(t => JSON.stringify(t)));
  }
});
