/* eslint-disable */
import { BigQuery } from '@google-cloud/bigquery';
import { executeWithRetry } from './_gemini.js';

const projectId = process.env.BIGQUERY_PROJECT_ID || 'chronos-stress-sandbox';

const bq = new BigQuery({
  projectId,
  credentials: {
    client_email: process.env.BIGQUERY_CLIENT_EMAIL,
    private_key: process.env.BIGQUERY_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});


/**
 * Parse complete JSON objects from a partially streamed JSON array string.
 * Tracks brace depth and string boundaries to extract finished {...} objects.
 */
function extractCompleteObjects(jsonStr) {
  const objects = [];
  let depth = 0;
  let inString = false;
  let escape = false;
  let objStart = -1;

  for (let i = 0; i < jsonStr.length; i++) {
    const ch = jsonStr.charAt(i);

    if (escape) {
      escape = false;
      continue;
    }

    if (inString) {
      if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }

    // Outside string
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && objStart !== -1) {
        try {
          objects.push(JSON.parse(jsonStr.substring(objStart, i + 1)));
        } catch (e) { /* incomplete, skip */ }
        objStart = -1;
      }
    }
  }

  return objects;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { count, startingDifficulty, subject, targetUserId = 'default_user', freeResponseMode, examFormat } = req.body;

  if (!count || !startingDifficulty || !subject) {
    return res.status(400).json({ error: 'Missing required parameters: count, startingDifficulty, subject' });
  }

  const sanitizedUser = String(targetUserId).replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();

  try {
    // 1. Fetch user weaknesses from BigQuery
    const weaknessesQuery = `
      SELECT 
        COALESCE(
          STRING_AGG(
            FORMAT("Topic: %s (Accuracy: %d%%)", sub_category, CAST(accuracy_rate * 100 AS INT64)), 
            "; "
          ),
          "None (excellent performance across all topics)"
        ) AS weaknesses
      FROM \`${projectId}\`.\`chronos_users\`.\`user_topic_mastery\`
      WHERE accuracy_rate < 0.65 AND user_id = @targetUserId AND subject = @subject
    `;

    const [rows] = await bq.query({
      query: weaknessesQuery,
      params: { targetUserId: sanitizedUser, subject },
    });

    const weaknesses = rows[0]?.weaknesses || 'None (excellent performance across all topics)';

    // 2. Build the Gemini generation prompt
    let subjectSpecificInstructions = '';
    const normSubject = String(subject).trim().toLowerCase();

    if (normSubject === 'math') {
      subjectSpecificInstructions = `
Follow these strict Olympiad Design Philosophies:

1. Syllabus Boundaries (Difficulty via Depth, Not Scope)
- Restrict topics strictly to the competitive high-school/national olympiad purview:
  * Focus on algebra, combinatorics, geometry, and number theory.
- DO increase difficulty by forcing the integration of multiple foundational concepts:
  * Pair algebraic geometry (curves/conics) with modular arithmetic (finding integer points), or pair recursive sequence properties with combinatorics/pigeonhole principle, or use complex numbers to solve non-trivial coordinate geometry problems.
- Incorporate subtle conceptual traps:
  * Design problems with subtle domain/range constraints, non-obvious degeneracy in geometric configurations, off-by-one counting errors in combinatorics, or division-by-zero/modulo-zero pitfalls in systems of equations.

2. Authentic Style & Tone Mimicry
- Use the exact technical nomenclature, passive voice, and formal phrasing characteristic of official olympiads:
  * Mimic MAA Mathematics Olympiad (AMC 12, AIME, USAMO) exam phrasing (e.g. "Find the number of...", "Let S be the set of...", "Determine all functions f...").
- Ensure a formal, objective, and neutral tone, keeping the question texts direct and free of conversational framing or explicit hints.
- Match the layout density and typographic conventions of genuine past papers. Use LaTeX strictly for all equations, formulas, physical units, and mathematical variables.

Calibrate the 1-10 difficulty scale exactly as follows:
- 1: MATHCOUNTS school/chapter level, 5: AMC 12 question 20-ish level, 8: Average USAJMO problem level, 10: Hardest problems on the IMO.
`;
    } else if (normSubject === 'physics') {
      subjectSpecificInstructions = `
Follow these strict Olympiad Design Philosophies:

1. Syllabus Boundaries (Difficulty via Depth, Not Scope)
- For difficulty levels < 8, restrict topics strictly to the high-school/national olympiad physics purview (e.g., classical mechanics, electromagnetism, thermodynamics, fluid dynamics, waves, and optics).
- For difficulty levels >= 8, you MAY introduce advanced outside, college, or graduate-level topics. IMPORTANT: Ensure a highly diverse, balanced, and heavily randomized selection of advanced topics across all subfields. When you do introduce an advanced topic, you must use a first-principles approach, You must assume the user knows absolutely nothing about the topic and define all non-standard concepts, equations, and phenomena from scratch within the problem text itself.
- DO increase difficulty by forcing the integration of multiple foundational concepts:
  * Pair a thermodynamic PV-cycle with a magnetic induction loop or a spring-mass oscillator, or combine electrostatics/Lorentz force with rotational dynamics, or analyze buoyant forces in a rotating/accelerating frame.
- Incorporate subtle conceptual traps:
  * Design problems involving non-inertial reference frames, non-ideal frictional transitions (static vs kinetic), non-obvious geometric constraints, or cases requiring integration of first principles instead of basic formulas (e.g., non-uniform mass density).

2. Authentic Style & Tone Mimicry
- Use the exact technical nomenclature, passive voice, and formal phrasing characteristic of official olympiads:
  * Mimic AAPT Physics Olympiad (F=ma, USAPhO) exam phrasing.
- Ensure a formal, objective, and neutral tone, keeping the question texts direct and free of conversational framing or explicit hints.
- Match the layout density and typographic conventions of genuine past papers. Use LaTeX strictly for all equations, formulas, physical units, and mathematical variables.

Calibrate the 1-10 difficulty scale exactly as follows:
- 1: introductory level, 3: AP Physics C level, 5: F=ma level, 8: USAPhO level, 10: hardest problem on the IPhO.
`;
    } else if (normSubject === 'chemistry') {
      subjectSpecificInstructions = `

Role: You are a professional chemistry olympiad question writer for high school olympiad-level tests such as the USNCO. You want to write tricky chemistry problems that challenges students in their understanding of chemistry concepts, rather than their breadth of knowledge.

Follow these strict Olympiad Design Philosophies:

Generate [Number] Chemistry Olympiad problems at difficulty level [1-10], adhering strictly to the following Design Philosophies:

1. Novelty & "Invisible Traps" (Subtle Conceptual Bottlenecks)
- Create highly original and unique questions that require active derivation and first-principles reasoning over memory or template-matching.
- Every problem must center on a non-obvious conceptual trick, a hidden limiting factor, or a subtle breakdown of a standard textbook assumption.
- Ensure the question text remains entirely neutral and strictly objective, presenting the facts and parameters without any hints, warnings, or clarifying instructions.
- Incorporate a deceptive path: design the problem so that the most common rote formula shortcut yields an exact numerical value or structural choice that perfectly matches one of the incorrect distractor options.

2. Advanced Design & Difficulty Criteria
- Conceptual Integration (Multi-Topic Coupling): Standard questions isolate a single topic (e.g., a simple acid-base titration). High-quality difficult questions require the simultaneous application of disparate chemical principles. (e.g., coupling a coordination chemistry equilibrium ($K_f$) with a solubility product ($K_{sp}$) and an electrochemical cell ($E^{\circ}$), requiring the user to determine free ligand concentration via Nernst equation manipulation).
- Multi-Step Logical Cascades: The problem cannot be solved in a single algebraic or conceptual step. It requires a clear execution pathway where the output of one step forms the input of the next, often without explicit prompting on the intermediate variables (e.g., advanced organic synthesis/structure elucidation: deducing a molecular structure from elemental analysis (empirical formula) -> mass spectrometry fragments -> IR functional groups -> regioselective multi-step mechanistic outcomes, such as ozonolysis followed by an intramolecular aldol condensation).
- Discrimination of Subtle Chemical Nuances: Distinguishes top-tier students by testing exceptions grounded in fundamental principles rather than rote memorization. Focuses on electronic structures, periodic trends, and thermodynamic vs. kinetic control (e.g., predicting the major product of an electrophilic aromatic substitution where steric hindrance and electronic activation conflict, or identifying anomalies in molecular orbital configurations, such as $B_2$ vs $O_2$ paramagnetism and bond orders).
- Mathematical and Algorithmic Rigor: Eliminates standard simplifying assumptions (e.g., the $x$-is-small approximation in weak acid ionization). Requires setting up and solving higher-order algebraic equations or systems of simultaneous equations derived from mass and charge balances (e.g., calculating the exact pH of a polyprotic acid solution where $K_{a2}$ is non-negligible or the solution is sufficiently dilute that water autoionization ($K_w$) must be factored into the charge balance equation: $[H^+] = [OH^-] + [A^-] + 2[A^{2-}]$).
- Novel Context and Data Interpretation: Presents familiar chemical principles within an unfamiliar framework (e.g., bioinorganic active sites, industrial catalytic cycles, or cutting-edge materials chemistry like Metal-Organic Frameworks). Requires the student to extract relevant thermodynamic, kinetic, or structural variables from raw data tables or graphical representations (e.g., phase diagrams with unexpected polymorphs).

3. Difficulty-Dependent Syllabus Boundaries
- IF DIFFICULTY < 8 (USNCO National Level):
  - Maintain the USNCO scope but test to maximum depth.
  - Limit standard physical chemistry content to standard AP/USNCO curricula, keeping rules and equations within the standard scope.
  - Keep stereochemistry within standard general organic chemistry basics, avoiding advanced transition-state geometry or stereospecific control trajectories.
  - Confine coordination questions strictly to basic nomenclature, coordination number, and oxidation states.
  - Limit all derivations and principles to non-calculus based mathematics.
  - Focus spectroscopy questions on standard 1D-NMR and basic IR/UV-Vis.
  - Confine the conceptual level to competitive high school chemistry (e.g., excluding Tafel equation, advanced quantum mechanics, etc.).
  - Increase difficulty by coupling unexpected systems (e.g., matching a non-trivial stoichiometry with an electrochemical change that alters concentration ratios, or an organic reaction where a common functional group exhibits atypical reactivity due to adjacent electronic effects).
- IF DIFFICULTY >= 8 (IChO Level):
  - Pivot to completely original, concept-first designs leveraging advanced chemical phenomena.
  - The "First-Principles" Guardrail: Introduce advanced, extra-syllabus topics using self-contained, axiomatic background information within the problem preamble. A student must be able to deduce the correct path using standard prerequisites combined with the provided context.

4. Structural Representation (SMILES Rules)
- Represent simple chemical names and basic empirical formulas in standard prose using their standard IUPAC/common names or formulas (e.g., write water as $\text{H}_2\text{O}$ or name it directly).
- Limit SMILES notation (or Reaction SMILES) strictly to complex organic molecules, coordination complexes, or standalone reaction schemes where a 2D structural diagram is explicitly required.
- Display SMILES directly inline when needed, integrating them naturally into the sentence structure without introductory phrases.
- Use LaTeX strictly for all mathematical equations, equilibrium expressions, simple empirical chemical formulas in prose, physical units, and variables (e.g., $\Delta G^\circ$, $E^\circ$, $K_{\text{sp}}$, $1.0 \times 10^{-3} \text{ M}$).

5. SVG Graphics & Diagrams (svglib Compatibility & Optimization Constraints)
- When a chemistry question requires a graph, diagram, titration curve, phase diagram, or crystal lattice, generate the required diagram as a single, self-contained, valid <svg> block.
- Adhere to the following optimization constraints to minimize token usage and maximize rendering efficiency:
  * Use Primitive Shapes: Prioritize <circle>, <rect>, <line>, <ellipse>, and <polygon> over complex <path> elements whenever possible.
  * Reuse Components: Use <defs> and <use> elements to define and repeat recurring symbols, labels, or structural markers.
  * Optimize Paths: If a <path> is necessary, use absolute minimum control points. Round coordinates to 1 decimal place maximum. Do not generate dense, pixel-by-pixel coordinate arrays.
  * Leverage CSS Styling & Grouping: Group elements with <g> and apply shared styles (stroke, fill, stroke-width) to the group rather than repeating attributes on individual elements. (Note: always use inline standard presentation attributes on the elements or groups; do NOT use CSS <style> blocks to ensure full compatibility with python's svglib).
  * No Redundancy: Omit metadata, editor comments, unnecessary namespaces, or hidden elements. Keep formatting compact.
  * Ensure svglib Compatibility: Keep the layout flat or use standard <g transform='...'> groups. Avoid advanced clipping, masks, gradients, custom filters, or complex patterns. Ensure a solid white background (e.g. <rect width='100%' height='100%' fill='white'/>) is placed at the start of the SVG for visibility. Use single-quotes (apostrophes) for SVG attributes to maintain perfect JSON syntax compatibility.
  * Formatting: Enclose the raw SVG code within standard \`\`\`xml code blocks inside the "question" field. Do not wrap it in markdown text or prose.

6. Exemplar Chemistry Olympiad Questions
Below are high-quality, concept-rich, and rigorous exemplar chemistry questions demonstrating the expected style, formatting, and depth:

USNCO Question Example 1:
{
  "id": "chem_ex1",
  "topic": "Analytical Chemistry & Iodometry",
  "question": "A weighed sample of a copper-nickel alloy is dissolved in a known volume of nitric acid. Which method is most suitable for determining the mass percent of copper in the alloy?",
  "type": "multiple_choice",
  "options": [
    "Treatment of an aliquot of the solution with excess iodide, followed by titration of the iodine produced with sodium thiosulfate.",
    "Measurement of the absorbance of the solution at a wavelength of light at which both $\\\\ce{Cu^{2+}}$ and $\\\\ce{Ni^{2+}}$ absorb, and comparison with the absorbances of known standards of the two ions.",
    "Addition of excess sodium hydroxide to the solution, isolation of the metal hydroxides by filtration, and measurement of the mass of the precipitate.",
    "Bubbling hydrogen gas through the solution and measuring the mass of the metal that precipitates from the solution."
  ],
  "answer": "A",
  "difficulty": 6,
  "detailedSolution": "Dissolving a copper-nickel alloy in nitric acid produces $\\\\ce{Cu^{2+}}$ and $\\\\ce{Ni^{2+}}$ ions.\\n\\n1. In method (A), adding excess iodide ($\\\\ce{I^-}$) selectively reduces $\\\\ce{Cu^{2+}}$ to insoluble copper(I) iodide ($\\\\ce{CuI}$), producing triiodide/iodine ($\\\\ce{I_3^-}$ / $\\\\ce{I_2}$):\\n$$2\\\\ce{Cu^{2+}} + 4\\\\ce{I^-} \\\\rightarrow 2\\\\ce{CuI(s)} + \\\\ce{I_2}$$\\n\\\\ce{Ni^{2+}}$ does not oxidize iodide. Titrating the liberated iodine with sodium thiosulfate ($\\\\ce{S_2O_3^{2-}}$) allows for highly selective and accurate quantification of copper:\\n$$\\\\ce{I_2} + 2\\\\ce{S_2O_3^{2-}} \\\\rightarrow 2\\\\ce{I^-} + \\\\ce{S_4O_6^{2-}}$$\\nThis iodometric titration is extremely selective for copper over nickel, making (A) the correct and most suitable method.\\n\\n2. Method (B) is unsuitable because both ions absorb light at the chosen wavelength, making direct comparison difficult without a multi-wavelength deconvolution method.\\n3. Method (C) precipitates both metal hydroxides ($\\\\ce{Cu(OH)_2}$ and $\\\\ce{Ni(OH)_2}$), so their masses cannot be separated simply by weighing the precipitate.\\n4. Method (D) cannot selectively precipitate copper in a strongly oxidizing nitric acid environment, nor is it a standard analytical procedure."
}

USNCO Question Example 2:
{
  "id": "chem_ex2",
  "topic": "Chemical Bonding & Bond Order",
  "question": "Which species has the longest carbon-oxygen bond?",
  "type": "multiple_choice",
  "options": [
    "$\\\\ce{HCO2^-}$",
    "$\\\\ce{CO3^{2-}}$",
    "$\\\\ce{CO2}$",
    "$\\\\ce{COS}$"
  ],
  "answer": "B",
  "difficulty": 5,
  "detailedSolution": "The length of a carbon-oxygen bond is inversely proportional to its bond order. Let's determine the carbon-oxygen bond orders in each species:\\n\\n1. For $\\\\ce{HCO2^-}$ (formate ion), the carbon has one double bond and one single bond to oxygen, which are delocalized by resonance. The average $\\\\ce{C-O}$ bond order is:\\n$$\\\\text{Bond Order} = \\\\frac{1 + 2}{2} = 1.5$$\\n\\n2. For $\\\\ce{CO3^{2-}}$ (carbonate ion), the carbon is bonded to three oxygen atoms with one double bond and two single bonds in resonance. The average $\\\\ce{C-O}$ bond order is:\\n$$\\\\text{Bond Order} = \\\\frac{1 + 1 + 2}{3} = 1.33$$\\n\\n3. For $\\\\ce{CO2}$ (carbon dioxide), the Lewis structure is $\\\\ce{O=C=O}$, which has two discrete $\\\\ce{C-O}$ double bonds. The bond order is $2.0$.\\n\\n4. For $\\\\ce{COS}$ (carbonyl sulfide), the Lewis structure is $\\\\ce{O=C=S}$, containing a $\\\\ce{C-O}$ double bond. The bond order is $2.0$.\\n\\nComparing the average bond orders, the carbonate ion ($\\\\ce{CO3^{2-}}$) has the lowest average bond order ($1.33$) and therefore the longest carbon-oxygen bond, making (B) the correct choice."
}

USNCO Question Example 3:
{
  "id": "chem_ex3",
  "topic": "Organic Structure & Resonance Delocalization",
  "question": "Which is the best description of the arrangement of the atoms in space in the protonated urea ion, $\\\\ce{H5CN2O^+}$?",
  "type": "multiple_choice",
  "options": [
    "SMILES: [[SMILES: NC(=O)[NH3+]]]",
    "SMILES: [[SMILES: NC(=O)[NH3+]]]",
    "SMILES: [[SMILES: N=C(O)N]]",
    "SMILES: [[SMILES: NC(O)=[NH2+]]]"
  ],
  "answer": "D",
  "difficulty": 7,
  "detailedSolution": "Protonation of urea, $\\\\ce{(NH2)2C=O}$, occurs preferentially on the oxygen atom rather than the nitrogen atom.\\n\\n1. Protonation on the oxygen atom gives the cation $\\\\ce{[(NH2)2C=OH]^+}$. The positive charge in this cation is highly stabilized via resonance delocalization over both electronegative nitrogen atoms:\\n$$\\\\ce{H2N-C(OH)=NH2^+} \\\\leftrightarrow \\\\ce{H2N^+=C(OH)-NH2} \\\\leftrightarrow \\\\ce{H2N-C(O^+H)-NH2}$$\\nThis delocalization gives both $\\\\ce{C-N}$ bonds substantial double-bond character and makes the three heavy atoms (N, C, N) and O lie in the same plane.\\n\\n2. Protonation on nitrogen, yielding $\\\\ce{H2N-C(=O)-NH3^+}$, lacks this resonance stabilization because the positive charge on nitrogen cannot be delocalized since nitrogen has no lone pairs to participate in conjugation.\\n\\n3. The SMILES string representing oxygen protonation (specifically showing one resonance contributor with a $\\\\ce{C=N}$ double bond) is [[SMILES: NC(O)=[NH2+]]], which is option (D)."
}

USNCO Question Example 4:
{
  "id": "chem_ex4",
  "topic": "Acid-Base Titration & Gas Laws (Structure Elucidation)",
  "question": "A is an ionic compound that contains only the elements hydrogen, nitrogen, and oxygen.\\n\\na. A 1.000-g sample of A is dissolved in 20 mL water and titrated with 0.5000 M NaOH solution, giving the data shown below. What is the molar mass of A?\\n\\n<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 620 400' width='100%' height='100%' fill='none' stroke='none'>\\n  <defs>\\n    <pattern id='minor' width='8.66667' height='6.4' patternUnits='userSpaceOnUse'>\\n      <path d='M 8.66667 0 L 0 0 0 6.4' fill='none' stroke='#e0e0e0' stroke-width='0.5'/>\\n    </pattern>\\n    <pattern id='major' width='43.33333' height='32' patternUnits='userSpaceOnUse'>\\n      <path d='M 43.33333 0 L 0 0 0 32' fill='none' stroke='#999' stroke-width='1'/>\\n    </pattern>\\n  </defs>\\n  <rect width='100%' height='100%' fill='white'/>\\n  <g transform='translate(60, 20)'>\\n    <rect width='520' height='320' fill='url(#minor)'/>\\n    <rect width='520' height='320' fill='url(#major)'/>\\n    <rect width='520' height='320' fill='none' stroke='#999' stroke-width='1'/>\\n  </g>\\n  <g font-family='Arial, sans-serif' font-size='12' text-anchor='end' fill='black'>\\n    <text x='50' y='24'>14</text><text x='50' y='56'>13</text><text x='50' y='88'>12</text>\\n    <text x='50' y='120'>11</text><text x='50' y='152'>10</text><text x='50' y='184'>9</text>\\n    <text x='50' y='216'>8</text><text x='50' y='248'>7</text><text x='50' y='280'>6</text>\\n    <text x='50' y='312'>5</text><text x='50' y='344'>4</text>\\n    <text x='40' y='180' font-size='16' font-weight='bold'>pH</text>\\n  </g>\\n  <g font-family='Arial, sans-serif' font-size='12' text-anchor='middle' fill='black'>\\n    <text x='60' y='355'>0</text><text x='103.3' y='355'>5</text><text x='146.7' y='355'>10</text>\\n    <text x='190' y='355'>15</text><text x='233.3' y='355'>20</text><text x='276.7' y='355'>25</text>\\n    <text x='320' y='355'>30</text><text x='363.3' y='355'>35</text><text x='406.7' y='355'>40</text>\\n    <text x='450' y='355'>45</text><text x='493.3' y='355'>50</text><text x='536.7' y='355'>55</text>\\n    <text x='580' y='355'>60</text>\\n    <text x='320' y='380' font-size='16'>mL 0.5000 M NaOH added</text>\\n  </g>\\n  <path d='M 60 314.4 C 60 250, 68.7 237.6, 77.3 218.4 S 103.3 192.8, 146.7 173.6 S 190 160.8, 233.3 144.8 S 268 109.6, 276.7 77.6 S 285.3 68, 320 58.4 S 406.7 48.8, 580 42.4' fill='none' stroke='black' stroke-width='2' />\\n</svg>\\n\\nb. When a 1.000-g sample of A is heated at 230 °C in an evacuated 1.50 L vessel, it decomposes into gaseous products, giving a final pressure of 784 mm Hg. How many moles of gas are formed in this reaction?\\n\\nc. If the gases produced from the decomposition of 1.000 g of A are instead first passed through a column packed with magnesium perchlorate (which strongly absorbs water vapor) and then collected at 25 °C and a pressure of 755 mm Hg, the total volume of gas is 308 mL. How many moles of gas are collected in this experiment?\\n\\nd. What is the formula of A? Explain your reasoning.\\n\\ne. Write Lewis structures for the cation and the anion present in A and for the product(s) of its decomposition at 230 °C. Your Lewis structures should include all bonds, lone pairs, and nonzero formal charges. You should show all significant resonance structures for each species.",
  "type": "free_response",
  "answer": "",
  "difficulty": 9,
  "detailedSolution": "a. Let $V_e$ be the volume of $0.5000 \\\\text{ M } \\\\text{NaOH}$ required to reach the equivalence point of the titration. From the provided titration curve, the equivalence point (inflection point of the steep pH rise) is reached at exactly $V_e = 25.0 \\\\text{ mL}$.\\n\\nThe moles of $\\\\text{OH}^-$ added at equivalence are:\\n$$\\\\text{moles } \\\\text{OH}^- = 0.0250 \\\\text{ L} \\\\times 0.5000 \\\\text{ M} = 0.0125 \\\\text{ mol}$$\\nSince $\\\\text{A}$ reacts with $\\\\text{NaOH}$ in a 1:1 molar ratio, the sample contains $0.0125 \\\\text{ mol}$ of $\\\\text{A}$.\\n\\nThe molar mass of $\\\\text{A}$ is:\\n$$\\\\text{Molar Mass} = \\\\frac{1.000 \\\\text{ g}}{0.0125 \\\\text{ mol}} = 80.0 \\\\text{ g/mol}$$\\n\\nb. Using the ideal gas law ($PV = nRT$):\\n- $P = 784 \\\\text{ mm Hg} = \\\\frac{784}{760} \\\\text{ atm} \\\\approx 1.0316 \\\\text{ atm}$\\n- $V = 1.50 \\\\text{ L}$\\n- $T = 230 \\\\ ^\\\\circ\\\\text{C} = 503.15 \\\\text{ K}$\\n- $R = 0.08206 \\\\text{ L atm mol}^{-1}\\\\text{K}^{-1}$\\n$$\\\\text{moles of gas } (n) = \\\\frac{PV}{RT} = \\\\frac{1.0316 \\\\text{ atm} \\\\times 1.50 \\\\text{ L}}{0.08206 \\\\text{ L atm mol}^{-1}\\\\text{K}^{-1} \\\\times 503.15 \\\\text{ K}} = 0.0375 \\\\text{ mol}$$\\n\\nc. Using the ideal gas law for the dry collected gases:\\n- $P = 755 \\\\text{ mm Hg} = \\\\frac{755}{760} \\\\text{ atm} \\\\approx 0.9934 \\\\text{ atm}$\\n- $V = 308 \\\\text{ mL} = 0.308 \\\\text{ L}$\\n- $T = 25 \\\\ ^\\\\circ\\\\text{C} = 298.15 \\\\text{ K}$\\n$$\\\\text{moles of dry gas} = \\\\frac{PV}{RT} = \\\\frac{0.9934 \\\\text{ atm} \\\\times 0.308 \\\\text{ L}}{0.08206 \\\\text{ L atm mol}^{-1}\\\\text{K}^{-1} \\\\times 298.15 \\\\text{ K}} = 0.0125 \\\\text{ mol}$$\\n\\nd. Determination of the formula of $\\\\text{A}$:\\n1. The initial moles of $\\\\text{A}$ in the $1.000 \\\\text{ g}$ sample is $0.0125 \\\\text{ mol}$.\\n2. Thermal decomposition of $0.0125 \\\\text{ mol}$ of $\\\\text{A}$ produces $0.0375 \\\\text{ mol}$ of total gaseous products (a 1:3 molar ratio).\\n3. When water is absorbed, $0.0125 \\\\text{ mol}$ of non-water gas remains (a 1:1 molar ratio of dry gas to initial $\\\\text{A}$), meaning $0.0375 - 0.0125 = 0.0250 \\\\text{ mol}$ of water vapor was produced (a 1:2 ratio of $\\\\text{H}_2\\\\text{O}$ to initial $\\\\text{A}$).\\n4. This yields a stoichiometry where 1 mole of $\\\\text{A}$ decomposes to form 1 mole of a nitrogen/oxygen-containing gas and 2 moles of $\\\\text{H}_2\\\\text{O}(g)$.\\n5. Since the molar mass of $\\\\text{A}$ is $80.0 \\\\text{ g/mol}$ and it contains only H, N, and O, the formula matches ammonium nitrate, $\\\\text{NH}_4\\\\text{NO}_3$ ($M = 80.04 \\\\text{ g/mol}$).\\n6. The thermal decomposition equation at $230 \\\\ ^\\\\circ\\\\text{C}$ is:\\n$$\\\\text{NH}_4\\\\text{NO}_3(s) \\\\rightarrow \\\\text{N}_2\\\\text{O}(g) + 2\\\\text{H}_2\\\\text{O}(g)$$\\nThis matches the observed 1:3 total gas ratio and 1:2 water vapor ratio perfectly.\\n\\ne. Lewis structures (using bracket SMILES notation for structures or standard chemical descriptions):\\n- **Cation** $\\\\text{NH}_4^+$: Central $\\\\text{N}$ atom single-bonded to four $\\\\text{H}$ atoms in a tetrahedral geometry (formal charge on $\\\\text{N}$ is $+1$). SMILES: '[NH4+]'\\n- **Anion** $\\\\text{NO}_3^-$: Central $\\\\text{N}$ atom single-bonded to two $\\\\text{O}$ atoms (formal charge $-1$ each) and double-bonded to one $\\\\text{O}$ atom (formal charge $0$). The central $\\\\text{N}$ has a formal charge of $+1$. There are three major resonance structures, showing the double bond delocalized over all three oxygen atoms. SMILES: '[O-]N(=O)[O-]'\\n- **Decomposition Products**:\\n  - $\\\\text{N}_2\\\\text{O}$: Linear structure with two major resonance contributors:\\n    1. $\\\\text{:N}\\\\equiv\\\\text{N}-\\\\ddot{\\\\text{O}}\\\\text{:}^-$ (terminal $\\\\text{N}$ formal charge $0$, central $\\\\text{N}$ formal charge $+1$, terminal $\\\\text{O}$ formal charge $-1$). SMILES: 'N#[N+][O-]'\\n    2. $^-\\\\text{:}\\\\ddot{\\\\text{N}}=\\\\text{N}=\\\\ddot{\\\\text{O}}\\\\text{:}$ (terminal $\\\\text{N}$ formal charge $-1$, central $\\\\text{N}$ formal charge $+1$, terminal $\\\\text{O}$ formal charge $0$). SMILES: '[N-]=[N+]=O'\\n  - $\\\\text{H}_2\\\\text{O}$: Bent structure with central $\\\\text{O}$ single-bonded to two $\\\\text{H}$ atoms and holding two lone pairs. SMILES: '[OH2]'"
}

USNCO Question Example 5:
{
  "id": "chem_ex5",
  "topic": "Reaction Prediction & Net Ionic Equations",
  "question": "Write net equations for each of the reactions below. Use appropriate ionic and molecular formulas and omit formulas for all ions or molecules that do not take part in a reaction. Write structural formulas for all organic substances, and clearly show stereochemistry where relevant. You need not balance the equations or show the phase of the species.\\n\\na. Aqueous hydrochloric acid is added to a solution of sodium hypochlorite.\\n\\nb. Aluminum foil is added to concentrated aqueous potassium hydroxide solution.\\n\\nc. Metallic sodium is added to liquid ammonia in the presence of a trace amount of iron(III) nitrate.\\n\\nd. Potassium tetrachloroplatinate is heated with two equivalents of aqueous ammonia.\\n\\ne. Sodium tert-butoxide is added to 3-bromo-3-ethylpentane in N,N-dimethylformamide (DMF) solution.\\n\\nf. Cobalt-57 undergoes radioactive decay by electron capture.",
  "type": "free_response",
  "answer": "",
  "difficulty": 8,
  "detailedSolution": "a. Adding aqueous hydrochloric acid to a solution of sodium hypochlorite results in protonation of the hypochlorite ion. Under acidic conditions, the hypochlorous acid can react with chloride ions to undergo compropoportionation, forming chlorine gas:\\n$$\\\\text{H}^+(aq) + \\\\text{ClO}^-(aq) \\\\rightarrow \\\\text{HClO}(aq)$$\\nAnd/or the compropoportionation to chlorine gas:\\n$$\\\\text{ClO}^-(aq) + \\\\text{Cl}^-(aq) + 2\\\\text{H}^+(aq) \\\\rightarrow \\\\text{Cl}_2(g) + \\\\text{H}_2\\\\text{O}(l)$$\\nBoth are correct net chemical representations depending on concentration.\\n\\nb. Aluminum is an amphoteric metal that dissolves in strongly basic solutions to form tetrahydroxoaluminate(III) complex and hydrogen gas:\\n$$\\\\text{Al}(s) + \\\\text{OH}^-(aq) + 3\\\\text{H}_2\\\\text{O}(l) \\\\rightarrow [\\\\text{Al}(OH)_4]^-(aq) + \\\\frac{3}{2}\\\\text{H}_2(g)$$\\n\\nc. In liquid ammonia, sodium metal normally dissolves to form solvated electrons. However, in the presence of a catalytic transition metal like iron(III) (provided as iron(III) nitrate), sodium reacts with ammonia to produce sodium amide and hydrogen gas:\\n$$\\\\text{Na}(s) + \\\\text{NH}_3(l) \\\\xrightarrow{\\\\text{Fe}^{3+}} \\\\text{NaNH}_2(s) + \\\\frac{1}{2}\\\\text{H}_2(g)$$\\nNet ionic equation:\\n$$\\\\text{Na} + \\\\text{NH}_3 \\\\rightarrow \\\\text{Na}^+ + \\\\text{NH}_2^- + \\\\text{H}_2$$\\n\\nd. Tetrachloroplatinate reacts with two equivalents of ammonia via ligand substitution. Due to the strong trans-directing effect of chloride compared to ammonia, the second ammonia ligand replaces the chloride trans to the first chloride, selectively forming the *cis* isomer (cisplatin):\\n$$\\\\text{[PtCl_4]}^{2-}(aq) + 2\\\\text{NH}_3(aq) \\\\rightarrow \\\\text{cis-Pt(NH}_3)_2\\\\text{Cl}_2(s) + 2\\\\text{Cl}^-(aq)$$\\n\\ne. Sodium tert-butoxide is a strong, sterically hindered base. When added to 3-bromo-3-ethylpentane (a tertiary alkyl halide) in a polar aprotic solvent like DMF, an E2 elimination occurs, forming 3-ethylpent-2-ene:\\nReaction SMILES representation:\\n'CCC(Br)(CC)CC.CC(C)(C)[O-]>>CCC(=CC)CC.CC(C)(C)O.[Br-]' (representing 3-bromo-3-ethylpentane and tert-butoxide reacting to yield 3-ethylpent-2-ene, tert-butanol, and bromide).\\n\\nf. Cobalt-57 decays by electron capture. An inner-shell electron is captured by the nucleus, converting a proton into a neutron and releasing an electron neutrino, yielding iron-57:\\n$$^{57}_{27}\\\\text{Co} + \\\\text{e}^- \\\\rightarrow ^{57}_{26}\\\\text{Fe} + \\\\nu_e$$"
}

IChO Question Example 6:
{
  "id": "chem_ex6",
  "topic": "Chemical Equilibrium & Thermodynamics (Hydrates)",
  "question": "A British artist Roger Hiorns entirely filled an apartment with a supersaturated copper sulfate solution, forming brilliant blue crystals of a solid hydrate on the walls, floor, and ceiling.\\n\\na. Write the chemical formula of these blue crystals.\\n\\nb. If the humidity in the apartment is maintained at a constant level, use the Clausius-Clapeyron equation to calculate the temperature (in $^\\circ\\\\text{C}$) at which the relative humidity will be exactly $35\\\\%$. Assume the relative humidity is governed by the dehydration equilibrium:\\n$$\\\\ce{CuSO4*5H2O(s) <=> CuSO4*3H2O(s) + 2H2O(g)}$$\\n\\nc. Rectification of aqueous ethanol at atmospheric pressure can increase its concentration to not more than $95.5\\\\%\\\\text{ wt.}$. Deduce the thermodynamic basis for this limit.\\n\\nd. Anhydrous copper sulfate is used to dehydrate ethanol further by treating it in sequential portions until it stops turning blue. Calculate the minimum residual water content (in mass percent) in ethanol that can be achieved at room temperature ($298.15\\\\text{ K}$) using this method.\\n\\ne. Determine the minimum residual water contents (in mass percent) if ethanol is dried using this method at $0\\\\ ^\\circ\\\\text{C}$ and $40\\\\ ^\\circ\\\\text{C}$ respectively, and explain which temperature is preferred.\\n\\n**Thermodynamic Data (at 298 K):**\\n- $\\\\Delta_f H^\\circ\\\\ce{[CuSO4*5H2O(s)]} = -2277.4\\\\text{ kJ mol}^{-1}$\\n- $\\\\Delta_f H^\\circ\\\\ce{[CuSO4*3H2O(s)]} = -1688.7\\\\text{ kJ mol}^{-1}$\\n- $\\\\Delta_f H^\\circ\\\\ce{[CuSO4*H2O(s)]} = -1084.4\\\\text{ kJ mol}^{-1}$\\n- $\\\\Delta_f H^\\circ\\\\ce{[CuSO4(s)]} = -770.4\\\\text{ kJ mol}^{-1}$\\n- $\\\\Delta_f H^\\circ\\\\ce{[H2O(l)]} = -285.83\\\\text{ kJ mol}^{-1}$\\n- $\\\\Delta_f H^\\circ\\\\ce{[H2O(g)]} = -241.83\\\\text{ kJ mol}^{-1}$\\n- $p_{sat}\\\\text{ of pure water} = 3200\\\\text{ Pa}$\\n- $p_{sat}\\\\text{ over } \\\\ce{CuSO4*5H2O} = 1047\\\\text{ Pa}$\\n- $p_{sat}\\\\text{ over } \\\\ce{CuSO4*H2O} = 107\\\\text{ Pa}$\\n\\n*Note: Vapor pressure of water over a dilute solution in ethanol is given by $p = p_{sat} \\\\gamma x$, where $x$ is the mole fraction of water, and $\\\\gamma$ is the activity coefficient of water, which is approximately $2.45$ and is independent of temperature.*",
  "type": "free_response",
  "answer": "",
  "difficulty": 9,
  "detailedSolution": "a. The blue crystals are copper(II) sulfate pentahydrate: $\\\\ce{CuSO4*5H2O}$.\\n\\nb. For the dehydration equilibrium:\\n$$\\\\ce{CuSO4*5H2O(s) <=> CuSO4*3H2O(s) + 2H2O(g)}$$\\n$\\\\Delta_{dec} H^\\circ = \\\\Delta_f H^\\circ(\\\\ce{CuSO4*3H2O}) + 2\\\\Delta_f H^\\circ(\\\\ce{H2O(g)}) - \\\\Delta_f H^\\circ(\\\\ce{CuSO4*5H2O})$$\\n$$\\\\Delta_{dec} H^\\circ = -1688.7 + 2(-241.83) - (-2277.4) = +105.04\\\\text{ kJ mol}^{-1}$$\\nThis reaction produces $2$ moles of water vapor, so the enthalpy of dehydration per mole of water vapor is $\\\\Delta H_{dec} = 52.52\\\\text{ kJ mol}^{-1}$.\\n\\nApplying the Clausius-Clapeyron equation for the water vapor pressure over the hydrate $p_h(T)$ and saturated water vapor pressure $p_{sat}(T)$:\\n$$\\\\ln \\\\frac{p_h(T)}{p_{h0}} = -\\\\frac{\\\\Delta H_{dec}}{R} \\\\left( \\\\frac{1}{T} - \\\\frac{1}{T_0} \\\\right)$$\\n$$\\\\ln \\\\frac{p_{sat}(T)}{p_{sat0}} = -\\\\frac{\\\\Delta H_{vap}}{R} \\\\left( \\\\frac{1}{T} - \\\\frac{1}{T_0} \\\\right)$$\\nwhere $\\\\Delta H_{vap} = \\\\Delta_f H^\\circ(\\\\ce{H2O(g)}) - \\\\Delta_f H^\\circ(\\\\ce{H2O(l)}) = -241.83 - (-285.83) = 44.00\\\\text{ kJ mol}^{-1}$.\\n\\nSetting the relative humidity to $35\\\\%$, we have $p_h(T) / p_{sat}(T) = 0.35$:\\n$$\\\\ln \\\\left( \\\\frac{p_h(T)}{p_{sat}(T)} \\\\right) = \\\\ln \\\\left( \\\\frac{p_{h0}}{p_{sat0}} \\\\right) - \\\\frac{\\\\Delta H_{dec} - \\\\Delta H_{vap}}{R} \\\\left( \\\\frac{1}{T} - \\\\frac{1}{298.15} \\\\right)$$\\n$$\\\\ln(0.35) = \\\\ln \\\\left( \\\\frac{1047}{3200} \\\\right) - \\\\frac{52520 - 44000}{8.314} \\\\left( \\\\frac{1}{T} - \\\\frac{1}{298.15} \\\\right)$$\\n$$-1.0498 = -1.1171 - 1024.78 \\\\left( \\\\frac{1}{T} - \\\\frac{1}{298.15} \\\\right)$$\\n$$\\\\frac{1}{T} - \\\\frac{1}{298.15} = -6.567 \\\\times 10^{-5}\\\\text{ K}^{-1} \\\\Rightarrow T = 304.1\\\\text{ K} \\\\approx 31\\\\ ^\\circ\\\\text{C}$$\\n\\nc. Rectification limit is due to the formation of a minimum-boiling azeotrope (at $95.5\\\\%\\\\text{ wt.}$) where the mole fractions of water and ethanol in the gas and liquid phases at equilibrium are equal ($y_i = x_i$).\\n\\nd. Anhydrous copper sulfate acts as a desiccant by forming lower hydrates. In sequential batch dehydrations, the final desiccant phase is in equilibrium with the monohydrate:\\n$$\\\\ce{CuSO4*H2O(s) <=> CuSO4(s) + H2O(g)}$$\\nThe vapor pressure of water over this system at $298.15\\\\text{ K}$ is $p_h = 107\\\\text{ Pa}$.\\nAt equilibrium: $p = p_{sat} \\\\gamma x = p_h$\\n$$107 = 3200 \\\\times 2.45 \\\\times x \\\\Rightarrow x = 0.01365$$\\nConverting the mole fraction $x$ to mass percent:\\n$$\\\\text{wt.}\\\\% = \\\\frac{x \\\\times 18.015}{x \\\\times 18.015 + (1 - x) \\\\times 46.07} \\\\times 100 \\\\approx 0.54\\\\%\\\\text{ wt.}$$\\n\\ne. The enthalpy of dehydration of the monohydrate is:\\n$$\\\\Delta H_{dec,mono} = \\\\Delta_f H^\\circ(\\\\ce{CuSO4}) + \\\\Delta_f H^\\circ(\\\\ce{H2O(g)}) - \\\\Delta_f H^\\circ(\\\\ce{CuSO4*H2O}) = -770.4 - 241.83 - (-1084.4) = +72.17\\\\text{ kJ mol}^{-1}$$\\n\\nUsing the Clausius-Clapeyron equation for $x(T)$:\\n$$x(T) = x_{298} \\\\exp \\\\left[ -\\\\frac{\\\\Delta H_{dec,mono} - \\\\Delta H_{vap}}{R} \\\\left( \\\\frac{1}{T} - \\\\frac{1}{298.15} \\\\right) \\\\right]$$\\n$$x(T) = 0.01365 \\\\exp \\\\left[ -\\\\frac{28170}{8.314} \\\\left( \\\\frac{1}{T} - \\\\frac{1}{298.15} \\\\right) \\\\right]$$\\n\\n- At $0\\\\ ^\\circ\\\\text{C}$ ($T = 273.15\\\\text{ K}$):\\n  $x = 0.00482 \\\\Rightarrow \\\\text{wt.}\\\\% \\\\approx 0.19\\\\%\\\\text{ wt.}$\\n- At $40\\\\ ^\\circ\\\\text{C}$ ($T = 313.15\\\\text{ K}$):\\n  $x = 0.02352 \\\\Rightarrow \\\\text{wt.}\\\\% \\\\approx 0.93\\\\%\\\\text{ wt.}$\\n\\nPerforming the dehydration at a lower temperature ($0\\\\ ^\\circ\\\\text{C}$) is preferred because the hydration reaction ($\\\\Delta H_{hyd} = -72.17\\\\text{ kJ mol}^{-1}$) is highly exothermic, which shifts the equilibrium to the reactant (hydrated) side at lower temperatures, achieving a lower residual water content."
}

IChO Question Example 7:
{
  "id": "chem_ex7",
  "topic": "Chemical Kinetics & Heterogeneous Catalysis (TOF/TON)",
  "question": "Turnover frequency (TOF) and turnover number (TON) are crucial kinetic indicators of a catalyst\\'s performance. Under IUPAC definitions, TOF is the maximum number of reagent molecules a catalytic site can convert per unit time, while TON is the total number of moles of reagent converted per mole of catalyst before inactivation.\\n\\na. State the SI unit of TOF and write the thermodynamic/kinetic relation between TON, TOF, and the time until inactivation ($t$).\\n\\nb. A gas-phase reaction $\\\\ce{A + Cat -> B}$ proceeds on a solid catalyst surface in a closed system. The amount of product $B$ produced per $\\\\text{cm}^2$ of a catalytic surface with $10^{15}\\\\text{ sites cm}^{-2}$ as a function of time is plotted below:\\n\\n\`\`\`xml\\n<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 400 300\\' width=\\'400\\' height=\\'300\\'>\\n  <rect width=\\'100%\\' height=\\'100%\\' fill=\\'white\\'/>\\n  <line x1=\\'40\\' y1=\\'280\\' x2=\\'380\\' y2=\\'280\\' stroke=\\'black\\' stroke-width=\\'2\\' fill=\\'none\\'/>\\n  <line x1=\\'40\\' y1=\\'280\\' x2=\\'40\\' y2=\\'20\\' stroke=\\'black\\' stroke-width=\\'2\\' fill=\\'none\\'/>\\n  <polygon points=\\'380,277 385,280 380,283\\' fill=\\'black\\'/>\\n  <polygon points=\\'37,20 40,15 43,20\\' fill=\\'black\\'/>\\n  <text x=\\'50\\' y=\\'30\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>N_B, mol/cm² • 10^8</text>\\n  <text x=\\'360\\' y=\\'295\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>t, s</text>\\n  <line x1=\\'35\\' y1=\\'230\\' x2=\\'40\\' y2=\\'230\\' stroke=\\'black\\' stroke-width=\\'1\\' fill=\\'none\\'/><text x=\\'15\\' y=\\'234\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>1</text>\\n  <line x1=\\'35\\' y1=\\'180\\' x2=\\'40\\' y2=\\'180\\' stroke=\\'black\\' stroke-width=\\'1\\' fill=\\'none\\'/><text x=\\'15\\' y=\\'184\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>5</text>\\n  <line x1=\\'35\\' y1=\\'130\\' x2=\\'40\\' y2=\\'130\\' stroke=\\'black\\' stroke-width=\\'1\\' fill=\\'none\\'/><text x=\\'15\\' y=\\'134\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>9</text>\\n  <line x1=\\'35\\' y1=\\'80\\' x2=\\'40\\' y2=\\'80\\' stroke=\\'black\\' stroke-width=\\'1\\' fill=\\'none\\'/><text x=\\'15\\' y=\\'84\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>13</text>\\n  <line x1=\\'90\\' y1=\\'280\\' x2=\\'90\\' y2=\\'285\\' stroke=\\'black\\' stroke-width=\\'1\\' fill=\\'none\\'/><text x=\\'86\\' y=\\'295\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>2</text>\\n  <text x=\\'136\\' y=\\'295\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>4</text>\\n  <path d=\\'M40,280 Q100,80 300,70\\' fill=\\'none\\' stroke=\\'black\\' stroke-width=\\'2\\'/>\\n</svg>\\n\`\`\`\\n\\nEstimate the TOF (in $\\\\text{s}^{-1}$) of the catalyst from this plot.\\n\\nc. The kinetics of the same reaction are evaluated at different initial pressures of reagent $A$ (indicated by the red labels on the curves below):\\n\\n\`\`\`xml\\n<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 400 300\\' width=\\'400\\' height=\\'300\\'>\\n  <rect width=\\'100%\\' height=\\'100%\\' fill=\\'white\\'/>\\n  <line x1=\\'40\\' y1=\\'280\\' x2=\\'380\\' y2=\\'280\\' stroke=\\'black\\' stroke-width=\\'2\\' fill=\\'none\\'/>\\n  <line x1=\\'40\\' y1=\\'280\\' x2=\\'40\\' y2=\\'20\\' stroke=\\'black\\' stroke-width=\\'2\\' fill=\\'none\\'/>\\n  <polygon points=\\'380,277 385,280 380,283\\' fill=\\'black\\'/>\\n  <polygon points=\\'37,20 40,15 43,20\\' fill=\\'black\\'/>\\n  <text x=\\'50\\' y=\\'30\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>N_B, mol/cm² • 10^7</text>\\n  <text x=\\'360\\' y=\\'295\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>t, s</text>\\n  <line x1=\\'35\\' y1=\\'230\\' x2=\\'40\\' y2=\\'230\\' stroke=\\'black\\' stroke-width=\\'1\\' fill=\\'none\\'/><text x=\\'15\\' y=\\'234\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>1</text>\\n  <line x1=\\'35\\' y1=\\'180\\' x2=\\'40\\' y2=\\'180\\' stroke=\\'black\\' stroke-width=\\'1\\' fill=\\'none\\'/><text x=\\'15\\' y=\\'184\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>5</text>\\n  <line x1=\\'35\\' y1=\\'130\\' x2=\\'40\\' y2=\\'130\\' stroke=\\'black\\' stroke-width=\\'1\\' fill=\\'none\\'/><text x=\\'15\\' y=\\'134\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>9</text>\\n  <line x1=\\'35\\' y1=\\'80\\' x2=\\'40\\' y2=\\'80\\' stroke=\\'black\\' stroke-width=\\'1\\' fill=\\'none\\'/><text x=\\'15\\' y=\\'84\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>13</text>\\n  <line x1=\\'90\\' y1=\\'280\\' x2=\\'90\\' y2=\\'285\\' stroke=\\'black\\' stroke-width=\\'1\\' fill=\\'none\\'/><text x=\\'86\\' y=\\'295\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>2</text>\\n  <line x1=\\'140\\' y1=\\'280\\' x2=\\'140\\' y2=\\'285\\' stroke=\\'black\\' stroke-width=\\'1\\' fill=\\'none\\'/><text x=\\'136\\' y=\\'295\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>4</text>\\n  <path d=\\'M40,280 Q90,90 280,80\\' fill=\\'none\\' stroke=\\'black\\' stroke-width=\\'2\\'/>\\n  <text x=\\'290\\' y=\\'85\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'red\\'>11</text>\\n  <path d=\\'M40,280 Q90,100 270,100\\' fill=\\'none\\' stroke=\\'darkgreen\\' stroke-width=\\'2\\'/>\\n  <text x=\\'280\\' y=\\'105\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'red\\'>10</text>\\n  <path d=\\'M40,280 Q80,180 230,170\\' fill=\\'none\\' stroke=\\'darkblue\\' stroke-width=\\'2\\'/>\\n  <text x=\\'240\\' y=\\'175\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'red\\'>3</text>\\n  <path d=\\'M40,280 Q80,220 220,220\\' fill=\\'none\\' stroke=\\'purple\\' stroke-width=\\'2\\'/>\\n  <text x=\\'230\\' y=\\'225\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'red\\'>1</text>\\n</svg>\\n\`\`\`\\n\\nAssuming $10^{15}\\\\text{ sites cm}^{-2}$, calculate TOF. If this catalyst is run under maximum efficiency for exactly $40$ minutes before becoming completely inactivated, estimate its TON.\\n\\nd. Under Kobozev\\'s active ensemble theory, active catalytic sites consist of clusters of $n_1$ deposited metal atoms on an inert surface. The reaction rate $N_B$ as a function of deposited metal atoms $N_{Cat}$ is shown in two cases below. In Figure 2a, every deposited atom acts as an active site. Calculate TOF for this case:\\n\\n\`\`\`xml\\n<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 400 300\\' width=\\'400\\' height=\\'300\\'>\\n  <rect width=\\'100%\\' height=\\'100%\\' fill=\\'white\\'/>\\n  <line x1=\\'40\\' y1=\\'280\\' x2=\\'380\\' y2=\\'280\\' stroke=\\'black\\' stroke-width=\\'2\\' fill=\\'none\\'/>\\n  <line x1=\\'40\\' y1=\\'280\\' x2=\\'40\\' y2=\\'20\\' stroke=\\'black\\' stroke-width=\\'2\\' fill=\\'none\\'/>\\n  <polygon points=\\'380,277 385,280 380,283\\' fill=\\'black\\'/>\\n  <polygon points=\\'37,20 40,15 43,20\\' fill=\\'black\\'/>\\n  <text x=\\'50\\' y=\\'30\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>N_B, mol/s/cm² • 10^11</text>\\n  <text x=\\'240\\' y=\\'295\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>N_Cat, molecules/cm² • 10^12</text>\\n  <line x1=\\'40\\' y1=\\'280\\' x2=\\'320\\' y2=\\'80\\' stroke=\\'purple\\' stroke-width=\\'2\\' fill=\\'none\\'/>\\n  <circle cx=\\'80\\' cy=\\'250\\' r=\\'4\\' fill=\\'purple\\'/>\\n  <circle cx=\\'120\\' cy=\\'220\\' r=\\'4\\' fill=\\'purple\\'/>\\n  <circle cx=\\'180\\' cy=\\'180\\' r=\\'4\\' fill=\\'purple\\'/>\\n  <circle cx=\\'220\\' cy=\\'150\\' r=\\'4\\' fill=\\'purple\\'/>\\n  <circle cx=\\'280\\' cy=\\'110\\' r=\\'4\\' fill=\\'purple\\'/>\\n  <line x1=\\'35\\' y1=\\'180\\' x2=\\'40\\' y2=\\'180\\' stroke=\\'black\\' stroke-width=\\'1\\' fill=\\'none\\'/><text x=\\'15\\' y=\\'184\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>6</text>\\n  <line x1=\\'35\\' y1=\\'230\\' x2=\\'40\\' y2=\\'230\\' stroke=\\'black\\' stroke-width=\\'1\\' fill=\\'none\\'/><text x=\\'15\\' y=\\'234\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>2</text>\\n  <line x1=\\'120\\' y1=\\'280\\' x2=\\'120\\' y2=\\'285\\' stroke=\\'black\\' stroke-width=\\'1\\' fill=\\'none\\'/><text x=\\'116\\' y=\\'295\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>3</text>\\n</svg>\\n\`\`\`\\n\\nIn Figure 2b, the reaction rate peaks due to the statistical ensemble formation of $n_1$-atom sites. Deduce $n_1$ from the curve using the peak parameters ($N_{Cat} = 7 \\\\times 10^{12}\\\\text{ molecules cm}^{-2}$, $\\\\text{Rate} = 18 \\\\times 10^{11}\\\\text{ molecules s}^{-1}\\\\text{ cm}^{-2}$, $\\\\text{TOF} = 35\\\\text{ s}^{-1}$):\\n\\n\`\`\`xml\\n<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 400 300\\' width=\\'400\\' height=\\'300\\'>\\n  <rect width=\\'100%\\' height=\\'100%\\' fill=\\'white\\'/>\\n  <line x1=\\'40\\' y1=\\'280\\' x2=\\'380\\' y2=\\'280\\' stroke=\\'black\\' stroke-width=\\'2\\' fill=\\'none\\'/>\\n  <line x1=\\'40\\' y1=\\'280\\' x2=\\'40\\' y2=\\'20\\' stroke=\\'black\\' stroke-width=\\'2\\' fill=\\'none\\'/>\\n  <polygon points=\\'380,277 385,280 380,283\\' fill=\\'black\\'/>\\n  <polygon points=\\'37,20 40,15 43,20\\' fill=\\'black\\'/>\\n  <text x=\\'50\\' y=\\'30\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>N_B, mole/s/cm² • 10^11</text>\\n  <text x=\\'240\\' y=\\'295\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>N_Cat, molecules/cm² • 10^12</text>\\n  <path d=\\'M40,200 Q100,200 130,190 T160,80 T190,160 T220,210 T360,210\\' fill=\\'none\\' stroke=\\'purple\\' stroke-width=\\'2\\'/>\\n  <circle cx=\\'60\\' cy=\\'195\\' r=\\'4\\' fill=\\'purple\\'/>\\n  <circle cx=\\'110\\' cy=\\'210\\' r=\\'4\\' fill=\\'purple\\'/>\\n  <circle cx=\\'130\\' cy=\\'150\\' r=\\'4\\' fill=\\'purple\\'/>\\n  <circle cx=\\'160\\' cy=\\'80\\' r=\\'4\\' fill=\\'purple\\'/>\\n  <circle cx=\\'190\\' cy=\\'160\\' r=\\'4\\' fill=\\'purple\\'/>\\n  <circle cx=\\'280\\' cy=\\'210\\' r=\\'4\\' fill=\\'purple\\'/>\\n  <text x=\\'180\\' y=\\'60\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>TOF = 35</text>\\n  <line x1=\\'35\\' y1=\\'80\\' x2=\\'40\\' y2=\\'80\\' stroke=\\'black\\' stroke-width=\\'1\\' fill=\\'none\\'/><text x=\\'15\\' y=\\'84\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>18</text>\\n  <line x1=\\'160\\' y1=\\'280\\' x2=\\'160\\' y2=\\'285\\' stroke=\\'black\\' stroke-width=\\'1\\' fill=\\'none\\'/><text x=\\'156\\' y=\\'295\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>7</text>\\n</svg>\\n\`\`\`\\n\\ne. Deposition of Au on $Mo-TiO_2$ forms active CO oxidation catalysts. The bilayer structure (Fig. 3a) yields a rate of $r_1$, while the monolayer (Fig. 3b) yields $r_2 = \\\\frac{1}{4}r_1$:\\n\\n\`\`\`xml\\n<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 400 300\\' width=\\'400\\' height=\\'300\\'>\\n  <rect width=\\'100%\\' height=\\'100%\\' fill=\\'white\\'/>\\n  <text x=\\'20\\' y=\\'20\\' font-family=\\'sans-serif\\' font-size=\\'14\\' font-weight=\\'bold\\' fill=\\'black\\'>a) (1x3)</text>\\n  <circle cx=\\'50\\' cy=\\'80\\' r=\\'12\\' fill=\\'lightblue\\' stroke=\\'darkblue\\' stroke-width=\\'1\\'/>\\n  <circle cx=\\'75\\' cy=\\'80\\' r=\\'12\\' fill=\\'lightblue\\' stroke=\\'darkblue\\' stroke-width=\\'1\\'/>\\n  <circle cx=\\'100\\' cy=\\'80\\' r=\\'12\\' fill=\\'lightblue\\' stroke=\\'darkblue\\' stroke-width=\\'1\\'/>\\n  <circle cx=\\'40\\' cy=\\'60\\' r=\\'10\\' fill=\\'yellow\\' stroke=\\'olive\\' stroke-width=\\'1\\'/>\\n  <circle cx=\\'60\\' cy=\\'45\\' r=\\'10\\' fill=\\'red\\' stroke=\\'darkred\\' stroke-width=\\'1\\'/>\\n  <circle cx=\\'80\\' cy=\\'60\\' r=\\'10\\' fill=\\'yellow\\' stroke=\\'olive\\' stroke-width=\\'1\\'/>\\n  <text x=\\'20\\' y=\\'160\\' font-family=\\'sans-serif\\' font-size=\\'14\\' font-weight=\\'bold\\' fill=\\'black\\'>b) (1x1)</text>\\n  <circle cx=\\'50\\' cy=\\'220\\' r=\\'12\\' fill=\\'lightblue\\' stroke=\\'darkblue\\' stroke-width=\\'1\\'/>\\n  <circle cx=\\'75\\' cy=\\'220\\' r=\\'12\\' fill=\\'lightblue\\' stroke=\\'darkblue\\' stroke-width=\\'1\\'/>\\n  <circle cx=\\'100\\' cy=\\'220\\' r=\\'12\\' fill=\\'lightblue\\' stroke=\\'darkblue\\' stroke-width=\\'1\\'/>\\n  <circle cx=\\'50\\' cy=\\'200\\' r=\\'10\\' fill=\\'yellow\\' stroke=\\'olive\\' stroke-width=\\'1\\'/>\\n  <circle cx=\\'75\\' cy=\\'200\\' r=\\'10\\' fill=\\'yellow\\' stroke=\\'olive\\' stroke-width=\\'1\\'/>\\n  <circle cx=\\'100\\' cy=\\'200\\' r=\\'10\\' fill=\\'yellow\\' stroke=\\'olive\\' stroke-width=\\'1\\'/>\\n</svg>\\n\`\`\`\\n\\nIf all yellow spheres have identical rates when accessible but zero when blocked (covered by upper layers), and every red atom is fully active in the bilayer structure, calculate the ratio of the TOF for the upper layer red atoms to the TOF of the monolayer yellow atoms.",
  "type": "free_response",
  "answer": "",
  "difficulty": 9,
  "detailedSolution": "a. The unit of TOF is $\\\\text{time}^{-1}$, and the SI unit is $\\\\text{s}^{-1}$. The upper bound relation is given by:\\n$$\\\\text{TON} \\\\leq \\\\text{TOF} \\\\times t$$\\nIf activity drops gradually over time, then:\\n$$\\\\text{TON} = \\\\int_{0}^{t} \\\\text{TOF}(t^{\\\\prime}) \\\\text{ d}t^{\\\\prime} \\\\leq \\\\text{TOF}_{\\\\text{max}} \\\\times t$$\\n\\nb. From Figure 1a, the initial slope of the curve is:\\n$$\\\\frac{\\\\Delta N_B}{\\\\Delta t} = \\\\tan \\\\alpha = \\\\frac{7}{2} \\\\times 10^{-8}\\\\text{ mol cm}^{-2}\\\\text{ s}^{-1} = 3.5 \\\\times 10^{-8}\\\\text{ mol cm}^{-2}\\\\text{ s}^{-1}$$\\nConverting moles to molecules:\\n$$\\\\text{Rate} = 3.5 \\\\times 10^{-8} \\\\times 6.022 \\\\times 10^{23} = 2.108 \\\\times 10^{16}\\\\text{ molecules cm}^{-2}\\\\text{ s}^{-1}$$\\nSince there are $10^{15}\\\\text{ sites cm}^{-2}$:\\n$$\\\\text{TOF} = \\\\frac{\\\\text{Rate}}{\\\\text{Sites}} = \\\\frac{2.108 \\\\times 10^{16}}{10^{15}} \\\\approx 21\\\\text{ s}^{-1}$$\\n\\nc. In Fig 1b, under saturated reagent pressures (reagent pressure $\\\\geq 10$), the rate achieves a plateau independent of initial pressure. The maximum slope yields identical performance to case (b), so $\\\\text{TOF} \\\\approx 21\\\\text{ s}^{-1}$.\\nFor $t = 40\\\\text{ minutes} = 2400\\\\text{ s}$:\\n$$\\\\text{TON} = \\\\text{TOF} \\\\times t = 21\\\\text{ s}^{-1} \\\\times 2400\\\\text{ s} \\\\approx 5.0 \\\\times 10^4$$\\n\\nd. In Fig 2a, at $N_{Cat} = 3 \\\\times 10^{12}\\\\text{ molecules cm}^{-2}$ the rate is $N_B = 2 \\\\times 10^{11}\\\\text{ molecules s}^{-1}\\\\text{ cm}^{-2}$. Since every atom is a site:\\n$$\\\\text{TOF} = \\\\frac{\\\\text{Rate}}{N_{Cat}} = \\\\frac{2 \\\\times 10^{11}}{3 \\\\times 10^{12}} \\\\approx 0.067\\\\text{ s}^{-1}$$\\n\\nIn Fig 2b, the number of active sites is given by Kobozev ensemble theory. At the peak ($N_{Cat} = 7 \\\\times 10^{12}$), the rate is $N_B = 18 \\\\times 10^{11}\\\\text{ molecules s}^{-1}\\\\text{ cm}^{-2}$.\\nSince $\\\\text{TOF} = 35\\\\text{ s}^{-1}$, the active site concentration is:\\n$$N_{sites} = \\\\frac{N_B}{\\\\text{TOF}} = \\\\frac{18 \\\\times 10^{11}}{35} \\\\approx 5.14 \\\\times 10^{10}\\\\text{ sites cm}^{-2}$$\\nAt the peak, $n_1$ is the ratio of deposited atoms to active sites:\\n$$n_1 = \\\\frac{N_{Cat}}{N_{sites}} = \\\\frac{7 \\\\times 10^{12}}{5.14 \\\\times 10^{10}} \\\\approx 136\\\\text{ atoms site}^{-1}$$\\n\\ne. In the monolayer (Fig 3b), all $3$ yellow atoms are accessible. The rate is $r_2 = 3 \\\\times \\\\text{TOF}_{yel}$.\\nIn the bilayer (Fig 3a), the $1$ red atom is fully active. The $2$ yellow atoms are covered/blocked, meaning $N_{yel, accessible} = 0$.\\nThus, the bilayer rate is entirely due to the red atom: $r_1 = 1 \\\\times \\\\text{TOF}_{red}$.\\nGiven $r_2 = \\\\frac{1}{4}r_1 \\\\Rightarrow r_1 = 4r_2$, we substitute the rates:\\n$$\\\\text{TOF}_{red} = 4 \\\\left( 3 \\\\times \\\\text{TOF}_{yel} \\\\right) = 12 \\\\times \\\\text{TOF}_{yel}$$\\nSo the ratio of the TOF of the red upper-layer atoms to that of the monolayer yellow atoms is exactly $12$."
}

IChO Question Example 8:
{
  "id": "chem_ex8",
  "topic": "Phase Transitions & Lattices (Water Phase Diagram)",
  "question": "The phase diagram of water at high pressures contains several crystalline polymorphs of ice, as shown in the logarithmic scale plot below:\\n\\n\`\`\`xml\\n<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 500 400\\' width=\\'500\\' height=\\'400\\'>\\n  <rect width=\\'100%\\' height=\\'100%\\' fill=\\'white\\'/>\\n  <line x1=\\'60\\' y1=\\'360\\' x2=\\'480\\' y2=\\'360\\' stroke=\\'black\\' stroke-width=\\'2\\' fill=\\'none\\'/>\\n  <line x1=\\'60\\' y1=\\'360\\' x2=\\'60\\' y2=\\'20\\' stroke=\\'black\\' stroke-width=\\'2\\' fill=\\'none\\'/>\\n  <text x=\\'30\\' y=\\'200\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\' text-anchor=\\'middle\\' transform=\\'rotate(-90 30 200)\\'>Pressure p / MPa</text>\\n  <text x=\\'270\\' y=\\'390\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\' text-anchor=\\'middle\\'>Temperature T / K</text>\\n  <text x=\\'50\\' y=\\'30\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\' text-anchor=\\'end\\'>10^4</text>\\n  <text x=\\'50\\' y=\\'110\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\' text-anchor=\\'end\\'>10^2</text>\\n  <text x=\\'50\\' y=\\'190\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\' text-anchor=\\'end\\'>10^0</text>\\n  <text x=\\'50\\' y=\\'270\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\' text-anchor=\\'end\\'>10^-2</text>\\n  <text x=\\'50\\' y=\\'350\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\' text-anchor=\\'end\\'>10^-4</text>\\n  <line x1=\\'60\\' y1=\\'360\\' x2=\\'60\\' y2=\\'365\\' stroke=\\'black\\' stroke-width=\\'1\\'/><text x=\\'60\\' y=\\'380\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\' text-anchor=\\'middle\\'>200</text>\\n  <line x1=\\'120\\' y1=\\'360\\' x2=\\'120\\' y2=\\'365\\' stroke=\\'black\\' stroke-width=\\'1\\'/><text x=\\'120\\' y=\\'380\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\' text-anchor=\\'middle\\'>300</text>\\n  <line x1=\\'180\\' y1=\\'360\\' x2=\\'180\\' y2=\\'365\\' stroke=\\'black\\' stroke-width=\\'1\\'/><text x=\\'180\\' y=\\'380\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\' text-anchor=\\'middle\\'>400</text>\\n  <line x1=\\'240\\' y1=\\'360\\' x2=\\'240\\' y2=\\'365\\' stroke=\\'black\\' stroke-width=\\'1\\'/><text x=\\'240\\' y=\\'380\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\' text-anchor=\\'middle\\'>500</text>\\n  <line x1=\\'300\\' y1=\\'360\\' x2=\\'300\\' y2=\\'365\\' stroke=\\'black\\' stroke-width=\\'1\\'/><text x=\\'300\\' y=\\'380\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\' text-anchor=\\'middle\\'>600</text>\\n  <line x1=\\'360\\' y1=\\'360\\' x2=\\'360\\' y2=\\'365\\' stroke=\\'black\\' stroke-width=\\'1\\'/><text x=\\'360\\' y=\\'380\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\' text-anchor=\\'middle\\'>700</text>\\n  <path d=\\'M120,360 Q150,280 180,270\\' fill=\\'none\\' stroke=\\'black\\' stroke-width=\\'2\\'/>\\n  <path d=\\'M180,270 Q280,180 460,110\\' fill=\\'none\\' stroke=\\'black\\' stroke-width=\\'2\\'/>\\n  <path d=\\'M180,270 Q180,180 160,80\\' fill=\\'none\\' stroke=\\'black\\' stroke-width=\\'2\\'/>\\n  <path d=\\'M160,80 L140,80\\' fill=\\'none\\' stroke=\\'black\\' stroke-width=\\'2\\'/>\\n  <path d=\\'M160,80 L170,60\\' fill=\\'none\\' stroke=\\'black\\' stroke-width=\\'2\\'/>\\n  <path d=\\'M170,60 L190,40\\' fill=\\'none\\' stroke=\\'black\\' stroke-width=\\'2\\'/>\\n  <path d=\\'M190,40 L260,10\\' fill=\\'none\\' stroke=\\'black\\' stroke-width=\\'2\\'/>\\n  <path d=\\'M170,60 L140,40\\' fill=\\'none\\' stroke=\\'black\\' stroke-width=\\'2\\'/>\\n  <path d=\\'M190,40 L160,10\\' fill=\\'none\\' stroke=\\'black\\' stroke-width=\\'2\\'/>\\n  <circle cx=\\'180\\' cy=\\'270\\' r=\\'4\\' fill=\\'black\\'/>\\n  <circle cx=\\'160\\' cy=\\'80\\' r=\\'4\\' fill=\\'black\\'/>\\n  <circle cx=\\'170\\' cy=\\'60\\' r=\\'4\\' fill=\\'black\\'/>\\n  <circle cx=\\'190\\' cy=\\'40\\' r=\\'4\\' fill=\\'black\\'/>\\n  <text x=\\'100\\' y=\\'160\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>Ice I</text>\\n  <text x=\\'110\\' y=\\'70\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>Ice III</text>\\n  <text x=\\'130\\' y=\\'50\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>Ice V</text>\\n  <text x=\\'160\\' y=\\'30\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>Ice VI</text>\\n  <text x=\\'240\\' y=\\'20\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>Ice VII</text>\\n  <text x=\\'280\\' y=\\'140\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>Liquid</text>\\n  <text x=\\'320\\' y=\\'270\\' font-family=\\'sans-serif\\' font-size=\\'12\\' fill=\\'black\\'>Vapor</text>\\n</svg>\\n\`\`\`\\n\\na. Explain qualitatively how the boiling point of water and the melting points of ordinary ice (Ice I) and Ice V vary with pressure, referencing Le Chatelier\\'s principle.\\n\\nb. Deduce the sequence of phase transitions that occur when water vapor is gradually compressed from $10\\\\text{ Pa}$ to $10\\\\text{ GPa}$ at a constant temperature of: (i) $250\\\\text{ K}$, (ii) $400\\\\text{ K}$, (iii) $700\\\\text{ K}$.\\n\\nc. Water, Ice I, and Ice III meet at a triple point at a pressure of $210\\\\text{ MPa}$. Estimate the temperature at this triple point.\\n\\nd. Assuming the heat of fusion is identical for all forms of ice, determine which of the ice polymorphs is the densest, and estimate its melting point at $10\\\\text{ GPa}$.\\n\\ne. The densest ice (Ice VII) has a cubic crystal structure with two water molecules per unit cell. The unit cell edge length is $0.335\\\\text{ nm}$. Calculate the density (in $\\\\text{g cm}^{-3}$) of Ice VII.\\n\\nf. Estimate the enthalpy of fusion of this densest ice.\\n\\n**Thermodynamic & Physical Data:**\\n- Density of ordinary ice (Ice I) = $0.917\\\\text{ g cm}^{-3}$\\n- Density of liquid water = $1.000\\\\text{ g cm}^{-3}$\\n- Enthalpy of fusion of ordinary ice = $+6010\\\\text{ J mol}^{-1}$\\n- Triple point of $\\\\ce{Liquid - Ice VI - Ice VII}$: $P = 2200\\\\text{ MPa}$, $T = 355\\\\text{ K}$.\\n- *Assume the densities and transition enthalpies do not vary with pressure or temperature.*",
  "type": "free_response",
  "answer": "",
  "difficulty": 9,
  "detailedSolution": "a. Applying the Le Chatelier principle to phase transitions:\\n- For boiling ($\\\\ce{H2O(l) <=> H2O(g)}$), volume increases ($\\\\Delta V > 0$) and heat is absorbed ($\\\\Delta H > 0$). An increase in pressure shifts the equilibrium leftwards; thus, the boiling point increases.\\n- For Ice V melting ($\\\\ce{Ice V <=> Liquid}$), volume decreases ($\\\\Delta V < 0$) and heat is absorbed ($\\\\Delta H > 0$). An increase in pressure shifts the equilibrium rightwards; thus, the melting point of Ice V increases with pressure.\\n- For ordinary ice melting ($\\\\ce{Ice I <=> Liquid}$), liquid water is denser than Ice I, so volume decreases ($\\\\Delta V < 0$) and heat is absorbed ($\\\\Delta H > 0$). Increasing pressure shifts the equilibrium to the liquid side; thus, the melting point decreases with pressure.\\n\\nb. Compression paths from $10\\\\text{ Pa}$ to $10\\\\text{ GPa}$ ($10^4\\\\text{ MPa}$):\\n- **At $250\\\\text{ K}$**: Vapor $\\\\rightarrow$ Ice I $\\\\rightarrow$ Ice III $\\\\rightarrow$ Ice V $\\\\rightarrow$ Ice VI $\\\\rightarrow$ Ice VII.\\n- **At $400\\\\text{ K}$**: Vapor $\\\\rightarrow$ Liquid $\\\\rightarrow$ Ice VI $\\\\rightarrow$ Ice VII.\\n- **At $700\\\\text{ K}$**: The temperature is above the critical temperature of water ($647\\\\text{ K}$). It begins as a supercritical fluid/gas and compresses directly into Ice VII.\\n\\nc. The triple point is the intersection of Ice I, Ice III, and liquid water. We can approximate the melting point boundary of Ice I using the Clapeyron equation:\\n$$\\\\frac{dT}{dP} = \\\\frac{T \\\\Delta V}{\\\\Delta H}$$\\nGiven $\\\\Delta H_{fus} = +6010\\\\text{ J mol}^{-1}$:\\n$$\\\\Delta V = V_l - V_{ice} = 18.015 \\\\left( \\\\frac{1}{1.000} - \\\\frac{1}{0.917} \\\\right) = -1.632\\\\text{ cm}^3\\\\text{ mol}^{-1} = -1.632 \\\\times 10^{-6}\\\\text{ m}^3\\\\text{ mol}^{-1}$$\\nIntegrating from the standard triple point ($T_0 = 273.16\\\\text{ K}$, $P_0 = 611\\\\text{ Pa} \\\\approx 0$):\\n$$\\\\ln \\\\left( \\\\frac{T}{273.16} \\\\right) = \\\\frac{\\\\Delta V}{\\\\Delta H} \\\\Delta P = \\\\frac{-1.632 \\\\times 10^{-6}}{6010} \\\\left( 210 \\\\times 10^6 - 0 \\\\right) = -0.0570$$\\n$$T = 273.16 \\\\times e^{-0.0570} \\\\approx 258\\\\text{ K}$$\\n\\nd. By the Clapeyron equation, the phase boundary slope $\\\\frac{dT}{dP} = \\\\frac{T \\\\Delta V}{\\\\Delta H}$ determines the density. Since the melting lines of Ice III, V, VI, and VII all have positive slopes ($dT/dP > 0$), and all forms of ice are assumed to have similar positive heats of fusion ($\\\\Delta H_{fus} > 0$), we have $\\\\Delta V = V_l - V_{ice} > 0$, meaning the liquid is less dense than these ice forms. Ice VII exists at the highest pressures and has the steepest positive melting slope, making it the densest form.\\nIntegrating the melting boundary of Ice VII from the $\\\\ce{Liquid - Ice VI - Ice VII}$ triple point ($T_0 = 355\\\\text{ K}$, $P_0 = 2200\\\\text{ MPa}$):\\nWith a density of $1.59\\\\text{ g cm}^{-3}$ (from part e), the volume change of fusion is:\\n$$\\\\Delta V = V_l - V_{ice} = 18.015 \\\\left( \\\\frac{1}{1.00} - \\\\frac{1}{1.59} \\\\right) = 6.68\\\\text{ cm}^3\\\\text{ mol}^{-1} = 6.68 \\\\times 10^{-6}\\\\text{ m}^3\\\\text{ mol}^{-1}$$\\n$$\\\\ln \\\\left( \\\\frac{T}{355} \\\\right) = \\\\frac{6.68 \\\\times 10^{-6}}{6010} \\\\left( 10000 \\\\times 10^6 - 2200 \\\\times 10^6 \\\\right) = 0.867$$\\n$$T = 355 \\\\times e^{-0.867} \\\\approx 845\\\\text{ K}$$\\n\\ne. Density of Ice VII:\\n$$V_{\\\\text{cell}} = (0.335 \\\\times 10^{-7}\\\\text{ cm})^3 = 3.760 \\\\times 10^{-23}\\\\text{ cm}^3$$\\n$$\\\\rho = \\\\frac{Z \\\\times M}{N_A \\\\times V_{\\\\text{cell}}} = \\\\frac{2 \\\\times 18.015}{6.022 \\\\times 10^{23} \\\\times 3.760 \\\\times 10^{-23}} \\\\approx 1.59\\\\text{ g cm}^{-3}$$\\n\\nf. By the Clapeyron equation, using $\\\\Delta V = 6.68 \\\\times 10^{-6}\\\\text{ m}^3\\\\text{ mol}^{-1}$ and the boundary line slope: the enthalpy of fusion remains highly constant at approximately $+6.01\\\\text{ kJ mol}^{-1}$."
}

IChO Question Example 9:
{
  "id": "chem_ex9",
  "topic": "Analytical Chemistry & Complexation Titration (Stoichiometry)",
  "question": "Fluoride ions form a stable complex with aluminum(III):\\n$$\\\\ce{6 F^- + Al^{3+} <=> [AlF6]^{3-}}$$\\nThis complexation equilibrium forms the basis for direct titration of fluoride and indirect determination of other inorganic ions.\\n\\nIn the first experiment, an aqueous sample solution containing fluoride was neutralized with methyl red indicator, saturated with solid $\\\\ce{NaCl}$, and heated to $70-80\\\\ ^\\circ\\\\text{C}$. The solution was titrated with $0.150\\\\text{ M } \\\\ce{AlCl3}$ titrant until the yellow indicator turned pink.\\n\\na. Write the chemical equation representing the process that occurs at the endpoint and explain the role of $\\\\ce{NaCl}$.\\n\\nb. Explain why heating the titration mixture increases the endpoint sharpness.\\n\\nc. In the second experiment, the concentration of calcium ions in a sample was determined via back-titration. An excess of solid $\\\\ce{NaCl}$ and exactly $0.500\\\\text{ g}$ of $\\\\ce{NaF}$ were added to the sample. The resulting mixture was neutralized and titrated with $0.1000\\\\text{ M } \\\\ce{AlCl3}$ in the presence of methyl red. The indicator endpoint was reached with exactly $10.25\\\\text{ cm}^3$ of titrant. Identify the reactions taking place and calculate the amount (in moles) and mass (in grams) of calcium in the sample.\\n\\nd. Deducing silicic acid content uses similar principles. To a neutralized colloidal solution of silicic acid ($\\\\ce{Si(OH)4}$), exactly $0.500\\\\text{ g}$ of $\\\\ce{KF}$ is added, followed by the addition of exactly $10.00\\\\text{ cm}^3$ of $0.0994\\\\text{ M } \\\\ce{HCl}$. The resulting mixture is titrated with a standard $0.1000\\\\text{ M } \\\\ce{NaOH}$ solution in the presence of phenol red indicator, requiring exactly $5.50\\\\text{ cm}^3$ of the base to reach the endpoint.\\n\\nWrite the balanced chemical equations representing the determination reactions, justify the choice of indicator for the pre-titration neutralization step (among methyl red, $pK_a = 5.1$; phenol red, $pK_a = 8.0$; and thymolphthalein, $pK_a = 9.9$), and calculate the moles of silicic acid in the sample solution.",
  "type": "free_response",
  "answer": "",
  "difficulty": 8,
  "detailedSolution": "a. At the endpoint, the excess $\\\\ce{Al^{3+}}$ ions undergo hydrolysis, generating hydronium ions that lower the pH and turn the methyl red indicator from yellow to pink:\\n$$\\\\ce{[Al(H2O)6]^{3+} + H2O <=> [Al(OH)(H2O)5]^{2+} + H3O^+}$$\\nThe addition of solid $\\\\ce{NaCl}$ shifts the complexation equilibrium forward by precipitating cryolite ($\\\\ce{Na3AlF6}$), which is only slightly soluble in water:\\n$$\\\\ce{6 F^- + Al^{3+} + 3Na^+ <=> Na3AlF6(s)}$$\\nThe common ion effect of $\\\\ce{Na^+}$ dramatically decreases the solubility of cryolite, driving the complexation to completion and increasing the sharpness of the endpoint.\\n\\nb. The hydrolysis of aluminum(III) is an endothermic process. Heating the solution to $70-80\\\\ ^\\circ\\\\text{C}$ shifts the hydrolysis equilibrium rightwards, producing more hydronium ions per excess unit of $\\\\ce{Al^{3+}}$ at the equivalence point, which increases the pH drop and endpoint sharpness.\\n\\nc. In the back-titration of calcium:\\n1. Fluoride precipitates calcium ions quantitatively:\\n$$\\\\ce{Ca^{2+} + 2F^- -> CaF2(s)}$$\\n2. The excess, unreacted fluoride is titrated with aluminum chloride:\\n$$\\\\ce{6 F^- + Al^{3+} + 3Na^+ -> Na3AlF6(s)}$$\\n\\nLet\\'s calculate the moles of species:\\n- Total moles of $\\\\ce{NaF}$ added:\\n$$n(\\\\ce{F^-})_{\\\\text{total}} = \\\\frac{0.500\\\\text{ g}}{41.99\\\\text{ g mol}^{-1}} = 0.01191\\\\text{ mol}$$\\n- Moles of $\\\\ce{Al^{3+}}$ added at titration endpoint:\\n$$n(\\\\ce{Al^{3+}}) = 10.25 \\\\times 10^{-3}\\\\text{ dm}^3 \\\\times 0.1000\\\\text{ mol dm}^{-3} = 0.001025\\\\text{ mol}$$\\n- Moles of fluoride reacting with aluminum:\\n$$n(\\\\ce{F^-})_{\\\\text{complexed}} = 6 \\\\times n(\\\\ce{Al^{3+}}) = 6 \\\\times 0.001025 = 0.006150\\\\text{ mol}$$\\n- Moles of fluoride precipitated by calcium:\\n$$n(\\\\ce{F^-})_{\\\\text{precipitated}} = 0.01191 - 0.006150 = 0.00576\\\\text{ mol}$$\\n- Moles of calcium in the sample:\\n$$n(\\\\ce{Ca^{2+}}) = \\\\frac{1}{2} n(\\\\ce{F^-})_{\\\\text{precipitated}} = \\\\frac{0.00576}{2} = 0.00288\\\\text{ mol}$$\\n- Mass of calcium in the sample:\\n$$m(\\\\ce{Ca}) = 0.00288\\\\text{ mol} \\\\times 40.08\\\\text{ g mol}^{-1} \\\\approx 0.115\\\\text{ g}$$\\n\\nd. Deducing silicic acid content:\\n1. Silicic acid reacts with fluoride in the presence of acid to form hexafluorosilicate:\\n$$\\\\ce{Si(OH)4 + 6 F^- + 4 H^+ -> SiF6^{2-} + 4 H2O}$$\\n2. The unreacted hydrochloric acid is back-titrated with sodium hydroxide:\\n$$\\\\ce{H^+ + OH^- -> H2O}$$\\n\\nLet\\'s calculate the moles of species:\\n- Total moles of $\\\\ce{HCl}$ added:\\n$$n(\\\\ce{H^+})_{\\\\text{total}} = 10.00 \\\\times 10^{-3}\\\\text{ dm}^3 \\\\times 0.0994\\\\text{ mol dm}^{-3} = 0.000994\\\\text{ mol}$$\\n- Moles of $\\\\ce{NaOH}$ titrated at endpoint:\\n$$n(\\\\ce{OH^-}) = 5.50 \\\\times 10^{-3}\\\\text{ dm}^3 \\\\times 0.1000\\\\text{ mol dm}^{-3} = 0.000550\\\\text{ mol}$$\\n- Moles of acid consumed by the silicic acid reaction:\\n$$n(\\\\ce{H^+})_{\\\\text{consumed}} = 0.000994 - 0.000550 = 0.000444\\\\text{ mol}$$\\n- Stoichiometrically, $4$ moles of $\\\\ce{H^+}$ react per mole of $\\\\ce{Si(OH)4}$:\\n$$n(\\\\ce{Si(OH)4}) = \\\\frac{1}{4} n(\\\\ce{H^+})_{\\\\text{consumed}} = \\\\frac{0.000444}{4} = 0.000111\\\\text{ mol} = 1.11 \\\\times 10^{-4}\\\\text{ mol}$$\\n\\nFor the pre-titration neutralization, phenol red ($pK_a = 8.0$) is the ideal indicator. Silicic acid is an extremely weak acid ($pK_{a1} \\\\approx 9.9$), meaning it remains fully protonated as $\\\\ce{Si(OH)4}$ and un-ionized at pH 7-8. Neutralizing with phenol red ensures that all strong acids/bases are neutralized without deprotonating or initiating reaction with the weak silicic acid prior to fluoride addition."
}

Examples of bad questions - what you SHOULD NOT DO:

Bad USNCO question #1
{
"id": "viol_1",
"topic": "Electrochemistry",
"question": "For a hydrogen evolution reaction occurring on a platinum electrode in 1.0 M HCl at 298 K, if the exchange current density $j_0 = 10^{-3} \text{ A cm}^{-2}$ and the transfer coefficient $\alpha = 0.5$, calculate the overpotential $\eta$ required to drive a current density of $j = 0.1 \text{ A cm}^{-2}$ using the Tafel equation. Provide the value in Volts.",
"type": "multiple_choice",
"options": [
"$0.059 \text{ V}$",
"$0.118 \text{ V}$",
"$0.236 \text{ V}$",
"$0.029 \text{ V}$"
],
"answer": "B",
"difficulty": 6,
"detailedSolution": "The Tafel equation is given by $\eta = a + b \log(j)$, where $b = \frac{2.303 RT}{\alpha nF}$. At high overpotentials, $\eta = \frac{2.303 RT}{\alpha nF} \log(\frac{j}{j_0})$. With $n=1$, $R=8.314$, $T=298$, $F=96485$, and $\alpha=0.5$, $b \approx 0.118 \text{ V/decade}$. Thus, $\eta = 0.118 \log(\frac{0.1}{10^{-3}}) = 0.118 \log(100) = 0.118 \times 2 = 0.236 \text{ V}$. *Note: The prompt requires this to be marked at a difficulty level that violates USNCO scope boundaries.*"
},

Problem: Tests content outside the scope of USNCO (tests breadth instead of depth of knowledge).

Bad USNCO question #2:

{
"id": "viol_2",
"topic": "Stoichiometry",
"question": "Calculate the number of moles of sodium chloride in 5.0 grams of the substance. (Molar mass of NaCl = 58.44 g/mol)",
"type": "multiple_choice",
"options": [
"$0.0856 \text{ mol}$",
"$0.100 \text{ mol}$",
"$0.292 \text{ mol}$",
"$11.69 \text{ mol}$"
],
"answer": "A",
"difficulty": 1,
"detailedSolution": "Number of moles = $\text{mass} / \text{molar mass} = 5.0 \text{ g} / 58.44 \text{ g mol}^{-1} \approx 0.08555 \text{ mol}$."
}

Problem: Too simple - can be solved simply by plugging in a formula.

Bad IChO question #3:

{
"id": "viol_3",
"topic": "Materials Chemistry",
"question": "In the context of recently synthesized covalent organic framework (COF) variants, identify the primary structural defect responsible for the anomalous charge carrier mobility observed in $sp^2$-carbon-conjugated 2D-COFs as described in the 2026 JACS report on 'Topological Engineering of Radical-Coupled Frameworks'.",
"type": "multiple_choice",
"options": [
"Stacking fault dislocation",
"Interlayer sliding",
"Radical-induced domain boundary quenching",
"Pore-size polydispersity"
],
"answer": "C",
"difficulty": 9,
"detailedSolution": "The recent research indicates that in $sp^2$-carbon-conjugated COFs, the presence of localized radical sites at the edges of domain boundaries creates traps that quench charge carriers, a phenomenon specific to these high-conductivity topological materials."
}

Problem: Tests research-level knowledge that high school students do not have, and requires knowledge of advanced concepts IChO does not require students to know, without introducing with a first-principles approach.

Bad USNCO question #4:

{
"id": "viol_4",
"topic": "Photochemistry",
"question": "A molecule with a singlet excited state $S_1$ has a fluorescence lifetime of 5.0 ns and a quantum yield of 0.25. Calculate the rate constant of internal conversion $k_{ic}$ assuming that intersystem crossing $k_{isc}$ is negligible.",
"type": "multiple_choice",
"options": [
"$5.0 \times 10^7 \text{ s}^{-1}$",
"$1.5 \times 10^8 \text{ s}^{-1}$",
"$2.0 \times 10^8 \text{ s}^{-1}$",
"$7.5 \times 10^7 \text{ s}^{-1}$"
],
"answer": "B",
"difficulty": 6,
"detailedSolution": "The fluorescence lifetime $\tau = 1 / (k_f + k_{ic} + k_{isc})$. Given $k_{isc} = 0$, $\tau = 1 / (k_f + k_{ic}) = 5.0 \times 10^{-9} \text{ s}$. The quantum yield $\Phi_f = k_f / (k_f + k_{ic}) = k_f \tau = 0.25$. Thus $k_f = 0.25 / 5.0 \times 10^{-9} = 5.0 \times 10^7 \text{ s}^{-1}$. Since $k_f + k_{ic} = 1 / \tau = 2.0 \times 10^8 \text{ s}^{-1}$, then $k_{ic} = 2.0 \times 10^8 - 0.5 \times 10^8 = 1.5 \times 10^8 \text{ s}^{-1}$."
}

Problem: IChO level content in a USNCO level question (outside the scope of USNCO).

Bad IChO question #5:

{
"id": "viol_5",
"topic": "Quantum Dynamics",
"question": "Using the Lindblad master equation in the Markovian approximation, derive the steady-state density matrix $\rho_{ss}$ for a two-level system coupled to a thermal reservoir with a decay rate $\gamma$ and a mean thermal photon number $\bar{n}$.",
"type": "free_response",
"answer": "$\rho_{ss} = \frac{\bar{n}}{2\bar{n}+1} |e\rangle\langle e| + \frac{\bar{n}+1}{2\bar{n}+1} |g\rangle\langle g|$",
"difficulty": 10,
"detailedSolution": "The Lindblad equation for a two-level system is $\dot{\rho} = -i[H, \rho] + \gamma(\bar{n}+1) \mathcal{D}[\sigma_-]\rho + \gamma\bar{n} \mathcal{D}[\sigma_+]\rho$. Setting $\dot{\rho}=0$ and solving for the diagonal elements $\rho_{ee}$ and $\rho_{gg}$ under the condition $\rho_{ee} + \rho_{gg} = 1$ yields the population distribution based on the ratio of excitation/de-excitation rates."
}

Problem: Requires advanced knowledge beyond what is expected at IChO, without introducing the topic on a first-principles basis.

Calibrate the 1-10 difficulty scale exactly as follows:
- 1: simple Honors/early AP chem, 3: harder problems on the ACS Local Exam, 5: harder problems on the USNCO Nationals, 10: hardest problem on the IChO.
`;
    }

    const allowedTypes = Array.isArray(examFormat)
      ? examFormat
      : (typeof examFormat === 'string' && examFormat.trim()
        ? (examFormat.includes(',') ? examFormat.split(',') : [examFormat])
        : ['multiple_choice', 'short_answer', 'free_response']);

    const parsedTypes = allowedTypes.map(t => t.trim()).filter(Boolean);

    let typeSchemaDesc = parsedTypes.map(t => `"${t}"`).join(', ');
    let optionsSchemaDesc = parsedTypes.includes('multiple_choice')
      ? `\n  "options": ["Option A", "Option B", "Option C", "Option D"], // MUST be provided if type is multiple_choice`
      : ``;
    let keywordExpressionSchemaDesc = parsedTypes.includes('short_answer')
      ? `\n  "keywordExpression": "A logical boolean expression representing answer correctness (e.g., 'gravity AND newton' or 'O2 OR oxygen' or \"'carbon dioxide' OR CO2\"). Use AND, OR, NOT, parentheses, and single quotes for multi-word phrases. Required ONLY if type is short_answer.",`
      : ``;
    let answerSchemaDesc = `"For multiple_choice, exactly 'A', 'B', 'C', or 'D'. For short_answer, the exact correct short text or number. For free_response, an empty string ''."`;

    const systemInstruction = `You are an expert examiner creating questions for high-stakes competitive olympiad exams.

${subjectSpecificInstructions}

For free_response questions, especially at high difficulty levels (such as IMO, USAMO, IPhO, IChO, etc.), the question MUST require the user to write out a comprehensive mathematical proof, detailed step-by-step physics derivation, or organic chemistry synthesis mechanism/conceptual proof, rather than just calculating a final numerical value.

All questions generated MUST adhere to these critical design directives:
1. QUESTION STYLE & TRICKINESS: Provide a balanced and diverse mix of standard and tricky questions:
   - For difficulty levels 1 to 4: Standard, straightforward conceptual or algorithmic questions must be used.
   - For difficulty levels 5 to 10: Questions can either be tricky (presenting sophisticated conceptual traps or subtle edge cases that penalize rote formula-plugging) OR they can be standard, non-trick questions that are highly difficult and challenging in their own right (demanding deep logic, multi-step reasoning, or integration of multiple foundational concepts).
   - Ensure all questions are solvable based strictly on competitive high school level concepts or below, maintaining complete scientific and mathematical rigor while remaining accessible from core principles. For multiple_choice questions involving traps, craft the distractor options to precisely match the results of common conceptual mistakes.
2. BALANCED TOPIC DIVERSITY & WEAKNESS WEIGHTING: The exam must cover a wide, extremely diverse range of standard core subjects/topics within the chosen field. For example:
      - In Chemistry: You must select from stoichiometry, descriptive, states of matter, thermodynamics, kinetics, equilibrium, oxidation-reduction, atomic structure/periodicity, bonding/molecular structure, and organic/biochemistry.
      - In Physics: You must select from kinematics, forces, momentum, systems of particles, rotational kinematics, rotational dynamics, angular momentum, energy, fluid statics, gravitation, fluid dynamics, oscillations, waves, thermodynamics, electricity, and magnetism.
      - In Math: You must select from algebra, geometry, counting/probability, number theory.
   If a user's weak concepts are provided, allocate a minority of the questions (~30%, e.g., 1 out of 3, or 2 out of 5) to target those weaknesses, and dedicate the remaining majority (~70%) to a diverse selection of other core topics in the subject's standard syllabus, ensuring a balanced distribution of topics across the exam. If weaknesses are "None", distribute questions evenly across all core topics.
3. OPTIONS FORMATTING (LaTeX Delimiters): For multiple_choice questions, any mathematical expressions, chemical formulas, equations, physical units, or numerical values in the options list MUST be wrapped in LaTeX delimiters (e.g., $...$). Keep simple, purely qualitative text options that do not contain mathematical or chemical terms in plain, un-delimited text format.

The output must be a pure JSON array containing exactly the requested number of objects, with the following schema for each object:
{
  "id": "A unique string ID",
  "topic": "The brief sub-category or topic tested (e.g. 'Algebra', 'Stoichiometry', 'Mechanics')",
  "question": "The text of the question. It should be challenging, clear, and require working suitable for the question format.",
  "type": ${typeSchemaDesc},${optionsSchemaDesc}${keywordExpressionSchemaDesc}
  "answer": ${answerSchemaDesc},
  "difficulty": a number between 1 and 10 representing difficulty,
  "detailedSolution": "A thorough, detailed step-by-step solution to the question"
}

Output the result strictly as a raw, valid JSON array, keeping it free of any markdown formatting or surrounding code blocks.`;

    const prompt = `Generate exactly ${count} ${subject} problems. The difficulty should start around ${startingDifficulty} out of 10 and can vary slightly to provide a balanced test.

The user's identified weak concepts are: ${weaknesses}.
Follow these strict rules:
1. Question Style: Provide a balanced mix of standard and tricky questions. Standard questions should only be generated for difficulty levels 1-4. For difficulty levels 5-10, make questions either tricky with conceptual traps, or standard but highly difficult in their own right. Focus strictly on standard and competitive syllabus topics suitable for high school Olympiad exams.
2. The exam must span a wide, diverse range of standard topics in ${subject}. Distribute questions evenly and broadly across a diverse range of standard topics in the standard syllabus.
3. Dedicated Distribution: Target the user's weak concepts (${weaknesses}) for approximately 30% of the questions. Dedicate the remaining 70% of the questions to actively cover other diverse, standard subjects/topics in the ${subject} syllabus (e.g. for Chemistry, you MUST actively generate questions on other topics such as periodic trends, kinetics, thermodynamics, organic synthesis, chemical equilibrium, coordination chemistry, atomic structure, etc. instead of just stoichiometry and electrochemistry). If the weak concepts listed are "None", distribute all questions evenly across all main topics.
4. Detailed Solutions: For every question generated, you MUST provide a thorough, detailed step-by-step correct solution and proof in the "detailedSolution" field.`;

    // 3. Set SSE headers for streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const safetySettings = [
      {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
      },
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
      },
      {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
      },
      {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
      }
    ];

    const modelId = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
    const stream = await executeWithRetry(modelId, (ai) => ai.models.generateContentStream({
      model: modelId,
      contents: prompt,
      safety_settings: safetySettings,
      safetySettings: safetySettings,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        safety_settings: safetySettings,
        safetySettings: safetySettings,
      },
    }), req);

    let accumulated = '';
    let questionsSent = 0;

    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) {
        accumulated += text;

        // Extract all fully-formed question objects so far
        const parsed = extractCompleteObjects(accumulated);

        // Emit any newly completed questions
        while (questionsSent < parsed.length) {
          res.write(`data: ${JSON.stringify({ type: 'question', data: parsed[questionsSent] })}\n\n`);
          questionsSent++;
        }
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();

  } catch (err) {
    console.error('Streaming generation error:', err);
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
      res.end();
    } else {
      return res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  }
}
