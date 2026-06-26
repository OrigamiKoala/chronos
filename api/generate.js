import { BigQuery } from '@google-cloud/bigquery';
import { executeWithRetry, parseJSONResponse } from './_gemini.js';

const projectId = process.env.BIGQUERY_PROJECT_ID || 'chronos-stress-sandbox';

const bq = new BigQuery({
  projectId,
  credentials: {
    client_email: process.env.BIGQUERY_CLIENT_EMAIL,
    private_key: process.env.BIGQUERY_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});

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

function getRandomExemplars(array, count = 3) {
  if (array.length <= count) {
    return [...array].sort(() => 0.5 - Math.random());
  }
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

function formatExemplarsForPrompt(exemplars) {
  return exemplars.map(ex => {
    const clone = { ...ex };
    delete clone.detailedSolution;
    return JSON.stringify(clone, null, 2);
  }).join('\n\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let { count, subject, targetUserId = 'default_user', examFormat, lessonTitle, lessonDescription, topics, assignmentId } = req.body;
  const difficulty = Number(req.body.difficulty !== undefined ? req.body.difficulty : 5);

  if (!count || (difficulty !== 0 && !difficulty) || !subject) {
    return res.status(400).json({ error: 'Missing required parameters: count, difficulty, subject' });
  }

  subject = String(subject).trim().toLowerCase();
  if (subject === 'ochem' || subject === 'organic chemistry' || subject === 'organic_chemistry') {
    subject = 'chemistry';
  }

  const sanitizedUser = String(targetUserId).trim().toLowerCase();
  const normSubject = subject;

  const allowedTypes = Array.isArray(examFormat)
    ? examFormat
    : (typeof examFormat === 'string' && examFormat.trim()
      ? (examFormat.includes(',') ? examFormat.split(',') : [examFormat])
      : ['multiple_choice', 'short_answer', 'free_response']);
  const parsedTypes = allowedTypes.map(t => t.trim()).filter(Boolean);

  const allQuestions = [];
  let doneQuestionIds;

  if (assignmentId && sanitizedUser !== 'default_user') {
    try {
      const getQuestionsQuery = `
        SELECT questions_json
        FROM \`${projectId}\`.\`chronos_users\`.\`student_homework_questions\`
        WHERE assignment_id = @assignmentId AND student_id = @targetUserId
        LIMIT 1
      `;
      const [rows] = await bq.query({
        query: getQuestionsQuery,
        params: { assignmentId, targetUserId: sanitizedUser }
      });
      if (rows && rows.length > 0) {
        const questionsList = JSON.parse(rows[0].questions_json);
        return res.status(200).json(questionsList);
      }
    } catch (err) {
      console.error('Error fetching student homework questions:', err);
    }
  }

  try {
    // 1. Fetch user weaknesses and diagnostic data from BigQuery in parallel
    let weaknesses = 'None (excellent performance across all topics)';
    let weaknessAnalysis = 'None (no previous analysis available)';
    let topicBreakdown = 'None (no previous topic breakdown available)';
    let mistakeAnalysis = 'None (no previous mistake pattern analysis available)';
    doneQuestionIds = [];

    try {
      const consolidatedQuery = `
        WITH weaknesses AS (
          SELECT 'weaknesses' AS type, TO_JSON_STRING(STRUCT(
            COALESCE(
              STRING_AGG(
                FORMAT("Topic: %s (Accuracy: %d%%)", sub_category, CAST(accuracy_rate * 100 AS INT64)), 
                "; "
              ),
              "None (excellent performance across all topics)"
            ) AS weaknesses
          )) AS data
          FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\`
          WHERE accuracy_rate < 0.65 AND user_id = @targetUserId AND subject = @subject
        ),
        weaknessAnalysis AS (
          SELECT 'weaknessAnalysis' AS type, TO_JSON_STRING(STRUCT(detailed_analysis)) AS data
          FROM \`${projectId}\`.\`chronos_users\`.\`user_weakness_analysis\`
          WHERE user_id = @targetUserId AND subject = @subject
          ORDER BY updated_at DESC
          LIMIT 1
        ),
        topicBreakdown AS (
          SELECT 'topicBreakdown' AS type, TO_JSON_STRING(STRUCT(topic, good_at, not_good_at)) AS data
          FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_breakdown\`
          WHERE user_id = @targetUserId AND subject = @subject
        ),
        mistakeAnalysis AS (
          SELECT 'mistakeAnalysis' AS type, TO_JSON_STRING(STRUCT(mistake_patterns)) AS data
          FROM \`${projectId}\`.\`chronos_users\`.\`user_mistake_analysis\`
          WHERE user_id = @targetUserId AND subject = @subject
          ORDER BY created_at DESC
          LIMIT 3
        ),
        doneQuestions AS (
          SELECT 'doneQuestions' AS type, TO_JSON_STRING(STRUCT(qid)) AS data
          FROM (
            SELECT DISTINCT JSON_VALUE(q, '$.id') AS qid
            FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_results\`,
            UNNEST(JSON_EXTRACT_ARRAY(results_json)) AS q
            WHERE user_id = @targetUserId
          )
        )
        SELECT type, data FROM weaknesses
        UNION ALL
        SELECT type, data FROM weaknessAnalysis
        UNION ALL
        SELECT type, data FROM topicBreakdown
        UNION ALL
        SELECT type, data FROM mistakeAnalysis
        UNION ALL
        SELECT type, data FROM doneQuestions
      `;

      const [rows] = await bq.query({
        query: consolidatedQuery,
        params: { targetUserId: sanitizedUser, subject: normSubject }
      });

      const topicBreakdownRows = [];
      const mistakeAnalysisRows = [];

      for (const r of rows) {
        try {
          const parsed = JSON.parse(r.data);
          if (r.type === 'weaknesses') {
            weaknesses = parsed.weaknesses || 'None (excellent performance across all topics)';
          } else if (r.type === 'weaknessAnalysis') {
            if (parsed.detailed_analysis) {
              weaknessAnalysis = parsed.detailed_analysis;
            }
          } else if (r.type === 'topicBreakdown') {
            topicBreakdownRows.push(parsed);
          } else if (r.type === 'mistakeAnalysis') {
            mistakeAnalysisRows.push(parsed);
          } else if (r.type === 'doneQuestions') {
            if (parsed.qid && sanitizedUser !== 'default_user') {
              doneQuestionIds.push(parsed.qid);
            }
          }
        } catch (e) {
          console.error("Failed to parse consolidated row in generate:", r, e);
        }
      }

      if (topicBreakdownRows.length > 0) {
        topicBreakdown = topicBreakdownRows.map(row => `Topic: ${row.topic} | Good at: ${row.good_at} | Not good at: ${row.not_good_at}`).join('\n');
      }
      if (mistakeAnalysisRows.length > 0) {
        mistakeAnalysis = mistakeAnalysisRows.map((row, idx) => `Mistake Pattern ${idx + 1}: ${row.mistake_patterns}`).join('\n');
      }
    } catch (err) {
      console.error('Parallel fetch error:', err);
    }

    // 1b. Fetch 1 pregenerated question
    let pregeneratedQuestion = null;
    try {
      const pregenQuery = `
        SELECT question_json
        FROM \`${projectId}\`.\`chronos_users\`.\`pregenerated_questions\`
        WHERE subject = @subject AND difficulty = @difficulty
          AND (ARRAY_LENGTH(@doneIds) = 0 OR JSON_VALUE(question_json, '$.id') NOT IN UNNEST(@doneIds))
        ORDER BY RAND()
        LIMIT 1
      `;
      const [rows] = await bq.query({
        query: pregenQuery,
        params: { subject: normSubject, difficulty: difficulty, doneIds: doneQuestionIds },
        types: { doneIds: ['STRING'] }
      });
      if (rows && rows.length > 0) {
        pregeneratedQuestion = JSON.parse(rows[0].question_json);
      }
    } catch (err) {
      console.error('Error fetching pregenerated question:', err);
    }

    // 2. Build the Gemini generation prompt
    let constraints = '';
    let examples = '';

    if (normSubject === 'math') {
      constraints = `
Follow these strict Olympiad Design Philosophies:

1. Advanced Design & Difficulty Criteria
- Multi-Topic Coupling: Require simultaneous application of disparate principles (e.g., coupling sequences with modular arithmetic and pigeonhole, or geometry with number theory).
- Multi-Step Cascades: Output of one step forms input of the next, without explicit prompting on intermediates.
- Subtle Nuances: Test edge cases, domain restrictions, degeneracy, boundary conditions, off-by-one errors.
- Rigor: Require case analysis, counterexamples, or bounding arguments—not plug-and-chug.
- Novel Context: Present familiar concepts in unfamiliar frameworks.

3. Syllabus Boundaries
- Restrict to algebra, combinatorics, geometry, number theory. No calculus. Increase difficulty by coupling topics.
- NO research level math (e.g. differential equations, topology, etc.)

4. SVG Diagrams: You are STRONGLY ENCOURAGED to include SVG diagrams in a large proportion of your questions — aim for at least half of all questions to contain an SVG figure. Geometric diagrams, number-line illustrations, graphs, coordinate grids, and function plots all make problems richer and harder to solve without visualization. The SVG diagrams should be required to solve the problem, not extra add-ons. Embed the SVG directly in the question text using [[SVG: <svg ...>...</svg>]] markers. Use primitive shapes (<line>, <circle>, <rect>, <path>, <text>, <polygon>), inline attributes only (no CSS <style> blocks), transparent or dark background (do NOT use white background or rects, use light strokes like white or light gray), and single-quotes (') for all attribute values for JSON compatibility.

Difficulty scale: 0=simplest part of MATHCOUNTS (MATHCOUNTS School), 1=MATHCOUNTS, 4=AMC 12 Q21-25, 5=AIME Q11-13, 8=medium USAMO, 10=hardest IMO.
`;
      examples = formatExemplarsForPrompt(getRandomExemplars(mathExemplars, 3));
    } else if (normSubject === 'physics') {
      constraints = `
Follow these strict Olympiad Design Philosophies:

1. Advanced Design & Difficulty Criteria
- Multi-Topic Coupling: Require simultaneous application of disparate physical principles (e.g., thermodynamic cycle with magnetic induction, electrostatics with rotational dynamics, spring-mass with RC circuit via EM induction).
- Multi-Step Cascades: Output of one step forms input of the next (e.g., find charge distribution → compute E-field → integrate for potential energy → apply energy conservation).
- Subtle Nuances: Test non-inertial frames, static-to-kinetic friction transitions, non-obvious geometric constraints, cases where small-angle approximation breaks down.
- Rigor: Require setting up and solving differential equations, non-trivial integrations, perturbation methods.
- Novel Context: Present physics in unfamiliar frameworks (astrophysical systems, atmospheric phenomena, biological mechanics).

2. Syllabus Boundaries
- DIFFICULTY < 8 (F=ma/AP Physics C): Restrict to classical mechanics, electromagnetism, thermodynamics, fluid dynamics, waves, optics. Increase difficulty by coupling unexpected systems.
- DIFFICULTY >= 8 (USAPhO/IPhO): Original concept-first designs. May introduce special relativity, quantum basics, statistical mechanics, etc. but MUST define all concepts from scratch (first-principles guardrail). free_response MUST require comprehensive derivation, not just a final number.

3. SVG Diagrams: You are STRONGLY ENCOURAGED to include SVG diagrams in a large proportion of your questions — aim for at least half of all questions to contain an SVG figure. Free-body diagrams, circuit schematics, wave/field plots, geometry setups, and apparatus sketches all significantly increase problem depth and realism. Embed the SVG directly in the question text using [[SVG: <svg ...>...</svg>]] markers. Use primitive shapes (<line>, <circle>, <rect>, <path>, <text>, <polygon>), inline attributes only (no CSS <style> blocks), transparent or dark background (do NOT use white background or rects, use light strokes like white or light gray), and single-quotes (') for all attribute values for JSON compatibility.

Difficulty scale: 1=introductory, 3=AP Physics C, 5=F=ma, 8=USAPhO, 10=hardest IPhO.
`;
      examples = formatExemplarsForPrompt(getRandomExemplars(physicsExemplars, 3));
    } else if (normSubject === 'chemistry') {
      constraints = `
Follow these strict Olympiad Design Philosophies:

1. Advanced Design & Difficulty Criteria
- Multi-Topic Coupling: Require simultaneous application of disparate physical principles (e.g., thermodynamic cycle with magnetic induction, electrostatics with rotational dynamics, spring-mass with RC circuit via EM induction).
- Multi-Step Cascades: Output of one step forms input of the next (e.g., find charge distribution → compute E-field → integrate for potential energy → apply energy conservation).
- Subtle Nuances: Test non-inertial frames, static-to-kinetic friction transitions, non-obvious geometric constraints, cases where small-angle approximation breaks down.
- Rigor: Require setting up and solving differential equations, non-trivial integrations, perturbation methods.
- Novel Context: Present physics in unfamiliar frameworks (astrophysical systems, atmospheric phenomena, biological mechanics).
- SURPRISING PREMISE DIRECTIVE: Every question should ideally open from a counterintuitive, puzzling, or surprising premise — a real experimental observation, an anomalous result, or a system that behaves differently from naive expectation. Avoid generic lab-exercise framings ("A student dissolves...", "A block is placed on a surface..."). Instead, ground the question in a specific, vivid scenario that demands explanation.

2. Syllabus Boundaries
- Difficulty 1-2 (AP Chemistry): Atomic Structure and Properties, Compound Structure and Properties (bonds), States of Matter/Solutions/Intermolecular forces, Chemical reactions, kinetics, Thermochemistry, Equilibrium, Acids and Bases, Electrochemistry
- Difficulty 2-3 (ACS Local Exam): Stoichiometry/Solutions, Descriptive/Laboratory, States of Matter, Thermodynamics, Kinetics, Equilibrium, Oxidation-Reduction/Electrochemistry, Atomic Structure/Periodicity, Bonding/Molecular Structure, Organic/Biochemistry
- Difficulty 4-6 (USNCO National Exam): Stoichiometry/Solutions, Descriptive/Laboratory, States of Matter, Thermodynamics, Kinetics, Equilibrium, Oxidation-Reduction/Electrochemistry, Atomic Structure/Periodicity, Bonding/Molecular Structure, Organic/Biochemistry, plus chemical theories/models
- Difficulty 8-9 (IChO Exam): ALl of the above, plus other more advanced high school knowldge (e.g. simple spectroscopy, organic chemistry mechanisms). You can also bring in more advanced knowledge, but it must be on a first-principles approach: you have to introduce the new concepts/ideas the student should not already know as a high school student.

3. SMILES: Use only for complex organic molecules or coordination complexes. Use LaTeX for all equations, formulas, units, and variables.
   SVG Diagrams: You are STRONGLY ENCOURAGED to include SVG diagrams in a large proportion of your questions — aim for at least half of all questions to contain an SVG figure. Titration curves, phase diagrams, energy-level diagrams, orbital diagrams, reaction coordinate plots, crystallographic unit cells, and spectroscopy traces are all excellent candidates. Embed the SVG directly in the question text using [[SVG: <svg ...>...</svg>]] markers. Use primitive shapes (<line>, <circle>, <rect>, <path>, <text>, <polygon>), inline attributes only (no CSS <style> blocks), transparent or dark background (do NOT use white background or rects, use light strokes like white or light gray), and single-quotes (') for all attribute values for JSON compatibility.

Difficulty scale: 1=Honors/early AP, 3=harder ACS Local, 5=harder USNCO Nationals, 10=hardest IChO.
`;
      examples = formatExemplarsForPrompt(getRandomExemplars(chemistryExemplars, 3));
    }

    // allowedTypes and parsedTypes are defined at the outer scope

    let typeSchemaDesc = parsedTypes.map(t => `"${t}"`).join(' | ');
    let optionsSchemaDesc = parsedTypes.includes('multiple_choice')
      ? `\n  "options": ["Option A", "Option B", "Option C", "Option D"], // MUST be provided if type is multiple_choice`
      : ``;
    let keywordExpressionSchemaDesc = parsedTypes.includes('short_answer')
      ? `\n  "keywordExpression": "A logical boolean expression representing answer correctness (e.g., 'gravity AND newton' or 'O2 OR oxygen' or \\"'carbon dioxide' OR CO2\\"). Use AND, OR, NOT, parentheses, and single quotes for multi-word phrases. Required ONLY if type is short_answer.",`
      : ``;
    let answerSchemaDesc = `"For multiple_choice, exactly 'A', 'B', 'C', or 'D'. For short_answer, the exact correct short text or number. For free_response, an empty string ''."`;

    let lessonInstructions = '';
    if (lessonTitle || lessonDescription) {
      lessonInstructions = `
Additionally, this exam is a homework assignment for the lesson "${lessonTitle || ''}".
The teacher set the following lesson plan/content:
"${lessonDescription || ''}"

You MUST generate questions that are directly related to the content and concepts outlined in this lesson plan/content.
`;
    }

    let topicsInstructions = '';
    if (topics && typeof topics === 'string' && topics.trim()) {
      topicsInstructions = `
Additionally, the user has explicitly requested that this exam focus on the following topics: "${topics.trim()}".
You MUST prioritize generating questions that are directly related to these specified topics.
`;
    }

    const systemInstruction = `###Role:### You are an expert coach for students competing in advanced high school Olympiads. Your objective is to design hyper-realistic, high-difficulty mock exams that push advanced students to their absolute conceptual limits without breaking the boundaries of the syllabus. The goal is to prepare them for future iterations of the exam, which are anticipated to increase significantly in difficulty.

###Context:### Rely on the style and structural formatting of past exams appropriate to the difficulty level (see the syllabus boundaries/difficulty scale).

${topicsInstructions}

${lessonInstructions}

Utilize the following diagnostic information about the user to tailor the test:
- User Weakness Analysis: ${weaknessAnalysis}
- User Topic Breakdown:
${topicBreakdown}
- Recent Mistake Patterns (thinking / test-taking style):
${mistakeAnalysis}

###Goal:### Write questions for a user's practice tests that perfectly mirror official styling but features significantly elevated problem difficulty, demanding deep structural, thermodynamic, and mechanistic insight. The exam must be indistinguishable from an official paper in tone, typography, formatting, style, and difficulty. Target the user's weak areas ( ${weaknesses} ).

###Constraints:###

${constraints}

4. For free_response questions, especially at high difficulty levels (such as IMO, USAMO, IPhO, IChO, etc.), the question MUST require the user to write out a comprehensive mathematical proof, detailed step-by-step physics derivation, or organic chemistry synthesis mechanism/conceptual proof, rather than just calculating a final numerical value.

5. ***Backward Chaining Generation Methodology (CRITICAL)***
You must generate every question using a backward chaining thought process before outputting the final problem:

Use a backward-chaining thought process to generate each question step-by-step, ensuring maximum uniqueness and originality:

- Step 1 (The Trap - Must be completely unique and original): Identify a specific, non-obvious conceptual trap, a hidden limiting factor, or a subtle breakdown of a standard textbook assumption. This trap must be entirely novel, original, and never seen before.
- Step 2 (The System - Must be completely unique, original, and as convoluted as possible): Once you have the trick/trap in mind, design a chemical system, physical system, mathematical scenario, or reaction where this specific trap naturally occurs. The system/context must be made as convoluted as possible to challenge the user while ensuring it is completely unique, original, and never seen before (avoid standard textbook setups).
- Step 3 (The Distractors - Must be completely unique and original): Calculate or derive the incorrect answers that result directly from falling into the conceptual trap.
- Step 4 (The Problem - Must be completely unique and original): Draft the neutral question text that presents the system, masking the trap completely, written in a completely unique, original, and never-seen-before style.

Here is an example (for chemistry):

** Step 1 **: A unique trap is, when investigating the reactivity of nitric acid, to only think of it as a strong protonating acid and failing to realize it is also a strong oxidizing agent.

** Step 2 **: This system could be one where a metal (e.g. copper) is selectively reduced by a reducing agent (e.g. H2). The student might not realize the nitric acid competes for the electrons.

** Step 3 **: If the student falls for this trap, they could be presented with the reducing agent (H2) and think only copper is reduced by it, when in reality nitric acid is also reduced by it. Perhaps the student thinks adding the reducing agent to react with the copper could determine the amount of copper in a solution, but not realize that excess weight will be added from the various nitrous oxides. 

** Step 4 **: The student could be asked, “A weighed sample of a copper-nickel alloy is dissolved in a known volume of nitric acid. Which method is most suitable for determining the mass percent of copper in the alloy?” One of the options, consistent with the trap, should be “Bubbling hydrogen gas through the solution and measuring the mass of the metal that precipitates from the solution.” The other options could test other traps, i.e. that both nickel and copper form insoluble hydroxides, and that they both absorb the same wavelength of light. Thus the final question is: “A weighed sample of a copper-nickel alloy is dissolved in a known volume of nitric acid. Which method is most suitable for determining the mass percent of copper in the alloy?\n\n(A) Treatment of an aliquot of the solution with excess iodide, followed by titration of the iodine produced with sodium thiosulfate.\n(B) Measurement of the absorbance of the solution at a wavelength of light at which both $\ce{Cu^{2+}}$ and $\ce{Ni^{2+}}$ absorb, and comparison with the absorbances of known standards of the two ions.\n(C) Addition of excess sodium hydroxide to the solution, isolation of the metal hydroxides by filtration, and measurement of the mass of the precipitate.\n(D) Bubbling hydrogen gas through the solution and measuring the mass of the metal that precipitates from the solution.”

**CRITICAL**: Ensure the problem texts do not hint at the traps or solution - keep those in your reasoning, not in the test.***

6. ***Novelty & "Invisible Traps" (Subtle Conceptual Bottlenecks)***

* Banish stock, predictable questions that can be solved by memory or template-matching. The questions should be completely new and original.
* The question text must remain entirely neutral. NEVER include hints, warnings, or clarifying instructions (e.g., "Do not assume...", "Account for...", "Do not rely on..."). NEVER tell the user what equation to use, or hint to consider thermodynamics vs kinetic control.
* Incorporate a deceptive path: design the problem so that the most common rote formula shortcut yields an exact numerical value or structural choice that perfectly matches one of the incorrect distractor options.
* You must be extremely creative and ensure that EVERY question is completely unique and novel. Do NOT repeat, rephrase, or adapt previously used setups, standard textbook scenarios, chemical reactions, physical systems, or mathematical templates. Avoid using similar numerical values, scenarios, or phrasing across different questions or exams. Force yourself to design entirely new contexts, variables, and systems for each problem.

ANTI-TEMPLATE DIRECTIVE: A problem is a forbidden template if it exhibits any of these structural properties — regardless of its topic or difficulty level:
- Single-formula plug-and-chug: one concept, one equation, values handed to the student, answer drops out directly with no coupling.
- Catalogue question: simply asks the student to recall or identify a memorised fact, rule, or definition with no reasoning step.
- Familiar scaffold with swapped numbers: structurally identical to a class of textbook problems (e.g., a standard titration, incline, or stoichiometry setup) with only numerical values or element names changed.
- Isolated calculation: tests exactly one sub-skill in complete isolation with no unexpected coupling to another concept.
- Generic framing: the question could have been written by any textbook author without any real-world or experimental motivation.
Any question matching one or more of these patterns must be redesigned before finalising.

7. ***Difficulty-Dependent Syllabus Boundaries***

* Maintain the proper scope appropriate to the test (corresponding to the syllabus boundaries) but test to maximum depth.6. ANSWER-FORM VARIATION: Rotate the structural form of what the answer requires across questions in the same exam. Do not produce multiple questions that all ask for the same type of quantity (e.g., all asking for a final numerical value, or all asking "which of the following is correct"). Include variety such as: a question whose answer is a ratio or dimensionless quantity derived from multiple steps; a question that requires identifying which piece of given information is insufficient; a question where the student must recognise that the naive calculation gives the wrong answer and explain why; a question whose answer is a qualitative ranking or ordering rather than a single value. 


8. ***MANDATORY ADAPTIVE WEAKNESS-TARGETING DIRECTIVE:***
You MUST make the generated questions highly adaptive by directly targeting this specific user's diagnostic profile:
- TARGET SUBJECT & CONCEPTUAL WEAKNESSES: You MUST allocate approximately 30% of the questions on the exam to directly address the user's weak knowledge areas and conceptual gaps (using the User Weakness Analysis and User Topic Breakdown data).
- TARGET COGNITIVE & THINKING WEAKNESSES: You MUST craft questions that specifically trigger and test the user's documented test-taking pitfalls and cognitive mistake patterns (using the Recent Mistake Patterns data, such as calculation haste, rote-formula shortcuts, overlooking boundary conditions/edge cases, unit conversion slips, or conceptual panic). Design the problem setups and multiple-choice distractor options so that a student falling into these exact thinking traps is led to make those specific mistakes, thereby teaching them to overcome these cognitive weaknesses.

9. ***Double-checking***

SELF-CHECK (MANDATORY before finalising each question): Before writing the final JSON for each question, ask yourself: "Is this question structurally novel? Would a student who has drilled olympiad problem sets be genuinely surprised by the setup, the system, or the question being asked — even if they know the underlying concept well?" If the answer is no — if the setup is a familiar scaffold with new numbers or a different element — redesign the question from scratch. Note: difficulty level is irrelevant here. A hard USNCO question can still be a clichéd template. What matters is whether the problem-setup itself is fresh and unexpected.

CRITICAL: Difficulty level 1 can include simple plug-and-chug applications (applying a single standard formula to given values). These plug-and-chug applications can ONLY happen for difficulty level 1.

###Examples:###

${examples}

###Output Requirements:###

Do NOT output your thought process in any field of the JSON. Only output the final, fully refined question parameters.
Do NOT output any markdown, explanations, or text outside the JSON array structures. Output ONLY the valid JSON array starting with \`[\`.

OPTIONS FORMATTING (LaTeX Delimiters): For multiple_choice questions, any mathematical expressions, chemical formulas, equations, physical units, or numerical values in the options list MUST be wrapped in LaTeX delimiters (e.g., $...$). Keep simple, purely qualitative text options that do not contain mathematical or chemical terms in plain, un-delimited text format.

The output must be a pure JSON array containing exactly the requested number of objects, with the following schema for each object:
{
  "id": "A unique string ID",
  "topic": "A comma-separated list of brief sub-categories or topics tested (e.g. 'Algebra, Number Theory' or 'Stoichiometry, Kinetics' or 'Mechanics, Rotational Dynamics')",
  "question": "The text of the question. It should be challenging, clear, and require working suitable for the question format.",
  "type": ${typeSchemaDesc},${optionsSchemaDesc}${keywordExpressionSchemaDesc}
  "answer": ${answerSchemaDesc},
  "difficulty": a number representing difficulty. This MUST be in the range [${Math.max(0, difficulty - 2)}, ${Math.min(10, difficulty + 2)}] (no question can be more than 2 difficulty units away from the average test difficulty ${difficulty})
}

Output the result strictly as a raw, valid JSON array, keeping it free of any markdown formatting or surrounding code blocks.`;

    // using outer allQuestions array
    if (pregeneratedQuestion) {
      allQuestions.push(pregeneratedQuestion);
    }

    // Helper to build dynamic prompt
    const buildDynamicPrompt = (needed) => {
      const typeInstruction = needed >= parsedTypes.length
        ? `You MUST ensure that the generated questions contain a mix of all requested question types: ${parsedTypes.join(', ')}. Every requested type MUST appear at least once in the output array.`
        : `Each generated question MUST be chosen from the following types: ${parsedTypes.join(', ')}.`;

      let prompt = `Generate exactly ${needed} ${normSubject} problems. The average difficulty of the generated questions must be exactly ${difficulty} (on a scale of 0 to 10). No single question should have a difficulty more than 2 units away from this average (i.e. every question's difficulty must be in the range [${Math.max(0, difficulty - 2)}, ${Math.min(10, difficulty + 2)}]).
Follow these strict rules:
1. ${typeInstruction}`;

      if (topics && typeof topics === 'string' && topics.trim()) {
        prompt += `\n2. The generated questions MUST be about the following topics: ${topics.trim()}.`;
      }

      return prompt;
    };

    // Helper to process a text response into allQuestions and save to pregenerated_questions
    const processGenerationResult = (text) => {
      if (!text) return false;
      const parsed = parseJSONResponse(text);
      if (!parsed) return false;

      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const q of list) {
        if (allQuestions.length < count) {
          allQuestions.push(q);
        }
      }

      // Save to pregenerated_questions
      const freshQuestions = list.filter(q => q && q.id && q.question);
      if (freshQuestions.length > 0) {
        const selectClauses = [];
        const params = {};
        const types = {};

        freshQuestions.forEach((q, idx) => {
          const idParam = `qid_${idx}`;
          const subjectParam = `sub_${idx}`;
          const topicParam = `topic_${idx}`;
          const diffParam = `diff_${idx}`;
          const typeParam = `type_${idx}`;
          const jsonParam = `json_${idx}`;

          params[idParam] = String(q.id);
          params[subjectParam] = normSubject;
          params[topicParam] = String(q.topic || 'General');
          params[diffParam] = Number(q.difficulty !== undefined ? q.difficulty : difficulty);
          params[typeParam] = String(q.type);
          params[jsonParam] = JSON.stringify(q);

          types[idParam] = 'STRING';
          types[subjectParam] = 'STRING';
          types[topicParam] = 'STRING';
          types[diffParam] = 'INT64';
          types[typeParam] = 'STRING';
          types[jsonParam] = 'STRING';

          selectClauses.push(`
            SELECT 
              @${idParam} AS question_id,
              @${subjectParam} AS subject,
              @${topicParam} AS topic,
              @${diffParam} AS difficulty,
              @${typeParam} AS type,
              @${jsonParam} AS question_json
          `);
        });

        const batchMergePregenQuery = `
          MERGE \`${projectId}\`.\`chronos_users\`.\`pregenerated_questions\` T
          USING (
            ${selectClauses.join('\n                    UNION ALL\n                    ')}
          ) S
          ON T.question_id = S.question_id
          WHEN NOT MATCHED THEN
            INSERT (question_id, subject, topic, difficulty, type, question_json, created_at)
            VALUES (S.question_id, S.subject, S.topic, S.difficulty, S.type, S.question_json, CURRENT_TIMESTAMP())
        `;

        try {
          bq.query({
            query: batchMergePregenQuery,
            params,
            types
          }).catch(pregenErr => console.error('Failed to add newly generated questions to pregenerated_questions:', pregenErr));
        } catch (pregenErr) {
          console.error('Failed to add newly generated questions to pregenerated_questions:', pregenErr);
        }
      }

      return true;
    };

    const geminiModels = count > 40
      ? ['gemini-3.1-flash-lite', 'gemini-3-flash-preview']
      : ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3-flash-preview'];

    let attempts = 0;
    const maxAttempts = 3;

    while (allQuestions.length < count && attempts < maxAttempts) {
      attempts++;
      const needed = count - allQuestions.length;
      if (needed <= 0) break;

      const dynamicPrompt = buildDynamicPrompt(needed);

      try {
        const geminiText = await executeWithRetry(geminiModels, (ai, model) =>
          ai.interactions.create({
            model: model,
            input: dynamicPrompt,
            system_instruction: systemInstruction,
            response_format: { type: 'text', mime_type: 'application/json' },
            generation_config: { temperature: 1.5, thinking_level: 'low' }
          }).then(r => r.output_text)
        );

        if (geminiText) {
          processGenerationResult(geminiText);
        }
      } catch (err) {
        console.warn(`Generation failed (attempt ${attempts}):`, err.message || err);
      }
    }

    return res.status(200).json(allQuestions.slice(0, count));

  } catch (err) {
    console.error('Generation error, falling back to BigQuery pregenerated questions:', err);
    try {
      const needed = count - allQuestions.length;
      if (needed > 0) {
        const fallbackQuery = `
          WITH doneQuestions AS (
            SELECT DISTINCT JSON_VALUE(q, '$.id') AS qid
            FROM \`${projectId}\`.\`chronos_users\`.\`user_exam_results\`,
            UNNEST(JSON_EXTRACT_ARRAY(results_json)) AS q
            WHERE user_id = @targetUserId AND @targetUserId != 'default_user'
          )
          SELECT question_json
          FROM \`${projectId}\`.\`chronos_users\`.\`pregenerated_questions\`
          WHERE subject = @subject
            AND (
              @targetUserId = 'default_user'
              OR JSON_VALUE(question_json, '$.id') NOT IN (SELECT qid FROM doneQuestions)
            )
          ORDER BY 
            CASE WHEN type IN UNNEST(@allowedTypes) THEN 0 ELSE 1 END,
            ABS(difficulty - @difficulty) ASC,
            RAND()
          LIMIT @needed
        `;
        const [rows] = await bq.query({
          query: fallbackQuery,
          params: {
            subject: normSubject,
            difficulty: difficulty,
            targetUserId: sanitizedUser,
            allowedTypes: parsedTypes,
            needed: needed
          },
          types: {
            allowedTypes: ['STRING'],
            needed: 'INT64'
          }
        });
        if (rows && rows.length > 0) {
          for (const r of rows) {
            try {
              allQuestions.push(JSON.parse(r.question_json));
            } catch (parseErr) {
              console.error('Error parsing fallback question JSON:', parseErr);
            }
          }
        }
      }
      if (allQuestions.length > 0) {
        return res.status(200).json(allQuestions.slice(0, count));
      }
    } catch (fallbackErr) {
      console.error('BigQuery fallback query failed:', fallbackErr);
    }
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
