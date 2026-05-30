/* eslint-disable */
import { GoogleGenAI } from '@google/genai';

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

// Random key selection on page load
if (typeof sessionStorage !== 'undefined') {
  const keysCount = [
    import.meta.env.GEMINI_API_KEY,
    import.meta.env.GEMINI_API_KEY_2,
    import.meta.env.GEMINI_API_KEY_3
  ].filter(Boolean).length;

  if (keysCount > 0) {
    let selectedKeyIndex = sessionStorage.getItem('gemini_key_index');
    if (selectedKeyIndex === null) {
      selectedKeyIndex = String(Math.floor(Math.random() * keysCount));
      sessionStorage.setItem('gemini_key_index', selectedKeyIndex);
    }
    document.cookie = `gemini_key_index=${selectedKeyIndex}; path=/; SameSite=Strict`;
    console.log(`[API Rotation] Selected key index ${selectedKeyIndex} for this session.`);
  }
}

async function executeWithRetry(modelId, apiCallFn) {
  const keys = [
    import.meta.env.GEMINI_API_KEY,
    import.meta.env.GEMINI_API_KEY_2,
    import.meta.env.GEMINI_API_KEY_3
  ].filter(Boolean);

  if (keys.length === 0) {
    throw new Error('GEMINI_API_KEY, GEMINI_API_KEY_2, and GEMINI_API_KEY_3 are missing');
  }

  let selectedIndex = 0;
  if (typeof sessionStorage !== 'undefined') {
    const stored = sessionStorage.getItem('gemini_key_index');
    if (stored !== null) {
      selectedIndex = parseInt(stored, 10);
    }
  }

  if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= keys.length) {
    selectedIndex = 0;
  }

  // Build the rotation order starting from selectedIndex
  const keysOrder = [];
  for (let i = 0; i < keys.length; i++) {
    const idx = (selectedIndex + i) % keys.length;
    keysOrder.push(keys.at(idx));
  }

  let lastError;

  for (let i = 0; i < keysOrder.length; i++) {
    const apiKey = keysOrder.at(i);
    if (isKeyRateLimited(modelId, apiKey)) {
      continue;
    }

    try {
      if (i > 0) {
        console.warn(`[API Rotation] Selected key failed. Rotating to backup key ${i + 1} for model ${modelId}.`);
      }
      const aiClient = new GoogleGenAI({ apiKey });
      return await apiCallFn(aiClient);
    } catch (err) {
      lastError = err;
      const status = err.status || err.statusCode || (err.message && err.message.includes('429') ? 429 : null);
      if (status === 429) {
        console.warn(`[429] Rate limit hit for ${modelId} on key.`);
        markKeyRateLimited(modelId, apiKey);
      } else {
        console.warn(`[API Rotation] Error for ${modelId}: ${err.message}. Trying next key...`);
      }
    }
  }

  throw lastError || new Error('All API keys failed or are rate limited');
}

const hasKeys = !!(import.meta.env.GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY_2 || import.meta.env.GEMINI_API_KEY_3);

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
        } catch {
          // ignore incomplete JSON blocks
        }
        objStart = -1;
      }
    }
  }

  return objects;
}


/**
 * Read an SSE stream from a fetch Response and invoke onQuestion for each
 * complete question object that arrives.
 * Returns a promise that resolves with the full array of questions.
 */
async function readSSEStream(response, onQuestion) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const questions = [];

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Split on double-newlines to isolate complete SSE frames
        const frames = buffer.split('\n\n');
        buffer = frames.pop(); // keep any trailing incomplete frame

        for (const frame of frames) {
            const trimmed = frame.trim();
            if (!trimmed.startsWith('data: ')) continue;

            try {
                const event = JSON.parse(trimmed.slice(6));

                if (event.type === 'question' && event.data) {
                    questions.push(event.data);
                    if (onQuestion) onQuestion(event.data, questions.length - 1);
                }
                // 'done' and 'error' events are handled implicitly by the loop ending
            } catch {
                // skip malformed SSE event
            }
        }
    }

    return questions;
}

/**
 * Generate exam problems.
 *
 * @param {number}   count
 * @param {number}   startingDifficulty
 * @param {string}   subject
 * @param {string}   username
 * @param {function} onQuestion - optional callback (questionObj, index) invoked
 *                                for each question the moment it fully arrives.
 * @returns {Promise<Array>} Resolves with the complete array of question objects.
 */
export async function generateProblems(count, startingDifficulty, subject = "Math", username = "default_user", onQuestion = null, freeResponseMode = false, examFormat = 'mix') {
    // Attempt to call Vercel Serverless Function first in production or if VITE_USE_VERCEL_API is enabled
    if (import.meta.env.PROD || import.meta.env.VITE_USE_VERCEL_API) {
        try {
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    count,
                    startingDifficulty,
                    subject,
                    targetUserId: username,
                    freeResponseMode,
                    examFormat
                }),
            });

            if (!response.ok) {
                console.warn(`Vercel API returned status ${response.status}. Falling back to direct Gemini client.`);
            } else {
                const contentType = response.headers.get('content-type') || '';

                if (contentType.includes('text/event-stream')) {
                    // SSE streaming path
                    return await readSSEStream(response, onQuestion);
                } else {
                    // Legacy non-streaming JSON fallback
                    const data = await response.json();
                    const questions = Array.isArray(data) ? data : [data];
                    if (onQuestion) questions.forEach((q, i) => onQuestion(q, i));
                    return questions;
                }
            }
        } catch (error) {
            console.error("Failed to connect to Vercel API, falling back to direct Gemini client:", error);
        }
    }

    if (!hasKeys) {
        // Fallback for missing API key to allow UI testing
        console.warn("Using fallback mock data due to missing API key.");
        const mockProblems = [];
        for (let i = 0; i < count; i++) {
            const diff = Math.min(10, Math.max(1, startingDifficulty + (i % 2 === 0 ? 1 : -1) * Math.floor(i / 2)));
            const format = examFormat || (freeResponseMode ? 'free_response' : 'mix');
            
            if (format === 'free_response' || (format === 'mix' && i % 3 === 2)) {
                mockProblems.push({
                    id: `${Date.now()}-${i}`,
                    question: `Mock ${subject} FRQ Problem ${i + 1} (Difficulty: ${diff}): Explain and solve for $x$ in the equation $${diff}x + ${i + 1} = ${diff * 2 + i + 1}$.`,
                    type: "free_response",
                    answer: `Subtract ${i + 1} from both sides to get $${diff}x = ${diff * 2}$. Then divide by $${diff}$ to get $x = 2$.`,
                    difficulty: diff
                });
            } else if (format === 'multiple_choice' || (format === 'mix' && i % 3 === 0)) {
                mockProblems.push({
                    id: `${Date.now()}-${i}`,
                    question: `Mock ${subject} MCQ Problem ${i + 1} (Difficulty: ${diff}): What is ${i + 1} + ${diff}?`,
                    type: "multiple_choice",
                    options: [`${i + 1 + diff}`, `${i + 2 + diff}`, `${i + 3 + diff}`, `${i + 4 + diff}`],
                    answer: `${i + 1 + diff}`,
                    difficulty: diff
                });
            } else {
                mockProblems.push({
                    id: `${Date.now()}-${i}`,
                    question: `Mock ${subject} Short Answer Problem ${i + 1} (Difficulty: ${diff}): What is ${i + 1} + ${diff}?`,
                    type: "short_answer",
                    answer: `${i + 1 + diff}`,
                    difficulty: diff
                });
            }
        }
        if (onQuestion) mockProblems.forEach((q, i) => onQuestion(q, i));
        return mockProblems;
    }

    let subjectContext = '';
    const normSubject = String(subject).trim().toLowerCase();
    if (normSubject === 'math') {
        subjectContext = `
    Calibrate the 1-10 difficulty scale exactly as follows:
    - 1: MATHCOUNTS school/chapter level
    - 5: AMC 12 question 20-ish level
    - 8: Average USAJMO problem level
    - 10: Hardest problems on the IMO
    Syllabus Boundaries: Do NOT introduce advanced topics outside the high-school/national olympiad purview (e.g., avoid advanced measure theory, abstract algebra like Galois theory/ring theory, general topology, or complex analysis).
    Syllabus Boundaries: Do NOT introduce advanced topics outside the high-school/national olympiad purview (e.g., avoid advanced measure theory, abstract algebra like Galois theory/ring theory, general topology, or complex analysis).
    `;
    } else if (normSubject === 'physics') {
        subjectContext = `
    Calibrate the 1-10 difficulty scale exactly as follows:
    - 1: introductory level
    - 3: AP Physics C level
    - 5: F=ma level
    - 8: USAPhO level
    - 10: hardest problem on the IPhO
    1. Syllabus Boundaries (Difficulty via Depth, Not Scope)
    - For USNCO (< 8): Do NOT introduce advanced graduate topics outside the USNCO purview (e.g., full molecular orbital symmetry point groups, complex computational quantum mechanics derivations, or advanced spectroscopic methods like 2D-NMR).
    - DO increase difficulty by forcing the integration of multiple foundational concepts (e.g., pairing a non-trivial thermodynamic cycle with an electrochemistry cell, or forcing a non-obvious stereochemical outcome via steric/electronic shielding in reaction prediction).
    - Incorporate subtle conceptual traps: design problems where standard shortcuts or rote formula-plugging yield tempting distractors, requiring exact tracking of assumptions (e.g., non-ideal behavior, temperature dependence of ΔH, or structural rearrangements).

    For IChO (>= 8):
    - Strict Originality & Concept-First Design: Questions must be entirely novel, leveraging uncommon molecular architectures, obscure inorganic frameworks, or elegant biophysical mechanisms. Banish mechanical, plug-and-chug calculations. Every problem must pivot on a subtle conceptual bottleneck or structural "trick" that rewards profound first-principles understanding over rote memorization.
    - The "First-Principles" Guardrail: You may introduce highly advanced or modern chemical phenomena (e.g., non-adiabatic transitions, explicit quantum mechanical operators, or complex coordination topology). However, you must provide self-contained, axiomatic background information within the problem preamble. A brilliant student must be capable of reasoning the correct path using only standard Olympiad prerequisites (thermodynamics, kinetics, advanced organic mechanisms, quantum basics) combined with the provided context. Avoid requiring niche, un-hinted graduate research knowledge.
    - Elevated Difficulty Profile: The exam must be systematically harder and more time-consuming than historical IChO papers. Achieve this by increasing the density of coupled multi-step pathways, requiring non-trivial algebraic or differential manipulations, and utilizing highly symmetric or counter-intuitive stereochemical transformations.

    `;
    } else if (normSubject === 'chemistry') {
        subjectContext = `
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
  "detailedSolution": "Dissolving a copper-nickel alloy in nitric acid produces $\\\\ce{Cu^{2+}}$ and $\\\\ce{Ni^{2+}}$ ions.\\n\\n1. In method (A), adding excess iodide ($\\\\ce{I^-}$) selectively reduces $\\\\ce{Cu^{2+}}$ to insoluble copper(I) iodide ($\\\\ce{CuI}$), producing triiodide/iodine ($\\\\ce{I_3^-}$ / $\\\\ce{I_2}$):\\n$2\\\\ce{Cu^{2+}} + 4\\\\ce{I^-} \\\\rightarrow 2\\\\ce{CuI(s)} + \\\\ce{I_2}$\\n\\\\ce{Ni^{2+}}$ does not oxidize iodide. Titrating the liberated iodine with sodium thiosulfate ($\\\\ce{S_2O_3^{2-}}$) allows for highly selective and accurate quantification of copper:\\n$\\\\ce{I_2} + 2\\\\ce{S_2O_3^{2-}} \\\\rightarrow 2\\\\ce{I^-} + \\\\ce{S_4O_6^{2-}}$\\nThis iodometric titration is extremely selective for copper over nickel, making (A) the correct and most suitable method.\\n\\n2. Method (B) is unsuitable because both ions absorb light at the chosen wavelength, making direct comparison difficult without a multi-wavelength deconvolution method.\\n3. Method (C) precipitates both metal hydroxides ($\\\\ce{Cu(OH)_2}$ and $\\\\ce{Ni(OH)_2}$), so their masses cannot be separated simply by weighing the precipitate.\\n4. Method (D) cannot selectively precipitate copper in a strongly oxidizing nitric acid environment, nor is it a standard analytical procedure."
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
  "detailedSolution": "The length of a carbon-oxygen bond is inversely proportional to its bond order. Let's determine the carbon-oxygen bond orders in each species:\\n\\n1. For $\\\\ce{HCO2^-}$ (formate ion), the carbon has one double bond and one single bond to oxygen, which are delocalized by resonance. The average $\\\\ce{C-O}$ bond order is:\\n$\\\\text{Bond Order} = \\\\frac{1 + 2}{2} = 1.5$\\n\\n2. For $\\\\ce{CO3^{2-}}$ (carbonate ion), the carbon is bonded to three oxygen atoms with one double bond and two single bonds in resonance. The average $\\\\ce{C-O}$ bond order is:\\n$\\\\text{Bond Order} = \\\\frac{1 + 1 + 2}{3} = 1.33$\\n\\n3. For $\\\\ce{CO2}$ (carbon dioxide), the Lewis structure is $\\\\ce{O=C=O}$, which has two discrete $\\\\ce{C-O}$ double bonds. The bond order is $2.0$.\\n\\n4. For $\\\\ce{COS}$ (carbonyl sulfide), the Lewis structure is $\\\\ce{O=C=S}$, containing a $\\\\ce{C-O}$ double bond. The bond order is $2.0$.\\n\\nComparing the average bond orders, the carbonate ion ($\\\\ce{CO3^{2-}}$) has the lowest average bond order ($1.33$) and therefore the longest carbon-oxygen bond, making (B) the correct choice."
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
  "detailedSolution": "Protonation of urea, $\\\\ce{(NH2)2C=O}$, occurs preferentially on the oxygen atom rather than the nitrogen atom.\\n\\n1. Protonation on the oxygen atom gives the cation $\\\\ce{[(NH2)2C=OH]^+}$. The positive charge in this cation is highly stabilized via resonance delocalization over both electronegative nitrogen atoms:\\n$\\\\ce{H2N-C(OH)=NH2^+} \\\\leftrightarrow \\\\ce{H2N^+=C(OH)-NH2} \\\\leftrightarrow \\\\ce{H2N-C(O^+H)-NH2}$\\nThis delocalization gives both $\\\\ce{C-N}$ bonds substantial double-bond character and makes the three heavy atoms (N, C, N) and O lie in the same plane.\\n\\n2. Protonation on nitrogen, yielding $\\\\ce{H2N-C(=O)-NH3^+}$, lacks this resonance stabilization because the positive charge on nitrogen cannot be delocalized since nitrogen has no lone pairs to participate in conjugation.\\n\\n3. The SMILES string representing oxygen protonation (specifically showing one resonance contributor with a $\\\\ce{C=N}$ double bond) is [[SMILES: NC(O)=[NH2+]]], which is option (D)."
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
      ? `\n    "options": ["Option A", "Option B", "Option C", "Option D"], // MUST be provided if type is multiple_choice` 
      : ``;
    let keywordExpressionSchemaDesc = parsedTypes.includes('short_answer')
      ? `\n    "keywordExpression": "A logical boolean expression representing answer correctness (e.g., 'gravity AND newton' or 'O2 OR oxygen' or \"'carbon dioxide' OR CO2\"). Use AND, OR, NOT, parentheses, and single quotes for multi-word phrases. Required ONLY if type is short_answer.",`
      : ``;
    let answerSchemaDesc = `"For multiple_choice, exactly 'A', 'B', 'C', or 'D'. For short_answer, the exact correct short text or number. For free_response, an empty string ''."`;

    const systemInstruction = `You are an expert examiner creating questions for high-stakes competitive olympiad exams.

${subjectContext}

For free_response questions, especially at high difficulty levels (such as IMO, USAMO, IPhO, IChO, etc.), the question MUST require the user to write out a comprehensive mathematical proof, detailed step-by-step physics derivation, or organic chemistry synthesis mechanism/conceptual proof, rather than just calculating a final numerical value.

All questions generated MUST adhere to these critical design directives:
1. QUESTION STYLE & TRICKINESS: Do NOT make every single question a trap question; instead, provide a mix of standard and tricky questions:
   - For difficulty levels 1 to 4: Standard, straightforward conceptual or algorithmic questions must be used.
   - For difficulty levels 5 to 10: Questions can either be tricky (presenting sophisticated conceptual traps or subtle edge cases that penalize rote formula-plugging) OR they can be standard, non-trick questions that are highly difficult and challenging in their own right (demanding deep logic, multi-step reasoning, or integration of multiple foundational concepts).
   - Under no circumstances should any question require obscure, highly specialized research-level details, graduate-level knowledge, or any college-level content. All questions must be strictly competitive high school level or below. Problems must be completely solvable and scientifically/mathematically rigorous if the student deeply understands core principles. For multiple_choice questions involving traps, craft the distractor options to precisely match the results of common conceptual mistakes.
2. BALANCED TOPIC DIVERSITY: The exam must cover a wide, diverse range of standard topics/subjects within the chosen field (e.g., for Chemistry, include thermodynamics, kinetics, stoichiometry, organic synthesis, coordination chemistry, etc.). Do NOT let any single topic dominate the entire exam. Distribute the questions evenly across a broad variety of core topics/subjects in the syllabus.
3. OPTIONS FORMATTING (LaTeX Delimiters): For multiple_choice questions, any mathematical expressions, chemical formulas, equations, physical units, or numerical values in the options list MUST be wrapped in LaTeX delimiters (e.g., $...$). Simple, purely qualitative text options that do not contain mathematical or chemical terms must NOT be wrapped in LaTeX.

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
Do not wrap the JSON in markdown code blocks. Return ONLY valid JSON.`;

    const prompt = `Generate exactly ${count} ${subject} problems. The difficulty should start around ${startingDifficulty} out of 10 and can vary slightly to provide a balanced test.
Follow these strict rules:
1. Question Style: Provide a balanced mix of standard and tricky questions. Standard questions should only be generated for difficulty levels 1-4. For difficulty levels 5-10, make questions either tricky with conceptual traps, or standard but highly difficult in their own right. Do NOT use obscure, highly specialized research-level details.
2. The exam must span a wide, diverse range of standard topics in ${subject}. Do NOT let any single topic dominate the entire exam. Distribute the questions across a broad variety of core topics in the standard syllabus.
3. Detailed Solutions: For every question generated, you MUST provide a thorough, detailed step-by-step correct solution and proof in the "detailedSolution" field.`;

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

    try {
        const stream = await executeWithRetry('gemini-3.5-flash', (aiClient) => aiClient.models.generateContentStream({
            model: 'gemini-3.5-flash',
            contents: prompt,
            safety_settings: safetySettings,
            safetySettings: safetySettings,
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                temperature: 0.7,
                safety_settings: safetySettings,
                safetySettings: safetySettings,
            }
        }));

        let accumulated = '';
        let questionsSent = 0;
        const questions = [];

        for await (const chunk of stream) {
            const text = chunk.text;
            if (text) {
                accumulated += text;
                const parsed = extractCompleteObjects(accumulated);
                while (questionsSent < parsed.length) {
                    const q = parsed[questionsSent];
                    questions.push(q);
                    if (onQuestion) onQuestion(q, questionsSent);
                    questionsSent++;
                }
            }
        }

        return questions;
    } catch (error) {
        console.error("Error generating problems:", error);
        throw error;
    }
}
