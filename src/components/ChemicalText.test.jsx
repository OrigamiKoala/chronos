import { describe, it, expect } from 'vitest';
import { isReactionSmiles } from './ChemicalText.jsx';

describe('isReactionSmiles', () => {
  it('should return false for empty or non-string inputs', () => {
    expect(isReactionSmiles('')).toBe(false);
    expect(isReactionSmiles(null)).toBe(false);
    expect(isReactionSmiles(undefined)).toBe(false);
    expect(isReactionSmiles(123)).toBe(false);
    expect(isReactionSmiles({})).toBe(false);
  });

  it('should return false for strings without the reaction separator ">"', () => {
    expect(isReactionSmiles('CCO')).toBe(false);
    expect(isReactionSmiles('c1ccccc1')).toBe(false);
    expect(isReactionSmiles('Hello world')).toBe(false);
  });

  it('should return true for valid reaction SMILES', () => {
    // Simple reactant to product
    expect(isReactionSmiles('CCO>CC(=O)O')).toBe(true);
    // Reactant, agent, product
    expect(isReactionSmiles('CCO>[Na+]>CC(=O)O')).toBe(true);
    // Reactants with dot separator
    expect(isReactionSmiles('CCO.c1ccccc1>C=O>CCOCC')).toBe(true);
    // Reactant only
    expect(isReactionSmiles('CCO>')).toBe(true);
    // Product only
    expect(isReactionSmiles('>CCO')).toBe(true);
    // Agent only
    expect(isReactionSmiles('>CCO>')).toBe(true);
  });

  it('should return false for strings with ">" but no valid SMILES parts', () => {
    expect(isReactionSmiles('invalid>string')).toBe(false);
    expect(isReactionSmiles('not>a>reaction')).toBe(false);
    expect(isReactionSmiles('hello>world')).toBe(false);
    expect(isReactionSmiles('the>quick>brown')).toBe(false);
  });

  it('should return false for empty reaction separators', () => {
    expect(isReactionSmiles('>')).toBe(false);
    expect(isReactionSmiles('>>')).toBe(false);
    expect(isReactionSmiles('>.>')).toBe(false); // '.' is not a valid SMILES on its own
  });
});
