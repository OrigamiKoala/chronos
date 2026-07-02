import { isSmiles, isReactionSmiles } from '../src/components/chemicalHelpers';

describe('isSmiles helper', () => {
  it('should identify valid SMILES strings when wrapped in smiles tags', () => {
    expect(isSmiles('<smiles>CC</smiles>')).toBe(true);
    expect(isSmiles('<smiles>CCC</smiles>')).toBe(true);
    expect(isSmiles('<smiles>CCO</smiles>')).toBe(true);
    expect(isSmiles('<smiles>C(=O)O</smiles>')).toBe(true);
    expect(isSmiles('<smiles>Cl</smiles>')).toBe(true);
  });

  it('should reject SMILES strings not wrapped in smiles tags', () => {
    expect(isSmiles('CC')).toBe(false);
    expect(isSmiles('CCC')).toBe(false);
  });

  it('should reject English words even if wrapped in smiles tags', () => {
    expect(isSmiles('<smiles>the</smiles>')).toBe(false);
    expect(isSmiles('<smiles>have</smiles>')).toBe(false);
    expect(isSmiles('<smiles>in</smiles>')).toBe(false);
    expect(isSmiles('<smiles>on</smiles>')).toBe(false);
  });

  it('should reject Roman numerals even if wrapped in smiles tags', () => {
    expect(isSmiles('<smiles>II</smiles>')).toBe(false);
    expect(isSmiles('<smiles>III</smiles>')).toBe(false);
    expect(isSmiles('<smiles>ii</smiles>')).toBe(false);
    expect(isSmiles('<smiles>iii</smiles>')).toBe(false);
  });

  it('should still support single iodine-containing SMILES like [I-] when wrapped', () => {
    expect(isSmiles('<smiles>[I-]</smiles>')).toBe(true);
    expect(isSmiles('<smiles>CI</smiles>')).toBe(true);
  });
});
