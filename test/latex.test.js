import { normalizeLaTeX, deepCleanLaTeX, parseJSONResponse } from '../api/_gemini.js';

describe('LaTeX normalization tests', () => {
  it('should normalize double and quadruple escaped backslashes before LaTeX commands', () => {
    const raw = "A $10.00\\\\text{ g}$ sample containing a mixture of anhydrous sodium carbonate ($\\\\\\\\ce{Na2CO3}$, $M = 105.99\\\\text{ g mol}^{-1}$) is heated at $200\\\\ ^\\\\circ\\\\text{C}$ until constant mass is reached. The mass loss due to the thermal decomposition of sodium bicarbonate is found to be $1.24\\\\text{ g}$. What was the mass fraction of $\\\\\\\\ce{NaHCO3}$ in the original mixture?";
    const expected = "A $10.00\\text{ g}$ sample containing a mixture of anhydrous sodium carbonate ($\\ce{Na2CO3}$, $M = 105.99\\text{ g mol}^{-1}$) is heated at $200^\\circ\\text{C}$ until constant mass is reached. The mass loss due to the thermal decomposition of sodium bicarbonate is found to be $1.24\\text{ g}$. What was the mass fraction of $\\ce{NaHCO3}$ in the original mixture?";
    
    expect(normalizeLaTeX(raw)).toBe(expected);
  });

  it('should fix unescaped times and ce formulas from corrupted LaTeX strings', () => {
    const raw = "Given $K_{a1} = 1.00times10^{-2}$, what is the second ionization constant $K_{a2}$ of ceH2A?";
    const expected = "Given $K_{a1} = 1.00 \\times 10^{-2}$, what is the second ionization constant $K_{a2}$ of \\ce{H2A}?";
    expect(normalizeLaTeX(raw)).toBe(expected);
  });

  it('should fix control character tab-escaped times and text', () => {
    const raw = "1.00\times10^{-2} and \text{ mol}";
    const cleaned = normalizeLaTeX(raw);
    expect(cleaned).toContain('\\times');
    expect(cleaned).toContain('\\text');
  });

  it('should clean complex LaTeX array tables', () => {
    const input = "$$\\begin{array}{|c|c|} \\\\hline Exp. & r_0 \\\\ \\\\hline 1 & 1.2 \\\\times 10^{-3} \\\\ \\\\end{array}$$";
    const cleaned = normalizeLaTeX(input);
    expect(cleaned).toContain('\\begin{array}');
    expect(cleaned).toContain('\\hline Exp.');
    expect(cleaned).toContain('\\times 10^{-3}');
  });

  it('should deepClean nested question objects', () => {
    const sampleQuestion = {
      id: "q1",
      question: "Sample $\\\\\\\\ce{Na2CO3}$ and $\\\\\\\\text{H2O}$ with $1.00times10^{-3}$",
      options: [
        "$\\\\\\\\ce{NaHCO3}$",
        "$10.00\\\\text{ g}$"
      ]
    };

    const cleaned = deepCleanLaTeX(sampleQuestion);
    expect(cleaned.question).toBe("Sample $\\ce{Na2CO3}$ and $\\text{H2O}$ with $1.00 \\times 10^{-3}$");
    expect(cleaned.options[0]).toBe("$\\ce{NaHCO3}$");
    expect(cleaned.options[1]).toBe("$10.00\\text{ g}$");
  });

  it('should correctly parse the raw AI response provided in user prompt', () => {
    const rawAiResponse = `[
      {
        "id": "q1",
        "question": "A $10.00\\\\text{ g}$ sample containing a mixture of anhydrous sodium carbonate ($\\\\\\\\ce{Na2CO3}$, $M = 105.99\\\\text{ g mol}^{-1}$) is heated at $200\\\\ ^\\\\circ\\\\text{C}$ until constant mass is reached. The mass loss due to the thermal decomposition of sodium bicarbonate is found to be $1.24\\\\text{ g}$. What was the mass fraction of $\\\\\\\\ce{NaHCO3}$ in the original mixture?",
        "options": ["$0.168$", "$0.336$", "$0.565$", "$0.672$"],
        "answer": "D"
      }
    ]`;

    const parsed = parseJSONResponse(rawAiResponse);
    expect(parsed).not.toBeNull();
    expect(parsed[0].question).toContain('\\ce{Na2CO3}');
    expect(parsed[0].question).toContain('$10.00\\text{ g}$');
    expect(parsed[0].question).toContain('200^\\circ\\text{C}');
    expect(parsed[0].question).toContain('\\ce{NaHCO3}');
  });
});
