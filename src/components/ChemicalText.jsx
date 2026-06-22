import React, { useEffect, useRef, useState } from 'react';
import SmilesDrawer from 'smiles-drawer';

import { isSmiles, isReactionSmiles, smilesThemes } from './chemicalHelpers';

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
        Promise.resolve().then(() => setHasError(false));
        drawer.draw(tree, svgRef.current, 'dark', false);
      }, () => {
        Promise.resolve().then(() => setHasError(true));
      });
    } catch {
      Promise.resolve().then(() => setHasError(true));
    }
  }, [smiles, width, height, theme]);

  if (hasError) {
    return <span>{smiles}</span>;
  }

  return (
    <span style={{ 
      display: 'flex', 
      justifyContent: 'center',
      margin: '12px auto'
    }}>
      <svg ref={svgRef} data-smiles={smiles} width={width} height={height} style={{ width, height, display: 'block' }} />
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
        Promise.resolve().then(() => setHasError(false));
        reactionDrawer.draw(rxn, svgRef.current, 'dark');
      }, () => {
        Promise.resolve().then(() => setHasError(true));
      });
    } catch {
      Promise.resolve().then(() => setHasError(true));
    }
  }, [reaction, theme]);

  if (hasError) {
    return <span>{reaction}</span>;
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

  // Split by LaTeX blocks ($...$, $$...$$, \(...\), \[...\]), SVG blocks wrapped in ```xml ... ```, raw SVG blocks,
  // and markdown bold (**...**) / italic (*...*) to keep them intact.
  const parts = text.split(/(\$\$.*?\$\$|\$.*?\$|\\\(.*?\\\)|\\\[.*?\\\]|```xml[\s\S]*?<\/svg>[\s\S]*?```|\[\[SVG:[\s\S]*?\]\]|<svg[\s\S]*?<\/svg>|\*\*[^*]+\*\*|\*[^*]+\*)/g);

  return (
    <span ref={containerRef} style={{ display: 'inline', alignItems: 'center', flexWrap: 'wrap' }}>
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
              const match = token.match(/^([`'"({[<]*)(.*?)([`'")}>.,;:!?-]*)$/);
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
