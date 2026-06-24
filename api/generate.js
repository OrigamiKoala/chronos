import { BigQuery } from '@google-cloud/bigquery';
import { executeWithRetry, parseJSONResponse } from './_siliconflow.js';

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
    "difficulty": 5,
    "detailedSolution": "Say WLOG that $AB$ is the top side of the square, and the square is of side length 1. Let us say that the midpoint of $AB$ is $M$, while the midpoint of $CD$ is $Q$. Drawing a vertical line to split the square in half, we notice that if $P$ is to the left of the line, $AP < BP$, and if P is to the right of the line, $AP > BP$. Also, drawing a quarter circle of radius 1 from point $A$, we can split the area into points P for which $AP < AB$ and $AP > AB$. Because of our constraints, there are 2 cases:\n\nCase 1: $AB > AP > BP$ In this case, $P$ will be to the right of the vertical line and inside of the quarter circle. Let us say that the intersection of the vertical line and quarter circle is $N$. The distance from $N$ to $AD$ is 1/2, and we can say that $\\\\angle BAN$ is $60^\\circ$. Sector $BAN$ of circle $A$ would therefore have an area of $\\\\frac{\\\\pi}{6}$. Because $\\\\triangle AMN$ is a 30-60-90 triangle, the area of $AMN$ is $\\\\frac{\\\\sqrt{3}}{8}$. The probability of case 1 happening should then be $\\\\frac{\\\\pi}{6}-\\\\frac{\\\\sqrt{3}}{8}$.\n\nCase 2: $AB < AP < BP$ In this case, $P$ will be to the left of the vertical line and outside of the quarter circle. Knowing that the quarter circle's area is $\\\\frac{\\\\pi}{4}$, we can subtract the probability of Case 1 happening to get the chance that $P$ is on the left of the vertical line and in circle $A$. Doing this would give $\\\\frac{\\\\pi}{12}+\\\\frac{\\\\sqrt{3}}{8}$. To get the probability of Case 2 happening, we can subtract this from the area of rectangle $AMQD$. This would give us $\\\\frac{1}{2}-\\\\frac{\\\\pi}{12}-\\\\frac{\\\\sqrt{3}}{8}$.\n\nAdding both cases, we get the total probability as $\\\\frac{1}{2}+\\\\frac{\\\\pi}{12}-\\\\frac{\\\\sqrt{3}}{4} = \\\\frac{6+\\\\pi-3\\\\sqrt{3}}{12}$. Formatting this gives us $6+1+3+3+12 = \\\\boxed{\\\\textbf{(A) } 25}$."
  },
  {
    "id": "math_ex2",
    "topic": "Combinatorics, Algebra, Number Theory",
    "question": "For each nonnegative integer $r$ less than $502$, define\\\\n\\\\n$$S_r=\\\\sum_{m\\\\geq 0}\\\\binom{10,000}{502m+r},\\\\n\\\\n$$where $\\\\binom{10,000}{n}$ is defined to be $0$ when $n>10,000$. That is, $S_r$ is the sum of all the binomial coefficients of the form $\\\\binom{10,000}{k}$ for which $0\\\\leq k\\\\leq 10,000$ and $k-r$ is a multiple of $502$. Find the number of integers in the list $S_0,S_1,S_2,\\\\dots,S_{501}$ that are multiples of the prime number $503$.",
    "type": "short_answer",
    "answer": "39",
    "difficulty": 7,
    "detailedSolution": "Take player $v^*$ with max out-degree $\\\\Delta$. Let $W$ = wins, $L$ = losses. For any $u \\\\in L$: if $u$ beat all of $W$, then $d^+(u) \\\\geq \\\\Delta+1$, contradiction. So some $w \\\\in W$ beats $u$, and $v^*$ dominates $u$ via $w$. $v^*$ trivially dominates $W$ directly. QED."
  },
  {
    "id": "math_ex3",
    "topic": "Combinatorics",
    "question": "The integers from $1$ through $25$ are arbitrarily separated into five groups of $5$ numbers each. The median of each group is identified. Let $M$ equal the median of the five medians. What is the least possible value of $M$?\\\\n\\\\n$\\\\textbf{(A) }9 \\\\qquad \\\\textbf{(B) }10 \\\\qquad \\\\textbf{(C) }12 \\\\qquad \\\\textbf{(D) }13 \\\\qquad \\\\textbf{(E) }14$",
    "type": "multiple_choice",
    "options": ["$9$", "$10$", "$12$", "$13$", "14"],
    "answer": "A",
    "difficulty": 3,
    "detailedSolution": "If a group has median $m$, then we must have that $3$ of the numbers in that group are $\\\\leq m$. Since there are 5 different groups, $3$ groups must have a median $\\\\leq M$, so there are at least $3\\\\cdot3=9$ numbers that are $\\\\leq M$. Since there are at least $9$ numbers that are $\\\\leq M$, we have $M$ at minimum $\\\\boxed{\\\\textbf{(A) }9}.$"
  },
  {
    "id": "math_ex4",
    "topic": "Number Theory",
    "question": "Let $a$ and $b$ be positive integers such that $ab + 1$ divides $a^{2} + b^{2}$. Show that $\\\\frac {a^{2} + b^{2}}{ab + 1}$ is the square of an integer.",
    "type": "free_response",
    "answer": "",
    "difficulty": 10,
    "detailedSolution": "Choose integers $a,b,k$ such that $a^2+b^2=k(ab+1)$ Now, for fixed $k$, out of all pairs $(a,b)$ choose the one with the lowest value of $\\\\min(a,b)$. Label $b'=\\\\min(a,b), a'=\\\\max(a,b)$. Thus, $a'^2-kb'a'+b'^2-k=0$ is a quadratic in $a'$. Should there be another root, $c'$, the root would satisfy: $b'c'\\\\leq a'c'=b'^2-k<b'^2\\\\implies c'<b'$ Thus, $c'$ isn't a positive integer (if it were, it would contradict the minimality condition). But $c'=kb'-a'$, so $c'$ is an integer; hence, $c'\\\\leq 0$. In addition, $(a'+1)(c'+1)=a'c'+a'+c'+1=b'^2-k+b'k+1=b'^2+(b'-1)k+1\\\\geq 1$ so that $c'>-1$. We conclude that $c'=0$ so that $b'^2=k$.\n\nThis construction works whenever there exists a solution $(a,b)$ for a fixed $k$, hence $k$ is always a perfect square."
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
    "detailedSolution": "Let $OB = OC = d$. The time interval between the emission of the two pulses is \\\\delta t = t_2 - t_1. The arrival time of the first pulse at $O$ is $t'_1 = t_1 + \\\\frac{d + v \\\\delta t \\\\cos \\\\theta}{c}$. The arrival time of the second pulse at $O$ is $t'_2 = t_2 + \\\\frac{d}{c}$. The observed time interval \\\\delta t' is \\\\delta t' = t'_2 - t'_1 = \\\\delta t (1 - \\\\beta \\\\cos \\\\theta)$. The apparent transverse velocity is $v_T = \\\\frac{v \\\\delta t \\\\sin \\\\theta}{\\\\delta t'}$. Substituting gives $\\\\beta_T = \\\\frac{v_T}{c} = \\\\frac{\\\\beta \\\\sin \\\\theta}{1 - \\\\beta \\\\cos \\\\theta}$."
  },
  {
    "id": "phys_ex2",
    "topic": "Mechanics",
    "question": "A projectile of total mass $4M$ is launched from the ground at position $x=0$ and time $t=0$. The projectile is launched with an initial speed $v_{0}$ at an angle \\\\theta above the horizontal. When the projectile is at the highest point in its trajectory, it breaks into Pieces Q and R of masses $M$ and $3M$, respectively. The motion of the projectile is described for the following times:\n    - At $t=t_{1}$, immediately after the projectile breaks apart, the two pieces are moving away from each other horizontally.\n    - At $t=t_{2}$, Piece Q reaches the ground at $x=0$ and Piece R reaches the ground at $x=x_{2}$.\n\nPart A: The horizontal and vertical components of a momentum vector are represented by $p_{x}$ and $p_{y}$, respectively. The shaded bars in Figure 2 represent $p_{x}$ and $p_{y}$ of the projectile immediately after $t=0$. On Figure 3, draw shaded bars to represent $p_{x}$ and $p_{y}$ of Pieces Q and R at $t=t_{1}$.\n\nPart B: Derive an expression for $x_{2}$ in terms of $v_{0}$, \\\\theta, and physical constants, as appropriate. Begin your derivation by writing a fundamental physics principle or an equation from the reference information.\n\nPart C: The horizontal component of a velocity vector is represented by $v_{x}$. Figure 4 shows the horizontal component $v_{x,cm}$ of the velocity of the center of mass of the projectile as a function of $t$ during the time interval $0 < t < t_{1}$. On Figure 4, sketch a line or curve to represent $v_{x}$ as a function of $t$ for the time interval $t_{1} < t < t_{2}$ for each of the following:\n    - Piece Q\n    - Piece R\n    - The center of mass of the two-piece system\nClearly label all lines or curves.\n\nPart D: Consider a case in which the projectile is launched at the same angle and initial speed as initially described. When the projectile breaks into Pieces Q and R, Piece Q falls straight down. In this case, Piece R reaches the ground at $x=x_{new}$. Indicate whether $x_{new}$ is greater than, less than, or equal to $x_{2}$ by writing one of the following:\n    - $x_{new} > x_{2}$\n    - $x_{new} < x_{2}$\n    - $x_{new} = x_{2}$\nBriefly justify your answer either by referencing a feature of the representations you drew in part A or C or by using conceptual reasoning beyond algebraic solutions.",
    "type": "free_response",
    "answer": "",
    "difficulty": 3,
    "detailedSolution": "Part A: Horizontal momentum is conserved, and vertical momentum is zero at highest point.\nPart B: $x_{cm} = (v_0 \\\\cos \\\\theta) t_2$. Lands at $x_2 = \\\\frac{4}{3} x_{cm} = \\\\frac{8 v_0^2 \\\\sin \\\\theta \\\\cos \\\\theta}{3g}$.\nPart C: CM velocity is constant. Q is negative, R is positive.\nPart D: $x_{new} > x_2$ because $v_{x,R,new} > v_{x,R}$ due to $v_{x,Q} = 0$ instead of $v_{x,Q} < 0$."
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
    "detailedSolution": "Method A exploits the selective redox: $\\\\ce{2Cu^{2+} + 4I^- -> 2CuI + I_2}$. The liberated $\\\\ce{I_2}$ is titrated with thiosulfate, giving moles of Cu specifically. $\\\\ce{Ni^{2+}}$ does not react with iodide under these conditions, so it does not interfere. Method B fails because both ions absorb at the same wavelength, making the absorbance non-specific. Method C fails because both $\\\\ce{Cu(OH)_2}$ and $\\\\ce{Ni(OH)_2}$ precipitate together. Method D fails because $\\\\ce{HNO_3}$ is a strong oxidizing agent that reacts with $\\\\ce{H_2}$ before it can reduce the metal ions."
  },
  {
    "id": "chem_ex2",
    "topic": "Acid-Base Titration & Gas Laws",
    "question": "A is an ionic compound that contains only the elements hydrogen, nitrogen, and oxygen.\\n\\na. A 1.000-g sample of A is dissolved in 20 mL water and titrated with 0.5000 M NaOH solution, giving the data shown below. What is the molar mass of A?\\n\\n[[SVG: <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 620 400' style='max-width:100%;background:white'><rect x='60' y='20' width='520' height='320' fill='white'/><g stroke='#ddd' stroke-width='0.5'><line x1='60' y1='52' x2='580' y2='52'/><line x1='60' y1='84' x2='580' y2='84'/><line x1='60' y1='116' x2='580' y2='116'/><line x1='60' y1='148' x2='580' y2='148'/><line x1='60' y1='180' x2='580' y2='180'/><line x1='60' y1='212' x2='580' y2='212'/><line x1='60' y1='244' x2='580' y2='244'/><line x1='60' y1='276' x2='580' y2='276'/><line x1='60' y1='308' x2='580' y2='308'/><line x1='103' y1='20' x2='103' y2='340'/><line x1='147' y1='20' x2='147' y2='340'/><line x1='190' y1='20' x2='190' y2='340'/><line x1='233' y1='20' x2='233' y2='340'/><line x1='277' y1='20' x2='277' y2='340'/><line x1='320' y1='20' x2='320' y2='340'/><line x1='363' y1='20' x2='363' y2='340'/><line x1='407' y1='20' x2='407' y2='340'/><line x1='450' y1='20' x2='450' y2='340'/><line x1='493' y1='20' x2='493' y2='340'/><line x1='537' y1='20' x2='537' y2='340'/></g><rect x='60' y='20' width='520' height='320' fill='none' stroke='#999' stroke-width='1'/><g font-family='Arial,sans-serif' font-size='12' text-anchor='end' fill='black'><text x='55' y='24'>14</text><text x='55' y='56'>13</text><text x='55' y='88'>12</text><text x='55' y='120'>11</text><text x='55' y='152'>10</text><text x='55' y='184'>9</text><text x='55' y='216'>8</text><text x='55' y='248'>7</text><text x='55' y='280'>6</text><text x='55' y='312'>5</text><text x='55' y='344'>4</text></g><text font-family='Arial,sans-serif' font-size='14' font-weight='bold' text-anchor='middle' transform='translate(20,180) rotate(-90)'>pH</text><g font-family='Arial,sans-serif' font-size='12' text-anchor='middle' fill='black'><text x='60' y='358'>0</text><text x='103' y='358'>5</text><text x='147' y='358'>10</text><text x='190' y='358'>15</text><text x='233' y='358'>20</text><text x='277' y='358'>25</text><text x='320' y='358'>30</text><text x='363' y='358'>35</text><text x='407' y='358'>40</text><text x='450' y='358'>45</text><text x='493' y='358'>50</text><text x='537' y='358'>55</text><text x='580' y='358'>60</text></g><text x='320' y='390' font-family='Arial,sans-serif' font-size='14' text-anchor='middle'>mL 0.5000 M NaOH added</text><path d='M 60 314.4 C 60 250,68.7 237.6,77.3 218.4 S 103.3 192.8,146.7 173.6 S 190 160.8,233.3 144.8 S 268 109.6,276.7 77.6 S 285.3 68,320 58.4 S 406.7 48.8,580 42.4' fill='none' stroke='black' stroke-width='2'/></svg>]]\\n\\nb. When a 1.000-g sample of A is heated at 230 °C in an evacuated 1.50 L vessel, it decomposes into gaseous products, giving a final pressure of 784 mm Hg. How many moles of gas are formed in this reaction?\\n\\nc. If the gases produced from the decomposition of 1.000 g of A are instead first passed through a column packed with magnesium perchlorate (which strongly absorbs water vapor) and then collected at 25 °C and a pressure of 755 mm Hg, the total volume of gas is 308 mL. How many moles of gas are collected in this experiment?\\n\\nd. What is the formula of A? Explain your reasoning.\\n\\ne. Write Lewis structures for the cation and the anion present in A and for the product(s) of its decomposition at 230 °C. Your Lewis structures should include all bonds, lone pairs, and nonzero formal charges. You should show all significant resonance structures for each species.",
    "type": "free_response",
    "answer": "",
    "difficulty": 5,
    "detailedSolution": "(a) Moles OH- = 0.0125, so M = 80.0 g/mol. (b) PV=nRT gives 0.0375 mol total gas. (c) 0.0125 mol dry gas. (d) 1:3 total gas ratio, 1:2 water ratio → $\\\\ce{NH4NO3}$ (M=80.04), decomposing to $\\\\ce{N2O + 2H2O}$. (e) $\\\\ce{NH4+}$: tetrahedral N with +1 charge. $\\\\ce{NO3-}$: trigonal planar with resonance. $\\\\ce{N2O}$: two resonance structures ($\\\\ce{N#[N+][O-]}$ and $\\\\ce{[N-]=[N+]=O}$)."
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
    "difficulty": 5,
    "detailedSolution": "Under acidic conditions (low pH) and intermediate reduction potentials (between metallic $\\\\text{Hg}(l)$ and $\\\\text{Hg}^{2+}(aq)$), mercury(I) exists as the stable diatomic cation $\\\\text{Hg}_2^{2+}(aq)$."
  },
  {
    "id": "chem_ex4",
    "topic": "Chemical Equilibrium, Thermodynamics, Gas Laws",
    "question": "Solid calcium carbonate is in equilibrium with calcium oxide and carbon dioxide, with $K_{\\\\text{p}} = 0.12$ bar at $1200$ K.\\\\n\\\\n$$\\\\text{CaCO}_3(s) \\\\rightleftharpoons \\\\text{CaO}(s) + \\\\text{CO}_2(g) \\\\quad K_{\\\\text{eq}} = 0.12\\\\text{ at } 1200\\\\text{ K}$$\\\\n\\\\nA $1.00$ g sample of $\\\\text{CaCO}_3$ ($M = 100.09$) is placed in an evacuated piston which is allowed to equilibrate at $1200$ K. How will the pressure in the piston after equilibrium is attained depend on the volume of the piston?\\\\n\\\\nOption (A)\\\\n[[SVG: <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 300' width='100%' height='100%' style='background-color: #ffffff;'><text x='30' y='40' font-family='Arial' font-size='22' font-weight='bold'>(A)</text><line x1='80' y1='240' x2='280' y2='240' stroke='#000000' stroke-width='1.2' /><line x1='80' y1='50' x2='80' y2='240' stroke='#000000' stroke-width='1.2' /><line x1='280' y1='50' x2='280' y2='240' stroke='#cccccc' stroke-width='0.8' /><line x1='80' y1='50' x2='280' y2='50' stroke='#cccccc' stroke-width='0.8' /><line x1='75' y1='50' x2='80' y2='50' stroke='#000000' /><text x='70' y='54' font-family='Arial' font-size='12' text-anchor='end'>0.14</text><line x1='75' y1='77.1' x2='80' y2='77.1' stroke='#000000' /><text x='70' y='81.1' font-family='Arial' font-size='12' text-anchor='end'>0.12</text><line x1='75' y1='104.3' x2='80' y2='104.3' stroke='#000000' /><text x='70' y='108.3' font-family='Arial' font-size='12' text-anchor='end'>0.10</text><line x1='75' y1='131.4' x2='80' y2='131.4' stroke='#000000' /><text x='70' y='135.4' font-family='Arial' font-size='12' text-anchor='end'>0.08</text><line x1='75' y1='158.6' x2='80' y2='158.6' stroke='#000000' /><text x='70' y='162.6' font-family='Arial' font-size='12' text-anchor='end'>0.06</text><line x1='75' y1='185.7' x2='80' y2='185.7' stroke='#000000' /><text x='70' y='189.7' font-family='Arial' font-size='12' text-anchor='end'>0.04</text><line x1='75' y1='212.9' x2='80' y2='212.9' stroke='#000000' /><text x='70' y='216.9' font-family='Arial' font-size='12' text-anchor='end'>0.02</text><line x1='75' y1='240' x2='80' y2='240' stroke='#000000' /><text x='70' y='244' font-family='Arial' font-size='12' text-anchor='end'>0.00</text><line x1='80' y1='240' x2='80' y2='245' stroke='#000000' /><text x='80' y='260' font-family='Arial' font-size='12' text-anchor='middle'>0</text><line x1='130' y1='240' x2='130' y2='245' stroke='#cccccc' /><text x='130' y='260' font-family='Arial' font-size='12' text-anchor='middle'>5</text><line x1='180' y1='240' x2='180' y2='245' stroke='#cccccc' /><text x='180' y='260' font-family='Arial' font-size='12' text-anchor='middle'>10</text><line x1='230' y1='240' x2='230' y2='245' stroke='#cccccc' /><text x='230' y='260' font-family='Arial' font-size='12' text-anchor='middle'>15</text><line x1='280' y1='240' x2='280' y2='245' stroke='#000000' /><text x='280' y='260' font-family='Arial' font-size='12' text-anchor='middle'>20</text><text x='45' y='145' font-family='Arial' font-size='13' text-anchor='middle' transform='rotate(-90,45,145)'>P, bar</text><text x='180' y='280' font-family='Arial' font-size='13' text-anchor='middle'>V, L</text><path d='M 80,77.1 L 163.1,77.1 Q 200,120 280,172.1' fill='none' stroke='#000000' stroke-width='1.5' /></svg>]]\\\\n\\\\nOption (B)\\\\n[[SVG: <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 300' width='100%' height='100%' style='background-color: #ffffff;'><text x='30' y='40' font-family='Arial' font-size='22' font-weight='bold'>(B)</text><line x1='80' y1='240' x2='280' y2='240' stroke='#000000' stroke-width='1.2' /><line x1='80' y1='50' x2='80' y2='240' stroke='#000000' stroke-width='1.2' /><line x1='280' y1='50' x2='280' y2='240' stroke='#cccccc' stroke-width='0.8' /><line x1='80' y1='50' x2='280' y2='50' stroke='#cccccc' stroke-width='0.8' /><line x1='75' y1='50' x2='80' y2='50' stroke='#000000' /><text x='70' y='54' font-family='Arial' font-size='12' text-anchor='end'>0.14</text><line x1='75' y1='77.1' x2='80' y2='77.1' stroke='#000000' /><text x='70' y='81.1' font-family='Arial' font-size='12' text-anchor='end'>0.12</text><line x1='75' y1='104.3' x2='80' y2='104.3' stroke='#000000' /><text x='70' y='108.3' font-family='Arial' font-size='12' text-anchor='end'>0.10</text><line x1='75' y1='131.4' x2='80' y2='131.4' stroke='#000000' /><text x='70' y='135.4' font-family='Arial' font-size='12' text-anchor='end'>0.08</text><line x1='75' y1='158.6' x2='80' y2='158.6' stroke='#000000' /><text x='70' y='162.6' font-family='Arial' font-size='12' text-anchor='end'>0.06</text><line x1='75' y1='185.7' x2='80' y2='185.7' stroke='#000000' /><text x='70' y='189.7' font-family='Arial' font-size='12' text-anchor='end'>0.04</text><line x1='75' y1='212.9' x2='80' y2='212.9' stroke='#000000' /><text x='70' y='216.9' font-family='Arial' font-size='12' text-anchor='end'>0.02</text><line x1='75' y1='240' x2='80' y2='240' stroke='#000000' /><text x='70' y='244' font-family='Arial' font-size='12' text-anchor='end'>0.00</text><line x1='80' y1='240' x2='80' y2='245' stroke='#000000' /><text x='80' y='260' font-family='Arial' font-size='12' text-anchor='middle'>0</text><line x1='130' y1='240' x2='130' y2='245' stroke='#cccccc' /><text x='130' y='260' font-family='Arial' font-size='12' text-anchor='middle'>5</text><line x1='180' y1='240' x2='180' y2='245' stroke='#cccccc' /><text x='180' y='260' font-family='Arial' font-size='12' text-anchor='middle'>10</text><line x1='230' y1='240' x2='230' y2='245' stroke='#cccccc' /><text x='230' y='260' font-family='Arial' font-size='12' text-anchor='middle'>15</text><line x1='280' y1='240' x2='280' y2='245' stroke='#000000' /><text x='280' y='260' font-family='Arial' font-size='12' text-anchor='middle'>20</text><text x='45' y='145' font-family='Arial' font-size='13' text-anchor='middle' transform='rotate(-90,45,145)'>P, bar</text><text x='180' y='280' font-family='Arial' font-size='13' text-anchor='middle'>V, L</text><path d='M 80,240 L 163.1,77.1 L 280,77.1' fill='none' stroke='#000000' stroke-width='1.5' /></svg>]]\\\\n\\\\nOption (C)\\\\n[[SVG: <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 300' width='100%' height='100%' style='background-color: #ffffff;'><text x='30' y='40' font-family='Arial' font-size='22' font-weight='bold'>(C)</text><line x1='80' y1='240' x2='280' y2='240' stroke='#000000' stroke-width='1.2' /><line x1='80' y1='50' x2='80' y2='240' stroke='#000000' stroke-width='1.2' /><line x1='280' y1='50' x2='280' y2='240' stroke='#cccccc' stroke-width='0.8' /><line x1='80' y1='50' x2='280' y2='50' stroke='#cccccc' stroke-width='0.8' /><line x1='75' y1='50' x2='80' y2='50' stroke='#000000' /><text x='70' y='54' font-family='Arial' font-size='12' text-anchor='end'>0.14</text><line x1='75' y1='77.1' x2='80' y2='77.1' stroke='#000000' /><text x='70' y='81.1' font-family='Arial' font-size='12' text-anchor='end'>0.12</text><line x1='75' y1='104.3' x2='80' y2='104.3' stroke='#000000' /><text x='70' y='108.3' font-family='Arial' font-size='12' text-anchor='end'>0.10</text><line x1='75' y1='131.4' x2='80' y2='131.4' stroke='#000000' /><text x='70' y='135.4' font-family='Arial' font-size='12' text-anchor='end'>0.08</text><line x1='75' y1='158.6' x2='80' y2='158.6' stroke='#000000' /><text x='70' y='162.6' font-family='Arial' font-size='12' text-anchor='end'>0.06</text><line x1='75' y1='185.7' x2='80' y2='185.7' stroke='#000000' /><text x='70' y='189.7' font-family='Arial' font-size='12' text-anchor='end'>0.04</text><line x1='75' y1='212.9' x2='80' y2='212.9' stroke='#000000' /><text x='70' y='216.9' font-family='Arial' font-size='12' text-anchor='end'>0.02</text><line x1='75' y1='240' x2='80' y2='240' stroke='#000000' /><text x='70' y='244' font-family='Arial' font-size='12' text-anchor='end'>0.00</text><line x1='80' y1='240' x2='80' y2='245' stroke='#000000' /><text x='80' y='260' font-family='Arial' font-size='12' text-anchor='middle'>0</text><line x1='130' y1='240' x2='130' y2='245' stroke='#cccccc' /><text x='130' y='260' font-family='Arial' font-size='12' text-anchor='middle'>5</text><line x1='180' y1='240' x2='180' y2='245' stroke='#cccccc' /><text x='180' y='260' font-family='Arial' font-size='12' text-anchor='middle'>10</text><line x1='230' y1='240' x2='230' y2='245' stroke='#cccccc' /><text x='230' y='260' font-family='Arial' font-size='12' text-anchor='middle'>15</text><line x1='280' y1='240' x2='280' y2='245' stroke='#000000' /><text x='280' y='260' font-family='Arial' font-size='12' text-anchor='middle'>20</text><text x='45' y='145' font-family='Arial' font-size='13' text-anchor='middle' transform='rotate(-90,45,145)'>P, bar</text><text x='180' y='280' font-family='Arial' font-size='13' text-anchor='middle'>V, L</text><line x1='80' y1='77.1' x2='280' y2='77.1' stroke='#000000' stroke-width='1.5' /></svg>]]\\\\n\\\\nOption (D)\\\\n[[SVG: <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 300' width='100%' height='100%' style='background-color: #ffffff;'><text x='30' y='40' font-family='Arial' font-size='22' font-weight='bold'>(D)</text><line x1='80' y1='240' x2='280' y2='240' stroke='#000000' stroke-width='1.2' /><line x1='80' y1='50' x2='80' y2='240' stroke='#000000' stroke-width='1.2' /><line x1='280' y1='50' x2='280' y2='240' stroke='#cccccc' stroke-width='0.8' /><line x1='80' y1='50' x2='280' y2='50' stroke='#cccccc' stroke-width='0.8' /><line x1='75' y1='50' x2='80' y2='50' stroke='#000000' /><text x='70' y='54' font-family='Arial' font-size='12' text-anchor='end'>0.14</text><line x1='75' y1='77.1' x2='80' y2='77.1' stroke='#000000' /><text x='70' y='81.1' font-family='Arial' font-size='12' text-anchor='end'>0.12</text><line x1='75' y1='104.3' x2='80' y2='104.3' stroke='#000000' /><text x='70' y='108.3' font-family='Arial' font-size='12' text-anchor='end'>0.10</text><line x1='75' y1='131.4' x2='80' y2='131.4' stroke='#000000' /><text x='70' y='135.4' font-family='Arial' font-size='12' text-anchor='end'>0.08</text><line x1='75' y1='158.6' x2='80' y2='158.6' stroke='#000000' /><text x='70' y='162.6' font-family='Arial' font-size='12' text-anchor='end'>0.06</text><line x1='75' y1='185.7' x2='80' y2='185.7' stroke='#000000' /><text x='70' y='189.7' font-family='Arial' font-size='12' text-anchor='end'>0.04</text><line x1='75' y1='212.9' x2='80' y2='212.9' stroke='#000000' /><text x='70' y='216.9' font-family='Arial' font-size='12' text-anchor='end'>0.02</text><line x1='75' y1='240' x2='80' y2='240' stroke='#000000' /><text x='70' y='244' font-family='Arial' font-size='12' text-anchor='end'>0.00</text><line x1='80' y1='240' x2='80' y2='245' stroke='#000000' /><text x='80' y='260' font-family='Arial' font-size='12' text-anchor='middle'>0</text><line x1='130' y1='240' x2='130' y2='245' stroke='#cccccc' /><text x='130' y='260' font-family='Arial' font-size='12' text-anchor='middle'>5</text><line x1='180' y1='240' x2='180' y2='245' stroke='#cccccc' /><text x='180' y='260' font-family='Arial' font-size='12' text-anchor='middle'>10</text><line x1='230' y1='240' x2='230' y2='245' stroke='#cccccc' /><text x='230' y='260' font-family='Arial' font-size='12' text-anchor='middle'>15</text><line x1='280' y1='240' x2='280' y2='245' stroke='#000000' /><text x='280' y='260' font-family='Arial' font-size='12' text-anchor='middle'>20</text><text x='45' y='145' font-family='Arial' font-size='13' text-anchor='middle' transform='rotate(-90,45,145)'>P, bar</text><text x='180' y='280' font-family='Arial' font-size='13' text-anchor='middle'>V, L</text><path d='M 80,240 L 163.1,82 Q 200,120 280,172.1' fill='none' stroke='#000000' stroke-width='1.5' /></svg>]]",
    "type": "multiple_choice",
    "options": ["A", "B", "C", "D"],
    "answer": "A",
    "difficulty": 5,
    "detailedSolution": "Since the decomposition reaction $\\\\text{CaCO}_3(s) \\\\rightleftharpoons \\\\text{CaO}(s) + \\\\text{CO}_2(g)$ has $K_{\\\\text{p}} = P_{\\\\text{CO}_2} = 0.12$ bar, the pressure of $\\\\text{CO}_2$ remains constant at $0.12$ bar as long as both solid phases are present. The maximum volume where both solid phases exist is $V = \\\\frac{n R T}{P} = \\\\frac{(1.00 \\\\text{ g}/100.09 \\\\text{ g mol}^{-1}) \\\\times 0.08314 \\\\text{ L bar mol}^{-1}\\\\text{ K}^{-1} \\\\times 1200 \\\\text{ K}}{0.12 \\\\text{ bar}} \\\\approx 8.3$ L. Beyond this volume, all $\\\\text{CaCO}_3(s)$ decomposes, and the pressure decreases as $P \\\\propto 1/V$ (Boyle's law). This behavior is correctly represented in Graph (A)."
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
    "detailedSolution": "For $\\\\ce{CdS}$ to precipitate quantitatively ($>99.9\\\\%$), $[\\\\ce{Cd^{2+}}] < 1.0 \\\\times 10^{-4}$ M. Thus, $[\\\\ce{S^{2-}}] \\\\ge \\\\frac{K_{\\\\text{sp}}(\\\\text{CdS})}{1.0 \\\\times 10^{-4}} = 1.0 \\\\times 10^{-23}$ M.\\\\n\\\\nFor $\\\\ce{Tl2S}$ to NOT precipitate at all (meaning $[\\\\ce{Tl^+}] = 0.10$ M remains in solution), we must have $[\\\\ce{Tl^+}]^2 [\\\\ce{S^{2-}}] < K_{\\\\text{sp}}(\\\\ce{Tl2S}) \\\\implies (0.10)^2 [\\\\ce{S^{2-}}] < 6.0 \\\\times 10^{-22} \\\\implies [\\\\ce{S^{2-}}] < 6.0 \\\\times 10^{-20}$ M.\\\\n\\\\nThus, $1.0 \\\\times 10^{-23} \\\\le [\\\\ce{S^{2-}}] < 6.0 \\\\times 10^{-20}$ M.\\\\n\\\\nUsing the acid dissociation constants for $\\\\ce{H2S}$:\\\\n\\\\n$$K_{\\\\text{a1}} K_{\\\\text{a2}} = \\\\frac{[\\\\text{H}^+]^2 [\\\\ce{S^{2-}}]}{[\\\\ce{H2S}]}$$\\\\n\\\\n$$8.9 \\\\times 10^{-8} \\\\times 1.0 \\\\times 10^{-19} = 8.9 \\\\times 10^{-27} = \\\\frac{[\\\\text{H}^+]^2 [\\\\ce{S^{2-}}]}{0.1}$$\\\\n\\\\n$$[\\\\text{H}^+]^2 [\\\\ce{S^{2-}}] = 8.9 \\\\times 10^{-28}$$\\\\n\\\\n$$\\\\text{For } [\\\\ce{S^{2-}}] = 1.0 \\\\times 10^{-23} \\\\implies [\\\\text{H}^+]^2 = 8.9 \\\\times 10^{-5} \\\\implies [\\\\text{H}^+] \\\\approx 9.4 \\\\times 10^{-3} \\\\implies \\\\text{pH} \\\\approx 2.03$$\\\\n$$\\\\text{For } [\\\\ce{S^{2-}}] = 6.0 \\\\times 10^{-20} \\\\implies [\\\\text{H}^+]^2 = 1.48 \\\\times 10^{-8} \\\\implies [\\\\text{H}^+] \\\\approx 1.2 \\\\times 10^{-4} \\\\implies \\\\text{pH} \\\\approx 3.91$$\\\\n\\\\nTherefore, the pH must be between approximately $2.0$ and $3.9$ to selectively and quantitatively precipitate cadmium while keeping thallium(I) in solution."
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
    "difficulty": 5,
    "detailedSolution": "For transition metals, melting points depend strongly on the strength of metallic bonding, which has a significant covalent component due to the sharing of d-electrons. As we move down Group 6 (Cr to Mo to W), the 3d, 4d, and 5d orbitals become larger and more diffuse, resulting in better overlap and stronger covalent contribution to the metallic bonding in the solid state. This leads to a higher melting point."
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
    "detailedSolution": "For Statement I: Carbon dioxide is a gas and silicon dioxide is a network solid with extremely strong Si-O single bonds. Silicon dioxide is much more thermodynamically stable than carbon dioxide relative to the elemental state, meaning $\\\\ce{SiO2}$ is much harder to reduce than $\\\\ce{CO2}$, so $E^\\\\circ(\\\\text{Si}) < E^\\\\circ(\\\\text{C})$. Thus, Statement I is false.\\\\n\\\\nFor Statement II: Down group 14, the +4 oxidation state becomes less stable relative to the +2 state, and for lead, the +4 state ($\\\\ce{PbO2}$) is extremely powerful as an oxidizing agent (it is easily reduced to $\\\\ce{Pb^{2+}}$ or $\\\\ce{Pb}(s)$) due to the inert pair effect. Thus, $\\\\ce{PbO2}$ is reduced much more easily than $\\\\ce{SnO2}$, so $E^\\\\circ(\\\\text{Sn}) < E^\\\\circ(\\\\text{Pb})$. Thus, Statement II is correct. The answer is (B)."
  },
  {
    "id": "chem_ex8",
    "topic": "Thermodynamics, Chemical Equilibrium, Inorganic Chemistry",
    "question": "Lanthanum pentanickel, $\\\\ce{LaNi5}(s)$, is under consideration for solid-state hydrogen storage. $\\\\ce{LaNi5}(s)$ is a conductive metallic crystal, and it forms hydrides in two phases:\\\\n\\\\n$\\\\bullet$ an $\\\\alpha$ phase $\\\\alpha\\\\text{-LaNi5H}_x(s)$ observed at lower $\\\\ce{H2}$ pressure, characterized as a solid-state solution\\\\n$\\\\bullet$ a $\\\\beta$ phase $\\\\beta\\\\text{-LaNi5H}_{6.39}(s)$ observed at higher $\\\\ce{H2}$ pressure, characterized by metal-hydrogen bonding\\\\n\\\\n$$\\\\begin{array}{|c|c|c||c|c|c|} \\\\hline \\\\text{Species} & \\\\Delta H^\\\\circ\\\\textsubscript{f, kJ mol}^{-1} & S^\\\\circ\\\\text{, J mol}^{-1}\\\\text{ K}^{-1} & \\\\text{Species} & \\\\Delta H^\\\\circ\\\\textsubscript{f, kJ mol}^{-1} & S^\\\\circ\\\\text{, J mol}^{-1}\\\\text{ K}^{-1} \\\\ \\\\hline \\\\ce{H2}(g) & 0 & 130.7 & \\\\ce{LaNi5}(s) & -162 & 217 \\\\ \\\\hline \\\\ce{Ni}(s) & 0 & 29.9 & \\\\alpha\\\\text{-LaNi5H}_x(s) & -186 & 223 \\\\ \\\\hline \\\\ce{La}(s) & 0 & 56.9 & \\\\beta\\\\text{-LaNi5H}_{6.39}(s) & ? & ? \\\\ \\\\hline \\\\end{array}$$\\\\n\\\\na. Calculate $\\\\Delta G^\\\\circ\\\\textsubscript{f}$ of $\\\\ce{LaNi5}(s)$ at 298 K.\\\\n\\\\n$\\\\ce{LaNi5}(s)$ is placed in vacuum chambers, one at $30.0\\ ^\\\\circ\\\\text{C}$ and one at $50.0\\ ^\\\\circ\\\\text{C}$. Pure $\\\\ce{H2}(g)$ is added to each chamber, and the weight-percent hydrogenation of $\\\\ce{LaNi5}(s)$ is recorded as a function of pressure.\\\\n\\\\nb. Show that the maximum degree of hydrogenation $x$ for $\\\\alpha\\\\text{-LaNi5H}_x(s)$ is approximately $0.43$.\\\\n\\\\nc. Calculate $\\\\Delta G^\\\\circ\\\\textsubscript{rxn}$ at $30\\ ^\\\\circ\\\\text{C}$ and at $50\\ ^\\\\circ\\\\text{C}$ for the hydrogenation of the $\\\\alpha$ phase to the $\\\\beta$ phase.\\\\n\\\\nd. Calculate $\\\\Delta H^\\\\circ\\\\textsubscript{f}$ and $S^\\\\circ$ for $\\\\beta\\\\text{-LaNi5H}_{6.39}(s)$.",
    "type": "free_response",
    "options": [],
    "answer": "",
    "difficulty": 5,
    "detailedSolution": "(a) $\\\\Delta G^\\\\circ_f = \\\\Delta H^\\\\circ_f - T\\\\Delta S^\\\\circ_f$. For formation of $\\\\ce{LaNi5}(s)$: $\\\\ce{La}(s) + 5\\\\ce{Ni}(s) \\\\rightarrow \\\\ce{LaNi5}(s)$. $\\\\Delta H^\\\\circ_f = -162$ kJ/mol. $\\\\Delta S^\\\\circ_f = 217 - [56.9 + 5(29.9)] = 217 - 206.4 = 10.6$ J/(mol K). Thus, $\\\\Delta G^\\\\circ_f = -162 - 298.15(0.0106) = -165.2$ kJ/mol.\\\\n\\\\n(b) Maximum degree of hydrogenation is approximately $0.43$.\\\\n\\\\n(c) At the equilibrium plateau, the reaction is $\\\\frac{1}{y} \\\\alpha\\\\text{-LaNi5H}_{0.43}(s) + \\\\frac{1}{2} \\\\ce{H2}(g) \\\\rightleftharpoons \\\\frac{1}{y} \\\\beta\\\\text{-LaNi5H}_{6.39}(s)$, where $y = 6.39 - 0.43 = 5.96$. Since solid phases are in equilibrium, the equilibrium constant is $K_p = P_{\\\\ce{H2}}^{-1/2}$. $\\\\Delta G^\\\\circ_{rxn} = -RT \\\\ln K_p = \\\\frac{1}{2} RT \\\\ln P_{\\\\ce{H2}}$.\\\\n\\\\n(d) Using the van 't Hoff equation and $\\\\Delta G^\\\\circ$ values at different temperatures, we can determine the standard enthalpy and entropy of the transition, and from there calculate $\\\\Delta H^\\\\circ_f$ and $S^\\\\circ$ of $\\\\beta\\\\text{-LaNi5H}_{6.39}(s)$."
  },
  {
    "id": "chem_ex9",
    "topic": "Chemical Equilibrium, Solubility, Complex Ions",
    "question": "Silver iodide is a sparingly soluble salt. Silver also forms a soluble complex ion, $\\\\ce{AgI2-}$, with iodide ion. A series of solutions saturated with solid $\\\\ce{AgI}$ and containing various concentrations of dissolved iodide ion are prepared, and the total concentration of silver dissolved in each solution is measured. Which graph of the logarithm of the total silver concentration as a function of the logarithm of the iodide concentration best represents the results of this experiment?\\\\n\\\\nOption (A)\\\\n[[SVG: <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 320' width='100%' height='100%' style='background-color: #ffffff;'><text x='35' y='45' font-family='Arial' font-size='22' font-weight='bold'>(A)</text><line x1='80' y1='50' x2='280' y2='50' stroke='#cccccc' stroke-width='0.5' /><line x1='80' y1='88.3' x2='280' y2='88.3' stroke='#cccccc' stroke-width='0.5' /><line x1='80' y1='126.7' x2='280' y2='126.7' stroke='#cccccc' stroke-width='0.5' /><line x1='80' y1='165' x2='280' y2='165' stroke='#cccccc' stroke-width='0.5' /><line x1='80' y1='203.3' x2='280' y2='203.3' stroke='#cccccc' stroke-width='0.5' /><line x1='80' y1='241.7' x2='280' y2='241.7' stroke='#cccccc' stroke-width='0.5' /><line x1='80' y1='280' x2='280' y2='280' stroke='#cccccc' stroke-width='0.5' /><line x1='80' y1='50' x2='80' y2='280' stroke='#cccccc' stroke-width='0.5' /><line x1='113.3' y1='50' x2='113.3' y2='280' stroke='#cccccc' stroke-width='0.5' /><line x1='146.7' y1='50' x2='146.7' y2='280' stroke='#cccccc' stroke-width='0.5' /><line x1='180' y1='50' x2='180' y2='280' stroke='#cccccc' stroke-width='0.5' /><line x1='213.3' y1='50' x2='213.3' y2='280' stroke='#cccccc' stroke-width='0.5' /><line x1='246.7' y1='50' x2='246.7' y2='280' stroke='#cccccc' stroke-width='0.5' /><line x1='280' y1='50' x2='280' y2='280' stroke='#cccccc' stroke-width='0.5' /><rect x='80' y='50' width='200' height='230' fill='none' stroke='#000000' stroke-width='0.8' /><text x='73' y='54' font-family='Arial' font-size='10' text-anchor='end'>-6</text><text x='73' y='92.3' font-family='Arial' font-size='10' text-anchor='end'>-7</text><text x='73' y='130.7' font-family='Arial' font-size='10' text-anchor='end'>-8</text><text x='73' y='169' font-family='Arial' font-size='10' text-anchor='end'>-9</text><text x='73' y='207.3' font-family='Arial' font-size='10' text-anchor='end'>-10</text><text x='73' y='245.7' font-family='Arial' font-size='10' text-anchor='end'>-11</text><text x='73' y='284' font-family='Arial' font-size='10' text-anchor='end'>-12</text><text x='80' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-8</text><text x='113.3' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-7</text><text x='146.7' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-6</text><text x='180' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-5</text><text x='213.3' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-4</text><text x='246.7' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-3</text><text x='280' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-2</text><text x='45' y='165' font-family='Arial' font-size='11' text-anchor='middle' transform='rotate(-90,45,165)'>log([Ag<sub>total</sub>])</text><text x='180' y='312' font-family='Arial' font-size='11' text-anchor='middle'>log([I⁻])</text><path d='M 80,126.7 Q 160,220 280,280' fill='none' stroke='#000000' stroke-width='1.5' /></svg>]]\\\\n\\\\nOption (B)\\\\n[[SVG: <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 320' width='100%' height='100%' style='background-color: #ffffff;'><text x='35' y='45' font-family='Arial' font-size='22' font-weight='bold'>(B)</text><rect x='80' y='50' width='200' height='230' fill='none' stroke='#000000' stroke-width='0.8' /><line x1='80' y1='88.3' x2='280' y2='88.3' stroke='#cccccc' stroke-width='0.5' /><line x1='80' y1='126.7' x2='280' y2='126.7' stroke='#cccccc' stroke-width='0.5' /><line x1='80' y1='165' x2='280' y2='165' stroke='#cccccc' stroke-width='0.5' /><line x1='80' y1='203.3' x2='280' y2='203.3' stroke='#cccccc' stroke-width='0.5' /><line x1='80' y1='241.7' x2='280' y2='241.7' stroke='#cccccc' stroke-width='0.5' /><line x1='113.3' y1='50' x2='113.3' y2='280' stroke='#cccccc' stroke-width='0.5' /><line x1='146.7' y1='50' x2='146.7' y2='280' stroke='#cccccc' stroke-width='0.5' /><line x1='180' y1='50' x2='180' y2='280' stroke='#cccccc' stroke-width='0.5' /><line x1='213.3' y1='50' x2='213.3' y2='280' stroke='#cccccc' stroke-width='0.5' /><line x1='246.7' y1='50' x2='246.7' y2='280' stroke='#cccccc' stroke-width='0.5' /><text x='73' y='54' font-family='Arial' font-size='10' text-anchor='end'>-6</text><text x='73' y='92.3' font-family='Arial' font-size='10' text-anchor='end'>-7</text><text x='73' y='130.7' font-family='Arial' font-size='10' text-anchor='end'>-8</text><text x='73' y='169' font-family='Arial' font-size='10' text-anchor='end'>-9</text><text x='73' y='207.3' font-family='Arial' font-size='10' text-anchor='end'>-10</text><text x='73' y='245.7' font-family='Arial' font-size='10' text-anchor='end'>-11</text><text x='73' y='284' font-family='Arial' font-size='10' text-anchor='end'>-12</text><text x='80' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-8</text><text x='113.3' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-7</text><text x='146.7' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-6</text><text x='180' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-5</text><text x='213.3' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-4</text><text x='246.7' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-3</text><text x='280' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-2</text><text x='45' y='165' font-family='Arial' font-size='11' text-anchor='middle' transform='rotate(-90,45,165)'>log([Ag<sub>total</sub>])</text><text x='180' y='312' font-family='Arial' font-size='11' text-anchor='middle'>log([I⁻])</text><path d='M 80,126.7 Q 130,215 190,215 L 280,215' fill='none' stroke='#000000' stroke-width='1.5' /></svg>]]\\\\n\\\\nOption (C)\\\\n[[SVG: <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 320' width='100%' height='100%' style='background-color: #ffffff;'><text x='35' y='45' font-family='Arial' font-size='22' font-weight='bold'>(C)</text><rect x='80' y='50' width='200' height='230' fill='none' stroke='#000000' stroke-width='0.8' /><line x1='80' y1='88.3' x2='280' y2='88.3' stroke='#cccccc' stroke-width='0.5' /><line x1='80' y1='126.7' x2='280' y2='126.7' stroke='#cccccc' stroke-width='0.5' /><line x1='80' y1='165' x2='280' y2='165' stroke='#cccccc' stroke-width='0.5' /><line x1='80' y1='203.3' x2='280' y2='203.3' stroke='#cccccc' stroke-width='0.5' /><line x1='80' y1='241.7' x2='280' y2='241.7' stroke='#cccccc' stroke-width='0.5' /><line x1='113.3' y1='50' x2='113.3' y2='280' stroke='#cccccc' stroke-width='0.5' /><line x1='146.7' y1='50' x2='146.7' y2='280' stroke='#cccccc' stroke-width='0.5' /><line x1='180' y1='50' x2='180' y2='280' stroke='#cccccc' stroke-width='0.5' /><line x1='213.3' y1='50' x2='213.3' y2='280' stroke='#cccccc' stroke-width='0.5' /><line x1='246.7' y1='50' x2='246.7' y2='280' stroke='#cccccc' stroke-width='0.5' /><text x='73' y='54' font-family='Arial' font-size='10' text-anchor='end'>-6</text><text x='73' y='92.3' font-family='Arial' font-size='10' text-anchor='end'>-7</text><text x='73' y='130.7' font-family='Arial' font-size='10' text-anchor='end'>-8</text><text x='73' y='169' font-family='Arial' font-size='10' text-anchor='end'>-9</text><text x='73' y='207.3' font-family='Arial' font-size='10' text-anchor='end'>-10</text><text x='73' y='245.7' font-family='Arial' font-size='10' text-anchor='end'>-11</text><text x='73' y='284' font-family='Arial' font-size='10' text-anchor='end'>-12</text><text x='80' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-8</text><text x='113.3' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-7</text><text x='146.7' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-6</text><text x='180' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-5</text><text x='213.3' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-4</text><text x='246.7' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-3</text><text x='280' y='295' font-family='Arial' font-size='10' text-anchor='middle'>-2</text><text x='45' y='165' font-family='Arial' font-size='11' text-anchor='middle' transform='rotate(-90,45,165)'>log([Ag<sub>total</sub>])</text><text x='180' y='312' font-family='Arial' font-size='11' text-anchor='middle'>log([I⁻])</text><path d='M 80,126.7 C 110,180 140,215 165,215 C 190,215 230,175 280,148' fill='none' stroke='#000000' stroke-width='1.5' /></svg>]]",
    "type": "multiple_choice",
    "options": ["A", "B", "C", "D"],
    "answer": "C",
    "difficulty": 5,
    "detailedSolution": "The total dissolved silver concentration is the sum of free $\\\\text{Ag}^+$ and the complex $\\\\text{AgI2-}$. That is, $[\\\\text{Ag}_{\\\\text{total}}] = [\\\\text{Ag}^+] + [\\\\text{AgI2-}]$.\\nSince the solution is saturated with solid $\\\\text{AgI}(s)$, $[\\\\text{Ag}^+] = \\\\frac{K_{sp}}{[\\\\text{I}^-]}$.\\nThe formation of the complex ion is governed by: $\\\\text{Ag}^+ + 2\\\\text{I}^- \\\\rightleftharpoons \\\\text{AgI2-}$, with $K_f = \\\\frac{[\\\\text{AgI2-}]}{[\\\\text{Ag}^+][\\\\text{I}^-]^2}$.\\nSubstituting $[\\\\text{Ag}^+]$ gives: $[\\\\text{AgI2-}] = K_f K_{sp} [\\\\text{I}^-]$.\\nTherefore, $[\\\\text{Ag}_{\\\\text{total}}] = \\\\frac{K_{sp}}{[\\\\text{I}^-]} + K_f K_{sp} [\\\\text{I}^-]$.\\nIn terms of logarithms, at very low $[\\\\text{I}^-]$, the first term dominates, and $\\\\log [\\\\text{Ag}_{\\\\text{total}}] \\\\approx \\\\log K_{sp} - \\\\log [\\\\text{I}^-]$ (a line with slope -1).\\nAt very high $[\\\\text{I}^-]$, the second term dominates, and $\\\\log [\\\\text{Ag}_{\\\\text{total}}] \\\\approx \\\\log(K_f K_{sp}) + \\\\log [\\\\text{I}^-]$ (a line with slope +1).\\nThe graph of $\\\\log [\\\\text{Ag}_{\\\\text{total}}]$ vs $\\\\log [\\\\text{I}^-]$ is therefore a smooth concave curve that starts with a negative slope of -1, reaches a minimum, and then rises with a positive slope of +1. This is correctly shown in Graph (C)."
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
    "difficulty": 5,
    "detailedSolution": "The standard reduction potential for the reduction of $\\\\ce{Fe(CN)6^{3-}}$ to $\\\\ce{Fe(CN)6^{4-}}$ ($+0.370$ V) is higher than that for the reduction of $\\\\ce{Cu^{2+}}$ to $\\\\ce{Cu}(s)$ ($+0.337$ V). Therefore, $\\\\ce{Fe(CN)6^{3-}}$ is reduced first at the cathode. As long as there is a significant concentration of $\\\\ce{Fe(CN)6^{3-}}$ present near the electrode, the potential of the cathode will remain too high to allow the reduction of $\\\\ce{Cu^{2+}}$. Once the concentration of $\\\\ce{Fe(CN)6^{3-}}$ at the electrode drops to a very low level, the potential will shift more negative, allowing copper to begin depositing. Thus, no copper is deposited initially, and copper deposition begins only after a certain period of time. This corresponds to option (C)."
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
    "difficulty": 5,
    "detailedSolution": "Ammonium carbonate contains two moles of the acidic $\\\\ce{NH4+}$ ion and one mole of the basic $\\\\ce{CO3^{2-}}$ ion per mole of compound, whereas ammonium bicarbonate contains one mole of $\\\\ce{NH4+}$ and one mole of $\\\\ce{HCO3-}$ per mole of compound. The carbonate ion ($\\\\ce{CO3^{2-}}$) has a much higher base dissociation constant ($K_b \\\\approx 2.1 \\\\times 10^{-4}$) than the bicarbonate ion ($\\\\ce{HCO3-}$, $K_b \\\\approx 2.2 \\\\times 10^{-8}$). Because bicarbonate is a much weaker base than carbonate, the pH of the ammonium bicarbonate solution is significantly lower than that of the ammonium carbonate solution, making (A) the correct choice."
  },
  {
    "id": "chem_ex12",
    "topic": "Stoichiometry & Hydrocarbons",
    "question": "A $4.41$ g sample of a gaseous hydrocarbon M is completely combusted in excess oxygen to produce $13.20$ g of \\\\ce{CO_2} and $7.21$ g of \\\\ce{H_2O}. Determine the molecular formula of M if its density at STP is $1.97$ g/L.",
    "type": "multiple_choice",
    "options": ["\\\\ce{CH_4}", "\\\\ce{C_2H_6}", "\\\\ce{C_3H_8}", "\\\\ce{C_4H_{10}}"],
    "answer": "C",
    "difficulty": 5,
    "detailedSolution": "Calculate the moles of carbon and hydrogen atoms from the combustion products:\\n- Moles of C = 13.20 g / 44.01 g/mol = 0.300 mol\\n- Moles of H = 2 * (7.21 g / 18.02 g/mol) = 0.800 mol\\n\\nThe empirical formula is \\\\ce{C3H8} (empirical formula mass = 44.1 g/mol).\\n\\nNext, use the density at STP to calculate the molar mass of M:\\n- Molar Mass = 1.97 g/L * 22.4 L/mol = 44.1 g/mol.\\n\\nSince the molar mass matches the empirical formula mass, the molecular formula of M is \\\\ce{C3H8}."
  },
  {
    "id": "chem_ex13",
    "topic": "Electrochemistry",
    "question": "A galvanic cell consists of a silver electrode in $1.0$ M \\\\ce{AgNO_3} and a copper electrode in $1.0$ M \\\\ce{Cu(NO_3)_2}. If the cell operates at $25$ °C under a constant current of $2.0$ A for $45$ minutes, calculate the change in mass of the copper electrode. ($E^\\circ(\\\\ce{Ag^+/Ag}) = +0.80$ V, $E^\\circ(\\\\ce{Cu^{2+}/Cu}) = +0.34$ V, $F = 96485$ C/mol).",
    "type": "short_answer",
    "answer": "1.78 g",
    "difficulty": 6,
    "detailedSolution": "Since $E^\\circ(\\\\ce{Ag^+/Ag}) = +0.80$ V is greater than $E^\\circ(\\\\ce{Cu^{2+}/Cu}) = +0.34$ V, silver ions are reduced at the cathode, and the copper electrode undergoes oxidation at the anode:\\n$$\\\\ce{Cu(s) -> Cu^{2+}(aq) + 2e^-}$$\\n\\nThis oxidation causes a decrease in the mass of the copper electrode. First, calculate the total charge Q passed through the cell:\\n- Q = I * t = 2.0 A * (45 min * 60 s/min) = 5400 C.\\n\\nConvert charge to moles of electrons:\\n- n(e^-) = 5400 C / 96485 C/mol = 0.0560 mol.\\n\\nFrom the stoichiometry of the anode reaction, 1 mole of copper is oxidized for every 2 moles of electrons:\\n- n(Cu) = 0.0560 mol / 2 = 0.0280 mol.\\n\\nCalculate the mass loss of the copper electrode:\\n- \\\\Delta m = 0.0280 mol * 63.55 g/mol = 1.78 g decrease."
  },
  {
    "id": "chem_ex14",
    "topic": "Thermodynamics & Gas Laws",
    "question": "A horizontal, adiabatic cylinder of total volume $4.0$ L is divided into two compartments by a frictionless, moveable adiabatic piston. Compartment A contains $1.0$ mol of an ideal monoatomic gas at an initial pressure of $3.0$ atm, and compartment B contains $1.0$ mol of the same gas at $1.0$ atm. If $450$ J of heat is slowly supplied to the gas in compartment A via an internal resistive heater, calculate the final equilibrium volume of compartment A.",
    "type": "free_response",
    "answer": "",
    "difficulty": 9,
    "detailedSolution": "Let initial states be $P_{A0} = 3.0$ atm, $V_{A0} = 1.0$ L and $P_{B0} = 1.0$ atm, $V_{B0} = 3.0$ L. For compartment B, the compression is reversible and adiabatic: $P_f V_{Bf}^{5/3} = P_{B0} V_{B0}^{5/3}$ where $\\\\gamma = 5/3$. Under equilibrium, final pressures are equal: $P_{Af} = P_{Bf} = P_f$.\\n\\nFor compartment B: $P_f V_{Bf}^{5/3} = 1.0 * 3.0^{5/3} = 6.24$. Using the first law for the total system, the total work done is zero (exterior walls are rigid/adiabatic): $\\\\Delta U_A + \\\\Delta U_B = Q = 450$ J.\\n\\nFor monoatomic gases, $\\\\Delta U = 1.5 \\\\Delta(PV)$. Thus, $1.5 (P_f V_{Af} - P_{A0} V_{A0}) + 1.5 (P_f V_{Bf} - P_{B0} V_{B0}) = Q$.\\n\\nSubstituting values and using $V_{Af} + V_{Bf} = 4.0$ L, we solve the system of equations. Evaluating $V_{Af} = 2.0$ L yields $V_{Bf} = 2.0$ L, and $P_f = 1.0 * (3.0/2.0)^{5/3} = 1.97$ atm. The energy equation is satisfied exactly by these parameters for $Q = 450$ J. The final volume of compartment A is therefore $2.0$ L."
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

1. Novelty & "Invisible Traps"
- Create highly original questions requiring first-principles reasoning over template-matching.
- Every problem must center on a non-obvious conceptual trick or subtle breakdown of a standard assumption. The user should be tricked into thinking the wrong way, overlooking something.
- Keep the question text entirely neutral and objective — do NOT hint at the solution or mention the specific conceptual trick, trap, or method to use (e.g. do not say "taking into account the ionization of water" or "assume non-ideal behavior"). For example, instead of: "Calculate the pH of a $1.00 \\times 10^{-8}$ M aqueous solution of $\\ce{HCl}$ at $25 ^{\\circ}$ C, taking into account the ionization of water", write: "Calculate the pH of a $1.00 \\times 10^{-8}$ M aqueous solution of $\\ce{HCl}$ at $25 ^{\\circ}$ C".
- Incorporate a deceptive path: the most common rote shortcut should yield a value matching one incorrect distractor.
- No question should be like any other question seen before.

2. Advanced Design & Difficulty Criteria
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

1. Novelty & "Invisible Traps" (Subtle Conceptual Bottlenecks)
- Create highly original questions requiring first-principles reasoning over memory or template-matching.
- Questions should reward chemical intuition, not breadth of knowledge, experience grinding previous problems, or computational power.
- Center every problem on a non-obvious conceptual trick, hidden limiting factor, or subtle breakdown of a standard assumption.
- Keep the question text entirely neutral and objective — do NOT hint at the solution or mention the specific conceptual trick, trap, or method to use (e.g. do not say "taking into account the ionization of water" or "assume non-ideal behavior"). For example, instead of: "Calculate the pH of a $1.00 \\times 10^{-8}$ M aqueous solution of $\\ce{HCl}$ at $25 ^{\\circ}$ C, taking into account the ionization of water", write: "Calculate the pH of a $1.00 \\times 10^{-8}$ M aqueous solution of $\\ce{HCl}$ at $25 ^{\\circ}$ C".
- Incorporate a deceptive path: the most common rote formula shortcut should yield a value matching one incorrect distractor.

2. Advanced Design & Difficulty Criteria
- Multi-Topic Coupling: Require simultaneous application of disparate physical principles (e.g., thermodynamic cycle with magnetic induction, electrostatics with rotational dynamics, spring-mass with RC circuit via EM induction).
- Multi-Step Cascades: Output of one step forms input of the next (e.g., find charge distribution → compute E-field → integrate for potential energy → apply energy conservation).
- Subtle Nuances: Test non-inertial frames, static-to-kinetic friction transitions, non-obvious geometric constraints, cases where small-angle approximation breaks down.
- Rigor: Require setting up and solving differential equations, non-trivial integrations, perturbation methods.
- Novel Context: Present physics in unfamiliar frameworks (astrophysical systems, atmospheric phenomena, biological mechanics).

3. Syllabus Boundaries
- DIFFICULTY < 8 (F=ma/AP Physics C): Restrict to classical mechanics, electromagnetism, thermodynamics, fluid dynamics, waves, optics. Increase difficulty by coupling unexpected systems.
- DIFFICULTY >= 8 (USAPhO/IPhO): Original concept-first designs. May introduce special relativity, quantum basics, statistical mechanics, etc. but MUST define all concepts from scratch (first-principles guardrail). free_response MUST require comprehensive derivation, not just a final number.

4. SVG Diagrams: You are STRONGLY ENCOURAGED to include SVG diagrams in a large proportion of your questions — aim for at least half of all questions to contain an SVG figure. Free-body diagrams, circuit schematics, wave/field plots, geometry setups, and apparatus sketches all significantly increase problem depth and realism. Embed the SVG directly in the question text using [[SVG: <svg ...>...</svg>]] markers. Use primitive shapes (<line>, <circle>, <rect>, <path>, <text>, <polygon>), inline attributes only (no CSS <style> blocks), transparent or dark background (do NOT use white background or rects, use light strokes like white or light gray), and single-quotes (') for all attribute values for JSON compatibility.

Difficulty scale: 1=introductory, 3=AP Physics C, 5=F=ma, 8=USAPhO, 10=hardest IPhO.
`;
      examples = formatExemplarsForPrompt(getRandomExemplars(physicsExemplars, 3));
    } else if (normSubject === 'chemistry') {
      constraints = `
Follow these strict Olympiad Design Philosophies:

1. Novelty & "Invisible Traps"
- Create highly original questions requiring first-principles reasoning over template-matching.
- Every problem must center on a non-obvious conceptual trick or subtle breakdown of a standard assumption.
- Keep the question text entirely neutral and objective — do NOT hint at the solution or mention the specific conceptual trick, trap, or method to use (e.g. do not say "taking into account the ionization of water" or "assume non-ideal behavior"). For example, instead of: "Calculate the pH of a $1.00 \\times 10^{-8}$ M aqueous solution of $\\ce{HCl}$ at $25 ^{\\circ}$ C, taking into account the ionization of water", write: "Calculate the pH of a $1.00 \\times 10^{-8}$ M aqueous solution of $\\ce{HCl}$ at $25 ^{\\circ}$ C".
- Incorporate a deceptive path: the most common rote shortcut should yield a value matching one incorrect distractor.

2. Advanced Design & Difficulty Criteria
- Multi-Topic Coupling: Require simultaneous application of disparate chemical principles (e.g., coordination chemistry $K_f$ with $K_{sp}$ and electrochemical $E^\\circ$; organic structure elucidation from elemental analysis → MS → IR → regioselective mechanisms).
- Multi-Step Cascades: Output of one step forms input of the next, without explicit prompting on intermediates.
- Subtle Nuances: Test electronic structures, periodic trends, thermodynamic vs. kinetic control, anomalies in MO configurations ($B_2$ vs $O_2$).
- Rigor: Eliminate simplifying assumptions (e.g., x-is-small approximation). Require solving higher-order equations from mass/charge balances.
- Novel Context: MANDATORY — every question must be set in an unfamiliar or real-world olympiad-appropriate context. Rotate through this menu; do NOT use the same context type twice in one exam:
    • Industrial processes (Haber–Bosch, contact process, Hall–Héroult, Solvay, Fischer–Tropsch, Ostwald)
    • Atmospheric chemistry (ozone depletion mechanisms, NOx photochemical smog, stratospheric halogen cycles)
    • Electroanalytical / separation science (cyclic voltammetry, ion-exchange chromatography, electrophoresis, potentiometry)
    • Nuclear & radiochemistry (radioactive decay series, specific activity, neutron activation analysis, isotopic labelling in synthesis)
    • Inorganic materials (MOF gas adsorption, solid-state ion conductors, corrosion galvanic cells, crystal-field stabilization in spinels)
    • Organic synthesis context (multi-step retrosynthesis, protecting-group strategy, regio- and stereoselectivity in complex substrates)
    • Thermochemical cycles (Born–Haber, Ellingham diagrams, coupled redox/precipitation equilibria)
    • Spectroscopic identification (mass-spec fragmentation cascades, 1H-NMR of chiral or aromatic systems, IR of coordinated ligands)

3. Syllabus Boundaries
- DIFFICULTY < 8 (USNCO): Stick strictly to the standard high school olympiad (AP/USNCO) knowledge base. Try not to bring in too much outside knowledge - the outside knowledge as first principles/preamble approach should be reserved strictly for IChO questions. USNCO questions should mostly use the standard high school olympiad knowledge base, but go very deep conceptually and mathematically (e.g., removing standard simplifying approximations, coupling unexpected standard systems, or requiring multi-step cascades). ***CRITICALLY IMPORTANT:Do NOT test stereoselectivity, CFSE, Tafel/Butler-Volmer equations (they are strictly reserved for IChO***). However, it is okay to bring in some extra knowledge base to set up a more convoluted chemical system. No calculus-based derivations.
- DIFFICULTY >= 8 (IChO): Original concept-first designs. You may introduce advanced, extra-syllabus topics (such as stereoselectivity or Tafel/Butler-Volmer equations), but you MUST introduce them using self-contained, axiomatic background preambles (first-principles guardrail).


4. SMILES: Use only for complex organic molecules or coordination complexes. Use LaTeX for all equations, formulas, units, and variables.

5. SVG Diagrams: You are STRONGLY ENCOURAGED to include SVG diagrams in a large proportion of your questions — aim for at least half of all questions to contain an SVG figure. Titration curves, phase diagrams, energy-level diagrams, orbital diagrams, reaction coordinate plots, crystallographic unit cells, and spectroscopy traces are all excellent candidates. Embed the SVG directly in the question text using [[SVG: <svg ...>...</svg>]] markers. Use primitive shapes (<line>, <circle>, <rect>, <path>, <text>, <polygon>), inline attributes only (no CSS <style> blocks), transparent or dark background (do NOT use white background or rects, use light strokes like white or light gray), and single-quotes (') for all attribute values for JSON compatibility.

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

    const systemInstruction = `###Role:### You are a professional olympiad question writer for high school olympiad-level tests. You want to write tricky problems that challenges students in their understanding of [subject] concepts, rather than their breadth of knowledge.

###Goal:### Write questions for a user's practice tests that mirror the style of actual olympiad exams and challenge the user to think deeply about the material. Target the user's weak areas ( ${weaknesses} ).
${lessonInstructions}
${topicsInstructions}
Additionally, utilize the following diagnostic information about the user to tailor the test:
- User Weakness Analysis: ${weaknessAnalysis}
- User Topic Breakdown:
${topicBreakdown}
- Recent Mistake Patterns (thinking / test-taking style):
${mistakeAnalysis}

###CRITICAL UNIQUE & CREATIVE DIRECTIVE:###
You must be extremely creative and ensure that EVERY question is completely unique and novel. Do NOT repeat, rephrase, or adapt previously used setups, standard textbook scenarios, chemical reactions, physical systems, or mathematical templates. Avoid using similar numerical values, scenarios, or phrasing across different questions or exams. Force yourself to design entirely new contexts, variables, and systems for each problem.

###MANDATORY ADAPTIVE WEAKNESS-TARGETING DIRECTIVE:###
You MUST make the generated questions highly adaptive by directly targeting this specific user's diagnostic profile:
1. TARGET SUBJECT & CONCEPTUAL WEAKNESSES: You MUST allocate approximately 30% of the questions on the exam to directly address the user's weak knowledge areas and conceptual gaps (using the User Weakness Analysis and User Topic Breakdown data).
2. TARGET COGNITIVE & THINKING WEAKNESSES: You MUST craft questions that specifically trigger and test the user's documented test-taking pitfalls and cognitive mistake patterns (using the Recent Mistake Patterns data, such as calculation haste, rote-formula shortcuts, overlooking boundary conditions/edge cases, unit conversion slips, or conceptual panic). Design the problem setups and multiple-choice distractor options so that a student falling into these exact thinking traps is led to make those specific mistakes, thereby teaching them to overcome these cognitive weaknesses.

ANTI-TEMPLATE DIRECTIVE: A problem is a forbidden template if it exhibits any of these structural properties — regardless of its topic or difficulty level:
- Single-formula plug-and-chug: one concept, one equation, values handed to the student, answer drops out directly with no coupling.
- Catalogue question: simply asks the student to recall or identify a memorised fact, rule, or definition with no reasoning step.
- Familiar scaffold with swapped numbers: structurally identical to a class of textbook problems (e.g., a standard titration, incline, or stoichiometry setup) with only numerical values or element names changed.
- Isolated calculation: tests exactly one sub-skill in complete isolation with no unexpected coupling to another concept.
- Generic framing: the question could have been written by any textbook author without any real-world or experimental motivation.
Any question matching one or more of these patterns must be redesigned before finalising.

SELF-CHECK (MANDATORY before finalising each question): Before writing the final JSON for each question, ask yourself: "Is this question structurally novel? Would a student who has drilled olympiad problem sets be genuinely surprised by the setup, the system, or the question being asked — even if they know the underlying concept well?" If the answer is no — if the setup is a familiar scaffold with new numbers or a different element — redesign the question from scratch. Note: difficulty level is irrelevant here. A hard USNCO question can still be a clichéd template. What matters is whether the problem-setup itself is fresh and unexpected.

SURPRISING PREMISE DIRECTIVE: Every question should ideally open from a counterintuitive, puzzling, or surprising premise — a real experimental observation, an anomalous result, or a system that behaves differently from naive expectation. Avoid generic lab-exercise framings ("A student dissolves...", "A block is placed on a surface..."). Instead, ground the question in a specific, vivid scenario that demands explanation.

###Constraints:###

${constraints}

###Examples:###

${examples}

For free_response questions, especially at high difficulty levels (such as IMO, USAMO, IPhO, IChO, etc.), the question MUST require the user to write out a comprehensive mathematical proof, detailed step-by-step physics derivation, or organic chemistry synthesis mechanism/conceptual proof, rather than just calculating a final numerical value.

All questions generated MUST adhere to these critical design directives:
1. QUESTION STYLE & TRICKINESS: Provide a balanced and diverse mix of standard and tricky questions:
   - For difficulty levels 1 to 4: Standard, straightforward conceptual or algorithmic questions must be used.
   - For difficulty levels 5 to 10: Questions can either be tricky (presenting sophisticated conceptual traps or subtle edge cases that penalize rote formula-plugging) OR they can be standard, non-trick questions that are highly difficult and challenging in their own right (demanding deep logic, multi-step reasoning, or integration of multiple foundational concepts).
   - Ensure all questions are solvable based strictly on competitive high school level concepts or below, maintaining complete scientific and mathematical rigor while remaining accessible from core principles. For multiple_choice questions involving traps, craft the distractor options to precisely match the results of common conceptual mistakes.
   - For multiple_choice questions: do NOT include the answer options (A, B, C, D) inside the "question" or "instructions" text itself. The question text must only prompt the problem. The options must be listed solely in the "options" field of the JSON.
2. BALANCED TOPIC DIVERSITY & WEAKNESS WEIGHTING: The exam must cover a wide, extremely diverse range of standard core subjects/topics within the chosen field. For example:
      - In Chemistry: You must select from stoichiometry, descriptive, states of matter, thermodynamics, kinetics, equilibrium, oxidation-reduction, atomic structure/periodicity, bonding/molecular structure, and organic/biochemistry.
      - In Physics: You must select from kinematics, forces, momentum, systems of particles, rotational kinematics, rotational dynamics, angular momentum, energy, fluid statics, gravitation, fluid dynamics, oscillations, waves, thermodynamics, electricity, and magnetism.
      - In Math: You must select from algebra, geometry, counting/probability, number theory.
   If a user's weak concepts are provided, allocate a minority of the questions (~30%, e.g., 1 out of 3, or 2 out of 5) to target those weaknesses, and dedicate the remaining majority (~70%) to a diverse selection of other core topics in the subject's standard syllabus, ensuring a balanced distribution of topics across the exam. If weaknesses are "None", distribute questions evenly across all core topics.
3. QUESTION TYPES MIX: You MUST ensure that the generated questions contain a mix of all requested question types: ${parsedTypes.join(', ')}. Every requested type MUST appear at least once in the output array.
4. BACKWARD CHAINING (REVERSE DESIGN): Use a backward-chaining methodology to design questions. EVERY single question generated must be completely unique, original, and never seen before.
5. SVG DIAGRAMS (CRITICAL - HIGH FREQUENCY REQUIRED): You MUST include [[SVG: <svg>...</svg>]] diagrams in the majority of your questions. Every geometry question, every graph-based problem (titration curves, phase diagrams, potential energy surfaces, circuit diagrams, free-body diagrams, coordinate geometry, function plots, etc.) MUST have a corresponding SVG figure embedded directly in the question text. Failing to include diagrams where they would naturally appear is a serious quality defect. Use dark-mode compatible styling for all SVGs: use transparent or dark backgrounds, and white or light-colored strokes/lines/text (do NOT use black strokes or text, and do NOT use solid white background rects). Use single-quotes for all SVG attribute values.
6. ANSWER-FORM VARIATION: Rotate the structural form of what the answer requires across questions in the same exam. Do not produce multiple questions that all ask for the same type of quantity (e.g., all asking for a final numerical value, or all asking "which of the following is correct"). Include variety such as: a question whose answer is a ratio or dimensionless quantity derived from multiple steps; a question that requires identifying which piece of given information is insufficient; a question where the student must recognise that the naive calculation gives the wrong answer and explain why; a question whose answer is a qualitative ranking or ordering rather than a single value.

***Constraints & Execution Instructions:***

1. **Backward Chaining Generation Methodology (CRITICAL - Ensure 100% Uniqueness & Originality)**
You must generate every question using a backward chaining thought process before outputting the final problem, ensuring that each question is completely unique, original, and never seen before.

###Steps:###
To ensure high question quality:
- Mentally perform the draft, test-solving, feedback, and revision steps using a backward-chaining methodology, ensuring that each question is completely unique, original, and never seen before.
- Do NOT output your thought process in any field of the JSON. Only output the final, fully refined question parameters.
- Do NOT output any markdown, explanations, or text outside the JSON array structures. Output ONLY the valid JSON array starting with \`[\`.


###Output Requirements:###

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

Output the result strictly as a raw, valid JSON array, keeping it free of any markdown formatting or surrounding code blocks.

CRITICAL: Difficulty level 1 can include simple plug-and-chug applications (applying a single standard formula to given values). These plug-and-chug applications can ONLY happen for difficulty level 1.`;

    // using outer allQuestions array
    if (pregeneratedQuestion) {
      allQuestions.push(pregeneratedQuestion);
    }

    const modelId = process.env.SILICONFLOW_MODEL || 'Qwen/Qwen3.6-27B';
    const models = [...new Set([modelId, 'Qwen/Qwen3.6-27B'])];

    let attempts = 0;
    const maxAttempts = 3;
    while (allQuestions.length < count && attempts < maxAttempts) {
      attempts++;
      try {
        await executeWithRetry(models, async (ai, currentModel) => {
          const needed = count - allQuestions.length;
          if (needed <= 0) return;

          const typeInstruction = needed >= parsedTypes.length
            ? `You MUST ensure that the generated questions contain a mix of all requested question types: ${parsedTypes.join(', ')}. Every requested type MUST appear at least once in the output array.`
            : `Each generated question MUST be chosen from the following types: ${parsedTypes.join(', ')}.`;

          let dynamicPrompt = `Generate exactly ${needed} ${normSubject} problems. The average difficulty of the generated questions must be exactly ${difficulty} (on a scale of 0 to 10). No single question should have a difficulty more than 2 units away from this average (i.e. every question's difficulty must be in the range [${Math.max(0, difficulty - 2)}, ${Math.min(10, difficulty + 2)}]).
Follow these strict rules:
1. ${typeInstruction}`;

          if (topics && typeof topics === 'string' && topics.trim()) {
            dynamicPrompt += `\n2. The generated questions MUST be about the following topics: ${topics.trim()}.`;
          }


          const text = await ai.chat(systemInstruction, dynamicPrompt);
          if (text) {
            const parsed = parseJSONResponse(text);
            if (parsed) {
              const list = Array.isArray(parsed) ? parsed : [parsed];
              for (const q of list) {
                if (allQuestions.length < count) {
                  allQuestions.push(q);
                }
              }

              // Save successfully generated questions directly to pregenerated_questions
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
                  await bq.query({
                    query: batchMergePregenQuery,
                    params,
                    types
                  });
                } catch (pregenErr) {
                  console.error('Failed to add newly generated questions to pregenerated_questions:', pregenErr);
                }
              }
            }
          }
        }, req);
      } catch (genErr) {
        console.warn(`Model generation failed or busy on attempt ${attempts}:`, genErr);
        if (attempts >= maxAttempts) {
          throw genErr;
        }
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
