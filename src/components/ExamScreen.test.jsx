import { normalizeAnswer } from "./ExamScreen.jsx";
import { describe, it, expect } from "vitest";

describe("normalizeAnswer", () => {
  it("should handle falsy inputs", () => {
    expect(normalizeAnswer("")).toBe("");
    expect(normalizeAnswer(null)).toBe("");
    expect(normalizeAnswer(undefined)).toBe("");
  });

  it("should strip block math delimiters $$...$$", () => {
    expect(normalizeAnswer("$$x^2$$")).toBe("x^2");
    expect(normalizeAnswer("some text $$E=mc^2$$ more text")).toBe("some text e=mc^2 more text");
  });

  it("should strip inline math delimiters $...$", () => {
    expect(normalizeAnswer("$y=mx+b$")).toBe("y=mx+b");
    expect(normalizeAnswer("hello $x$ world")).toBe("hello x world");
  });

  it("should strip block math delimiters \\\\[...\\\\]", () => {
    expect(normalizeAnswer("\\[a^2 + b^2 = c^2\\]")).toBe("a^2 + b^2 = c^2");
  });

  it("should strip inline math delimiters \\\\(...\\\\)", () => {
    expect(normalizeAnswer("\\(x = 5\\)")).toBe("x = 5");
  });

  it("should strip LaTeX formatting commands like \\text, \\mathrm, \\mathbf", () => {
    expect(normalizeAnswer("\\text{hello}")).toBe("hello");
    expect(normalizeAnswer("\\mathrm{pH}")).toBe("ph");
    expect(normalizeAnswer("\\mathbf{v}")).toBe("v");
    expect(normalizeAnswer("\\mathit{italic}")).toBe("italic");
    expect(normalizeAnswer("\\rm{roman}")).toBe("roman");
    expect(normalizeAnswer("\\bf{bold}")).toBe("bold");
  });

  it("should replace LaTeX thin-spaces (~) with regular spaces", () => {
    expect(normalizeAnswer("x~y")).toBe("x y");
    expect(normalizeAnswer("a~~~b")).toBe("a b"); // ~~~ turns into spaces which collapse
  });

  it("should collapse multiple spaces into a single space", () => {
    expect(normalizeAnswer("this    is   a    test")).toBe("this is a test");
    expect(normalizeAnswer("  leading and trailing  ")).toBe("leading and trailing");
  });

  it("should trim leading and trailing spaces", () => {
    expect(normalizeAnswer("   x + y   ")).toBe("x + y");
  });

  it("should convert strings to lowercase", () => {
    expect(normalizeAnswer("AbCdEfG")).toBe("abcdefg");
    expect(normalizeAnswer("HELLO WORLD")).toBe("hello world");
  });

  it("should handle complex combined cases", () => {
    expect(normalizeAnswer("  $$ \\text{The}~~\\mathrm{Answer} $$ IS \\( 42 \\)  "))
      .toBe("the answer is 42");
    expect(normalizeAnswer("\\mathbf{Velocity} = \\frac{d}{dt} x(t)"))
      .toBe("velocity = \\frac{d}{dt} x(t)");
  });
});
