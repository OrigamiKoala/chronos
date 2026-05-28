import { useEffect, useRef } from 'react';
import SmilesDrawer from 'smiles-drawer';

// Helper to determine if a token is a SMILES string
export function isSmiles(word) {
  if (!word || word.length < 2) return false;
  // Reject H-containing words ONLY when they lack SMILES structural markers (brackets, parens, bonds).
  // This allows inorganic SMILES like [OH2], [NH3], [NH4+], OS(=O)(=O)O while
  // still rejecting plain English words like "the", "have", "he".
  if (/[Hh]/.test(word) && !/[\[\]\(\)=#]/.test(word)) return false;

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
  const cleanWord = word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").toLowerCase();
  if (englishWords.has(cleanWord)) {
    return false;
  }

  // Must contain organic/aromatic atoms (C, O, N, S, P, F, Cl, Br, I, H)
  if (!/[conpsfclbri]/i.test(word)) {
    return false;
  }

  // Reject if the token contains backslashes (likely LaTeX like \text{...})
  if (word.includes('\\')) {
    return false;
  }

  // Check valid SMILES character set (no backslash — "/" covers E/Z stereo)
  const smilesCharsRegex = /^[A-Za-z0-9@+\-\[\]\(\)\/=#$.%]+$/;
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
  const hasSmiIndicators = /[\(\)=\[\]#@+\-\\\/]/.test(word) || /[0-9]/.test(word);
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

/** Shared dark/light theme config for SmilesDrawer */
const smilesThemes = {
  dark: {
    PRIMARY: '#ffffff',
    BACKGROUND: 'transparent',
    ACCENT: '#a78bfa',
    C: '#ffffff',
    O: '#f87171',
    N: '#60a5fa',
    F: '#34d399',
    CL: '#34d399',
    BR: '#f59e0b',
    I: '#ec4899',
    S: '#fbbf24',
    P: '#8b5cf6'
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
    P: '#6366f1'
  }
};

export function SmilesRenderer({ smiles, width = 140, height = 140, theme = 'dark' }) {
  const svgRef = useRef(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!svgRef.current || !smiles) return;

    try {
      // Clear previous drawing
      svgRef.current.innerHTML = '';

      // Initialize the SvgDrawer with custom theme options
      const drawer = new SmilesDrawer.SvgDrawer({
        width,
        height,
        bondThickness: 1.8,
        bondLength: 15,
        fontSizeLarge: 11,
        fontSizeSmall: 8,
        padding: 8,
        themes: smilesThemes
      });

      // Strip any stray backslashes (e.g. from LaTeX remnants) before parsing
      const sanitized = smiles.replace(/\\/g, '/');
      SmilesDrawer.parse(sanitized, (tree) => {
        setHasError(false);
        drawer.draw(tree, svgRef.current, theme, false);
      }, (err) => {
        console.error('SMILES parse error:', err);
        setHasError(true);
      });
    } catch (error) {
      console.error('Error drawing SMILES:', error);
      setHasError(true);
    }
  }, [smiles, width, height, theme]);

  if (hasError) {
    return <span>{smiles}</span>;
  }

  return (
    <span style={{ 
      display: 'inline-flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: 'rgba(255, 255, 255, 0.03)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '8px',
      padding: '4px',
      verticalAlign: 'middle',
      margin: '4px 6px',
      boxShadow: '0 4px 10px -2px rgba(0,0,0,0.15)'
    }}>
      <svg ref={svgRef} width={width} height={height} style={{ maxWidth: '100%', height: 'auto' }} />
    </span>
  );
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

/**
 * ReactionRenderer — uses smiles-drawer's built-in ReactionDrawer to render
 * reaction SMILES as a pure SVG diagram (reactants → arrow → products).
 * No Ketcher editor, no toolbar, just the rendered structure.
 */
export function ReactionRenderer({ reaction, theme = 'dark', width = 500, height = 200 }) {
  const svgRef = useRef(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!svgRef.current || !reaction) return;

    try {
      // Clear any previous content
      svgRef.current.innerHTML = '';

      const molOpts = {
        width: 200,
        height: 200,
        bondThickness: 1.8,
        bondLength: 15,
        fontSizeLarge: 11,
        fontSizeSmall: 8,
        padding: 8,
        themes: smilesThemes
      };

      const reactionOpts = {
        scale: 1.0,
        spacing: 12,
        arrow: {
          length: 60,
          headSize: 6,
          thickness: 1.2,
          margin: 3,
        },
        plus: {
          size: 9,
          thickness: 1.2,
        },
      };

      const reactionDrawer = new SmilesDrawer.ReactionDrawer(reactionOpts, molOpts);

      SmilesDrawer.parseReaction(reaction, (rxn) => {
        setHasError(false);
        reactionDrawer.draw(rxn, svgRef.current, theme);
      }, (err) => {
        console.error('Reaction SMILES parse error:', err);
        setHasError(true);
      });
    } catch (error) {
      console.error('Error drawing reaction:', error);
      setHasError(true);
    }
  }, [reaction, theme]);

  if (hasError) {
    return <span>{reaction}</span>;
  }

  return (
    <span style={{
      display: 'inline-block',
      background: 'rgba(255, 255, 255, 0.03)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '12px',
      padding: '8px 12px',
      margin: '8px 0',
      verticalAlign: 'middle',
      overflow: 'auto',
      maxWidth: '100%',
      boxShadow: '0 4px 10px -2px rgba(0,0,0,0.15)'
    }}>
      <svg
        ref={svgRef}
        style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
      />
    </span>
  );
}

export function ChemicalText({ text, theme = 'dark', defaultWidth = 130, defaultHeight = 130 }) {
  const containerRef = useRef(null);

  // Trigger MathJax typesetting after render so LaTeX like $\text{H}_2\text{SO}_4$ renders
  useEffect(() => {
    if (!containerRef.current || !text) return;
    if (window.MathJax && window.MathJax.typesetPromise) {
      // Typeset only this container to avoid re-processing the entire document
      window.MathJax.typesetPromise([containerRef.current]).catch((err) => {
        console.error('MathJax typeset error:', err);
      });
    }
  }, [text]);

  if (!text) return null;

  // Split by LaTeX blocks ($...$ or $$...$$) first to keep LaTeX segments intact.
  // Using a regex to match either display math ($$...$$) or inline math ($...$)
  const parts = text.split(/(\$\$.*?\$\$|\$.*?\$)/g);

  return (
    <span ref={containerRef} style={{ display: 'inline', alignItems: 'center', flexWrap: 'wrap' }}>
      {parts.map((part, partIndex) => {
        // If this part is a LaTeX math block, render it directly as text so MathJax can process it
        if (part.startsWith('$')) {
          return <span key={partIndex}>{part}</span>;
        }

        // For non-math text, split by whitespace to detect SMILES/Reactions
        const tokens = part.split(/(\s+)/);
        return (
          <span key={partIndex}>
            {tokens.map((token, index) => {
              if (/^\s+$/.test(token)) {
                return <span key={index}>{token}</span>;
              }

              // Extract core word by removing leading/trailing punctuation/quotes
              const match = token.match(/^([`'"\(\{\[<]*)(.*?)([`'"\)\}\]>.,;:!?-]*)$/);
              if (!match) {
                return <span key={index}>{token}</span>;
              }

              const prefix = match[1];
              const coreWord = match[2];
              const suffix = match[3];

              if (isReactionSmiles(coreWord)) {
                return (
                  <span key={index} style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle' }}>
                    {prefix}
                    <ReactionRenderer reaction={coreWord} width={defaultWidth} height={defaultHeight} theme={theme} />
                    {suffix}
                  </span>
                );
              }

              if (isSmiles(coreWord)) {
                return (
                  <span key={index} style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle' }}>
                    {prefix}
                    <SmilesRenderer smiles={coreWord} width={defaultWidth} height={defaultHeight} theme={theme} />
                    {suffix}
                  </span>
                );
              }

              return <span key={index}>{token}</span>;
            })}
          </span>
        );
      })}
    </span>
  );
}
