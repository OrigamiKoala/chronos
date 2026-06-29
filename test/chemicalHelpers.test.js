import { isSmiles, isReactionSmiles } from '../src/components/chemicalHelpers';

describe('isSmiles helper', () => {
  it('should identify valid SMILES strings', () => {
    expect(isSmiles('CC')).toBe(true);
    expect(isSmiles('CCC')).toBe(true);
    expect(isSmiles('CCO')).toBe(true);
    expect(isSmiles('C(=O)O')).toBe(true);
    expect(isSmiles('Cl')).toBe(true);
  });

  it('should reject English words', () => {
    expect(isSmiles('the')).toBe(false);
    expect(isSmiles('have')).toBe(false);
    expect(isSmiles('in')).toBe(false);
    expect(isSmiles('on')).toBe(false);
  });

  it('should reject Roman numerals', () => {
    expect(isSmiles('II')).toBe(false);
    expect(isSmiles('III')).toBe(false);
    expect(isSmiles('ii')).toBe(false);
    expect(isSmiles('iii')).toBe(false);
  });

  it('should still support single iodine-containing SMILES like [I-]', () => {
    expect(isSmiles('[I-]')).toBe(true);
    expect(isSmiles('CI')).toBe(true); // Chlorine iodide or similar, standard organic/aromatic letters
  });
});
