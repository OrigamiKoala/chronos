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

export function ChemicalText({ text, theme = 'dark', defaultWidth = 130, defaultHeight = 130 }) {
  const containerRef = useRef(null);

  // Replace literal '\n' (backslash followed by n) with actual newlines first, but NOT when followed by a letter (which indicates a LaTeX command like \nu)
  const sanitizedText = typeof text === 'string' ? text.replace(/\\n(?![a-zA-Z])/g, '\n') : text;

  // Trigger MathJax typesetting after render so LaTeX like $\text{H}_2\text{SO}_4$ renders
  useEffect(() => {
    if (!containerRef.current || !sanitizedText) return;
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
  }, [sanitizedText]);

  if (!sanitizedText) return null;

  // Split by LaTeX blocks ($...$, $$...$$, \(...\), \[...\]), SVG blocks wrapped in ```xml ... ```, raw SVG blocks,
  // smiles tag blocks (<smiles>...</smiles>), and markdown bold (**...**) / italic (*...*) to keep them intact.
  const parts = sanitizedText.split(/(\$\$[\s\S]*?\$\$|\$[^\$]+?\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|```xml[\s\S]*?<\/svg>[\s\S]*?```|\[\[SVG:[\s\S]*?\]\]|<svg[\s\S]*?<\/svg>|<smiles>[\s\S]*?<\/smiles>|\*\*[^*]+\*\*|\*[^*]+\*)/gi);

  return (
    <span ref={containerRef} key={sanitizedText} style={{ display: 'inline', alignItems: 'center', flexWrap: 'wrap' }}>
      {parts.map((part, partIndex) => {
        let isSvg = false;
        let svgContent = part;

        if (part.startsWith('```xml') && part.includes('<svg') && part.endsWith('```')) {
          isSvg = true;
          // Strip off the ```xml and ``` block delimiters
          svgContent = part.replace(/^```xml\s*/, '').replace(/\s*```$/, '');
        } else if (part.startsWith('[[SVG:')) {
          isSvg = true;
          // Strip off the [[SVG: and ]] markers
          svgContent = part.replace(/^\[\[SVG:\s*/, '').replace(/\s*\]\]$/, '');
        } else if (part.startsWith('<svg')) {
          isSvg = true;
        }

        // If this part is an SVG block, adapt it to dark mode and render it inside a dark card container.
        if (isSvg) {
          const cleanedSvg = svgContent
            .replace(/stroke\s*=\s*['"](?:black|#000000|#000)['"]/gi, "stroke='currentColor'")
            .replace(/fill\s*=\s*['"](?:black|#000000|#000)['"]/gi, "fill='currentColor'")
            .replace(/fill\s*=\s*['"](?:white|#ffffff|#fff)['"]/gi, "fill='none'")
            .replace(/background\s*:\s*(?:white|#ffffff|#fff|black|#000000|#000)/gi, "background:transparent")
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
                  overflow: 'hidden',
                  lineHeight: 0,
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
        if (part.startsWith('$') || part.startsWith('\\(') || part.startsWith('\\[')) {
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

        // For non-math text, split by whitespace to detect newlines and space spacing properly
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

              return <span key={index}>{token}</span>;
            })}
          </span>
        );
      })}
    </span>
  );
}
