// Helper to determine if a token is a SMILES string
export function isSmiles(word) {
  if (!word || word.length < 2) return false;

  // Reject common Roman numerals like II and III that consist solely of I/i
  if (/^(ii|iii)$/i.test(word)) {
    return false;
  }

  // Reject single element symbols followed by numbers (e.g., C2, C4, C-3) representing carbon numbers
  const isSingleAtomRef = /^(C|c|O|o|N|n|P|p|S|s|F|f|I|i|H|h|Cl|cl|Br|br)[-+]?\d+$/;
  if (isSingleAtomRef.test(word)) {
    return false;
  }

  // Reject H-containing words ONLY when they lack SMILES structural markers (brackets, parens, bonds).
  // This allows inorganic SMILES like [OH2], [NH3], [NH4+], OS(=O)(=O)O while
  // still rejecting plain English words like "the", "have", "he".
  if (/[Hh]/.test(word) && !/[[\]()=#]/.test(word)) return false;

  const englishWords = new Set([
    'a', 'an', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'by', 'is', 'are', 'was', 'were', 'be', 'been',
    'has', 'have', 'had', 'do', 'does', 'did', 'but', 'or', 'and', 'if', 'then', 'else', 'no', 'not', 'so',
    'up', 'out', 'into', 'with', 'about', 'as', 'at', 'from', 'this', 'that', 'these', 'those', 'i', 'you',
    'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our',
    'their', 'which', 'who', 'what', 'whose', 'whom', 'where', 'when', 'why', 'how', 'all', 'any', 'both',
    'each', 'few', 'more', 'most', 'other', 'some', 'such', 'than', 'too', 'very', 'can', 'will', 'should',
    'would', 'could', 'may', 'might', 'must', 'shall', 'has', 'have', 'had', 'what'
  ]);

  // Clean the word to check against English dictionary
  const cleanWord = word.replace(/[.,\x2f#!$%^&*;:{}=\-_`~()]/g, "").toLowerCase();
  if (englishWords.has(cleanWord)) {
    return false;
  }

  // Must contain organic/aromatic atoms (C, O, N, S, P, F, Cl, Br, I, H)
  if (!/[conpsfclbri]/i.test(word)) {
    return false;
  }

  // Reject if the token contains typical LaTeX commands or curly braces
  if (/\\(text|ce|mathrm|frac|color|style|alpha|beta|gamma|delta|pi|theta|mu|eta|lambda|chi|psi|phi|omega|sigma|tau|zeta|rho|xi|kappa|iota|to|cdot|pm|mp|le|ge|ne|approx|equiv|sim|cong|propto|infty|partial|nabla|sum|prod)/i.test(word) || /[{}]/.test(word)) {
    return false;
  }

  // Check valid SMILES character set (including backslash for stereochemistry)
  const smilesCharsRegex = /^[A-Za-z0-9@+\-[\]()\x2f\\=#$.%]+$/;
  if (!smilesCharsRegex.test(word)) {
    return false;
  }

  // Must only contain allowed organic/aromatic letters outside of square brackets
  const outsideBrackets = word.replace(/\[[^\]]*\]/g, "");
  const remainingAfterOrganic = outsideBrackets
    .replace(/cl/gi, "")
    .replace(/br/gi, "")
    .replace(/[chonspfib]/gi, "");

  if (/[a-z]/i.test(remainingAfterOrganic)) {
    return false;
  }

  // If it has branching, ring numbers, double/triple bonds, charge, brackets, or stereochemistry indicators:
  const hasSmiIndicators = /[[\]()=#@+\-\\\x2f]/.test(word) || /[0-9]/.test(word);
  if (hasSmiIndicators) {
    return true;
  }

  // If it has no indicators, it might be a simple chain like CCO, CCC, CCCCC, CO, etc.
  const organicOnlyRegex = /^(C|O|N|P|S|F|H|Cl|Br|I|c|o|n|s|p)+$/;
  if (organicOnlyRegex.test(word) && word.length >= 2) {
    // Avoid matching typical words like "In", "No", "On", "So", "He", etc.
    if (word.length === 2 && ['no', 'in', 'on', 'so', 'he', 'cl'].includes(word.toLowerCase())) {
      return word.toLowerCase() === 'cl'; // Cl is Chlorine
    }
    return true;
  }

  return false;
}

export function isReactionSmiles(word) {
  if (!word || typeof word !== 'string') return false;
  if (!word.includes('>')) return false;

  // A reaction SMILES should have at least some SMILES-like characters or structures
  const parts = word.split('>');
  const hasSmilesPart = parts.some(part => {
    if (!part) return false;
    return part.split('.').some(comp => isSmiles(comp));
  });
  return hasSmilesPart;
}

/** Shared dark/light theme config for SmilesDrawer */
export const smilesThemes = {
  dark: {
    PRIMARY: '#ffffff',
    BACKGROUND: 'transparent',
    ACCENT: '#ffffff',
    C: '#ffffff',
    O: '#ffffff',
    N: '#ffffff',
    F: '#ffffff',
    CL: '#ffffff',
    BR: '#ffffff',
    I: '#ffffff',
    S: '#ffffff',
    P: '#ffffff',
    H: '#ffffff'
  },
  light: {
    PRIMARY: '#1e293b',
    BACKGROUND: 'transparent',
    ACCENT: '#6366f1',
    C: '#1e293b',
    O: '#ef4444',
    N: '#3b82f6',
    F: '#10b981',
    CL: '#10b981',
    BR: '#d97706',
    I: '#db2777',
    S: '#f59e0b',
    P: '#6366f1',
    H: '#1e293b'
  }
};
