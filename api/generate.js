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

5. Exemplar Chemistry Olympiad Questions
Below are high-quality, concept-rich, and rigorous exemplar chemistry questions demonstrating the expected style, formatting, and depth:

Question Example 1:
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

Question Example 2:
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

Question Example 3:
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
