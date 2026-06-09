import { describe, it, expect } from 'vitest';
import { isSmiles } from '../ChemicalText.jsx';

describe('isSmiles', () => {
  it('should return false for empty or non-string inputs', () => {
    expect(isSmiles('')).toBe(false);
    expect(isSmiles(null)).toBe(false);
    expect(isSmiles(undefined)).toBe(false);
    expect(isSmiles(123)).toBe(false);
    expect(isSmiles({})).toBe(false);
  });

  it('should reject English words', () => {
    expect(isSmiles('the')).toBe(false);
    expect(isSmiles('in')).toBe(false);
    expect(isSmiles('have')).toBe(false);
    expect(isSmiles('on')).toBe(false);
    expect(isSmiles('all')).toBe(false);
    expect(isSmiles('he')).toBe(false);
    expect(isSmiles('He')).toBe(false);
    expect(isSmiles('be')).toBe(false);
    expect(isSmiles('and')).toBe(false);
  });

  it('should reject words with backslashes', () => {
    expect(isSmiles('\\text{hello}')).toBe(false);
    expect(isSmiles('C\\C=C\\C')).toBe(false); // Valid SMILES stereo, but currently rejected by codebase logic for LaTeX collision
  });

  it('should allow simple chains', () => {
    expect(isSmiles('CCO')).toBe(true);
    expect(isSmiles('CCC')).toBe(true);
    expect(isSmiles('CCCCC')).toBe(true);
    expect(isSmiles('CO')).toBe(true);
    expect(isSmiles('NCCO')).toBe(true);
  });

  it('should allow SMILES with indicators', () => {
    expect(isSmiles('CC(=O)O')).toBe(true);
    expect(isSmiles('C1CCCCC1')).toBe(true);
    expect(isSmiles('c1ccccc1')).toBe(true);
    expect(isSmiles('C(C)C')).toBe(true);
    expect(isSmiles('C#C')).toBe(true);
    expect(isSmiles('[Na+]')).toBe(true);
    expect(isSmiles('[Cl-]')).toBe(true);
    expect(isSmiles('C[C@H](N)C(=O)O')).toBe(true);
    expect(isSmiles('C/C=C/C')).toBe(true); // Stereo with forward slashes
  });

  it('should allow non-organic elements if in brackets', () => {
    expect(isSmiles('[Au]')).toBe(true);
    expect(isSmiles('[Fe]')).toBe(true);
    expect(isSmiles('[Cu+2]')).toBe(true);
    expect(isSmiles('C[Pb]C')).toBe(true);
    expect(isSmiles('[SiH4]')).toBe(true);
  });

  it('should handle edge cases and non-organic elements correctly', () => {
    expect(isSmiles('Cl')).toBe(true); // Chlorine is explicitly allowed
    expect(isSmiles('Br')).toBe(true); // Bromine is organic subset
    expect(isSmiles('I')).toBe(true); // Iodine is organic subset

    // Invalid SMILES / Non-organic without brackets should be rejected
    expect(isSmiles('Au')).toBe(false);
    expect(isSmiles('Fe')).toBe(false);
    expect(isSmiles('Cu')).toBe(false);
    expect(isSmiles('Pb')).toBe(false);
    expect(isSmiles('Si')).toBe(false);
    expect(isSmiles('Na')).toBe(false);

    // Other edge cases
    expect(isSmiles('C1')).toBe(true); // Short with indicator
    expect(isSmiles('CC ')).toBe(false); // Whitespace not allowed
    expect(isSmiles(' CC')).toBe(false);
    expect(isSmiles('C C')).toBe(false);
  });
});
