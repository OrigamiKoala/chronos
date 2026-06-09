import { describe, it, expect } from 'vitest';
import { evaluateKeywordExpression, normalizeAnswer } from '../ExamScreen';

describe('normalizeAnswer', () => {
  it('normalizes string correctly', () => {
    expect(normalizeAnswer('$$E=mc^2$$')).toBe('e=mc^2');
    expect(normalizeAnswer('\\text{Hello} ~ World')).toBe('hello world');
    expect(normalizeAnswer('  spaces   ')).toBe('spaces');
    expect(normalizeAnswer('\\mathrm{Fe}^{3+}')).toBe('fe^{3+}');
    expect(normalizeAnswer(null)).toBe('');
    expect(normalizeAnswer(undefined)).toBe('');
  });
});

describe('evaluateKeywordExpression', () => {
  it('returns false for empty expression', () => {
    expect(evaluateKeywordExpression(null, "answer")).toBe(false);
    expect(evaluateKeywordExpression("", "answer")).toBe(false);
  });

  it('matches single keywords with quotes', () => {
    expect(evaluateKeywordExpression("'hello'", "I said hello there")).toBe(true);
    expect(evaluateKeywordExpression("'hello'", "I said goodbye")).toBe(false);
    expect(evaluateKeywordExpression('"world"', "hello world!")).toBe(true);
  });

  it('is case-insensitive for keywords', () => {
    expect(evaluateKeywordExpression("'HELLO'", "i said hello there")).toBe(true);
    expect(evaluateKeywordExpression("'hello'", "I SAID HELLO THERE")).toBe(true);
  });

  it('supports logical AND', () => {
    expect(evaluateKeywordExpression("'apple' AND 'banana'", "I have an apple and a banana")).toBe(true);
    expect(evaluateKeywordExpression("'apple' AND 'banana'", "I have an apple")).toBe(false);
    expect(evaluateKeywordExpression("'apple' and 'banana'", "I have an apple and a banana")).toBe(true); // lower case operator
  });

  it('supports logical OR', () => {
    expect(evaluateKeywordExpression("'apple' OR 'banana'", "I have an apple")).toBe(true);
    expect(evaluateKeywordExpression("'apple' OR 'banana'", "I have a banana")).toBe(true);
    expect(evaluateKeywordExpression("'apple' OR 'banana'", "I have an orange")).toBe(false);
  });

  it('supports logical NOT', () => {
    expect(evaluateKeywordExpression("NOT 'apple'", "I have a banana")).toBe(true);
    expect(evaluateKeywordExpression("NOT 'apple'", "I have an apple")).toBe(false);
    // Combined with AND
    expect(evaluateKeywordExpression("'banana' AND NOT 'apple'", "I have a banana")).toBe(true);
    expect(evaluateKeywordExpression("'banana' AND NOT 'apple'", "I have a banana and an apple")).toBe(false);
  });

  it('supports grouping with parentheses', () => {
    expect(evaluateKeywordExpression("('apple' OR 'banana') AND 'orange'", "I have an apple and an orange")).toBe(true);
    expect(evaluateKeywordExpression("('apple' OR 'banana') AND 'orange'", "I have a banana and an orange")).toBe(true);
    expect(evaluateKeywordExpression("('apple' OR 'banana') AND 'orange'", "I have an apple")).toBe(false);

    expect(evaluateKeywordExpression("'apple' OR ('banana' AND 'orange')", "I have an apple")).toBe(true);
    expect(evaluateKeywordExpression("'apple' OR ('banana' AND 'orange')", "I have a banana and an orange")).toBe(true);
    expect(evaluateKeywordExpression("'apple' OR ('banana' AND 'orange')", "I have a banana")).toBe(false);
  });

  it('handles spaces and formatting properly (using normalizeAnswer)', () => {
    // evaluateKeywordExpression applies normalizeAnswer to both the keyword and the user answer
    expect(evaluateKeywordExpression("'E=mc^2'", "The formula is $$E=mc^2$$")).toBe(true);
    expect(evaluateKeywordExpression("'\\text{iron}'", "The metal is iron")).toBe(true);
  });

  it('handles missing operators (invalid expression syntax gracefully fails)', () => {
    // "true false" would be an invalid JS expression
    expect(evaluateKeywordExpression("'apple' 'banana'", "I have an apple and a banana")).toBe(false);
  });

  it('prevents arbitrary JS execution due to safeRegex', () => {
    // Malicious payload attempting to exploit `new Function`
    // "true ; alert(1) ; //" -> 'true' ';' 'alert' ... these should fail safeRegex
    const malicious = "'; alert(1);'";
    // safeRegex is: /^(?:true|false|&&|\|\||!|\(|\)|\s)+$/
    // If we pass an expression that becomes something other than true/false/operators, it should return false
    expect(evaluateKeywordExpression("alert(1)", "alert(1)")).toBe(false);
  });

  it('handles words without quotes', () => {
    // The regex supports words without quotes: [a-zA-Z0-9_.-]+
    expect(evaluateKeywordExpression("apple AND banana", "I have an apple and a banana")).toBe(true);
    expect(evaluateKeywordExpression("apple OR banana", "I have a banana")).toBe(true);
  });

  it('logs error and returns false for syntactically invalid JS expressions', () => {
    // Provide a valid keyword but structure it poorly for javascript
    // e.g. "AND AND" -> "&& &&"
    expect(evaluateKeywordExpression("AND AND", "user answer")).toBe(false);

    // Unmatched parentheses
    expect(evaluateKeywordExpression("('apple' AND 'banana'", "apple banana")).toBe(false);
  });
});
