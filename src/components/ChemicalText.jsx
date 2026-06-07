import React, { useEffect, useRef, useState } from 'react';
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
      svgRef.current.innerHTML = '';
      const drawer = new SmilesDrawer.SvgDrawer({
        width,
        height,
        bondThickness: 1.8,
        bondLength: 15,
        fontSizeLarge: 11,
        fontSizeSmall: 8,
        padding: 0,
        themes: smilesThemes
      });

      const sanitized = smiles.replace(/\\/g, '/');
      SmilesDrawer.parse(sanitized, (tree) => {
        setHasError(false);
        drawer.draw(tree, svgRef.current, theme, false);
      }, (err) => {
        setHasError(true);
      });
    } catch (error) {
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
      verticalAlign: 'middle',
      margin: '0 4px'
    }}>
      <svg ref={svgRef} data-smiles={smiles} />
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
      svgRef.current.innerHTML = '';

      const molOpts = {
        width: 200,
        height: 200,
        bondThickness: 1.8,
        bondLength: 15,
        fontSizeLarge: 11,
        fontSizeSmall: 8,
        padding: 0,
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
        setHasError(true);
      });
    } catch (error) {
      setHasError(true);
    }
  }, [reaction, theme]);

  if (hasError) {
    return <span>{reaction}</span>;
  }

  return (
    <span style={{
      display: 'inline-block',
      verticalAlign: 'middle',
      margin: '0 4px',
      overflow: 'visible'
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

  // Split by LaTeX blocks ($...$ or $$...$$), SVG blocks wrapped in ```xml ... ```, raw SVG blocks,
  // and markdown bold (**...**) / italic (*...*) to keep them intact.
  const parts = text.split(/(\$\$.*?\$\$|\$.*?\$|```xml[\s\S]*?<\/svg>[\s\S]*?```|<svg[\s\S]*?<\/svg>|\*\*[^*]+\*\*|\*[^*]+\*)/g);

  return (
    <span ref={containerRef} style={{ display: 'inline', alignItems: 'center', flexWrap: 'wrap' }}>
      {parts.map((part, partIndex) => {
        let isSvg = false;
        let svgContent = part;

        if (part.startsWith('```xml') && part.includes('<svg') && part.endsWith('```')) {
          isSvg = true;
          // Strip off the ```xml and ``` block delimiters
          svgContent = part.replace(/^```xml\s*/, '').replace(/\s*```$/, '');
        } else if (part.startsWith('<svg')) {
          isSvg = true;
        }

        // If this part is an SVG block, render it inline
        if (isSvg) {
          return (
            <span
              key={partIndex}
              style={{ display: 'block', margin: '16px auto', maxWidth: '100%', textAlign: 'center' }}
              dangerouslySetInnerHTML={{ __html: svgContent }}
            />
          );
        }

        // If this part is a LaTeX math block, render it directly as text so MathJax can process it
        if (part.startsWith('$')) {
          const processedPart = part.replace(/\\(\s)/g, '\\\\$1');
          return <span key={partIndex}>{processedPart}</span>;
        }

        // If this part is markdown bold (**...**), render as <strong>
        if (part.startsWith('**') && part.endsWith('**')) {
          const inner = part.slice(2, -2);
          return <strong key={partIndex}><ChemicalText text={inner} theme={theme} defaultWidth={defaultWidth} defaultHeight={defaultHeight} /></strong>;
        }

        // If this part is markdown italic (*...*), render as <em>
        if (part.startsWith('*') && part.endsWith('*') && !part.startsWith('**')) {
          const inner = part.slice(1, -1);
          return <em key={partIndex}><ChemicalText text={inner} theme={theme} defaultWidth={defaultWidth} defaultHeight={defaultHeight} /></em>;
        }

        // For non-math text, split by whitespace to detect SMILES/Reactions
        const tokens = part.split(/(\s+)/);
        const isLast = (idx) => idx === tokens.length - 1;
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
                const cleanPrefix = prefix.replace(/`/g, '');
                const cleanSuffix = suffix.replace(/`/g, '');
                return (
                  <React.Fragment key={index}>
                    {cleanPrefix}
                    <ReactionRenderer reaction={coreWord} width={defaultWidth} height={defaultHeight} theme={theme} />
                    {cleanSuffix}
                    {isLast(index) ? '' : ' '}
                  </React.Fragment>
                );
              }

              if (isSmiles(coreWord)) {
                const cleanPrefix = prefix.replace(/`/g, '');
                const cleanSuffix = suffix.replace(/`/g, '');
                return (
                  <React.Fragment key={index}>
                    {cleanPrefix}
                    <SmilesRenderer smiles={coreWord} width={defaultWidth} height={defaultHeight} theme={theme} />
                    {cleanSuffix}
                    {isLast(index) ? '' : ' '}
                  </React.Fragment>
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
