import { GoogleGenAI } from '@google/genai';
import { getAccessToken } from './auth.js';
import { runQuery } from './bigquery.js';
import { md5 } from './md5.js';

// ------------------------------------
// Constants — copy the full values from apps_script.js
// ------------------------------------

const mathExemplars = [
  {
    "id": "math_ex1",
    "topic": "Geometry",
    "question": "A point $P$ is chosen at random inside square $ABCD$. The probability that $\\\\overline{AP}$ is neither the shortest nor the longest side of $\\\\triangle APB$ can be written as $\\\\frac{a + b \\\\pi - c \\\\sqrt{d}}{e}$, where $a, b, c, d,$ and $e$ are positive integers, $\\\\text{gcd}(a, b, c, e) = 1$, and $d$ is not divisible by the square of a prime. What is $a+b+c+d+e$?",
    "type": "multiple_choice",
    "options": ["$25$", "$26$", "$27$", "$28$", "29"],
    "answer": "A",
    "difficulty": 4,
  },
  {
    "id": "math_ex2",
    "topic": "Combinatorics, Algebra, Number Theory",
    "question": "For each nonnegative integer $r$ less than $502$, define\\\\n\\\\n$$S_r=\\\\sum_{m\\\\geq 0}\\\\binom{10,000}{502m+r},\\\\n\\\\n$$where $\\\\binom{10,000}{n}$ is defined to be $0$ when $n>10,000$. That is, $S_r$ is the sum of all the binomial coefficients of the form $\\\\binom{10,000}{k}$ for which $0\\\\leq k\\\\leq 10,000$ and $k-r$ is a multiple of $502$. Find the number of integers in the list $S_0,S_1,S_2,\\\\dots,S_{501}$ that are multiples of the prime number $503$.",
    "type": "short_answer",
    "answer": "39",
    "difficulty": 6,
  },
  {
    "id": "math_ex3",
    "topic": "Combinatorics",
    "question": "The integers from $1$ through $25$ are arbitrarily separated into five groups of $5$ numbers each. The median of each group is identified. Let $M$ equal the median of the five medians. What is the least possible value of $M$?\\\\n\\\\n$\\\\textbf{(A) }9 \\\\qquad \\\\textbf{(B) }10 \\\\qquad \\\\textbf{(C) }12 \\\\qquad \\\\textbf{(D) }13 \\\\qquad \\\\textbf{(E) }14$",
    "type": "multiple_choice",
    "options": ["$9$", "$10$", "$12$", "$13$", "14"],
    "answer": "A",
    "difficulty": 3,
  },
  {
    "id": "math_ex4",
    "topic": "Number Theory",
    "question": "Let $a$ and $b$ be positive integers such that $ab + 1$ divides $a^{2} + b^{2}$. Show that $\\\\frac {a^{2} + b^{2}}{ab + 1}$ is the square of an integer.",
    "type": "free_response",
    "answer": "",
    "difficulty": 10,
  },
  {
    "id": "math_ex5",
    "topic": "Algebra",
    "question": "Patrick started walking at a constant speed along a straight road from his school to the park. One hour after Patrick left, Tanya started running at a constant speed of $2$ miles per hour faster than Patrick walked, following the same straight road from the school to the park. One hour after Tanya left, José started bicycling at a constant speed of $7$ miles per hour faster than Tanya ran, following the same straight road from the school to the park. All three people arrived at the park at the same time. The distance from the school to the park is $\frac{m}{n}$ miles, where $m$ and $n$ are relatively prime positive integers. Find $m+n$.",
    "type": "short_answer",
    "answer": "277",
    "difficulty": 2,
  },
  {
    "id": "math_ex6",
    "topic": "Number Theory",
    "question": "Find the number of positive integer palindromes written in base $10$, with no zero digits, and whose digits add up to $13$. For example, $42124$ has these properties. Recall that a palindrome is a number whose representation reads the same from left to right as from right to left.",
    "type": "short_answer",
    "answer": "62",
    "difficulty": 2
  },
  {
    "id": "math_ex7",
    "topic": "Geometry",
    "question": "A hemisphere with radius $200$ sits on top of a horizontal circular disk with radius $200$, and the hemisphere and disk have the same center. Let $\mathcal{T}$ be the region of points $P$ in the disk such that a sphere of radius $42$ can be placed on top of the disk at $P$ and lie completely inside the hemisphere. The area of $\mathcal{T}$ divided by the area of the disk is $\frac{p}{q}$, where $p$ and $q$ are relatively prime positive integers. Find $p+q$.",
    "type": "short_answer",
    "answer": "79",
    "difficulty": 2,
  },
  {
    "id": "math_ex8",
    "topic": "Geometry",
    "question": "A plane contains points $A$ and $B$ with $AB=1$. Point $A$ is rotated in the plane counterclockwise through an acute angle $\theta$ around point $B$ to point $A'$. Then $B$ is rotated in the plane clockwise through angle $\theta$ around point $A'$ to point $B'$. Suppose $AB'=\frac{4}{3}$. The value of $\cos\theta$ can be written as $\frac{m}{n}$, where $m$ and $n$ are relatively prime positive integers. Find $m+n$.",
    "type": "short_answer",
    "answer": "65",
    "difficulty": 3,
  },
  {
    "id": "math_ex9",
    "topic": "Algebra",
    "question": "The product of all positive real numbers $x$ satisfying the equation\[\sqrt[20]{x^{\log_{2026}x}}=26x\]is an integer $P$. Find the number of positive integer divisors of $P$.",
    "type": "short_answer",
    "answer": "441",
    "difficulty": 3,
  },
  {
    "id": "math_ex10",
    "topic": "Number Theory",
    "question": "Let $N$ be the number of positive integer divisors of $17017^{17}$ that leave a remainder of $5$ upon division by $12$. Find the remainder when $N$ is divided by $1000$.",
    "type": "short_answer",
    "answer": "29",
    "difficulty": 4,
  },
  {
    "id": "math_ex11",
    "topic": "Combinatorics",
    "question": "Joanne has a blank fair six-sided die and six stickers each displaying a different integer from $1$ to $6$. Joanne rolls the die and then places the sticker labeled $1$ on the top face of the die. She then rolls the die again, places the sticker labeled $2$ on the top face, and continues this process to place the rest of the stickers in order. If the die ever lands with a sticker already on its top face, the new sticker is placed to cover the old sticker. Let $p$ be the conditional probability that at the end of the process exactly one face has been left blank, given that all the even-numbered stickers are visible on faces of the die. Then $p$ can be written as $\frac{m}{n}$, where $m$ and $n$ are relatively prime positive integers. Find $m+n$.",
    "type": "short_answer",
    "answer": "029",
    "difficulty": 4,
  },
  {
    "id": "math_ex12",
    "topic": "Combinatorics",
    "question": `Let $a, b,$ and $n$ be positive integers with both $a$ and $b$ greater than or equal to $2$ and less than or equal to $2n.{}$ Define an $a \times b$ cell loop in a $2n \times 2n$ grid of cells to be the $2a + 2b - 4$ cells that surround an $(a - 2) \times (b - 2)$ (possibly empty) rectangle of cells in the grid. For example, the following diagram shows a way to partition a $6 \times 6$ grid of cells into $4$ cell loops. 
    
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="100%" height="100%">
  <rect x="20" y="20" width="400" height="400" fill="#247eff" />
  
  <rect x="120" y="120" width="200" height="200" fill="#ff7675" />
  
  <rect x="20" y="420" width="400" height="200" fill="#ffffff" />
  
  <rect x="420" y="20" width="200" height="600" fill="#fff775" />

  <g stroke="#2d3436" stroke-width="1" opacity="0.7">
    <line x1="120" y1="20" x2="120" y2="620" />
    <line x1="220" y1="20" x2="220" y2="620" />
    <line x1="320" y1="20" x2="320" y2="620" />
    <line x1="420" y1="20" x2="420" y2="620" />
    <line x1="520" y1="20" x2="520" y2="620" />
    
    <line x1="20" y1="120" x2="620" y2="120" />
    <line x1="20" y1="220" x2="620" y2="220" />
    <line x1="20" y1="320" x2="620" y2="320" />
    <line x1="20" y1="420" x2="620" y2="420" />
    <line x1="20" y1="520" x2="620" y2="520" />
  </g>

  <g stroke="#000000" stroke-width="10" stroke-linecap="square">
    <rect x="20" y="20" width="600" height="600" fill="none" stroke-width="16" />
    
    <line x1="420" y1="20" x2="420" y2="620" stroke-width="12" />
    <line x1="20" y1="420" x2="420" y2="420" stroke-width="12" />
    
    <rect x="120" y="120" width="200" height="200" fill="none" stroke-width="12" />
    
    <line x1="120" y1="520" x2="320" y2="520" stroke-width="12" stroke-linecap="round" />
    <line x1="520" y1="120" x2="520" y2="520" stroke-width="12" stroke-linecap="round" />
  </g>

  <circle cx="220" cy="220" r="28" fill="#000000" />
</svg>
`,
    "answer": "83",
    "difficulty": 8,
  },
  {
    "id": "math_ex13",
    "topic": "Algebra",
    "question": "What is the value of $(7 \times 2) − (3 \times 4 + 2)$?",
    "type": "short_answer",
    "answer": "0",
    "difficulty": 0,
  },
  {
    "id": "math_ex14",
    "topic": "Algebra",
    "question": "Charlene is looking at part-time jobs from three local businesses. Al’s Avocados pays $\$250$ dollars a week no matter what. Bertha’s Burritos pays $\$20$ an hour. Carl’s Cantaloupes pays $\$15$ an hour for the first $10$ hours and $\$25$ an hour beyond that. Charlene’s desired number of hours per week would pay her the same at Al’s and at Carl’s.How much would she make per week if she took the job at Bertha’s?",
    "type": "short_answer",
    "answer": "$280",
    "difficulty": 1,
  }
];

const physicsExemplars = [
  {
    "id": "phys_ex1",
    "topic": "Mechanics",
    "question": "In astronomy, some galactic objects appear to sweep across the sky faster than light speed, $c$. This effect, called superluminal motion, comes purely from geometry and the finite travel time of light, and it has nothing to do with special relativity.\nA jet moves from point $A$ to $B$ at speed $v = \\\\beta c$. The jet emits a pulse of light at $A$, and a second pulse a time \\\\delta t later at $B$. An observer sees these pulses at point $O$. The angle between the jet and the line of sight is \\\\theta$. Assume the angle \\\\phi is small, so the distances from $O$ to points $B$ and $C$ can be treated as equal.\nFind the apparent transverse velocity, $v_T$, along $CB$ as measured by the observer, in terms of \\\\beta and \\\\theta. Express your answer as \\\\beta_T \\\\equiv \\\\frac{v_T}{c}.\n\n[[SVG: <svg width='500' height='200' viewBox='0 0 500 200' xmlns='http://www.w3.org/2000/svg'><line x1='50' y1='150' x2='450' y2='150' stroke='black' stroke-width='2' /> <line x1='450' y1='150' x2='250' y2='80' stroke='black' stroke-width='2' />  <line x1='50' y1='150' x2='250' y2='80' stroke='black' stroke-dasharray='4' /> <line x1='250' y1='80' x2='250' y2='150' stroke='black' stroke-dasharray='4' /> <circle cx='50' cy='150' r='4' fill='black' /> <circle cx='250' cy='80' r='4' fill='black' />  <circle cx='250' cy='150' r='4' fill='black' /> <circle cx='450' cy='150' r='4' fill='black' /> <text x='40' y='140' font-family='serif' font-style='italic'>O</text><text x='250' y='70' font-family='serif' font-style='italic'>B</text><text x='250' y='170' font-family='serif' font-style='italic'>C</text><text x='450' y='170' font-family='serif' font-style='italic'>A</text><text x='350' y='130' font-family='serif' font-style='italic'>θ</text><text x='350' y='100' font-family='serif' font-style='italic'>v</text><path d='M 420 150 A 30 30 0 0 0 400 120' fill='none' stroke='black' /><text x='90' y='140' font-family='serif' font-style='italic'>φ</text><path d='M 80 150 A 30 30 0 0 0 100 140' fill='none' stroke='black' /></svg>]]",
    "type": "multiple_choice",
    "options": [
      "$\\\\beta_T = \\\\frac{\\\\beta \\\\sin \\\\theta}{1 - \\\\beta \\\\cos \\\\theta}$",
      "$\\\\beta_T = \\\\beta \\\\sin \\\\theta(1 - \\\\beta \\\\cos \\\\theta)$",
      "$\\\\beta_T = \\\\frac{\\\\beta \\\\sin \\\\theta}{1 + \\\\beta \\\\cos \\\\theta}$",
      "$\\\\beta_T = \\\\frac{\\\\beta \\\\sin \\\\theta}{\\\\sqrt{1 - \\\\beta^2}}$",
      "$\\\\beta_T = \\\\beta \\\\tan \\\\theta$"
    ],
    "answer": "A",
    "difficulty": 6,
  },
  {
    "id": "phys_ex2",
    "topic": "Mechanics",
    "question": "A projectile of total mass $4M$ is launched from the ground at position $x=0$ and time $t=0$. The projectile is launched with an initial speed $v_{0}$ at an angle \\\\theta above the horizontal. When the projectile is at the highest point in its trajectory, it breaks into Pieces Q and R of masses $M$ and $3M$, respectively. The motion of the projectile is described for the following times:\n    - At $t=t_{1}$, immediately after the projectile breaks apart, the two pieces are moving away from each other horizontally.\n    - At $t=t_{2}$, Piece Q reaches the ground at $x=0$ and Piece R reaches the ground at $x=x_{2}$.\n\nPart A: The horizontal and vertical components of a momentum vector are represented by $p_{x}$ and $p_{y}$, respectively. The shaded bars in Figure 2 represent $p_{x}$ and $p_{y}$ of the projectile immediately after $t=0$. On Figure 3, draw shaded bars to represent $p_{x}$ and $p_{y}$ of Pieces Q and R at $t=t_{1}$.\n\nPart B: Derive an expression for $x_{2}$ in terms of $v_{0}$, \\\\theta, and physical constants, as appropriate. Begin your derivation by writing a fundamental physics principle or an equation from the reference information.\n\nPart C: The horizontal component of a velocity vector is represented by $v_{x}$. Figure 4 shows the horizontal component $v_{x,cm}$ of the velocity of the center of mass of the projectile as a function of $t$ during the time interval $0 < t < t_{1}$. On Figure 4, sketch a line or curve to represent $v_{x}$ as a function of $t$ for the time interval $t_{1} < t < t_{2}$ for each of the following:\n    - Piece Q\n    - Piece R\n    - The center of mass of the two-piece system\nClearly label all lines or curves.\n\nPart D: Consider a case in which the projectile is launched at the same angle and initial speed as initially described. When the projectile breaks into Pieces Q and R, Piece Q falls straight down. In this case, Piece R reaches the ground at $x=x_{new}$. Indicate whether $x_{new}$ is greater than, less than, or equal to $x_{2}$ by writing one of the following:\n    - $x_{new} > x_{2}$\n    - $x_{new} < x_{2}$\n    - $x_{new} = x_{2}$\nBriefly justify your answer either by referencing a feature of the representations you drew in part A or C or by using conceptual reasoning beyond algebraic solutions.",
    "type": "free_response",
    "answer": "",
    "difficulty": 3,
  },
  {
    "id": "phys_ex3",
    "topic": "Fluids",
    "question": `Water-Powered Rice-Pounding Mortar
      System Parameters
      Lever Mass ($M$): $30\text{ kg}$
      Moment of Inertia ($I$): $12\text{ kg}\cdot\text{m}^2$ (around axis $T$)
      Initial Lift Mass ($m$): $1.0\text{ kg}$ of water causes rotation from horizontal.
      Bucket Dimensions: $L = 74\text{ cm}$, $h = 12\text{ cm}$, $b = 15\text{ cm}$, angle $\gamma = 30^\circ$
      Lever Thickness: $8\text{ cm}$
      Pivot Distance ($a$): $20\text{ cm}$ from bucket edge to axis $T$
      Assumptions: Water surface always horizontal; neglect friction and water impact force.
      Problem Problems
      1. Structure of the Mortar
      1.1 Determine distance from center of mass $G$ to axis $T$ ($GT$ is horizontal when empty).
      1.2 Determine $\alpha_1$ (water starts flowing out) and $\alpha_2$ (bucket completely empty).
      1.3 Determine angle $\beta$ and water mass $m_1$ when total torque $\mu(\alpha) = 0$.
      2. Working Mode (Small Flow Rate $\Phi$)
      2.1 Sketch torque $\mu(\alpha)$ vs angle $\alpha$ for one cycle. Explicitly state values at $\alpha_1$, $\alpha_2$, and $\alpha = 0$.
      2.2 Give geometric interpretation of total energy $W_{\text{total}}$ and pounding work $W_{\text{pounding}}$.
      2.3 Estimate maximal angle $\alpha_0$ and $W_{\text{pounding}}$.
      3. Rest Mode
      3.1.1 Sketch $\mu(\alpha)$ near $\alpha = \beta$ (bucket overflown); identify equilibrium type.
      3.1.2 Find analytic form of $\mu(\alpha)$ for $\alpha = \beta + \Delta\alpha$ ($\Delta\alpha$ small).
      3.1.3 Write equation of motion for small deviations; find harmonic oscillation period $\tau$.
      3.2 Find minimal flow rate $\Phi_1$ for harmonic motion with amplitude $1^\circ$.
      3.3 Estimate minimal flow rate $\Phi_2$ for which the mortar ceases to work.
      Diagrams:
      FIgure 2: Operation Cycle

      <svg viewBox="0 0 200 420" width="200" height="420" xmlns="http://www.w3.org/2000/svg">
        <g transform="translate(0,0)">
          <text x="10" y="20" font-family="sans-serif" font-size="12">a)</text>
          <line x1="20" y1="40" x2="180" y2="40" stroke="black" stroke-width="2"/>
          <line x1="100" y1="40" x2="100" y2="60" stroke="black" stroke-width="4"/>
          <path d="M 20 40 Q 50 50 80 40 Z" fill="lightblue" stroke="black"/>
          <line x1="160" y1="40" x2="160" y2="60" stroke="black" stroke-width="2"/>
        </g>
        <g transform="translate(0,70)">
          <text x="10" y="20" font-family="sans-serif" font-size="12">b) alpha_1</text>
          <line x1="20" y1="50" x2="180" y2="30" stroke="black" stroke-width="2"/>
          <path d="M 20 50 Q 50 55 80 42 Z" fill="lightblue" stroke="black"/>
        </g>
        <g transform="translate(0,140)">
          <text x="10" y="20" font-family="sans-serif" font-size="12">c) alpha = beta</text>
          <line x1="20" y1="55" x2="180" y2="25" stroke="black" stroke-width="2"/>
        </g>
        <g transform="translate(0,210)">
          <text x="10" y="20" font-family="sans-serif" font-size="12">d) alpha_2</text>
          <line x1="20" y1="60" x2="180" y2="20" stroke="black" stroke-width="2"/>
        </g>
        <g transform="translate(0,280)">
          <text x="10" y="20" font-family="sans-serif" font-size="12">e) alpha_0</text>
          <line x1="20" y1="70" x2="180" y2="10" stroke="black" stroke-width="2"/>
        </g>
        <g transform="translate(0,350)">
          <text x="10" y="20" font-family="sans-serif" font-size="12">f) Impact</text>
          <line x1="20" y1="40" x2="180" y2="40" stroke="black" stroke-width="2"/>
          <line x1="160" y1="40" x2="160" y2="60" stroke="black" stroke-width="2"/>
          <rect x="150" y="60" width="20" height="15" fill="gray"/>
        </g>
      </svg>

      Figure 3: Mechanical Dimensions:
      <svg viewBox="0 0 500 150" width="500" height="150" xmlns="http://www.w3.org/2000/svg">
        <rect x="50" y="40" width="400" height="16" fill="#e0c090" stroke="black"/>
        <circle cx="200" cy="48" r="4" fill="black"/>
        <text x="195" y="35" font-family="sans-serif" font-size="12">T</text>
        <circle cx="240" cy="48" r="3" fill="red"/>
        <text x="238" y="35" font-family="sans-serif" font-size="12">G</text>
        <rect x="400" y="56" width="12" height="50" fill="#e0c090" stroke="black"/>
        <path d="M 50 40 L 150 40 L 150 56 L 80 56 Z" fill="lightcyan" stroke="black"/>
        <text x="90" y="35" font-family="sans-serif" font-size="12">Bucket</text>
        <path d="M 150 25 L 200 25" stroke="black" marker-start="url(#arrow)" marker-end="url(#arrow)"/>
        <text x="160" y="20" font-family="sans-serif" font-size="10">a = 20 cm</text>
        <path d="M 380 106 L 430 106 L 420 130 L 390 130 Z" fill="none" stroke="black" stroke-width="2"/>
      </svg>`,
    "type": "free_response",
    "answer": "",
    "difficulty": 10
  }
];

const chemistryExemplars = [
  {
    "id": "chem_ex1",
    "topic": "Analytical Chemistry, Oxidation-Reduction",
    "question": "A weighed sample of a copper-nickel alloy is dissolved in a known volume of nitric acid. Which method is most suitable for determining the mass percent of copper in the alloy?\\n\\n(A) Treatment of an aliquot of the solution with excess iodide, followed by titration of the iodine produced with sodium thiosulfate.\\n(B) Measurement of the absorbance of the solution at a wavelength of light at which both $\\\\ce{Cu^{2+}}$ and $\\\\ce{Ni^{2+}}$ absorb, and comparison with the absorbances of known standards of the two ions.\\n(C) Addition of excess sodium hydroxide to the solution, isolation of the metal hydroxides by filtration, and measurement of the mass of the precipitate.\\n(D) Bubbling hydrogen gas through the solution and measuring the mass of the metal that precipitates from the solution.",
    "type": "multiple_choice",
    "options": [
      "Treatment of an aliquot of the solution with excess iodide, followed by titration of the iodine produced with sodium thiosulfate.",
      "Measurement of the absorbance of the solution at a wavelength of light at which both $\\\\ce{Cu^{2+}}$ and $\\\\ce{Ni^{2+}}$ absorb, and comparison with the absorbances of known standards of the two ions.",
      "Addition of excess sodium hydroxide to the solution, isolation of the metal hydroxides by filtration, and measurement of the mass of the precipitate.",
      "Bubbling hydrogen gas through the solution and measuring the mass of the metal that precipitates from the solution."
    ],
    "answer": "A",
    "difficulty": 5,
  },
  {
    "id": "chem_ex2",
    "topic": "Acid-Base Titration & Gas Laws",
    "question": "A is an ionic compound that contains only the elements hydrogen, nitrogen, and oxygen. a. A $1.000$-g sample of A is dissolved in $20$ mL water and titrated with $0.5000$ M $\ce{NaOH}$ solution, giving the data shown below. What is the molar mass of A? [[SVG: <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 620 400' style='max-width:100%;background:white'><rect x='60' y='20' width='520' height='320' fill='white'/><g stroke='#ddd' stroke-width='0.5'><line x1='60' y1='52' x2='580' y2='52'/><line x1='60' y1='84' x2='580' y2='84'/><line x1='60' y1='116' x2='580' y2='116'/><line x1='60' y1='148' x2='580' y2='148'/><line x1='60' y1='180' x2='580' y2='180'/><line x1='60' y1='212' x2='580' y2='212'/><line x1='60' y1='244' x2='580' y2='244'/><line x1='60' y1='276' x2='580' y2='276'/><line x1='60' y1='308' x2='580' y2='308'/><line x1='103' y1='20' x2='103' y2='340'/><line x1='147' y1='20' x2='147' y2='340'/><line x1='190' y1='20' x2='190' y2='340'/><line x1='233' y1='20' x2='233' y2='340'/><line x1='277' y1='20' x2='277' y2='340'/><line x1='320' y1='20' x2='320' y2='340'/><line x1='363' y1='20' x2='363' y2='340'/><line x1='407' y1='20' x2='407' y2='340'/><line x1='450' y1='20' x2='450' y2='340'/><line x1='493' y1='20' x2='493' y2='340'/><line x1='537' y1='20' x2='537' y2='340'/></g><rect x='60' y='20' width='520' height='320' fill='none' stroke='#999' stroke-width='1'/><g font-family='Arial,sans-serif' font-size='12' text-anchor='end' fill='black'><text x='55' y='24'>14</text><text x='55' y='56'>13</text><text x='55' y='88'>12</text><text x='55' y='120'>11</text><text x='55' y='152'>10</text><text x='55' y='184'>9</text><text x='55' y='216'>8</text><text x='55' y='248'>7</text><text x='55' y='280'>6</text><text x='55' y='312'>5</text><text x='55' y='344'>4</text></g><text font-family='Arial,sans-serif' font-size='14' font-weight='bold' text-anchor='middle' transform='translate(20,180) rotate(-90)'>pH</text><g font-family='Arial,sans-serif' font-size='12' text-anchor='middle' fill='black'><text x='60' y='358'>0</text><text x='103' y='358'>5</text><text x='147' y='358'>10</text><text x='190' y='358'>15</text><text x='233' y='358'>20</text><text x='277' y='358'>25</text><text x='320' y='358'>30</text><text x='363' y='358'>35</text><text x='407' y='358'>40</text><text x='450' y='358'>45</text><text x='493' y='358'>50</text><text x='537' y='358'>55</text><text x='580' y='358'>60</text></g><text x='320' y='390' font-family='Arial,sans-serif' font-size='14' text-anchor='middle'>mL 0.5000 M NaOH added</text><path d='M 60 314.4 C 60 250,68.7 237.6,77.3 218.4 S 103.3 192.8,146.7 173.6 S 190 160.8,233.3 144.8 S 268 109.6,276.7 77.6 S 285.3 68,320 58.4 S 406.7 48.8,580 42.4' fill='none' stroke='black' stroke-width='2'/></svg>]] b. When a $1.000$-g sample of A is heated at $230 ^{\circ}$C in an evacuated $1.50$ L vessel, it decomposes into gaseous products, giving a final pressure of $784$ mm Hg. How many moles of gas are formed in this reaction?\\n\\n c. If the gases produced from the decomposition of $1.000$ g of A are instead first passed through a column packed with magnesium perchlorate (which strongly absorbs water vapor) and then collected at $25^{\circ}$C and a pressure of $755$ mm Hg, the total volume of gas is $308$ mL. How many moles of gas are collected in this experiment?\\n\\nd. What is the formula of A? Explain your reasoning.\\n\\ne. Write Lewis structures for the cation and the anion present in A and for the product(s) of its decomposition at $230^{\circ}$C. Your Lewis structures should include all bonds, lone pairs, and nonzero formal charges. You should show all significant resonance structures for each species.",
    "type": "free_response",
    "answer": "",
    "difficulty": 5,
  },
  {
    "id": "chem_ex3",
    "topic": "Inorganic Chemistry, Oxidation-Reduction, Electrochemistry",
    "question": "A diagram showing the thermodynamic stability of mercury-containing species as a function of pH and reduction potential (Pourbaix diagram) is shown below. What is $\\\\textbf{X}$?\\n\\n[[SVG: <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 500 500' width='100%' height='100%' style='background-color: #ffffff;'>\\n  <line x1='80' y1='50' x2='80' y2='420' stroke='#cccccc' stroke-width='1' />\\n  <line x1='140' y1='50' x2='140' y2='420' stroke='#eeeeee' stroke-width='1' />\\n  <line x1='200' y1='50' x2='200' y2='420' stroke='#eeeeee' stroke-width='1' />\\n  <line x1='260' y1='50' x2='260' y2='420' stroke='#eeeeee' stroke-width='1' />\\n  <line x1='320' y1='50' x2='320' y2='420' stroke='#eeeeee' stroke-width='1' />\\n  <line x1='380' y1='50' x2='380' y2='420' stroke='#eeeeee' stroke-width='1' />\\n  <line x1='440' y1='50' x2='440' y2='420' stroke='#cccccc' stroke-width='1' />\\n  \\n  <line x1='80' y1='420' x2='440' y2='420' stroke='#000000' stroke-width='1.5' />\\n  <line x1='80' y1='50' x2='80' y2='420' stroke='#000000' stroke-width='1.5' />\\n  <line x1='440' y1='50' x2='440' y2='420' stroke='#cccccc' stroke-width='1' />\\n  <line x1='80' y1='50' x2='440' y2='50' stroke='#cccccc' stroke-width='1' />\\n\\n  <line x1='75' y1='50' x2='80' y2='50' stroke='#000000' stroke-width='1' />\\n  <text x='50' y='55' font-family='Arial' font-size='12' text-anchor='middle'>1.2</text>\\n  <line x1='75' y1='111.7' x2='80' y2='111.7' stroke='#000000' stroke-width='1' />\\n  <text x='50' y='116.7' font-family='Arial' font-size='12' text-anchor='middle'>1.0</text>\\n  <line x1='75' y1='173.3' x2='80' y2='173.3' stroke='#000000' stroke-width='1' />\\n  <text x='50' y='178.3' font-family='Arial' font-size='12' text-anchor='middle'>0.8</text>\\n  <line x1='75' y1='235' x2='80' y2='235' stroke='#000000' stroke-width='1' />\\n  <text x='50' y='240' font-family='Arial' font-size='12' text-anchor='middle'>0.6</text>\\n  <line x1='75' y1='296.7' x2='80' y2='296.7' stroke='#000000' stroke-width='1' />\\n  <text x='50' y='301.7' font-family='Arial' font-size='12' text-anchor='middle'>0.4</text>\\n  <line x1='75' y1='358.3' x2='80' y2='358.3' stroke='#000000' stroke-width='1' />\\n  <text x='50' y='363.3' font-family='Arial' font-size='12' text-anchor='middle'>0.2</text>\\n  <line x1='75' y1='420' x2='80' y2='420' stroke='#000000' stroke-width='1' />\\n  <text x='50' y='425' font-family='Arial' font-size='12' text-anchor='middle'>0.0</text>\\n\\n  <line x1='80' y1='420' x2='80' y2='425' stroke='#000000' stroke-width='1' />\\n  <text x='80' y='440' font-family='Arial' font-size='12' text-anchor='middle'>0</text>\\n  <line x1='131.4' y1='420' x2='131.4' y2='425' stroke='#000000' stroke-width='1' />\\n  <text x='131.4' y='440' font-family='Arial' font-size='12' text-anchor='middle'>2</text>\\n  <line x1='182.8' y1='420' x2='182.8' y2='425' stroke='#000000' stroke-width='1' />\\n  <text x='182.8' y='440' font-family='Arial' font-size='12' text-anchor='middle'>4</text>\\n  <line x1='234.3' y1='420' x2='234.3' y2='425' stroke='#000000' stroke-width='1' />\\n  <text x='234.3' y='440' font-family='Arial' font-size='12' text-anchor='middle'>6</text>\\n  <line x1='285.7' y1='420' x2='285.7' y2='425' stroke='#000000' stroke-width='1' />\\n  <text x='285.7' y='440' font-family='Arial' font-size='12' text-anchor='middle'>8</text>\\n  <line x1='337.1' y1='420' x2='337.1' y2='425' stroke='#000000' stroke-width='1' />\\n  <text x='337.1' y='440' font-family='Arial' font-size='12' text-anchor='middle'>10</text>\\n  <line x1='388.6' y1='420' x2='388.6' y2='425' stroke='#000000' stroke-width='1' />\\n  <text x='388.6' y='440' font-family='Arial' font-size='12' text-anchor='middle'>12</text>\\n  <line x1='440' y1='420' x2='440' y2='425' stroke='#000000' stroke-width='1' />\\n  <text x='440' y='440' font-family='Arial' font-size='12' text-anchor='middle'>14</text>\\n\\n  <text x='260' y='465' font-family='Arial' font-size='14' text-anchor='middle' font-weight='bold'>pH</text>\\n  <text x='25' y='235' font-family='Arial' font-size='14' text-anchor='middle' font-weight='bold' transform='rotate(-90,25,235)'>E°, V</text>\\n\\n  <line x1='120' y1='50' x2='120' y2='142.5' stroke='#000000' stroke-width='2' />\\n  <line x1='80' y1='142.5' x2='120' y2='142.5' stroke='#000000' stroke-width='2' />\\n  <line x1='120' y1='142.5' x2='145' y2='173.3' stroke='#000000' stroke-width='2' />\\n  <line x1='80' y1='173.3' x2='145' y2='173.3' stroke='#000000' stroke-width='2' />\\n  <line x1='145' y1='173.3' x2='440' y2='376' stroke='#000000' stroke-width='2' />\\n\\n  <text x='100' y='95' font-family='Arial' font-size='12' text-anchor='middle'>Hg²⁺</text>\\n  <text x='100' y='110' font-family='Arial' font-size='10' text-anchor='middle'>(aq)</text>\\n  \\n  <text x='100' y='162' font-family='Arial' font-size='14' text-anchor='middle' font-weight='bold'>X</text>\\n  \\n  <text x='310' y='125' font-family='Arial' font-size='12' text-anchor='middle'>HgO(s)</text>\\n  <text x='220' y='300' font-family='Arial' font-size='12' text-anchor='middle'>Hg(l)</text>\\n</svg>]]",
    "type": "multiple_choice",
    "options": [
      "$\\\\text{Hg}_2^{2+}(aq)$",
      "$\\\\text{Hg}_2\\\\text{O}(s)$",
      "$\\\\text{Hg(OH)}^+(aq)$",
      "$\\\\text{Hg(O)(OH)}(s)$"
    ],
    "answer": "A",
    "difficulty": 6,
  },
  {
    "id": "chem_ex4",
    "topic": "Chemical Equilibrium, Thermodynamics, Gas Laws",
    "question": "Solid calcium carbonate is in equilibrium with calcium oxide and carbon dioxide, with $K_{\\\\text{p}} = 0.12$ bar at $1200$ K.\\\\n\\\\n$$\\\\text{CaCO}_3(s) \\\\rightleftharpoons \\\\text{CaO}(s) + \\\\text{CO}_2(g) \\\\quad K_{\\\\text{eq}} = 0.12\\\\text{ at } 1200\\\\text{ K}$$\\\\n\\\\nA $1.00$ g sample of $\\\\text{CaCO}_3$ ($M = 100.09$) is placed in an evacuated piston which is allowed to equilibrate at $1200$ K. How will the pressure in the piston after equilibrium is attained depend on the volume of the piston?", "type": "multiple_choice",
    "options": [
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 300' width='100%' height='100%' style='background-color: #ffffff;'><text x='30' y='40' font-family='Arial' font-size='22' font-weight='bold'>(A)</text><line x1='80' y1='240' x2='280' y2='240' stroke='#000000' stroke-width='1.2' /><line x1='80' y1='50' x2='80' y2='240' stroke='#000000' stroke-width='1.2' /><line x1='280' y1='50' x2='280' y2='240' stroke='#cccccc' stroke-width='0.8' /><line x1='80' y1='50' x2='280' y2='50' stroke='#cccccc' stroke-width='0.8' /><line x1='75' y1='50' x2='80' y2='50' stroke='#000000' /><text x='70' y='54' font-family='Arial' font-size='12' text-anchor='end'>0.14</text><line x1='75' y1='77.1' x2='80' y2='77.1' stroke='#000000' /><text x='70' y='81.1' font-family='Arial' font-size='12' text-anchor='end'>0.12</text><line x1='75' y1='104.3' x2='80' y2='104.3' stroke='#000000' /><text x='70' y='108.3' font-family='Arial' font-size='12' text-anchor='end'>0.10</text><line x1='75' y1='131.4' x2='80' y2='131.4' stroke='#000000' /><text x='70' y='135.4' font-family='Arial' font-size='12' text-anchor='end'>0.08</text><line x1='75' y1='158.6' x2='80' y2='158.6' stroke='#000000' /><text x='70' y='162.6' font-family='Arial' font-size='12' text-anchor='end'>0.06</text><line x1='75' y1='185.7' x2='80' y2='185.7' stroke='#000000' /><text x='70' y='189.7' font-family='Arial' font-size='12' text-anchor='end'>0.04</text><line x1='75' y1='212.9' x2='80' y2='212.9' stroke='#000000' /><text x='70' y='216.9' font-family='Arial' font-size='12' text-anchor='end'>0.02</text><line x1='75' y1='240' x2='80' y2='240' stroke='#000000' /><text x='70' y='244' font-family='Arial' font-size='12' text-anchor='end'>0.00</text><line x1='80' y1='240' x2='80' y2='245' stroke='#000000' /><text x='80' y='260' font-family='Arial' font-size='12' text-anchor='middle'>0</text><line x1='130' y1='240' x2='130' y2='245' stroke='#cccccc' /><text x='130' y='260' font-family='Arial' font-size='12' text-anchor='middle'>5</text><line x1='180' y1='240' x2='180' y2='245' stroke='#cccccc' /><text x='180' y='260' font-family='Arial' font-size='12' text-anchor='middle'>10</text><line x1='230' y1='240' x2='230' y2='245' stroke='#cccccc' /><text x='230' y='260' font-family='Arial' font-size='12' text-anchor='middle'>15</text><line x1='280' y1='240' x2='280' y2='245' stroke='#000000' /><text x='280' y='260' font-family='Arial' font-size='12' text-anchor='middle'>20</text><text x='45' y='145' font-family='Arial' font-size='13' text-anchor='middle' transform='rotate(-90,45,145)'>P, bar</text><text x='180' y='280' font-family='Arial' font-size='13' text-anchor='middle'>V, L</text><path d='M 80,77.1 L 163.1,77.1 Q 200,120 280,172.1' fill='none' stroke='#000000' stroke-width='1.5' /></svg>",
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 300' width='100%' height='100%' style='background-color: #ffffff;'><text x='30' y='40' font-family='Arial' font-size='22' font-weight='bold'>(B)</text><line x1='80' y1='240' x2='280' y2='240' stroke='#000000' stroke-width='1.2' /><line x1='80' y1='50' x2='80' y2='240' stroke='#000000' stroke-width='1.2' /><line x1='280' y1='50' x2='280' y2='240' stroke='#cccccc' stroke-width='0.8' /><line x1='80' y1='50' x2='280' y2='50' stroke='#cccccc' stroke-width='0.8' /><line x1='75' y1='50' x2='80' y2='50' stroke='#000000' /><text x='70' y='54' font-family='Arial' font-size='12' text-anchor='end'>0.14</text><line x1='75' y1='77.1' x2='80' y2='77.1' stroke='#000000' /><text x='70' y='81.1' font-family='Arial' font-size='12' text-anchor='end'>0.12</text><line x1='75' y1='104.3' x2='80' y2='104.3' stroke='#000000' /><text x='70' y='108.3' font-family='Arial' font-size='12' text-anchor='end'>0.10</text><line x1='75' y1='131.4' x2='80' y2='131.4' stroke='#000000' /><text x='70' y='135.4' font-family='Arial' font-size='12' text-anchor='end'>0.08</text><line x1='75' y1='158.6' x2='80' y2='158.6' stroke='#000000' /><text x='70' y='162.6' font-family='Arial' font-size='12' text-anchor='end'>0.06</text><line x1='75' y1='185.7' x2='80' y2='185.7' stroke='#000000' /><text x='70' y='189.7' font-family='Arial' font-size='12' text-anchor='end'>0.04</text><line x1='75' y1='212.9' x2='80' y2='212.9' stroke='#000000' /><text x='70' y='216.9' font-family='Arial' font-size='12' text-anchor='end'>0.02</text><line x1='75' y1='240' x2='80' y2='240' stroke='#000000' /><text x='70' y='244' font-family='Arial' font-size='12' text-anchor='end'>0.00</text><line x1='80' y1='240' x2='80' y2='245' stroke='#000000' /><text x='80' y='260' font-family='Arial' font-size='12' text-anchor='middle'>0</text><line x1='130' y1='240' x2='130' y2='245' stroke='#cccccc' /><text x='130' y='260' font-family='Arial' font-size='12' text-anchor='middle'>5</text><line x1='180' y1='240' x2='180' y2='245' stroke='#cccccc' /><text x='180' y='260' font-family='Arial' font-size='12' text-anchor='middle'>10</text><line x1='230' y1='240' x2='230' y2='245' stroke='#cccccc' /><text x='230' y='260' font-family='Arial' font-size='12' text-anchor='middle'>15</text><line x1='280' y1='240' x2='280' y2='245' stroke='#000000' /><text x='280' y='260' font-family='Arial' font-size='12' text-anchor='middle'>20</text><text x='45' y='145' font-family='Arial' font-size='13' text-anchor='middle' transform='rotate(-90,45,145)'>P, bar</text><text x='180' y='280' font-family='Arial' font-size='13' text-anchor='middle'>V, L</text><path d='M 80,240 L 163.1,77.1 L 280,77.1' fill='none' stroke='#000000' stroke-width='1.5' /></svg>",
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 300' width='100%' height='100%' style='background-color: #ffffff;'><text x='30' y='40' font-family='Arial' font-size='22' font-weight='bold'>(C)</text><line x1='80' y1='240' x2='280' y2='240' stroke='#000000' stroke-width='1.2' /><line x1='80' y1='50' x2='80' y2='240' stroke='#000000' stroke-width='1.2' /><line x1='280' y1='50' x2='280' y2='240' stroke='#cccccc' stroke-width='0.8' /><line x1='80' y1='50' x2='280' y2='50' stroke='#cccccc' stroke-width='0.8' /><line x1='75' y1='50' x2='80' y2='50' stroke='#000000' /><text x='70' y='54' font-family='Arial' font-size='12' text-anchor='end'>0.14</text><line x1='75' y1='77.1' x2='80' y2='77.1' stroke='#000000' /><text x='70' y='81.1' font-family='Arial' font-size='12' text-anchor='end'>0.12</text><line x1='75' y1='104.3' x2='80' y2='104.3' stroke='#000000' /><text x='70' y='108.3' font-family='Arial' font-size='12' text-anchor='end'>0.10</text><line x1='75' y1='131.4' x2='80' y2='131.4' stroke='#000000' /><text x='70' y='135.4' font-family='Arial' font-size='12' text-anchor='end'>0.08</text><line x1='75' y1='158.6' x2='80' y2='158.6' stroke='#000000' /><text x='70' y='162.6' font-family='Arial' font-size='12' text-anchor='end'>0.06</text><line x1='75' y1='185.7' x2='80' y2='185.7' stroke='#000000' /><text x='70' y='189.7' font-family='Arial' font-size='12' text-anchor='end'>0.04</text><line x1='75' y1='212.9' x2='80' y2='212.9' stroke='#000000' /><text x='70' y='216.9' font-family='Arial' font-size='12' text-anchor='end'>0.02</text><line x1='75' y1='240' x2='80' y2='240' stroke='#000000' /><text x='70' y='244' font-family='Arial' font-size='12' text-anchor='end'>0.00</text><line x1='80' y1='240' x2='80' y2='245' stroke='#000000' /><text x='80' y='260' font-family='Arial' font-size='12' text-anchor='middle'>0</text><line x1='130' y1='240' x2='130' y2='245' stroke='#cccccc' /><text x='130' y='260' font-family='Arial' font-size='12' text-anchor='middle'>5</text><line x1='180' y1='240' x2='180' y2='245' stroke='#cccccc' /><text x='180' y='260' font-family='Arial' font-size='12' text-anchor='middle'>10</text><line x1='230' y1='240' x2='230' y2='245' stroke='#cccccc' /><text x='230' y='260' font-family='Arial' font-size='12' text-anchor='middle'>15</text><line x1='280' y1='240' x2='280' y2='245' stroke='#000000' /><text x='280' y='260' font-family='Arial' font-size='12' text-anchor='middle'>20</text><text x='45' y='145' font-family='Arial' font-size='13' text-anchor='middle' transform='rotate(-90,45,145)'>P, bar</text><text x='180' y='280' font-family='Arial' font-size='13' text-anchor='middle'>V, L</text><line x1='80' y1='77.1' x2='280' y2='77.1' stroke='#000000' stroke-width='1.5' /></svg>",
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 300' width='100%' height='100%' style='background-color: #ffffff;'><text x='30' y='40' font-family='Arial' font-size='22' font-weight='bold'>(D)</text><line x1='80' y1='240' x2='280' y2='240' stroke='#000000' stroke-width='1.2' /><line x1='80' y1='50' x2='80' y2='240' stroke='#000000' stroke-width='1.2' /><line x1='280' y1='50' x2='280' y2='240' stroke='#cccccc' stroke-width='0.8' /><line x1='80' y1='50' x2='280' y2='50' stroke='#cccccc' stroke-width='0.8' /><line x1='75' y1='50' x2='80' y2='50' stroke='#000000' /><text x='70' y='54' font-family='Arial' font-size='12' text-anchor='end'>0.14</text><line x1='75' y1='77.1' x2='80' y2='77.1' stroke='#000000' /><text x='70' y='81.1' font-family='Arial' font-size='12' text-anchor='end'>0.12</text><line x1='75' y1='104.3' x2='80' y2='104.3' stroke='#000000' /><text x='70' y='108.3' font-family='Arial' font-size='12' text-anchor='end'>0.10</text><line x1='75' y1='131.4' x2='80' y2='131.4' stroke='#000000' /><text x='70' y='135.4' font-family='Arial' font-size='12' text-anchor='end'>0.08</text><line x1='75' y1='158.6' x2='80' y2='158.6' stroke='#000000' /><text x='70' y='162.6' font-family='Arial' font-size='12' text-anchor='end'>0.06</text><line x1='75' y1='185.7' x2='80' y2='185.7' stroke='#000000' /><text x='70' y='189.7' font-family='Arial' font-size='12' text-anchor='end'>0.04</text><line x1='75' y1='212.9' x2='80' y2='212.9' stroke='#000000' /><text x='70' y='216.9' font-family='Arial' font-size='12' text-anchor='end'>0.02</text><line x1='75' y1='240' x2='80' y2='240' stroke='#000000' /><text x='70' y='244' font-family='Arial' font-size='12' text-anchor='end'>0.00</text><line x1='80' y1='240' x2='80' y2='245' stroke='#000000' /><text x='80' y='260' font-family='Arial' font-size='12' text-anchor='middle'>0</text><line x1='130' y1='240' x2='130' y2='245' stroke='#cccccc' /><text x='130' y='260' font-family='Arial' font-size='12' text-anchor='middle'>5</text><line x1='180' y1='240' x2='180' y2='245' stroke='#cccccc' /><text x='180' y='260' font-family='Arial' font-size='12' text-anchor='middle'>10</text><line x1='230' y1='240' x2='230' y2='245' stroke='#cccccc' /><text x='230' y='260' font-family='Arial' font-size='12' text-anchor='middle'>15</text><line x1='280' y1='240' x2='280' y2='245' stroke='#000000' /><text x='280' y='260' font-family='Arial' font-size='12' text-anchor='middle'>20</text><text x='45' y='145' font-family='Arial' font-size='13' text-anchor='middle' transform='rotate(-90,45,145)'>P, bar</text><text x='180' y='280' font-family='Arial' font-size='13' text-anchor='middle'>V, L</text><path d='M 80,240 L 163.1,82 Q 200,120 280,172.1' fill='none' stroke='#000000' stroke-width='1.5' /></svg>"
    ],
    "answer": "A",
    "difficulty": 5,
  },
  {
    "id": "chem_ex5",
    "topic": "Chemical Equilibrium, Solubility, Acids & Bases",
    "question": "A solution initially is $0.10$ M in both $\\\\ce{Cd^{2+}}$ and $\\\\ce{Tl^+}$ and is kept saturated with hydrogen sulfide gas ($[\\\\ce{H2S}] = 0.1$ M). In what pH range will one of the metal ions be precipitated quantitatively ($> 99.9\\\\%$) while the other remains completely in solution?\\\\n\\\\n$$K_{\\\\text{sp}}\\\\text{ of CdS} = 1.0 \\\\times 10^{-27} \\\\quad K_{\\\\text{sp}}\\\\text{ of Tl}_2\\\\text{S} = 6.0 \\\\times 10^{-22}$$\\\\n$$K_{\\\\text{a}}\\\\text{ of H}_2\\\\text{S} = 8.9 \\\\times 10^{-8} \\\\quad K_{\\\\text{a}}\\\\text{ of HS}^- = 1.0 \\\\times 10^{-19}$$",
    "type": "multiple_choice",
    "options": [
      "Between $0.5$ and $6.8$",
      "Between $2.0$ and $3.9$",
      "Between $4.0$ and $6.8$",
      "There is no pH at which this is possible."
    ],
    "answer": "B",
    "difficulty": 5,
  },
  {
    "id": "chem_ex6",
    "topic": "Inorganic Chemistry, Periodicity & Bonding",
    "question": "The melting points of the group 6 elements increase in the order Cr ($2180\\ ^\\circ\\text{C}$) < Mo ($2896\\ ^\\circ\\text{C}$) < W ($3695\\ ^\\circ\\text{C}$). Which is the best explanation for this trend?",
    "type": "multiple_choice",
    "options": [
      "The degree of covalency increases down the group.",
      "The partial positive charge on the metal atoms in the lattice increases down the group.",
      "The valence orbitals become increasingly contracted down the group due to relativistic effects.",
      "The packing density of the metals increases down the group as the lattice changes from simple cubic to body-centered cubic to face-centered cubic."
    ],
    "answer": "A",
    "difficulty": 4,
  },
  {
    "id": "chem_ex7",
    "topic": "Inorganic Chemistry, Oxidation-Reduction, Periodicity",
    "question": "Which statements regarding the standard reduction potentials of the group 14 element dioxides $\\\\ce{XO2}$ are correct?\\\\n\\\\n$$\\\\ce{XO2} + 4\\\\text{ H}^+(aq) + 4\\\\text{ e}^- \\\\rightarrow \\\\text{X}(s) + 2\\\\text{ H2O}(l) \\\\quad E^\\\\circ(\\\\text{X})$$\\\\n\\\\nI. $E^\\\\circ(\\\\text{C}) < E^\\\\circ(\\\\text{Si})$ \\\\quad\\quad\\quad II. $E^\\\\circ(\\\\text{Sn}) < E^\\\\circ(\\\\text{Pb})$",
    "type": "multiple_choice",
    "options": [
      "I only",
      "II only",
      "Both I and II",
      "Neither I nor II"
    ],
    "answer": "B",
    "difficulty": 5,
  },
  {
    "id": "chem_ex8",
    "topic": "Thermodynamics, Chemical Equilibrium, Inorganic Chemistry",
    "question": "Lanthanum pentanickel, $\\\\ce{LaNi5}(s)$, is under consideration for solid-state hydrogen storage. $\\\\ce{LaNi5}(s)$ is a conductive metallic crystal, and it forms hydrides in two phases:\\\\n\\\\n$\\\\bullet$ an $\\\\alpha$ phase $\\\\alpha\\\\text{-LaNi5H}_x(s)$ observed at lower $\\\\ce{H2}$ pressure, characterized as a solid-state solution\\\\n$\\\\bullet$ a $\\\\beta$ phase $\\\\beta\\\\text{-LaNi5H}_{6.39}(s)$ observed at higher $\\\\ce{H2}$ pressure, characterized by metal-hydrogen bonding\\\\n\\\\n$$\\\\begin{array}{|c|c|c||c|c|c|} \\\\hline \\\\text{Species} & \\\\Delta H^\\\\circ\\\\textsubscript{f, kJ mol}^{-1} & S^\\\\circ\\\\text{, J mol}^{-1}\\\\text{ K}^{-1} & \\\\text{Species} & \\\\Delta H^\\\\circ\\\\textsubscript{f, kJ mol}^{-1} & S^\\\\circ\\\\text{, J mol}^{-1}\\\\text{ K}^{-1} \\\\ \\\\hline \\\\ce{H2}(g) & 0 & 130.7 & \\\\ce{LaNi5}(s) & -162 & 217 \\\\ \\\\hline \\\\ce{Ni}(s) & 0 & 29.9 & \\\\alpha\\\\text{-LaNi5H}_x(s) & -186 & 223 \\\\ \\\\hline \\\\ce{La}(s) & 0 & 56.9 & \\\\beta\\\\text{-LaNi5H}_{6.39}(s) & ? & ? \\\\ \\\\hline \\\\end{array}$$\\\\n\\\\na. Calculate $\\\\Delta G^\\\\circ\\\\textsubscript{f}$ of $\\\\ce{LaNi5}(s)$ at 298 K.\\\\n\\\\n$\\\\ce{LaNi5}(s)$ is placed in vacuum chambers, one at $30.0\\ ^\\\\circ\\\\text{C}$ and one at $50.0\\ ^\\\\circ\\\\text{C}$. Pure $\\\\ce{H2}(g)$ is added to each chamber, and the weight-percent hydrogenation of $\\\\ce{LaNi5}(s)$ is recorded as a function of pressure.\\\\n\\\\nb. Show that the maximum degree of hydrogenation $x$ for $\\\\alpha\\\\text{-LaNi5H}_x(s)$ is approximately $0.43$.\\\\n\\\\nc. Calculate $\\\\Delta G^\\\\circ\\\\textsubscript{rxn}$ at $30\\ ^\\\\circ\\\\text{C}$ and at $50\\ ^\\\\circ\\\\text{C}$ for the hydrogenation of the $\\\\alpha$ phase to the $\\\\beta$ phase.\\\\n\\\\nd. Calculate $\\\\Delta H^\\\\circ\\\\textsubscript{f}$ and $S^\\\\circ$ for $\\\\beta\\\\text{-LaNi5H}_{6.39}(s)$.",
    "type": "free_response",
    "options": [],
    "answer": "",
    "difficulty": 6,
  },
  {
    "id": "chem_ex9",
    "topic": "Chemical Equilibrium, Solubility, Complex Ions",
    "question": "Silver iodide is a sparingly soluble salt. Silver also forms a soluble complex ion, $\\\\ce{AgI2-}$, with iodide ion. A series of solutions saturated with solid $\\\\ce{AgI}$ and containing various concentrations of dissolved iodide ion are prepared, and the total concentration of silver dissolved in each solution is measured. Which graph of the logarithm of the total silver concentration as a function of the logarithm of the iodide concentration best represents the results of this experiment?\\\\n\\\\nOption (A)\\\\n[[SVG: <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 320' width='100%' height='100%' style='background-color: #ffffff;'><text x='35' y='45' font-family='Arial' font-size='22' font-weight='bold'>(A)</text><line x1='80' y1='50' x2='280' y2='50' stroke='#cccccc' stroke-width='0.5' /><line x1='80' y1='88.3' x2='280' y2='88.3' stroke='#cccccc' stroke-width='0.5' /><line x1='80' y1='126.7' x2='280' y2='126.7' stroke='#cccccc' stroke-width='0.5' /><line x1='80' y1='165' x2='280' y2='165' stroke='#cccccc' stroke-width='0.5' /><line x1='80' y1='203.3' x2='280' y2='203.3' stroke='#cccccc' stroke-width='0.5' /><line x1='80' y1='241.7' x2='280' y2='241.7' stroke='#cccccc' stroke-width='0.5' /><line x1='80' y1='280' x2='280' y2='280' stroke='#cccccc' stroke-width='0.5' /><line x1='80' y1='50' x2='80' y2='280' stroke='#cccccc' stroke-width='0.5' /><line x1='113.3' y1='50' x2='113.3' y2='280' stroke='#cccccc' stroke-width='0.5' /><line x1='146.7' y1='50' x2='146.7' y2='280' stroke='#cccccc' stroke-width='0.5' /><line x1='180' y1='50' x2='180' y2='280' stroke='#cccccc' stroke-width='0.5' /><line x1='213.3' y1='50' x2='213.3' y2='280' stroke='#cccccc' stroke-width='0.5' /><line x1='246.7' y1='50' x2='246.7' y2='280' stroke='#cccccc' stroke-width='0.5' /><line x1='280' y1='50' x2='280' y2='280' stroke='#cccccc' stroke-width='0.5' /><rect x='80' y='50' width='200' height='230' fill='none' stroke='#000000' stroke-width='0.8' /><text x='73' y='54' font-family='Arial' font-size='10' text-anchor='end'>-6</text><text x='73' y='92.3' font-family='Arial' font-size='10' text-anchor='end'>-7</text><text x='73' y='130.7' font-family='Arial' font-size='10' text-anchor='end'>-8</text><text x='73' y='169' font-family='Arial' font-size='10' text-anchor='end'>-9</text><text x='73' y='207.3' font-family='Arial' font-size='10' text-anchor='end'>-10</text><text x='73' y='245.7' font-family='Arial' font-size='10' text-anchor='end'>-11</text><text x='73' y='284' font-family='Arial' font-size='10' text-anchor='end'>-12</text><text x='80' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-8</text><text x='113.3' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-7</text><text x='146.7' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-6</text><text x='180' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-5</text><text x='213.3' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-4</text><text x='246.7' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-3</text><text x='280' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-2</text><text x='45' y='165' font-family='Arial' font-size='11' text-anchor='middle' transform='rotate(-90,45,165)'>log([Ag<sub>total</sub>])</text><text x='180' y='312' font-family='Arial' font-size='11' text-anchor='middle'>log([I⁻])</text><path d='M 80,126.7 Q 160,220 280,280' fill='none' stroke='#000000' stroke-width='1.5' /></svg>]]\\\\n\\\\nOption (B)\\\\n[[SVG: <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 320' width='100%' height='100%' style='background-color: #ffffff;'><text x='35' y='45' font-family='Arial' font-size='22' font-weight='bold'>(B)</text><rect x='80' y='50' width='200' height='230' fill='none' stroke='#000000' stroke-width='0.8' /><line x1='80' y1='88.3' x2='280' y2='88.3' stroke='#cccccc' stroke-width='0.5' /><line x1='80' y1='126.7' x2='280' y2='126.7' stroke='#cccccc' stroke-width='0.5' /><line x1='80' y1='165' x2='280' y2='165' stroke='#cccccc' stroke-width='0.5' /><line x1='80' y1='203.3' x2='280' y2='203.3' stroke='#cccccc' stroke-width='0.5' /><line x1='80' y1='241.7' x2='280' y2='241.7' stroke='#cccccc' stroke-width='0.5' /><line x1='113.3' y1='50' x2='113.3' y2='280' stroke='#cccccc' stroke-width='0.5' /><line x1='146.7' y1='50' x2='146.7' y2='280' stroke='#cccccc' stroke-width='0.5' /><line x1='180' y1='50' x2='180' y2='280' stroke='#cccccc' stroke-width='0.5' /><line x1='213.3' y1='50' x2='213.3' y2='280' stroke='#cccccc' stroke-width='0.5' /><line x1='246.7' y1='50' x2='246.7' y2='280' stroke='#cccccc' stroke-width='0.5' /><text x='73' y='54' font-family='Arial' font-size='10' text-anchor='end'>-6</text><text x='73' y='92.3' font-family='Arial' font-size='10' text-anchor='end'>-7</text><text x='73' y='130.7' font-family='Arial' font-size='10' text-anchor='end'>-8</text><text x='73' y='169' font-family='Arial' font-size='10' text-anchor='end'>-9</text><text x='73' y='207.3' font-family='Arial' font-size='10' text-anchor='end'>-10</text><text x='73' y='245.7' font-family='Arial' font-size='10' text-anchor='end'>-11</text><text x='73' y='284' font-family='Arial' font-size='10' text-anchor='end'>-12</text><text x='80' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-8</text><text x='113.3' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-7</text><text x='146.7' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-6</text><text x='180' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-5</text><text x='213.3' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-4</text><text x='246.7' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-3</text><text x='280' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-2</text><text x='45' y='165' font-family='Arial' font-size='11' text-anchor='middle' transform='rotate(-90,45,165)'>log([Ag<sub>total</sub>])</text><text x='180' y='312' font-family='Arial' font-size='11' text-anchor='middle'>log([I⁻])</text><path d='M 80,126.7 Q 130,215 190,215 L 280,215' fill='none' stroke='#000000' stroke-width='1.5' /></svg>]]\\\\n\\\\nOption (C)\\\\n[[SVG: <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 320' width='100%' height='100%' style='background-color: #ffffff;'><text x='35' y='45' font-family='Arial' font-size='22' font-weight='bold'>(C)</text><rect x='80' y='50' width='200' height='230' fill='none' stroke='#000000' stroke-width='0.8' /><line x1='80' y1='88.3' x2='280' y2='88.3' stroke='#cccccc' stroke-width='0.5' /><line x1='80' y1='126.7' x2='280' y2='126.7' stroke='#cccccc' stroke-width='0.5' /><line x1='80' y1='165' x2='280' y2='165' stroke='#cccccc' stroke-width='0.5' /><line x1='80' y1='203.3' x2='280' y2='203.3' stroke='#cccccc' stroke-width='0.5' /><line x1='80' y1='241.7' x2='280' y2='241.7' stroke='#cccccc' stroke-width='0.5' /><line x1='113.3' y1='50' x2='113.3' y2='280' stroke='#cccccc' stroke-width='0.5' /><line x1='146.7' y1='50' x2='146.7' y2='280' stroke='#cccccc' stroke-width='0.5' /><line x1='180' y1='50' x2='180' y2='280' stroke='#cccccc' stroke-width='0.5' /><line x1='213.3' y1='50' x2='213.3' y2='280' stroke='#cccccc' stroke-width='0.5' /><line x1='246.7' y1='50' x2='246.7' y2='280' stroke='#cccccc' stroke-width='0.5' /><text x='73' y='54' font-family='Arial' font-size='10' text-anchor='end'>-6</text><text x='73' y='92.3' font-family='Arial' font-size='10' text-anchor='end'>-7</text><text x='73' y='130.7' font-family='Arial' font-size='10' text-anchor='end'>-8</text><text x='73' y='169' font-family='Arial' font-size='10' text-anchor='end'>-9</text><text x='73' y='207.3' font-family='Arial' font-size='10' text-anchor='end'>-10</text><text x='73' y='245.7' font-family='Arial' font-size='10' text-anchor='end'>-11</text><text x='73' y='284' font-family='Arial' font-size='10' text-anchor='end'>-12</text><text x='80' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-8</text><text x='113.3' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-7</text><text x='146.7' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-6</text><text x='180' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-5</text><text x='213.3' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-4</text><text x='246.7' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-3</text><text x='280' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-2</text><text x='45' y='165' font-family='Arial' font-size='11' text-anchor='middle' transform='rotate(-90,45,165)'>log([Ag<sub>total</sub>])</text><text x='180' y='312' font-family='Arial' font-size='11' text-anchor='middle'>log([I⁻])</text><path d='M 80,126.7 C 110,180 140,215 165,215 C 190,215 230,175 280,148' fill='none' stroke='#000000' stroke-width='1.5' /></svg>]]",
    "type": "multiple_choice",
    "options": ["A", "B", "C", "D"],
    "answer": "C",
    "difficulty": 5,
  },
  {
    "id": "chem_ex10",
    "topic": "Electrochemistry, Oxidation-Reduction",
    "question": "The cathodic compartment of an electrolytic cell is $0.100$ M in the ions $\\\\ce{Fe(CN)6^{3-}}$ and $\\\\ce{Cu^{2+}}$ and has a chemically inert electrode. As current is passed through the cell, which best describes how $\\\\ce{Cu}(s)$ is deposited on the electrode?\\\\n\\\\n$$\\\\begin{array}{|c|c|} \\\\hline \\\\text{Half-reaction} & E^\\\\circ\\\\text{, V} \\\\ \\\\hline \\\\ce{Cu^{2+}}(aq) + 2e^- \\\\rightarrow \\\\ce{Cu}(s) & +0.337 \\\\ \\\\hline \\\\ce{Fe(CN)6^{3-}} + e^- \\\\rightarrow \\\\ce{Fe(CN)6^{4-}} & +0.370 \\\\ \\\\hline \\\\end{array}$$",
    "type": "multiple_choice",
    "options": [
      "Copper is deposited immediately, but at a rate much lower than 1 mol per 193000 C. As the electrolysis proceeds, the rate of copper deposition increases.",
      "Copper is deposited immediately, at a rate close to 1 mol per 193000 C. As the electrolysis proceeds, the rate of copper deposition decreases.",
      "No copper is deposited for a certain length of time, then copper deposition begins.",
      "Copper is deposited at a rate of 1 mol per 193000 C for a certain length of time, then the rate of copper deposition decreases."
    ],
    "answer": "C",
    "difficulty": 6,
  },
  {
    "id": "chem_ex11",
    "topic": "Chemical Equilibrium, Acids & Bases",
    "question": "Which statement best describes the differences between a $0.1$ M solution of ammonium bicarbonate, $\\\\ce{NH4(HCO3)}$, and a $0.1$ M solution of ammonium carbonate, $\\\\ce{(NH4)2CO3}$?",
    "type": "multiple_choice",
    "options": [
      "The pH of the ammonium bicarbonate solution is lower because bicarbonate is a weaker base than carbonate.",
      "The pH of the ammonium bicarbonate solution is lower because both ammonium ion and bicarbonate ion can act as Brønsted acids.",
      "The pH of the ammonium bicarbonate solution is higher because it has only half the ammonium ion concentration of the ammonium carbonate solution.",
      "The pH of the ammonium bicarbonate solution is higher because it contains only two-thirds as many total ions as the ammonium carbonate solution."
    ],
    "answer": "A",
    "difficulty": 4,
  },
  {
    "id": "chem_ex12",
    "topic": "Stoichiometry & Hydrocarbons",
    "question": "A $4.41$ g sample of a gaseous hydrocarbon M is completely combusted in excess oxygen to produce $13.20$ g of \\\\ce{CO_2} and $7.21$ g of \\\\ce{H_2O}. Determine the molecular formula of M if its density at STP is $1.97$ g/L.",
    "type": "multiple_choice",
    "options": ["\\\\ce{CH_4}", "\\\\ce{C_2H_6}", "\\\\ce{C_3H_8}", "\\\\ce{C_4H_{10}}"],
    "answer": "C",
    "difficulty": 5,
  },
  {
    "id": "chem_ex13",
    "topic": "Electrochemistry",
    "question": "A galvanic cell consists of a silver electrode in $1.0$ M \\\\ce{AgNO_3} and a copper electrode in $1.0$ M \\\\ce{Cu(NO_3)_2}. If the cell operates at $25$ °C under a constant current of $2.0$ A for $45$ minutes, calculate the change in mass of the copper electrode. ($E^\\circ(\\\\ce{Ag^+/Ag}) = +0.80$ V, $E^\\circ(\\\\ce{Cu^{2+}/Cu}) = +0.34$ V, $F = 96485$ C/mol).",
    "type": "short_answer",
    "answer": "1.78 g",
    "difficulty": 4,
  },
  {
    "id": "chem_ex14",
    "topic": "Thermodynamics & Gas Laws",
    "question": "A horizontal, adiabatic cylinder of total volume $4.0$ L is divided into two compartments by a frictionless, moveable adiabatic piston. Compartment A contains $1.0$ mol of an ideal monoatomic gas at an initial pressure of $3.0$ atm, and compartment B contains $1.0$ mol of the same gas at $1.0$ atm. If $450$ J of heat is slowly supplied to the gas in compartment A via an internal resistive heater, calculate the final equilibrium volume of compartment A.",
    "type": "free_response",
    "answer": "",
    "difficulty": 7,
  }
];

const chem_syllabus = `
# USNCO Learning Objectives

---

## T1: Stoichiometry/Solutions

### Fundamental Concepts
* **T1.1 (SL):** Concept of mole, Avogadro's constant, number of particles
* **T1.2 (SL):** Counting by weighing (mass, moles, molar mass, atomic mass)
* **T1.3 (SL):** Mass percent / percent composition, empirical formula, and molecular formula
* **T1.4 (SL):** Units of measurement, uncertainty, and significant figures in calculations

### Chemical Calculations
* **T1.5 (SL):** Stoichiometry based on balanced equations (stoichiometric calculations)
* **T1.6 (SL):** Molarity of ions after mixing, dilution, and reactions
* **T1.7 (SL):** Solution stoichiometry and composition of solutions
* **T1.8 (SL):** Gravimetric analysis stoichiometry
* **T1.9 (SL):** Gas stoichiometry and stoichiometric calculations involving reacting gases
* **T1.10 (SL):** Limiting reactant, yield and percent yield
* **T1.11 (SL):** Impurity, combustion, and mixture analysis

### Solution Properties
* **T1.12 (SL):** Mass percentage, mole fraction, molarity of solutions and their conversions
* **T1.13 (SL):** Molality and concept of colligative properties of non-electrolyte and electrolyte solutions
* **T1.14 (SL):** Vapor pressure of solutions with nonvolatile solutes (Raoult's Law), binary liquid mixtures
* **T1.15 (SL):** Boiling point elevation, freezing point depression, and osmotic pressure
* **T1.16 (SL):** Van't Hoff factor for strong and weak electrolytes

### Advanced Stoichiometry
* **T1.17 (HL):** Complex stoichiometry with unknown elements, compositions, or alloys
* **T1.18 (HL):** Stoichiometry based on graph analysis

---

## T2: Descriptive/Laboratory & Inorganic

### Chemical Properties & Trends
* **T2.1 (SL):** Colors of flame tests and common ions, and elemental abundance
* **T2.2 (SL):** Solubility rules, common precipitates, solubility trends/exceptions
* **T2.3 (SL):** Heat of common reactions, dissolution, and dilution
* **T2.4 (SL):** Reactivity trends of representative metals/nonmetals (Groups 1A-8A), diagonal relationships, inert-pair effect, first-row anomaly, amphoteric oxides/hydroxides, thermal stability of hydrides/oxides, preparation of elements, and metal-ammonia solutions
* **T2.5 (SL):** Acid-base properties of electrolytes including salts
* **T2.6 (SL):** Typical gas evolution and redox reactions

### Laboratory Techniques & Analysis
* **T2.7 (SL):** Volumetric glassware (usage, operation, calibration, precision) and pipette/bulb usage
* **T2.8 (SL):** Preparation and dilution of standard solutions (molarity and molality)
* **T2.9 (SL):** Common lab techniques (filtration, gravity/vacuum filtration, simple/fractional distillation, recrystallization, titration, paper/thin-layer chromatography, and gravimetric analysis)
* **T2.10 (SL):** UV-Vis spectroscopy and Beer's Law (blank, cuvette, absorbance, calibration curve, complementary colors/color wheel, applications, and error analysis)
* **T2.11 (SL):** Error analysis in titrations and other lab techniques
* **T2.12 (SL):** Instrumental analysis concepts (IR, MS, NMR, XRD)

### Transition Metals & Coordination Chemistry
* **T2.13 (HL):** Crystal Field Theory (CFT) and splitting of d orbitals in octahedral, tetrahedral, and square planar geometries
* **T2.14 (HL):** Application of CFT in explaining colors, magnetic properties (high spin vs low spin, magnetic susceptibility), and geometry of complex ions (tetrahedral vs square planar, d8 systems)
* **T2.15 (HL):** Transition metal survey: electronic configurations, oxidation states, valence-state electronegativity, densities, 18-electron rule, and lanthanide/3d contractions
* **T2.16 (HL):** Hard and Soft Acid-Base (HSAB) theory and its applications in explaining sulfide solubilities and qualitative inorganic analysis

### Advanced Laboratory & Titrations
* **T2.17 (HL):** Organic laboratory techniques and glassware (melting point measurement, acid-base extraction, reflux, recrystallization)
* **T2.18 (HL):** Direct and indirect iodometry (titration of Vitamin C, thiosulfate, $SO_3^{2-}$, and copper alloys), standardization of $S_2O_3^{2-}$ using $KIO_3$ or $I_2/I_3^-$, and related advanced error analysis

---

## T3: IMFs & States of Matter

### Intermolecular Forces
* **T3.1 (SL):** Intermolecular forces (IMFs) vs intramolecular forces (chemical bonds)
* **T3.2 (SL):** London dispersion forces, dipole-dipole forces, hydrogen bonding (intermolecular and intramolecular), ion-dipole forces, and their relative strengths
* **T3.3 (SL):** Relationship between IMFs and physical properties (boiling point, solubility, vapor pressure, viscosity, surface tension, etc.)
* **T3.4 (SL):** Comparison of IMFs within the same type or across isomers (molecular shape dependence)
* **T3.5 (HL):** Semi-quantitative IMF comparisons (e.g., $CH_3Cl$ vs $CCl_4$)

### Phase Changes & Liquids
* **T3.6 (SL):** States of matter, kinetic energy vs IMFs, heating and cooling curves
* **T3.7 (SL):** Phase diagrams (triple points, sublimation, supercritical fluids/critical point, thermal expansion/contraction, and density-slope relationship of solid-liquid boundaries)
* **T3.8 (SL):** Concept of vapor pressure and normal boiling point
* **T3.9 (HL):** Dynamic equilibrium and Clausius-Clapeyron equation ($\ln P$ vs $1/T$ plots)
* **T3.10 (HL):** Vapor pressure vs volume relationship and related graph analysis

### Gases
* **T3.11 (SL):** Kinetic molecular theory, distribution of molecular speeds (Maxwell-Boltzmann distribution under varying $T$ and mass), Graham's Law of effusion and diffusion
* **T3.12 (SL):** Ideal gases, conditions for ideality, ideal gas law ($PV=nRT$)
* **T3.13 (SL):** Gas density and molar mass ($D = \frac{MP}{RT}$), molar volume at STP, Dalton's Law of partial pressures, and atmospheric chemistry
* **T3.14 (HL):** Real gases, deviation from ideality, van der Waals equation, compression factors, and liquefaction

### Solids & Crystal Structures
* **T3.15 (SL):** Types of solids (ionic, metallic, molecular, covalent network) and their characteristic properties (e.g., diamond vs graphite, $CO_2$ vs $SiO_2$)
* **T3.16 (SL):** Concept of lattice energy, comparison of lattice energy based on ionic charge and size, and the Born-Haber cycle
* **T3.17 (SL):** Unit cells: simple cubic, body-centered cubic, face-centered cubic (cubic close packing), packing efficiency, coordination number, and density calculations ($D = \frac{ZM}{N_A V}$)
* **T3.18 (HL):** Hexagonal close packing (HCP) unit cells
* **T3.19 (HL):** Bragg equation for X-ray diffraction
* **T3.20 (HL):** Molecular orbital band theory: conductors, semiconductors (n-type and p-type doping), insulators, and ionic liquids

---

## T4: Thermodynamics

### Calorimetry & The First Law
* **T4.1 (SL):** First Law of Thermodynamics ($\Delta U = q + w$), sign conventions for heat and work
* **T4.2 (SL):** Calorimetry, heat capacity, and heat calculations ($q = cm\Delta T$)
* **T4.3 (SL):** Coffee-cup (constant pressure) vs bomb (constant volume) calorimeters
* **T4.4 (HL):** Internal energy vs enthalpy ($H = U + PV$), expansion/volume work ($w = -p\Delta V = -\Delta n_{gas}RT$), and heat at constant pressure vs constant volume ($q_P$ vs $q_V$)

### Enthalpy
* **T4.5 (SL):** Enthalpies of physical and chemical changes (standard states, thermochemical equations, heating curves)
* **T4.6 (SL):** Enthalpies of formation, standard enthalpy of formation for allotropes
* **T4.7 (SL):** Hess's Law and standard enthalpy calculations using enthalpies of formation or combustion
* **T4.8 (SL):** Estimation of reaction enthalpy using bond energies
* **T4.9 (HL):** Temperature dependence of $\Delta H$ (Kirchhoff's law / heat capacity differences)

### Entropy & The Second/Third Laws
* **T4.10 (SL):** Concept of entropy, predicting signs of $\Delta S$ qualitatively based on states of matter, positional and thermal disorder
* **T4.11 (HL):** Second Law of Thermodynamics ($\Delta S_{univ} > 0$ for spontaneous processes) and the Third Law (standard molar entropies, absolute zero)
* **T4.12 (HL):** Entropy changes in reactions involving ionic hydration

### Gibbs Free Energy & Equilibrium
* **T4.13 (SL):** Gibbs free energy, standard Gibbs free energy of formation, and spontaneity calculations ($\Delta G^\circ = \Delta H^\circ - T\Delta S^\circ$) with temperature dependence analysis
* **T4.14 (SL):** Thermodynamic vs kinetic control (stability)
* **T4.15 (HL):** Relationship between standard free energy and equilibrium constant ($\Delta G^\circ = -RT \ln K$) and free energy at non-standard conditions ($\Delta G = \Delta G^\circ + RT \ln Q$)
* **T4.16 (HL):** Free energy and maximum non-$PV$ work
* **T4.17 (HL):** Temperature dependence of equilibrium constants via van 't Hoff equation and graphical analysis ($\ln K$ vs $1/T$)

---

## T5: Kinetics

### Reaction Rates & Empirical Rate Laws
* **T5.1 (SL):** Reaction rates, relative rates, average vs instantaneous rates, and initial rates method
* **T5.2 (SL):** Rate laws, reaction orders, rate constant ($k$), and its units
* **T5.3 (SL):** Integrated rate laws (zeroth, first, and second order), linear plots, half-life calculations, and nuclear/radioactive decay kinetics

### Activation Energy & Temperature Dependence
* **T5.4 (SL):** Collision model (effective collision, orientation, and energy factors), transition state theory, and reaction coordinate energy profiles
* **T5.5 (SL):** Activation energy ($E_a$) and Arrhenius equation ($k = Ae^{-E_a/RT}$)
* **T5.6 (SL):** Graphical analysis based on the Arrhenius equation ($\ln k$ vs $1/T$)
* **T5.7 (HL):** Temperature sensitivity of $k$ based on $\ln k$ vs $1/T$ slope, pre-exponential factor ($A$) determinants

### Reaction Mechanisms & Catalysis
* **T5.8 (SL):** Elementary steps, molecularity, reaction intermediates, transition states, and the rate-determining step
* **T5.9 (SL):** Catalysts: concepts, classification (homogeneous, heterogeneous, enzymatic), reaction profiles, and mechanism of action
* **T5.10 (HL):** Pseudo-order kinetic models (e.g., pseudo-first-order reactions) and graph-based rate law analysis
* **T5.11 (HL):** Derivation of rate laws using the steady-state approximation or the pre-equilibrium approximation
* **T5.12 (HL):** Advanced kinetics: kinetics of parallel, consecutive, reversible reactions, and enzyme kinetics (Michaelis-Menten concepts)

---

## T6: Equilibrium

### Fundamental Equilibrium
* **T6.1 (SL):** Concept of dynamic equilibrium, equilibrium state, and the equilibrium constant ($K_c$ vs $K_P$)
* **T6.2 (SL):** Expression of $K$ (omitting solids and pure liquids), $K$ of reverse reactions, and multi-step reaction equilibria
* **T6.3 (SL):** Reaction quotient ($Q$), predicting reaction direction by comparing $Q$ and $K$, and RICE tables
* **T6.4 (SL):** Le Chatelier's Principle (concentration, pressure/volume, temperature, catalyst effects, and noble gas addition at constant volume/pressure)

### Acid-Base Equilibrium
* **T6.5 (SL):** Acid-base definitions (Arrhenius, Brønsted-Lowry, Lewis) and conjugate acid-base pairs
* **T6.6 (SL):** Weak acids and weak bases: $K_a$, $K_b$, $K_w$, autoionization of water, and pH/pOH calculations
* **T6.7 (SL):** Percent ionization of weak electrolytes and the dilution effect
* **T6.8 (SL):** Hydrolysis of salts and acid-base properties of salt solutions
* **T6.9 (HL):** Molecular structure and acid strength trends (binary hydrides, oxyacids, leveling effect of solvent)
* **T6.10 (HL):** pH calculations of polyprotic acids, mixtures of acids, amphoteric species (pH = $(pK_{a1} + pK_{a2})/2$), and weak acid-weak base salts
* **T6.11 (HL):** Systematic equilibrium treatment using mass balance and charge balance equations

### Buffers & Titrations
* **T6.12 (SL):** Buffers, common ion effect, Henderson-Hasselbalch equation (applications and limitations at extreme pH/concentrations), and buffering capacity
* **T6.13 (SL):** Titration curves (strong-strong, weak-strong, weak-weak, polyprotic, and mixed systems)
* **T6.14 (SL):** Equivalence point, endpoint, half-equivalence point (pH = $pK_a$), buffer region, and steep rise region
* **T6.15 (SL):** Acid-base indicators: principles, pH transition ranges, colors of common indicators (e.g., phenolphthalein, methyl orange), and selection of indicators

### Solubility & Complexation
* **T6.16 (SL):** Solubility product constant ($K_{sp}$) and calculations of molar and mass solubility
* **T6.17 (SL):** Common ion effect on solubility and solubility vs pH for precipitates containing conjugate bases of weak acids
* **T6.18 (SL):** Precipitation predictions using $K_{sp}$ vs $Q_{sp}$
* **T6.19 (HL):** Selective precipitation based on relative solubilities and fractional precipitation
* **T6.20 (HL):** Complex ion equilibria ($K_f$) and joint equilibria (solubility of precipitates in the presence of complexing agents)
* **T6.21 (HL):** Graphical analysis of solubility: solubility ($S$) vs pH curves

---

## T7: Redox/Electrochemistry

### Redox Fundamentals
* **T7.1 (SL):** Oxidation-reduction concepts, rules for assigning oxidation numbers, and balancing redox reactions (half-reaction method)
* **T7.2 (SL):** Redox titrations (standardization, indicators, and back titrations)
* **T7.3 (HL):** Assignment of oxidation numbers based on Lewis structures and formal charges
* **T7.4 (HL):** Comparison of common oxidizing and reducing agents

### Galvanic Cells
* **T7.5 (SL):** Galvanic (voltaic) cells: anode, cathode, salt bridge, electron/ion flow directions, and cell line notations
* **T7.6 (SL):** Standard reduction potentials, cell potential ($E^\circ_{cell} = E^\circ_{cat} - E^\circ_{ano}$), standard hydrogen electrode (SHE), and metal reactivities
* **T7.7 (HL):** Nernst equation for overall and half-reactions ($E = E^\circ - \frac{RT}{nF} \ln Q$), concentration cells
* **T7.8 (HL):** Determination of $K_{sp}$ or $K_f$ using electrochemical cells
* **T7.9 (HL):** Standard free energy, cell potential, and equilibrium constant relationships ($\Delta G^\circ = -nFE^\circ = -RT \ln K$), temperature dependence of cell potential ($E^\circ$ vs $T$, entropy and enthalpy change relations)

### Electrolysis & Advanced Electrochemistry
* **T7.10 (SL):** Electrolytic cells and Faraday's laws of electrolysis ($m = \frac{ItM}{zF}$)
* **T7.11 (HL):** Electrolysis of mixtures, selective discharge of ions at electrodes, and electrolysis under non-standard conditions
* **T7.12 (HL):** Latimer diagrams, Frost diagrams, standard reduction potential calculations for coupled half-reactions, and disproportionation thermodynamics
* **T7.13 (HL):** Pourbaix ($E$-pH) diagrams and electrochemical corrosion/prevention
* **T7.14 (HL):** Batteries and fuel cells (lead-acid, dry cell, alkaline, hydrogen-oxygen fuel cells)

---

## T8: Atomic Structure & Periodicity & Nuclear

### Atomic Models & Quantum Theory
* **T8.1 (SL):** Subatomic particles (protons, neutrons, electrons), isotopes, average atomic mass, abundance, and mass spectrometry
* **T8.2 (SL):** Electromagnetic spectrum, wave-particle duality, Bohr model ($E_n \propto -Z^2/n^2$), and hydrogen emission spectrum
* **T8.3 (SL):** Interaction of electromagnetic radiation with matter (rotation, vibration, electronic transition, ionization)
* **T8.4 (HL):** Photoelectric effect, de Broglie wavelength, Heisenberg uncertainty principle, and Schrödinger wave equation
* **T8.5 (HL):** Wavefunctions and radial distribution curves ($\Psi^2$ vs $r$), radial nodes, and angular nodes

### Orbitals & Electron Configuration
* **T8.6 (SL):** Quantum numbers ($n, l, m_l, m_s$), shapes, and relative energies of orbitals ($s, p, d, f$)
* **T8.7 (SL):** Electron configuration of atoms (Aufbau principle, Pauli exclusion principle, Hund's rule, and ground-state exceptions)
* **T8.8 (SL):** Electron configuration of ions and magnetic properties (paramagnetism vs diamagnetism, unpaired electrons)
* **T8.9 (SL):** Photoelectron spectroscopy (PES) and its applications

### Periodic Table & Trends
* **T8.10 (SL):** History and organization of the periodic table
* **T8.11 (SL):** Periodic trends (atomic/ionic radii, first and successive ionization energies, electron affinity, electronegativity, polarizability, metallic character, and acid-base behavior of oxides)
* **T8.12 (HL):** Exceptions in periodic trends, successive electron affinities, inert-pair effect, diagonal relationships, and lanthanide/3d contractions
* **T8.13 (HL):** Slater's rules for shielding and effective nuclear charge ($Z_{eff}$)

### Nuclear Chemistry
* **T8.14 (SL):** Nuclear stability, radioactive decay types ($\alpha, \beta^-, \beta^+$, electron capture, $\gamma$ emission) and nuclear equations
* **T8.15 (SL):** Kinetics of radioactive decay (half-life, activity) and carbon dating
* **T8.16 (HL):** Nuclear binding energy, mass defect, nuclear fission, and nuclear fusion

---

## T9: Bonding & Molecular Structure

### Bonding Models & Lattice Properties
* **T9.1 (SL):** Concepts and models of covalent, ionic, and metallic bonds
* **T9.2 (SL):** Potential energy profiles of covalent bonds (bond energy and bond length)
* **T9.3 (SL):** Comparisons of bond length and bond energy
* **T9.4 (SL):** Structure of ionic solids, lattice energy trends (charge and size effects), and the Born-Haber cycle

### Lewis Structures & Molecular Shape
* **T9.5 (SL):** Lewis structures, octet rule exceptions (electron-deficient, odd-electron, hypervalent species), and formal charge
* **T9.6 (SL):** Resonance structures, resonance hybrid stability, and applications (bond length, bond order, charge distribution)
* **T9.7 (SL):** VSEPR model: electron-pair geometry, molecular geometry, bond angle comparisons, molecular polarity, and dipole moments
* **T9.8 (HL):** VSEPR exceptions due to delocalization or steric effects, self-ionization of hypervalent halides (e.g., $PCl_5(s) \rightarrow [PCl_4]^+[PCl_6]^-$)

### Valence Bond & Molecular Orbital Theories
* **T9.9 (SL):** Valence bond theory: $\sigma$ and $\pi$ bonds, and orbital hybridization ($sp, sp^2, sp^3$, etc.)
* **T9.10 (HL):** Hybridization and bonding in cumulenes (e.g., allene) and carbon dioxide
* **T9.11 (HL):** Molecular Orbital (MO) theory: bonding/antibonding MOs, bond order, and magnetism (e.g., $O_2$ paramagnetism)
* **T9.12 (HL):** s-p mixing in homonuclear diatomic molecules ($N_2$ vs $O_2$), and MO diagrams of heteronuclear diatomic molecules/ions ($CO, NO, NF$, etc.)

### Coordination Chemistry
* **T9.13 (HL):** Coordination chemistry fundamentals: ligands (monodentate, polydentate, chelating), coordination number, and systematic nomenclature
* **T9.14 (HL):** Spectrochemical series, strong-field vs weak-field ligands, and applications
* **T9.15 (HL):** Isomerism in coordination compounds: structural isomers vs stereoisomers (geometric and optical isomers), isomer counting (e.g., $MX_2Y_2$, $MX_2Y_4$, $MX_3Y_3$, $M(X-X)_3$, $M(X-Y)_3$, $M(X-X)_2Y_2$)
* **T9.16 (HL):** Square planar vs tetrahedral coordination geometries (d8 configuration, ligand field strength, 4d/5d metals)

---

## T10: Organic Chemistry & Biochemistry

### Organic Fundamentals & Structures
* **T10.1 (SL):** Identification and properties of common functional groups (alkanes, alkenes, alkynes, aromatic rings, alkyl halides, alcohols, ethers, epoxides, aldehydes, ketones, carboxylic acids, esters, amides, acyl halides, acid anhydrides, amines, nitriles, thiols, sulfides, phenols)
* **T10.2 (SL):** IUPAC nomenclature of simple organic compounds (hydrocarbons, alcohols, aldehydes, ketones, carboxylic acids, esters, ethers, amines, amides)
* **T10.3 (SL):** Double bond equivalence / degree of unsaturation calculation
* **T10.4 (SL):** Skeletal structure representations, wedge-dash representations, Fischer projections, and Newman projections
* **T10.5 (SL):** Physical properties of organic compounds (boiling point, solubility, volatility, IMFs)

### Stereochemistry & Conformational Analysis
* **T10.6 (SL):** Isomerism: structural isomers vs stereoisomers (cis/trans, E/Z designations, chiral carbons, optical activity)
* **T10.7 (HL):** Enantiomers, diastereomers, meso compounds, racemic mixtures, and chemical resolution
* **T10.8 (HL):** Cyclohexane conformational analysis: chair conformations, ring flips, axial/equatorial bonds, 1,3-diaxial interactions, and relative stability

### Acidity, Basicity, and Extraction
* **T10.9 (HL):** Acidity and basicity of organic compounds (alkoxides, carboxylic acids, phenols, amines, anilines, substituent electronic effects, and ARIO rules)
* **T10.10 (HL):** Acid-base extraction principles and applications

### Organic Reactions & Mechanisms
* **T10.11 (SL):** Substitution reactions of alkyl halides: $S_N1$ vs $S_N2$ mechanisms, stereochemical outcomes (Walden inversion, racemization), and substituent/solvent/nucleophile effects
* **T10.12 (SL):** Addition reactions of alkenes/alkynes: acid-catalyzed hydration, halogenation, halohydrin formation, hydrohalogenation, regiochemistry (Markovnikov vs anti-Markovnikov), and stereochemistry (syn vs anti additions)
* **T10.13 (SL):** Oxidation of alcohols (1° vs 2° vs 3° alcohols, chromic acid, PCC/PDC) and saponification/esterification of carboxylic acids/esters
* **T10.14 (HL):** Elimination reactions of alkyl halides/alcohols: E1 vs E2 mechanisms, Zaitsev's rule, and alkene stability
* **T10.15 (HL):** Alkene epoxidation, ring opening of epoxides, ozonolysis (reductive/oxidative), and alkene/alkyne hydrogenation (catalytic, Lindlar, sodium/ammonia)
* **T10.16 (HL):** Radical addition to alkenes (anti-Markovnikov HBr addition) and radical halogenation of alkanes
* **T10.17 (HL):** Carbocation and free radical stability (primary, secondary, tertiary, allylic, benzylic) and rearrangement reactions (hydride/methyl shifts)
* **T10.18 (HL):** Conjugated dienes: stability, electrophilic additions (1,2- vs 1,4-additions, kinetic vs thermodynamic control), and Diels-Alder cycloadditions
* **T10.19 (HL):** Aromatic chemistry: aromaticity rules (Hückel's $4n+2$ rule, antiaromaticity, aromatic ions, heterocycles), electrophilic aromatic substitution (EAS) mechanism, substituent effects (directors and activators/deactivators), and Friedel-Crafts alkylation/acylation
* **T10.20 (HL):** Carbonyl reactions: nucleophilic additions (Grignard reagents, hydride reducers like $NaBH_4$/$LiAlH_4$, HCN, amine/hydrazine additions, Wittig reaction, hydration, acetal/hemiacetal formation)
* **T10.21 (HL):** Carbonyl $\alpha$-substitution: keto-enol tautomerism, $\alpha$-halogenation, Hell-Volhard-Zelinskii reaction, enolate formation/stability, and enolate alkylation
* **T10.22 (HL):** Carbonyl condensations: Aldol reaction/condensation, Claisen condensation, Dieckmann cyclization, Michael addition, Stork enamine reaction, and Robinson annulation

### Biochemistry
* **T10.23 (SL):** Carbohydrates: classifications (mono/di/polysaccharides), Fischer projections, D/L sugar notation, cyclic structures (anomers, mutarotation), hemiacetals vs acetals, glycosidic linkages, structures of glucose/fructose/sucrose/starch/cellulose
* **T10.24 (SL):** Amino acids: structures, zwitterion properties, peptide bond formation, side-chain acidity/basicity, and isoelectric point ($pI$) calculation
* **T10.25 (SL):** Proteins: primary, secondary ($\alpha$-helix, $\beta$-sheet), tertiary, and quaternary structures, denaturation, enzymes, and coenzymes
* **T10.26 (SL):** Nucleic acids: nucleotides, base pairing in DNA (Watson-Crick model), and chemical differences between DNA and RNA
* **T10.27 (SL):** Hydrolysis of biopolymers (peptides, glycosides, nucleic acids)

### Polymer Chemistry
* **T10.28 (SL):** Polymerization: monomers, repeating units, chain-growth vs step-growth polymerization, and addition vs condensation polymers (polyesters, polyamides)
* **T10.29 (HL):** Stereochemistry of polymerization (Ziegler-Natta catalyst) and copolymer chemistry
`

const chem_excluded_topics = `
***CRITICAL: DO NOT INCLUDE ANY OF THE FOLLOWING TOPICS***

- Named physical chemistry rules/equations outside standard AP/USNCO curricula (e.g., Trouton's rule, Eyring-Polanyi equation, explicit activity coefficients).
- Advanced stereochemical control and transition-state geometry (e.g., Bürgi-Dunitz trajectories, advanced diastereoselectivity, stereospecific enolate alkylations).
- Advanced coordination chemistry (e.g., Crystal Field Theory, $t_{2g}$/$e_g$ orbital splitting, high-spin/low-spin complexes, Jahn-Teller effects). Confine coordination questions to basic nomenclature, coordination number, and oxidation states.
- All calculus-based derivations or principles.
- Graduate-level concepts entirely unless you explicitly provide the necessary first-principles background within the question text itself.
- Advanced spectroscopy (e.g., 2D-NMR).
- Slater's rules
`

const agents_description = `
## Agent: Brainstorm
- **Instructions**:
  - Role: You are an expert coach for students competing at the national level of olympiads. Your objective is to design hyper-realistic, high-difficulty mock exams that push advanced students to their absolute conceptual limits without breaking the boundaries of the syllabus. The goal is to prepare them for future iterations of the exam, which are anticipated to increase significantly in difficulty.
  - Goal: Brainstorm a list of olympiad-style problem topics, traps, and ideas to send to the Writer agent.
  - Steps:
    1. Determine the style and scope of the olympiad exam, as well as how many questions there should be.
    2. Brainstorm specific, non-obvious conceptual traps for each individual problem: hidden limiting factors, or subtle breakdowns of standard textbook assumptions. These traps should not have shown up in past exams. They should be original and creative.
    3. For each trap, construct a counterintuitive and convoluted chemical system where this trap naturally occurs, while ensuring it is completely unique, original, and never seen before (avoid standard textbook setups).
    4. Generate a "Master Outline" containing all brainstormed ideas for each problem.
  - Constraints:
    - Stay within scope of syllabus, but should test to maximum depth.
    - Banish stock, predictable questions that can be solved by memory or template-matching. The questions should be completely new and original.
    - Avoid topics listed in excluded topics
    - Focus on traps where the correct answer is counterintuitive.
    - Increase difficulty by coupling unexpected systems.
    - The problems should be more difficult than past questions.

## Agent: Writer
- **Instructions**:
  - Role: You are a creative olympiad question writer.
  - Goal: Write out the problem text for each olympiad problem, as well as answer choices for multiple choice questions.
  - Steps:
    1. Read through the "Master Outline" document created by the Brainstorm agent for the problem sketches.
    2. For each problem, write out the problem text using proper LaTeX formatting, using mhchem for chemical formulas. Use SMILES to draw chemical structures and SVG for diagrams. Write all problems live into a "Problems" document.
    3. For multiple choice questions ONLY, calculate or derive 3 incorrect answer choices that result directly from falling into the conceptual trap. Then, write the LaTeX, SMILES, and/or SVG code for these answer choices and the correct answer choice. Add these to the "Problems" document.
  - Constraints:
    - Use the sketches from the "Master Outline" document.
    - Write in the same style/tone as past olympiad exams, but make the questions harder.
    - Incorrect answer choices should correspond to the common misconceptions and errors that students would likely make. 
    - Keep a strictly neutral tone. NEVER include hints, warnings, or clarifying instructions (e.g., "Do not assume...", "Account for...", "Do not rely on...").
    - NEVER hint at the problem solution or trap. 
    - Do not include any commentary.
    - Questions must be solvable with a scientific calculator ONLY. Excessive computation is beyond the scope of olympiads.
    - All organic chemical species should be drawn as their 2D or 3D representations (zigzag carbon chains) using SMILES. ***CRITICAL***You MUST wrap any SMILES string in <smiles>...</smiles> tags (e.g., <smiles>C(C)O</smiles> or <smiles>CC(=O)O</smiles>). Use LaTeX for all equations, formulas, units, and variables.
    - The traps should be well hidden and not immediately obvious to the student.
    - For calculation questions, do NOT round or truncate to ensure numerical accuracy.
    - SVG Diagrams: You are STRONGLY ENCOURAGED to include SVG diagrams in a large proportion of your questions — aim for at least half of all questions to contain an SVG figure. Titration curves, phase diagrams, energy-level diagrams, orbital diagrams, reaction coordinate plots, crystallographic unit cells, and spectroscopy traces are all excellent candidates. Embed the SVG directly in the question text using [[SVG: <svg ...>...</svg>]] markers. Use primitive shapes (<line>, <circle>, <rect>, <path>, <text>, <polygon>), inline attributes only (no CSS <style> blocks), transparent or dark background (do NOT use white background or rects, use light strokes like white or light gray), and single-quotes (') for all attribute values for JSON compatibility.
    - For free_response questions, especially at high difficulty levels (such as IMO, USAMO, IPhO, IChO, etc.), the question MUST require the user to write out a comprehensive mathematical proof, detailed step-by-step physics derivation, or organic chemistry synthesis mechanism/conceptual proof, rather than just calculating a final numerical value.
---

## Agent: Solver
- **Instructions**:
  - Role: You are an advanced science olympiad student competing at the international level.
  - Goal: Test-solve problems and ensure they are of high quality, are free from errors, and have correct solutions. Then, write solutions.
  - Steps:
    1. Read through the "Problems" document generated by the Writer agent. 
    2. Solve each problem as if you were taking the test.
    3. Ensure the problems are high-quality, and can be solved realistically by an advanced high school olympiad student using ONLY a scientific calculator.
    4. Output a "Solutions" document with detailed solutions. Write out the full solution in a clear, step-by-step format, explaining the reasoning and calculations involved, as well as the trap(s).
    5. If a problem is of low quality, alert the Director agent so another question can be generated to replace it.
  - Constraints:
    - The solutions should be clear and detailed, yet still concise.
    - The problems should all be solvable with ONLY a scientific calculator.
    - Multiple choice questions should have exactly ONE correct answer.

---

## Agent: Reviewer
- **Instructions**: 
  - Role: You are an expert test writer for national science olympiads like the AIME, USAPhO, and USNCO.
  - Goal: Review the exam to ensure it is high quality and that there are no errors. You are very nitpicky and hate bad or mediocre questions.
  - Steps:
    1. Understand the scope and format of the exam. Get a feel for the style and tone of the exam.
    2. Read through the "Problems" document generated by the Writer agent and the "Solutions" document generated by the Solver agent.
    3. Check to ensure each problem satisfies all of the problem constraints listed below.
    4. If a problem has a problem, alert the Director so it can be fixed or replaced.
  - Problem Constraints:
    - Every question must be fully solvable and sound. No hand-waving.
    - The problems should be more difficult than past exams.
    - The traps and systems should not be outside the scope of syllabus, but should test to maximum depth.
    - Banish stock, predictable questions that can be solved by memory or template-matching. The questions should be completely new and original.
    - Avoid topics listed in excluded topics.
    - The correct answers should be counterintuitive.
    - The problem texts should be written in the same style/tone as past olympiad exams, but make the questions harder.
    - Incorrect answer choices should correspond to the common misconceptions and errors that students would likely make. 
    - Keep a strictly neutral tone. NEVER include hints, warnings, or clarifying instructions (e.g., "Do not assume...", "Account for...", "Do not rely on...").
    - NEVER hint at the problem solution or trap. 
    - Do not include any commentary.
    - Questions must be solvable with a scientific calculator ONLY. Excessive computation is beyond the scope of olympiads.
    - All organic chemical species should be drawn as their 2D or 3D representations (zigzag carbon chains) using SMILES. ***CRITICAL***You MUST wrap any SMILES string in <smiles>...</smiles> tags (e.g., <smiles>C(C)O</smiles> or <smiles>CC(=O)O</smiles>). Use LaTeX for all equations, formulas, units, and variables.
    - The traps should be well hidden and not immediately obvious to the student.
    - For calculation questions, do NOT round or truncate to ensure numerical accuracy.
    - SVG Diagrams: You are STRONGLY ENCOURAGED to include SVG diagrams in a large proportion of your questions — aim for at least half of all questions to contain an SVG figure. Titration curves, phase diagrams, energy-level diagrams, orbital diagrams, reaction coordinate plots, crystallographic unit cells, and spectroscopy traces are all excellent candidates. Embed the SVG directly in the question text using [[SVG: <svg ...>...</svg>]] markers. Use primitive shapes (<line>, <circle>, <rect>, <path>, <text>, <polygon>), inline attributes only (no CSS <style> blocks), transparent or dark background (do NOT use white background or rects, use light strokes like white or light gray), and single-quotes (') for all attribute values for JSON compatibility.
    - For calculation questions, any answer choices/solutions should not round or truncate to ensure numerical accuracy.
    - The solutions should be clear and detailed, yet still concise.
    - Multiple choice questions should have exactly ONE correct answer.
    - For free_response questions, especially at high difficulty levels (such as IMO, USAMO, IPhO, IChO, etc.), the question MUST require the user to write out a comprehensive mathematical proof, detailed step-by-step physics derivation, or organic chemistry synthesis mechanism/conceptual proof, rather than just calculating a final numerical value.
---

## Agent: Compiler
- **Instructions**: 
  - Goal: Compile all the questions generated into the correct output format (see Output Requirements).
  - Context: The problems and solutions are listed in the "Problems" and "Solutions" documents. The format is listed in the Output Requirements.
  - Output the JSON for the entire exam.
`

// ------------------------------------
// Helpers
// ------------------------------------

function generateQuestionId(questionText, subject) {
  const inputStr = (subject || '') + ':' + questionText;
  const hex = md5(inputStr);
  const cleanSubject = String(subject || 'gen').trim().toLowerCase().substring(0, 5);
  return cleanSubject + '_' + hex.substring(0, 16);
}

function formatExemplarsForPrompt(exemplars) {
  return exemplars.map((ex) => {
    const clone = { ...ex };
    delete clone.detailedSolution;
    return JSON.stringify(clone, null, 2);
  }).join('\n\n');
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

// ------------------------------------
// Gemini API — mirrors executeWithRetry() + interactions API from _gemini.js
// ------------------------------------

const rateLimitRegistry = new Map();

function isKeyRateLimited(modelId, apiKey) {
  const today = new Date().toDateString();
  return rateLimitRegistry.get(`${modelId}:${apiKey}`) === today;
}

function markKeyRateLimited(modelId, apiKey) {
  const today = new Date().toDateString();
  rateLimitRegistry.set(`${modelId}:${apiKey}`, today);
  console.warn(`[API Rotation] Key marked rate-limited for model ${modelId} today.`);
}

async function executeWithRetry(apiKeys, models, apiCallFn) {
  const modelList = Array.isArray(models) ? models : [models];

  if (!apiKeys || apiKeys.length === 0) {
    throw new Error('GEMINI_API_KEYs are missing');
  }

  // Random starting index for rotation
  const selectedIndex = Math.floor(Math.random() * apiKeys.length);
  const keysOrder = [];
  for (let i = 0; i < apiKeys.length; i++) {
    keysOrder.push(apiKeys[(selectedIndex + i) % apiKeys.length]);
  }

  let lastError;
  let all503 = true;

  for (const currentModel of modelList) {
    for (let i = 0; i < keysOrder.length; i++) {
      const apiKey = keysOrder[i];
      if (isKeyRateLimited(currentModel, apiKey)) {
        continue;
      }

      try {
        if (i > 0) {
          console.warn(`[API Rotation] Selected key failed. Rotating to backup key ${i + 1} for model ${currentModel}.`);
        }
        const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 300_000 } });
        const result = await apiCallFn(ai, currentModel);
        console.log(`[AI Success] Successfully received response from model ${currentModel}`);
        return result;
      } catch (err) {
        lastError = err;
        let status = err.status || err.statusCode;
        const msg = err.message ? err.message.toLowerCase() : '';
        if (status === 500 || status === 503 || msg.includes('demand') || msg.includes('500') || msg.includes('503') || msg.includes('overloaded') || msg.includes('unavailable') || msg.includes('busy')) {
          status = 503;
        } else if (status === 429 || msg.includes('429') || msg.includes('exhausted') || msg.includes('rate limit')) {
          status = 429;
        }

        if (status !== 503) {
          all503 = false;
        }

        if (status === 503) {
          console.warn(`[503] Model overloaded for ${currentModel}. Breaking out of key loop to try next model.`);
          break;
        } else if (status === 429) {
          console.warn(`[429] Rate limit hit for ${currentModel} on key.`);
          markKeyRateLimited(currentModel, apiKey);
        } else if (status === 400) {
          console.warn(`[400] Bad request for ${currentModel}: ${err.message.substring(0, 100)}. Breaking out of key loop.`);
          all503 = false;
          break;
        } else {
          console.warn(`[API Rotation] Error for ${currentModel}: ${err.message}. Trying next key...`);
        }
      }
    }
  }

  if (all503 && lastError) {
    throw new Error('Models are currently experiencing high demand. Please try again later.');
  }

  throw lastError || new Error('All API keys failed or are rate limited');
}

async function callGemini(input, apiKeys, models, temperature, systemInstruction) {
  const defaultModels = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
  const targetModels = models?.length > 0 ? models : defaultModels;

  // Build input for the interactions API from various input formats
  let interactionInput;
  if (typeof input === 'string') {
    interactionInput = input;
  } else if (Array.isArray(input)) {
    // generateContent-style: [{ role, parts }] — extract parts and convert
    if (input[0]?.parts) {
      const parts = input.flatMap(item => item.parts || []);
      interactionInput = parts.map(p => {
        if (p?.inlineData) return { type: 'image', data: p.inlineData.data, mime_type: p.inlineData.mimeType };
        if (p?.text) return { type: 'text', text: p.text };
        return { type: 'text', text: String(p ?? '') };
      });
    } else {
      // Flat array of strings or text objects — flatten to string for text-only
      const joined = input.map(item => (typeof item === 'string' ? item : item?.text ?? '')).filter(Boolean).join('\n');
      interactionInput = joined || '';
    }
  } else {
    interactionInput = String(input ?? '');
  }

  try {
    return await executeWithRetry(apiKeys, targetModels, async (ai, currentModel) => {
      const config = {
        model: currentModel,
        input: interactionInput,
        system_instruction: systemInstruction,
        response_format: { type: 'text', mime_type: 'application/json' },
      };
      if (typeof temperature === 'number') {
        config.generation_config = { temperature };
      }
      const result = await ai.interactions.create(config);
      return result.output_text ?? null;
    });
  } catch (err) {
    console.warn('[callGemini] All models/keys failed:', err.message);
    return null;
  }
}


// ------------------------------------
// Homework Generation
// ------------------------------------

async function generateHomework(payload, projectId, accessToken, env) {
  const { teacherId, lessonId, lessonTitle, lessonDescription, studentIds, homeworks } = payload || {};
  const rawKeys = env.GEMINI_API_KEYS || payload?.geminiApiKeys || payload?.geminiApiKey || '';
  const geminiApiKeys = (Array.isArray(rawKeys) ? rawKeys : String(rawKeys).split(','))
    .map((k) => String(k).trim())
    .filter(Boolean);
  const tId = teacherId ? teacherId.trim().toLowerCase() : '';

  let subreqCount = 0;
  let drainSkipped = false;
  const BUDGET_LIMIT = 49;

  function drain(sql, params) {
    if (subreqCount >= BUDGET_LIMIT) { drainSkipped = true; return null; }
    subreqCount++;
    return runQuery(sql, params, projectId, accessToken);
  }

  function drainGemini(input, models, temperature, systemInstruction) {
    if (subreqCount >= BUDGET_LIMIT) { drainSkipped = true; return null; }
    subreqCount++;
    return callGemini(input, geminiApiKeys, models, temperature, systemInstruction);
  }

  function triggerFallback(sanitizedStudent, hw) {
    const fallbackUrl = env.FALLBACK_WEBHOOK_URL;
    if (!fallbackUrl) { console.warn('No FALLBACK_WEBHOOK_URL configured'); return; }
    fetch(fallbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'generate_homework',
        teacherId, lessonId, lessonTitle, lessonDescription,
        studentIds: [sanitizedStudent],
        homeworks: [hw],
        geminiApiKeys: payload?.geminiApiKeys
      })
    }).catch(err => console.error('Fallback ping failed:', err));
  }

  const safeStudents = Array.isArray(studentIds) ? studentIds : [];
  const safeHomeworks = Array.isArray(homeworks) ? homeworks : [];

  for (const studentId of safeStudents) {
    const sanitizedStudent = String(studentId || '').trim().toLowerCase();

    for (const hw of safeHomeworks) {
      drainSkipped = false;


      const subject = hw.subject || 'Math';
      const normSubject = subject.toLowerCase();
      const numQuestions = hw.numQuestions || 5;
      const difficulty = Number(hw.difficulty !== undefined ? hw.difficulty : 5);

      const sharedQuestionsCount = Array.isArray(hw.sharedQuestions) ? hw.sharedQuestions.length : 0;
      const aiCount = numQuestions - sharedQuestionsCount;

      if (aiCount <= 0) {
        await drain(
          `DELETE FROM \`${projectId}\`.\`chronos_users\`.\`student_homework_questions\` WHERE assignment_id = @assignmentId AND student_id = @studentId`,
          { assignmentId: hw.assignmentId, studentId: sanitizedStudent }
        );
        await drain(
          `INSERT INTO \`${projectId}\`.\`chronos_users\`.\`student_homework_questions\` (assignment_id, student_id, questions_json, created_at) VALUES (@assignmentId, @studentId, @questionsJson, CURRENT_TIMESTAMP())`,
          { assignmentId: hw.assignmentId, studentId: sanitizedStudent, questionsJson: '[]' }
        );
        continue;
      }

      // Fetch student data
      let ratingColumn = 'math_rating';
      if (normSubject === 'physics') ratingColumn = 'physics_rating';
      else if (normSubject === 'chemistry') ratingColumn = 'chemistry_rating';

      let studentRating = 100;
      let weaknesses = 'None', weaknessAnalysis = 'None', topicBreakdown = 'None', mistakeAnalysis = 'None';
      let doneQuestionIds = [];
      let pregeneratedQuestion = null;

      try {
        const rows = await drain(
          `SELECT * FROM (
            SELECT (SELECT ${ratingColumn} FROM \`${projectId}\`.\`chronos_users\`.\`users\` WHERE user_id = @studentId) AS rating,
            (SELECT COALESCE(STRING_AGG(FORMAT("Topic: %s (Accuracy: %d%%)", sub_category, CAST(accuracy_rate * 100 AS INT64)), "; "), "None") FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\` WHERE accuracy_rate < 0.65 AND user_id = @studentId AND subject = @subject) AS weaknesses,
            (SELECT detailed_analysis FROM \`${projectId}\`.\`chronos_users\`.\`user_weakness_analysis\` WHERE user_id = @studentId AND subject = @subject ORDER BY updated_at DESC LIMIT 1) AS weakness_analysis,
            (SELECT STRING_AGG(FORMAT("Topic: %s | Good: %s | Not good: %s", IFNULL(topic, ''), IFNULL(good_at, ''), IFNULL(not_good_at, '')), "\\n") FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_breakdown\` WHERE user_id = @studentId AND subject = @subject) AS topic_breakdown,
            (SELECT STRING_AGG(FORMAT("Pattern %d: %s", rn, IFNULL(mistake_patterns, '')), "\\n") FROM (SELECT mistake_patterns, ROW_NUMBER() OVER (ORDER BY created_at DESC) AS rn FROM \`${projectId}\`.\`chronos_users\`.\`user_mistake_analysis\` WHERE user_id = @studentId AND subject = @subject LIMIT 3)) AS mistake_analysis,
            (SELECT STRING_AGG(qid, ",") FROM (SELECT DISTINCT JSON_VALUE(q, '$.id') AS qid FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_results\`, UNNEST(JSON_EXTRACT_ARRAY(results_json)) AS q WHERE user_id = @studentId)) AS done_ids
          )`,
          { studentId: sanitizedStudent, subject },
          projectId, accessToken
        );
        if (rows?.length > 0) {
          const r = rows[0];
          studentRating = Number(r.rating) || 100;
          weaknesses = r.weaknesses || 'None';
          weaknessAnalysis = r.weakness_analysis || 'None';
          topicBreakdown = r.topic_breakdown || 'None';
          mistakeAnalysis = r.mistake_analysis || 'None';
          doneQuestionIds = r.done_ids ? r.done_ids.split(',').filter(Boolean) : [];
        }
      } catch (err) {
        console.error('Error fetching student data:', err);
      }

      // Calculate adaptive difficulty
      const baseDiff = Math.max(1, Math.min(10, difficulty));
      const eloMap = { 1: 100, 2: 300, 3: 500, 4: 750, 5: 1000, 6: 1250, 7: 1500, 8: 2000, 9: 2500, 10: 3000 };
      const expectedR = eloMap[Math.round(baseDiff)] || 1000;
      const rawOffset = (studentRating - expectedR) / 300;
      const clampedOffset = Math.max(-1.5, Math.min(1.5, rawOffset));
      const studentDifficulty = Math.max(1, Math.min(10, Math.round(baseDiff + clampedOffset)));

      // Build prompt components
      const allowedTypes = Array.isArray(hw.examFormat) ? hw.examFormat : [hw.examFormat || 'multiple_choice'];
      const parsedTypes = allowedTypes.map((t) => t.trim()).filter(Boolean);
      const typeSchemaDesc = parsedTypes.map((t) => `"${t}"`).join(' | ');
      const optionsSchemaDesc = parsedTypes.includes('multiple_choice')
        ? `\n  "options": ["Option A", "Option B", "Option C", "Option D"],`
        : '';
      const keywordExpressionSchemaDesc = parsedTypes.includes('short_answer')
        ? `\n  "keywordExpression": "A logical boolean expression (e.g., 'gravity AND newton'). Required ONLY if type is short_answer.",`
        : '';
      const answerSchemaDesc = `"For multiple_choice, exactly 'A', 'B', 'C', or 'D'. For short_answer, the exact correct short text or number. For free_response, an empty string ''."`;

      let lessonInstructions = '';
      if (lessonTitle || lessonDescription) {
        lessonInstructions = `\nAdditionally, this exam is a homework assignment for the lesson "${lessonTitle || ''}".\nThe teacher set the following lesson plan/content:\n"${lessonDescription || ''}"\n\nYou MUST generate questions that are directly related to the content and concepts outlined in this lesson plan/content.\n`;
      }

      let syllabus = '';
      let examples = '';

      if (normSubject === 'math') {
        syllabus = `Syllabus Boundaries\n- Restrict to algebra, combinatorics, geometry, number theory. No calculus.\n\nDifficulty scale: 0=simplest MATHCOUNTS School, 1=MATHCOUNTS, 4=AMC 12 Q21-25, 5=AIME Q11-13, 8=medium USAMO, 10=hardest IMO.`;
        examples = formatExemplarsForPrompt(mathExemplars);
      } else if (normSubject === 'physics') {
        syllabus = `Syllabus Boundaries\n- DIFFICULTY < 8 (F=ma/AP Physics C): Classical mechanics, E&M, thermodynamics, fluid dynamics, waves, optics.\n- DIFFICULTY >= 8 (USAPhO/IPhO): Original concept-first designs. May introduce SR, QM basics, stat mech — MUST define all concepts from first principles.\n\nDifficulty scale: 1=introductory, 3=AP Physics C, 5=F=ma, 8=USAPhO, 10=hardest IPhO.`;
        examples = formatExemplarsForPrompt(physicsExemplars);
      } else if (normSubject === 'chemistry') {
        syllabus = `# Syllabus Boundaries\n\n## USNCO Style (Difficulty < 8):\n${chem_syllabus}\n\nExcluded topics:\n${chem_excluded_topics}\n\n## IChO Style (Difficulty 8+):\nAll of the above plus advanced HS knowledge on a first-principles approach.`;
        examples = formatExemplarsForPrompt(chemistryExemplars);
      }

      const systemInstruction = `# Role: You are an expert coach for students competing in advanced high school Olympiads. Your objective is to design hyper-realistic, high-difficulty mock exams that push advanced students to their absolute conceptual limits without breaking the boundaries of the syllabus.

# Context: You are generating mock questions for an exam appropriate to the difficulty level (see the syllabus boundaries/difficulty scale).

${lessonInstructions}

Utilize the following diagnostic information about the user to tailor the test:
- User Weakness Analysis: ${weaknessAnalysis}
- User Topic Breakdown:\n${topicBreakdown}
- Recent Mistake Patterns:\n${mistakeAnalysis}

# Goal: Write questions that perfectly mirror official styling but features significantly elevated problem difficulty. Target the user's weak areas (${weaknesses}).

${syllabus}

# Steps: You will simulate different agent roles, completing a full generation pipeline:

${agents_description}

# Examples:

${examples}

# Output Requirements:

Do NOT output your thought process. Output ONLY the valid JSON array starting with \`[\`.

OPTIONS FORMATTING: For multiple_choice, mathematical expressions MUST be wrapped in LaTeX delimiters ($...$).

The output must be a pure JSON array with the following schema for each object:
{
  "id": "A unique string ID",
  "topic": "comma-separated sub-categories",
  "question": "The text of the question (no answer choices here for MC).",
  "type": ${typeSchemaDesc},${optionsSchemaDesc}${keywordExpressionSchemaDesc}
  "answer": ${answerSchemaDesc},
  "difficulty": a number in [${Math.max(0, studentDifficulty - 2)}, ${Math.min(10, studentDifficulty + 2)}]
}`;

      const buildDynamicPrompt = (needed) => {
        const typeInstruction = needed >= parsedTypes.length
          ? `You MUST ensure the output contains a mix of all requested types: ${parsedTypes.join(', ')}. Every type MUST appear at least once.`
          : `Each question MUST be one of: ${parsedTypes.join(', ')}.`;
        return `Generate exactly ${needed} ${normSubject} problems. Average difficulty must be exactly ${studentDifficulty} (range [${Math.max(0, studentDifficulty - 2)}, ${Math.min(10, studentDifficulty + 2)}]).\nFollow these strict rules:\n1. ${typeInstruction}`;
      };

      // Fetch 1 pregenerated question as seed
      try {
        const pregenRows = await drain(
          `SELECT question_json FROM \`${projectId}\`.\`chronos_users\`.\`pregenerated_questions\` WHERE subject = @subject AND difficulty = @difficulty ORDER BY RAND() LIMIT 50`,
          { subject: normSubject, difficulty: studentDifficulty }
        );
        if (pregenRows?.length > 0) {
          for (const row of pregenRows) {
            try {
              const qObj = JSON.parse(row.question_json);
              if (qObj?.question) {
                qObj.id = generateQuestionId(qObj.question, normSubject);
                if (!doneQuestionIds.includes(qObj.id)) {
                  pregeneratedQuestion = qObj;
                  break;
                }
              }
            } catch (_) { }
          }
        }
      } catch (err) {
        console.error('Error fetching pregenerated seed:', err);
      }

      const allQuestions = pregeneratedQuestion ? [pregeneratedQuestion] : [];
      let attempts = 0;

      while (allQuestions.length < aiCount && attempts < 2) {
        attempts++;
        const needed = aiCount - allQuestions.length;
        const dynamicPrompt = buildDynamicPrompt(needed);

        let responseText = await drainGemini(dynamicPrompt, ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'], 1.5, systemInstruction);

        if (responseText) {
          try {
            const cleanText = responseText.trim().replace(/^```json/, '').replace(/```$/, '').trim();
            const questionsList = JSON.parse(cleanText);
            const list = Array.isArray(questionsList) ? questionsList : [questionsList];

            for (const q of list) {
              if (q?.question) {
                q.id = generateQuestionId(q.question, normSubject);
                if (allQuestions.length < aiCount) allQuestions.push(q);
              }
            }
          } catch (err) {
            console.error('Failed to parse homework questions:', err);
          }
        }
      }

      // Fallback to DB if still short
      if (allQuestions.length < aiCount) {
        console.warn(`Insufficient questions (${allQuestions.length}/${aiCount}), using DB fallback`);
        try {
          const pregenFallback = await drain(
            `SELECT question_json FROM \`${projectId}\`.\`chronos_users\`.\`pregenerated_questions\` WHERE subject = @subject ORDER BY ABS(difficulty - @difficulty) ASC, RAND() LIMIT 100`,
            { subject: normSubject, difficulty: studentDifficulty }
          );
          for (const row of pregenFallback || []) {
            if (allQuestions.length >= aiCount) break;
            try {
              const qObj = JSON.parse(row.question_json);
              if (qObj?.question) {
                qObj.id = generateQuestionId(qObj.question, normSubject);
                if (!allQuestions.some((e) => e.id === qObj.id) && !doneQuestionIds.includes(qObj.id)) {
                  allQuestions.push(qObj);
                }
              }
            } catch (_) { }
          }
        } catch (err) {
          console.error('DB fallback query failed:', err);
        }
      }

      // Save final question set
      try {
        await drain(
          `DELETE FROM \`${projectId}\`.\`chronos_users\`.\`student_homework_questions\` WHERE assignment_id = @assignmentId AND student_id = @studentId`,
          { assignmentId: hw.assignmentId, studentId: sanitizedStudent }
        );
        await drain(
          `INSERT INTO \`${projectId}\`.\`chronos_users\`.\`student_homework_questions\` (assignment_id, student_id, questions_json, created_at) VALUES (@assignmentId, @studentId, @questionsJson, CURRENT_TIMESTAMP())`,
          { assignmentId: hw.assignmentId, studentId: sanitizedStudent, questionsJson: JSON.stringify(allQuestions) }
        );
      } catch (err) {
        console.error('Failed to save final homework questions:', err);
      }

      if (drainSkipped || allQuestions.length === 0) {
        console.warn(`No questions/drain skipped for student ${sanitizedStudent}, assignment ${hw.assignmentId}. Will trigger fallback.`);
        triggerFallback(sanitizedStudent, hw);
      }
    }
  }
}

// ------------------------------------
// Exam Grading
// ------------------------------------

async function gradeExam(payload, projectId, accessToken, env) {
  const data = payload?.payload || payload || {};
  const { username, subject, examId, accuracy, avgTime, ratingChange, newRating, isRated, assignmentId, results } = data;
  const rawKeys = env.GEMINI_API_KEYS || payload?.geminiApiKeys || payload?.geminiApiKey || '';
  const geminiApiKeys = (Array.isArray(rawKeys) ? rawKeys : String(rawKeys).split(','))
    .map((k) => String(k).trim())
    .filter(Boolean);
  const sanitizedUser = String(username || '').trim().toLowerCase();
  const safeResults = Array.isArray(results) ? results : [];

  // Fetch frqSubmission from BigQuery (not sent in payload to keep it small)
  let storedResults = [];
  try {
    const rows = await runQuery(
      `SELECT results_json FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_results\` WHERE exam_id = @examId AND user_id = @username LIMIT 1`,
      { examId, username: sanitizedUser },
      projectId, accessToken
    );
    if (rows?.length > 0) {
      storedResults = JSON.parse(rows[0].results_json || '[]');
    }
  } catch (e) {
    console.error('Failed to fetch stored exam results:', e);
  }
  const storedMap = {};
  storedResults.forEach(r => { if (r.id) storedMap[r.id] = r; });

  const frqs = safeResults.filter((r) => r.type === 'free_response');
  const nonFrqs = safeResults.filter((r) => r.type !== 'free_response');

  // Grade non-FRQs (trust client-side grading)
  const gradedNonFrqs = nonFrqs.map((r) => ({
    ...r,
    isCorrect: r.isCorrect !== undefined ? !!r.isCorrect : false,
    score: r.isCorrect ? 1.0 : 0.0,
  }));

  // Batch grade FRQs
  let gradedFrqs = [];
  if (frqs.length > 0) {
    try {
      const parts = [];
      let imageCounter = 0;
      let promptText = `You are a world-class grading examiner. You are grading multiple free-response questions for a competitive Olympiad-level exam in ${subject}.\n\nBelow are the details for each question:\n`;

      frqs.forEach((r) => {
        const sub = r.frqSubmission || storedMap[r.id]?.frqSubmission || null;
        const isImage =
          sub &&
          (sub.type === 'whiteboard' || sub.type === 'image') &&
          sub.value?.startsWith('data:image/');

        promptText += `\n---\nQuestion ID: ${r.id}\nTopic: ${r.topic || 'General'}\nQuestion: ${r.question}\n`;
        if (r.detailedSolution) promptText += `Correct Solution Reference: ${r.detailedSolution}\n`;

        if (isImage) {
          imageCounter++;
          const segments = sub.value.split(',');
          const base64Data = segments[1] || sub.value;
          const mimeMatch = segments[0].match(/data:(.*?);/);
          const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
          parts.push({ inlineData: { data: base64Data, mimeType } });
          promptText += `Student Work: Handwritten drawing (Refer to Image #${imageCounter} attached above)\n`;
        } else {
          const textAns = sub?.value || r.userAnswer || 'No answer submitted.';
          promptText += `Student Work: Typed solution:\n${textAns}\n`;
        }
      });

      promptText += `\n\nYour tasks for EACH question:
1. Solve the question completely from scratch to determine the correct solution.
2. Critically evaluate the student's work against the correct solution.
3. Award a partial credit score between 0.0 and 1.0. Be generous for valid logical steps.
4. Set 'isCorrect' to true if score >= 0.7.
5. Provide clear, professional, pedagogical feedback.
6. If the student work was an image, provide an extensive transcription in 'transcription'.
7. IMPORTANT: If a question is invalid, ambiguous, has multiple correct interpretations, contains an error in the question prompt/options/solution template, or is otherwise unfair to grade, you can NULLIFY the question by setting 'isCorrect' to null (literal JSON null), 'score' to null (literal JSON null), and 'feedback' explaining the reason for nullification.

Return ONLY a valid JSON array (one object per Question ID):
[
  {
    "id": "Question ID",
    "correctSolution": "Step-by-step solution",
    "correctAnswer": "Final answer",
    "score": 0.5,
    "isCorrect": true,
    "feedback": "Pedagogical feedback",
    "transcription": "Transcription of handwritten work (or null)"
  }
]`;

      parts.push({ text: promptText });

      const contents = [{ role: 'user', parts }];

      const responseText = await callGemini(
        contents,
        geminiApiKeys,
        ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']
      );

      if (!responseText) throw new Error('No response from Gemini during batch grading');

      const cleanText = responseText.trim().replace(/^```json/, '').replace(/```$/, '').trim();
      const batchGraded = JSON.parse(cleanText);
      const gradedMap = {};
      if (Array.isArray(batchGraded)) {
        batchGraded.forEach((item) => { if (item?.id) gradedMap[item.id] = item; });
      }

      gradedFrqs = frqs.map((r) => {
        const graded = gradedMap[r.id];
        if (!graded) return { ...r, isCorrect: false, score: 0, feedback: 'Grading failed for this question.' };
        const sub = r.frqSubmission || storedMap[r.id]?.frqSubmission || null;
        const isImage = sub?.value?.startsWith('data:image/');

        let finalIsCorrect = false;
        if (graded.isCorrect === null || graded.isCorrect === undefined) {
          finalIsCorrect = null;
        } else {
          finalIsCorrect = !!graded.isCorrect;
        }

        let finalScore = 0;
        if (graded.score === null || graded.score === undefined) {
          finalScore = null;
        } else {
          finalScore = Number(graded.score) || 0;
        }

        return {
          ...r,
          isCorrect: finalIsCorrect,
          score: finalScore,
          feedback: graded.feedback,
          answer: graded.correctAnswer || r.answer || '',
          solution: graded.correctSolution,
          userAnswer: isImage ? (graded.transcription || r.userAnswer) : r.userAnswer,
        };
      });
    } catch (err) {
      console.error('Error batch grading FRQs:', err);
      gradedFrqs = frqs.map((r) => ({ ...r, isCorrect: false, score: 0, feedback: 'Grading failed during batch processing.' }));
    }
  }

  // Merge results in original order
  const gradedResults = results.map((r) =>
    r.type === 'free_response'
      ? gradedFrqs.find((f) => f.id === r.id) || r
      : gradedNonFrqs.find((nf) => nf.id === r.id) || r
  );

  let finalAccuracy = accuracy;
  let finalRatingChange = ratingChange;
  let finalNewRating = newRating;
  const isGuest = sanitizedUser === 'default_user';

  if (!isGuest) {
    // 1. Database updates for FRQs (topic mastery delta & wrong problems)
    const dbPromises = [];
    for (const r of gradedFrqs) {
      const topicStr = r.topic || 'General';
      const topics = topicStr.split(',').map(t => t.trim()).filter(Boolean);

      if (r.isCorrect === true) {
        for (const topic of topics) {
          dbPromises.push(runQuery(
            `UPDATE \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\`
             SET correct_count = correct_count + 1,
                 accuracy_rate = SAFE_DIVIDE(correct_count + 1, total_count)
             WHERE user_id = @username AND subject = @subject AND sub_category = @topic`,
            { username: sanitizedUser, subject, topic },
            projectId, accessToken
          ));
        }
      } else if (r.isCorrect === false) {
        const sub = r.frqSubmission || storedMap[r.id]?.frqSubmission || null;
        dbPromises.push(runQuery(
          `INSERT INTO \`${projectId}\`.\`chronos_users\`.\`user_wrong_problems\`
            (user_id, exam_id, question_id, subject, topic, question_text, user_answer, correct_answer, created_at,
             options, question_type, ai_explanation, repetitions, interval_days, ease_factor, next_review_at, frq_submission_json)
          VALUES (@username, @examId, @questionId, @subject, @topic, @questionText, @userAnswer, @correctAnswer, CURRENT_TIMESTAMP(),
                  null, 'free_response', @feedback, 0, 0, 2.5, CURRENT_TIMESTAMP(), @frqSubmissionJson)`,
          {
            username: sanitizedUser,
            examId,
            questionId: String(r.id),
            subject,
            topic: r.topic || 'General',
            questionText: r.question,
            userAnswer: r.userAnswer || '',
            correctAnswer: r.answer || '',
            feedback: r.feedback || '',
            frqSubmissionJson: sub ? JSON.stringify(sub) : null
          },
          projectId, accessToken
        ));
      } else if (r.isCorrect === null) {
        for (const topic of topics) {
          dbPromises.push(runQuery(
            `UPDATE \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\`
             SET total_count = GREATEST(0, total_count - 1),
                 accuracy_rate = SAFE_DIVIDE(correct_count, GREATEST(0, total_count - 1))
             WHERE user_id = @username AND subject = @subject AND sub_category = @topic`,
            { username: sanitizedUser, subject, topic },
            projectId, accessToken
          ));
        }
      }
    }
    if (dbPromises.length > 0) {
      try {
        await Promise.all(dbPromises);
      } catch (e) {
        console.error('Failed to update stats/wrong problems for FRQs:', e);
      }
    }

    const hasFRQ = gradedResults.some((r) => r.type === 'free_response');
    if (isRated !== false && hasFRQ) {
      const scoredResults = gradedResults.filter((r) => r.isCorrect !== null && r.isCorrect !== undefined);
      const totalQuestions = scoredResults.length || 1;
      const totalScore = scoredResults.reduce((acc, r) => acc + (r.score ?? (r.isCorrect ? 1 : 0)), 0);
      finalAccuracy = totalScore / totalQuestions;

      let ratingColumn = 'math_rating';
      if (subject === 'Physics') ratingColumn = 'physics_rating';
      else if (subject === 'Chemistry') ratingColumn = 'chemistry_rating';

      let currentRating = 100;
      try {
        const userRows = await runQuery(
          `SELECT ${ratingColumn} FROM \`${projectId}\`.\`chronos_users\`.\`users\` WHERE user_id = @username`,
          { username: sanitizedUser },
          projectId, accessToken
        );
        if (userRows?.length > 0) currentRating = Number(userRows[0][ratingColumn]) || 100;
      } catch (e) { console.error('Failed to fetch user rating:', e); }

      const eloMap = { 1: 100, 2: 300, 3: 500, 4: 750, 5: 1000, 6: 1250, 7: 1500, 8: 2000, 9: 2500, 10: 3000 };
      const getQuestionRating = (diff) => eloMap[Math.max(1, Math.min(10, Math.round(diff)))] || 1000;

      const sumRatings = scoredResults.reduce((acc, r) => acc + getQuestionRating(r.difficulty || 5), 0);
      const avgQuestionRating = sumRatings / totalQuestions;

      let expectedScore = 1 / (1 + Math.pow(10, (avgQuestionRating - currentRating) / 400));
      if (avgQuestionRating < currentRating) expectedScore = Math.max(expectedScore, 0.75);

      let isChallenged = false;
      try {
        const historyRows = await runQuery(
          `SELECT accuracy FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_history\` WHERE user_id = @username AND subject = @subject ORDER BY created_at DESC LIMIT 5`,
          { username: sanitizedUser, subject },
          projectId, accessToken
        );
        let failCount = 0;
        for (const h of historyRows || []) {
          if (Number(h.accuracy) < 0.75) failCount++;
          else failCount = 0;
          if (failCount >= 2) isChallenged = true;
        }
      } catch (e) { console.error('Failed to fetch history:', e); }

      const K = isChallenged ? 32 : 250;
      const questionMultiplier = Math.sqrt(totalQuestions / 5);
      finalRatingChange = Math.round(K * questionMultiplier * (finalAccuracy - expectedScore));
      finalNewRating = Math.max(100, currentRating + finalRatingChange);
    }

    await runQuery(
      `MERGE INTO \`${projectId}\`.\`chronos_users\`.\`user_exam_history\` T
       USING (SELECT @username AS user_id, @examId AS exam_id) S
       ON T.user_id = S.user_id AND T.exam_id = S.exam_id
       WHEN MATCHED THEN
         UPDATE SET accuracy = @accuracy, rating_change = @ratingChange, new_rating = @newRating
       WHEN NOT MATCHED THEN
         INSERT (user_id, exam_id, subject, accuracy, avg_time, rating_change, new_rating, created_at, assignment_id)
         VALUES (@username, @examId, @subject, @accuracy, @avgTime, @ratingChange, @newRating, CURRENT_TIMESTAMP(), @assignmentId)`,
      { username: sanitizedUser, examId, subject, accuracy: finalAccuracy, avgTime, ratingChange: finalRatingChange, newRating: finalNewRating, assignmentId: assignmentId || null },
      projectId, accessToken
    );

    await runQuery(
      `MERGE INTO \`${projectId}\`.\`chronos_users\`.\`user_exam_results\` T
       USING (SELECT @username AS user_id, @examId AS exam_id) S
       ON T.user_id = S.user_id AND T.exam_id = S.exam_id
       WHEN MATCHED THEN
         UPDATE SET results_json = @resultsJson
       WHEN NOT MATCHED THEN
         INSERT (user_id, exam_id, results_json, created_at, assignment_id)
         VALUES (@username, @examId, @resultsJson, CURRENT_TIMESTAMP(), @assignmentId)`,
      { username: sanitizedUser, examId, resultsJson: JSON.stringify(gradedResults), assignmentId: assignmentId || null },
      projectId, accessToken
    );

    await runQuery(
      `DELETE FROM \`${projectId}\`.\`chronos_users\`.\`user_active_exams\` WHERE user_id = @username AND exam_id = @examId`,
      { username: sanitizedUser, examId },
      projectId, accessToken
    );

    if (isRated !== false) {
      let ratingColumn = 'math_rating';
      if (subject === 'Physics') ratingColumn = 'physics_rating';
      else if (subject === 'Chemistry') ratingColumn = 'chemistry_rating';

      await runQuery(
        `UPDATE \`${projectId}\`.\`chronos_users\`.\`users\` SET ${ratingColumn} = @newRating, elo_version = @eloVersion WHERE user_id = @username`,
        { username: sanitizedUser, newRating: finalNewRating, eloVersion: 3 },
        projectId, accessToken
      );
    }
  }
}

// ------------------------------------
// Worker entry point
// ------------------------------------

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    const { action } = payload || {};
    const projectId = payload?.projectId || env.PROJECT_ID;

    let accessToken;
    try {
      accessToken = await getAccessToken(env);
    } catch (err) {
      console.error('Auth failed:', err);
      return jsonResponse({ error: 'GCP authentication failed: ' + err.message }, 500);
    }

    try {
      if (action === 'generate_homework') {
        await generateHomework(payload, projectId, accessToken, env);
        return jsonResponse({ success: true, message: 'Homework generation complete' });
      }

      if (action === 'async_grade_exam') {
        await gradeExam(payload, projectId, accessToken, env);
        return jsonResponse({ success: true, message: 'Exam grading complete' });
      }

      return jsonResponse({ error: 'Unknown action: ' + action }, 400);
    } catch (err) {
      console.error(`Error processing action ${action}:`, err);
      return jsonResponse({ error: err.message || 'Internal worker error' }, 500);
    }
  },
};
