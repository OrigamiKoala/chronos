import React, { useEffect, useRef, useState } from 'react';
import SmilesDrawer from 'smiles-drawer';

import { isSmiles, isReactionSmiles, smilesThemes } from './chemicalHelpers';

export function SmilesRenderer({ smiles, width = 140, height = 140, theme = 'dark' }) {
  const svgRef = useRef(null);
  const [hasError, setHasError] = useState(false);

  let cleanSmiles = smiles;
  const match = smiles ? String(smiles).match(/^<smiles>([\s\S]*?)<\/smiles>$/i) : null;
  if (match) {
    cleanSmiles = match[1].trim();
  }

  useEffect(() => {
    if (!svgRef.current || !cleanSmiles) return;

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

      const sanitized = cleanSmiles.replace(/\\/g, '/');
      SmilesDrawer.parse(sanitized, (tree) => {
        Promise.resolve().then(() => setHasError(false));
        drawer.draw(tree, svgRef.current, 'dark', false);
      }, () => {
        Promise.resolve().then(() => setHasError(true));
      });
    } catch {
      Promise.resolve().then(() => setHasError(true));
    }
  }, [cleanSmiles, width, height, theme]);

  if (hasError) {
    return <span>{cleanSmiles}</span>;
  }

  return (
    <span style={{ 
      display: 'flex', 
      justifyContent: 'center',
      margin: '12px auto'
    }}>
      <svg ref={svgRef} data-smiles={cleanSmiles} width={width} height={height} style={{ width, height, display: 'block' }} />
    </span>
  );
}

/**
 * ReactionRenderer — uses smiles-drawer's built-in ReactionDrawer to render
 * reaction SMILES as a pure SVG diagram (reactants → arrow → products).
 * No Ketcher editor, no toolbar, just the rendered structure.
 */
export function ReactionRenderer({ reaction, theme = 'dark' }) {
  const svgRef = useRef(null);
  const [hasError, setHasError] = useState(false);

  let cleanReaction = reaction;
  const match = reaction ? String(reaction).match(/^<smiles>([\s\S]*?)<\/smiles>$/i) : null;
  if (match) {
    cleanReaction = match[1].trim();
  }

  useEffect(() => {
    if (!svgRef.current || !cleanReaction) return;

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

      SmilesDrawer.parseReaction(cleanReaction, (rxn) => {
        Promise.resolve().then(() => setHasError(false));
        reactionDrawer.draw(rxn, svgRef.current, 'dark');
      }, () => {
        Promise.resolve().then(() => setHasError(true));
      });
    } catch {
      Promise.resolve().then(() => setHasError(true));
    }
  }, [cleanReaction, theme]);

  if (hasError) {
    return <span>{cleanReaction}</span>;
  }

  return (
    <span style={{ 
      display: 'flex', 
      justifyContent: 'center',
      margin: '12px auto',
      width: '100%'
    }}>
      <svg
        ref={svgRef}
        style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
      />
    </span>
  );
}

export function normalizeLaTeX(str) {
  if (typeof str !== 'string' || !str) return str;

  let cleaned = str;

  // 1. Convert control characters (\t, \r, \f, \v) before LaTeX commands starting with a-z
  cleaned = cleaned
    .replace(/\r([a-zA-Z])/g, '\\\\r$1')
    .replace(/\f([a-zA-Z])/g, '\\\\f$1')
    .replace(/\v([a-zA-Z])/g, '\\\\v$1')
    .replace(/\x08([a-zA-Z])/g, '\\\\b$1')
    .replace(/\t(imes|ext|heta|au|ilde|riangle|op|an|anh|here|sfrac|o\b|[a-zA-Z]+)/g, '\\\\t$1');

  // 2. Convert raw 'times' directly following numbers (e.g. 1.00times10^{-2} or 1.00 times 10^{-2}) to \times
  cleaned = cleaned.replace(/([0-9.]+)\s*\\?\t?times/gi, '$1 \\\\times ');

  // 3. Fix unescaped chemical formulas like ceH2A, ceNa2CO3, ceNaHCO3, ceAgCl, ce[ML2]+ outside or inside math mode
  cleaned = cleaned.replace(/(^|[^a-zA-Z0-9\\])ce([A-Z][a-zA-Z0-9_{}+\-]*|\[[^\]]+\][a-zA-Z0-9_{}+\-]*|\{[^}]+\})/g, '$1\\\\ce{$2}');

  // 4. Unescape literal string escapes for newlines/tabs if present as literal "\n", "\r", "\t",
  // while preserving valid LaTeX commands like \nu, \rho, \tau, \text, \times, \tilde, \triangle, \theta, \rightarrow, \rightharpoonup, etc.
  cleaned = cleaned
    .replace(/\\+n(?![u]|eq|abla|eg|otin|exists|ot|atural|ewline|oindent|earrow|warrow|left|right|parallel|prec|succ|sim|sub|sup|vdash|vDash|Vdash|VDash|leqslant|geqslant|less|gtr|[a-z]*[0-9{}])/g, '\n')
    .replace(/\\+r(?![a-zA-Z])/g, '\r')
    .replace(/\\+t(?![a-zA-Z])/g, '\t');

  // 5. Normalize 2 or more backslashes before LaTeX command names or symbols (e.g. \\ce -> \ce, \\text -> \text, \\circ -> \circ, \\times -> \times, \\rightarrow -> \rightarrow)
  cleaned = cleaned.replace(/\\{2,}([a-zA-Z]+|[%$_#{}^])/g, '\\$1');

  // 6. Normalize one or more backslashes before ^ (e.g. 200\ ^ -> 200^, 200\\ ^ -> 200^)
  cleaned = cleaned.replace(/\\+\s*\^/g, '^');

  // 7. Reduce 4 or more backslashes to double backslash \\ (for row breaks in arrays/matrices)
  cleaned = cleaned.replace(/\\{4,}/g, '\\\\');

  return cleaned;
}

export function ChemicalText({ text, theme = 'dark', defaultWidth = 130, defaultHeight = 130 }) {
  const containerRef = useRef(null);

  const cleanText = normalizeLaTeX(text);

  // Trigger MathJax typesetting after render so LaTeX like $\text{H}_2\text{SO}_4$ renders
  useEffect(() => {
    if (!containerRef.current || !cleanText) return;
    if (window.MathJax && window.MathJax.typesetPromise) {
      try {
        window.MathJax.typesetClear([containerRef.current]);
      } catch (err) {
        console.warn('MathJax typesetClear error:', err);
      }
      // Typeset only this container to avoid re-processing the entire document
      window.MathJax.typesetPromise([containerRef.current]).catch((err) => {
        console.error('MathJax typeset error:', err);
      });
    }
  }, [cleanText]);

  if (!cleanText) return null;

  // Split by SVG blocks, SMILES blocks, LaTeX blocks ($...$, $$...$$, \(...\), \[...\], \begin{env}...\end{env}), and markdown bold (**...**) / italic (*...*)
  const parts = cleanText.split(/(\[\[SVG:[\s\S]*?\]\]|```(?:xml|html|svg)?[\s\S]*?<svg[\s\S]*?<\/svg>[\s\S]*?```|<svg[\s\S]*?<\/svg>|<smiles>[\s\S]*?<\/smiles>|\$\$[\s\S]*?\$\$|\$[^$]+?\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\\begin\{[a-zA-Z]+\*?\}[\s\S]*?\\end\{[a-zA-Z]+\*?\}|\*\*[^*]+\*\*|\*[^*]+\*)/gi);

  return (
    <span ref={containerRef} key={cleanText} style={{ display: 'inline', alignItems: 'center', flexWrap: 'wrap' }}>
      {parts.map((part, partIndex) => {
        let isSvg = false;
        let svgContent = part;

        if (part.startsWith('[[SVG:')) {
          isSvg = true;
          svgContent = part.replace(/^\[\[SVG:\s*/i, '').replace(/\s*\]\]$/, '');
        } else if (/^```(?:xml|html|svg)?/i.test(part) && part.includes('<svg')) {
          isSvg = true;
          svgContent = part.replace(/^```(?:xml|html|svg)?\s*/i, '').replace(/\s*```$/, '');
        } else if (part.toLowerCase().includes('<svg') && part.toLowerCase().includes('</svg>')) {
          isSvg = true;
          svgContent = part;
        }

        // If this part is an SVG block, adapt it to dark mode and render it inside a dark card container.
        if (isSvg) {
          let cleanedSvg = svgContent;
          const svgMatch = cleanedSvg.match(/<svg[\s\S]*?<\/svg>/i);
          if (svgMatch) {
            cleanedSvg = svgMatch[0];
          }

          cleanedSvg = cleanedSvg
            .replace(/stroke\s*=\s*['"](?:black|#000000|#000)['"]/gi, "stroke='currentColor'")
            .replace(/fill\s*=\s*['"](?:black|#000000|#000)['"]/gi, "fill='currentColor'")
            .replace(/fill\s*=\s*['"](?:white|#ffffff|#fff)['"]/gi, "fill='none'")
            .replace(/background(-color)?\s*:\s*(?:white|#ffffff|#fff|black|#000000|#000)/gi, "background:transparent")
            .replace(/stroke\s*:\s*(?:black|#000000|#000)/gi, "stroke:currentColor")
            .replace(/fill\s*:\s*(?:black|#000000|#000)/gi, "fill:currentColor");

          return (
            <span
              key={partIndex}
              className="svg-diagram-container"
              style={{ display: 'block', margin: '20px auto', maxWidth: '580px', color: 'var(--text-primary)' }}
            >
              <span
                style={{
                  display: 'block',
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  padding: '16px',
                  overflow: 'auto',
                  lineHeight: 'normal',
                }}
                dangerouslySetInnerHTML={{ __html: cleanedSvg }}
              />
            </span>
          );
        }

        // If this part is wrapped in <smiles>...</smiles> tags, parse it as a SMILES or Reaction SMILES structure
        if (part.toLowerCase().startsWith('<smiles>') && part.toLowerCase().endsWith('</smiles>')) {
          const match = part.match(/^<smiles>([\s\S]*?)<\/smiles>$/i);
          const innerSmiles = match ? match[1].trim() : '';
          const isReaction = innerSmiles.includes('>');
          if (isReaction) {
            return (
              <span key={partIndex} style={{ display: 'inline-block' }}>
                <ReactionRenderer reaction={part} theme={theme} />
              </span>
            );
          } else {
            return (
              <span key={partIndex} style={{ display: 'inline-block' }}>
                <SmilesRenderer smiles={part} width={defaultWidth} height={defaultHeight} theme={theme} />
              </span>
            );
          }
        }

        // If this part is a LaTeX math block, render it directly as text so MathJax can process it
        if (part.startsWith('$') || part.startsWith('\\(') || part.startsWith('\\[') || part.startsWith('\\begin')) {
          return <span key={partIndex}>{part}</span>;
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

        // For non-math text, split by whitespace to detect newlines, spaces, and unwrapped raw LaTeX commands safely per token
        const tokens = part.split(/(\s+)/);
        return (
          <span key={partIndex}>
            {tokens.map((token, index) => {
              if (/^\s+$/.test(token)) {
                if (token.includes('\n')) {
                  const subParts = token.split('\n');
                  return (
                    <span key={index}>
                      {subParts.map((sub, subIdx) => (
                        <React.Fragment key={subIdx}>
                          {sub}
                          {subIdx < subParts.length - 1 && <br />}
                        </React.Fragment>
                      ))}
                    </span>
                  );
                }
                return <span key={index}>{token}</span>;
              }

              // Check if token contains a raw LaTeX command (e.g. \ce{H2O}, \alpha, \textbf{(A)}) not enclosed in $...$
              if (/(?:^|[^\\])\\[a-zA-Z]+/.test(token) && !token.startsWith('\\n') && !token.startsWith('\\r') && !token.startsWith('\\t')) {
                return <span key={index}>{`$${token}$`}</span>;
              }

              return <span key={index}>{token}</span>;
            })}
          </span>
        );
      })}
    </span>
  );
}
