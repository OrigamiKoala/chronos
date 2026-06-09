import React from 'react';
import { render } from '@testing-library/react';
import { ChemicalText } from './ChemicalText.jsx';

describe('ChemicalText', () => {
  it('sanitizes SVG content', () => {
    const maliciousSvg = '```xml\n<svg><script>alert(1)</script><circle cx="50" cy="50" r="40" fill="red" /></svg>\n```';
    const { container } = render(<ChemicalText text={maliciousSvg} />);
    expect(container.innerHTML).not.toContain('<script>');
    expect(container.innerHTML).toContain('<circle');
  });
});
