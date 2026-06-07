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
    import.meta.env.GEMINI_API_KEY_3,
    import.meta.env.GEMINI_API_KEY_4,
    import.meta.env.GEMINI_API_KEY_5,
    import.meta.env.GEMINI_API_KEY_6,
    import.meta.env.GEMINI_API_KEY_7,
    import.meta.env.GEMINI_API_KEY_8,
    import.meta.env.GEMINI_API_KEY_9,
    import.meta.env.GEMINI_API_KEY_10,
    import.meta.env.GEMINI_API_KEY_11,
    import.meta.env.GEMINI_API_KEY_12
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
    import.meta.env.GEMINI_API_KEY_3,
    import.meta.env.GEMINI_API_KEY_4,
    import.meta.env.GEMINI_API_KEY_5,
    import.meta.env.GEMINI_API_KEY_6,
    import.meta.env.GEMINI_API_KEY_7,
    import.meta.env.GEMINI_API_KEY_8,
    import.meta.env.GEMINI_API_KEY_9,
    import.meta.env.GEMINI_API_KEY_10,
    import.meta.env.GEMINI_API_KEY_11,
    import.meta.env.GEMINI_API_KEY_12
  ].filter(Boolean);

  if (keys.length === 0) {
    throw new Error('GEMINI_API_KEYs are missing');
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

const hasKeys = !!(
  import.meta.env.GEMINI_API_KEY ||
  import.meta.env.GEMINI_API_KEY_2 ||
  import.meta.env.GEMINI_API_KEY_3 ||
  import.meta.env.GEMINI_API_KEY_4 ||
  import.meta.env.GEMINI_API_KEY_5 ||
  import.meta.env.GEMINI_API_KEY_6 ||
  import.meta.env.GEMINI_API_KEY_7 ||
  import.meta.env.GEMINI_API_KEY_8 ||
  import.meta.env.GEMINI_API_KEY_9 ||
  import.meta.env.GEMINI_API_KEY_10 ||
  import.meta.env.GEMINI_API_KEY_11 ||
  import.meta.env.GEMINI_API_KEY_12
);

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
export async function generateProblems(count, startingDifficulty, subject = "Math", username = "default_user", onQuestion = null, freeResponseMode = false, examFormat = 'mix', lessonTitle = null, lessonDescription = null) {
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
          examFormat,
          lessonTitle,
          lessonDescription
        }),
      });

      if (!response.ok) {
        console.warn(`Vercel API returned status ${response.status}. Falling back to direct Gemini client.`);
      } else {
        const contentType = response.headers.get('content-type') || '';

        if (contentType.includes('text/event-stream')) {
          // SSE streaming path
          const wrappedOnQuestion = onQuestion
            ? (q, idx) => {
              if (idx < count) {
                onQuestion(q, idx);
              }
            }
            : null;
          const resQuestions = await readSSEStream(response, wrappedOnQuestion);
          return resQuestions.slice(0, count);
        } else {
          // Legacy non-streaming JSON fallback
          const data = await response.json();
          const questions = (Array.isArray(data) ? data : [data]).slice(0, count);
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
Follow these strict Olympiad Design Philosophies:

1. Novelty & "Invisible Traps"
- Create highly original questions requiring first-principles reasoning over template-matching.
- Every problem must center on a non-obvious conceptual trick or subtle breakdown of a standard assumption.
- Incorporate a deceptive path: the most common rote shortcut should yield a value matching one incorrect distractor.

2. Advanced Design & Difficulty Criteria
- Multi-Topic Coupling: Require simultaneous application of disparate principles (e.g., coupling sequences with modular arithmetic and pigeonhole, or geometry with number theory).
- Multi-Step Cascades: Output of one step forms input of the next, without explicit prompting on intermediates.
- Subtle Nuances: Test edge cases, domain restrictions, degeneracy, boundary conditions, off-by-one errors.
- Rigor: Require case analysis, counterexamples, or bounding arguments—not plug-and-chug.
- Novel Context: Present familiar concepts in unfamiliar frameworks.

3. Syllabus Boundaries
- DIFFICULTY < 8 (AMC/AIME): Restrict to algebra, combinatorics, geometry, number theory. No calculus. Increase difficulty by coupling topics.
- DIFFICULTY >= 8 (USAMO/IMO): Original concept-first designs. May introduce advanced topics but must define all non-standard concepts from scratch. free_response MUST require a complete proof.

4. SVG Diagrams: When needed, generate a single valid <svg> block. Use primitive shapes, <defs>/<use>, inline attributes (no CSS <style>), white background, single-quotes for JSON compat. Enclose in \`\`\`xml code blocks.

Difficulty scale: 1=MATHCOUNTS, 3=AMC 10, 5=AMC 12 Q20, 8=USAJMO, 10=hardest IMO.

5. Exemplar Questions (format reference):

{
  "id": "math_ex1",
  "topic": "Number Theory & Modular Arithmetic",
  "question": "Let $S$ be the set of all positive integers $n$ such that $n^2 \\\\equiv 1 \\\\pmod{2025}$. Find the number of elements in $S$ that are less than $2025$.",
  "type": "multiple_choice",
  "options": ["$8$", "$12$", "$16$", "$24$"],
  "answer": "C",
  "difficulty": 6,
  "detailedSolution": "Factor $2025 = 3^4 \\\\times 5^2$. By CRT, solve $n^2 \\\\equiv 1$ mod $81$ and mod $25$ separately. For odd prime power $p^k$, careful analysis via Hensel lifting gives 4 solutions mod $81$ and 4 mod $25$, yielding $4 \\\\times 4 = 16$ by CRT."
}

{
  "id": "math_ex2",
  "topic": "Combinatorics & Graph Theory",
  "question": "Let $n \\\\geq 3$. In a round-robin tournament with $n$ players, player $A$ *dominates* $B$ if $A$ beat $B$, or exists $C$ with $A$ beat $C$ and $C$ beat $B$.\\\\nProve that if $n \\\\geq 7$ and odd, there exists a player dominating every other.",
  "type": "free_response",
  "answer": "",
  "difficulty": 9,
  "detailedSolution": "Take player $v^*$ with max out-degree $\\\\Delta$. Let $W$ = wins, $L$ = losses. For any $u \\\\in L$: if $u$ beat all of $W$, then $d^+(u) \\\\geq \\\\Delta+1$, contradiction. So some $w \\\\in W$ beats $u$, and $v^*$ dominates $u$ via $w$. $v^*$ trivially dominates $W$ directly. QED."
}
`;
  } else if (normSubject === 'physics') {
    subjectContext = `
Follow these strict Olympiad Design Philosophies:

1. Novelty & "Invisible Traps"
- Create highly original questions requiring first-principles reasoning over template-matching.
- Every problem must center on a non-obvious conceptual trick or subtle breakdown of a standard assumption.
- Incorporate a deceptive path: the most common rote shortcut should yield a value matching one incorrect distractor.

2. Advanced Design & Difficulty Criteria
- Multi-Topic Coupling: Require simultaneous application of disparate physical principles (e.g., thermodynamic cycle with magnetic induction, electrostatics with rotational dynamics, spring-mass with RC circuit via EM induction).
- Multi-Step Cascades: Output of one step forms input of the next (e.g., find charge distribution → compute E-field → integrate for potential energy → apply energy conservation).
- Subtle Nuances: Test non-inertial frames, static-to-kinetic friction transitions, non-obvious geometric constraints, cases where small-angle approximation breaks down.
- Rigor: Require setting up and solving differential equations, non-trivial integrations, perturbation methods.
- Novel Context: Present physics in unfamiliar frameworks (astrophysical systems, atmospheric phenomena, biological mechanics).

3. Syllabus Boundaries
- DIFFICULTY < 8 (F=ma/AP Physics C): Restrict to classical mechanics, electromagnetism, thermodynamics, fluid dynamics, waves, optics. Increase difficulty by coupling unexpected systems.
- DIFFICULTY >= 8 (USAPhO/IPhO): Original concept-first designs. May introduce special relativity, quantum basics, statistical mechanics, etc. but MUST define all concepts from scratch (first-principles guardrail). free_response MUST require comprehensive derivation, not just a final number.

4. SVG Diagrams: When needed, generate a single valid <svg> block. Use primitive shapes, <defs>/<use>, inline attributes (no CSS <style>), white background, single-quotes for JSON compat. Enclose in \`\`\`xml code blocks.

Difficulty scale: 1=introductory, 3=AP Physics C, 5=F=ma, 8=USAPhO, 10=hardest IPhO.

5. Exemplar Questions (format reference):

{
  "id": "phys_ex1",
  "topic": "Mechanics & Rotational Dynamics",
  "question": "A uniform solid cylinder of mass $M$ and radius $R$ is on a rough incline at angle $\\\\theta$. A horizontal force $\\\\vec{F}$ is applied to the center, perpendicular to the surface (into the incline). Coefficient of static friction is $\\\\mu_s$. Determine $\\\\theta_{\\\\max}$ for static equilibrium without slipping.",
  "type": "multiple_choice",
  "options": ["$\\\\tan^{-1}\\\\left(\\\\frac{3\\\\mu_s(Mg + F)}{Mg}\\\\right)$", "$\\\\tan^{-1}\\\\left(\\\\frac{3\\\\mu_s(Mg\\\\cos\\\\theta + F)}{Mg}\\\\right)$", "$\\\\tan^{-1}(3\\\\mu_s)$", "$\\\\tan^{-1}\\\\left(\\\\frac{\\\\mu_s(Mg + F)}{Mg}\\\\right)$"],
  "answer": "A",
  "difficulty": 6,
  "detailedSolution": "Normal force $N = Mg\\\\cos\\\\theta + F$. For rolling without slipping, friction needed is $f = \\\\frac{1}{3}Mg\\\\sin\\\\theta$ (from combined translational/rotational equations with $I=\\\\frac{1}{2}MR^2$). Setting $f \\\\leq \\\\mu_s N$ and solving at equality gives $\\\\theta_{\\\\max} = \\\\tan^{-1}(3\\\\mu_s(Mg+F)/Mg)$."
}

{
  "id": "phys_ex2",
  "topic": "Electromagnetism & Induction",
  "question": "A thin conducting ring (radius $a$, resistance $R$, self-inductance $L$) is coaxial with a solenoid (radius $b<a$, $n$ turns/length, current $I(t)=I_0 e^{-t/\\\\tau}$). At $t=0$ the ring is released from rest under gravity.\\\\n(a) Derive the induced EMF.\\\\n(b) Write the coupled ODEs for induced current $i(t)$ and velocity $v(t)$.\\\\n(c) For $L \\\\ll R\\\\tau$, find the approximate terminal velocity.",
  "type": "free_response",
  "answer": "",
  "difficulty": 8,
  "detailedSolution": "(a) Flux $\\\\Phi = \\\\mu_0 n I(t) \\\\pi b^2$. EMF from time-varying current: $\\\\mathcal{E}_1 = \\\\mu_0 n \\\\pi b^2 I_0/\\\\tau \\\\cdot e^{-t/\\\\tau}$. (b) Circuit: $L di/dt + Ri = \\\\mathcal{E}$. Motion: $m dv/dt = mg - F_{drag}$. (c) When $L \\\\ll R\\\\tau$, $i \\\\approx \\\\mathcal{E}/R$. At terminal velocity $mg = F_{drag}$, solve for $v_{term}$."
}
`;
  } else if (normSubject === 'chemistry') {
    subjectContext = `
Follow these strict Olympiad Design Philosophies:

1. Novelty & "Invisible Traps"
- Create highly original questions requiring first-principles reasoning over template-matching.
- Every problem must center on a non-obvious conceptual trick or subtle breakdown of a standard assumption.
- Incorporate a deceptive path: the most common rote shortcut should yield a value matching one incorrect distractor.

2. Advanced Design & Difficulty Criteria
- Multi-Topic Coupling: Require simultaneous application of disparate chemical principles (e.g., coordination chemistry $K_f$ with $K_{sp}$ and electrochemical $E^\\circ$; organic structure elucidation from elemental analysis → MS → IR → regioselective mechanisms).
- Multi-Step Cascades: Output of one step forms input of the next, without explicit prompting on intermediates.
- Subtle Nuances: Test electronic structures, periodic trends, thermodynamic vs. kinetic control, anomalies in MO configurations ($B_2$ vs $O_2$).
- Rigor: Eliminate simplifying assumptions (e.g., x-is-small approximation). Require solving higher-order equations from mass/charge balances.
- Novel Context: Present principles in unfamiliar frameworks (bioinorganic sites, MOFs, industrial catalysis).

3. Syllabus Boundaries
- DIFFICULTY < 8 (USNCO): Standard AP/USNCO scope at max depth. No calculus-based derivations. Limit spectroscopy to 1D-NMR and basic IR/UV-Vis. Increase difficulty by coupling unexpected systems.
- DIFFICULTY >= 8 (IChO): Original concept-first designs. Introduce advanced topics with self-contained, axiomatic preambles (first-principles guardrail).

4. SMILES: Use only for complex organic molecules or coordination complexes. Use LaTeX for all equations, formulas, units, and variables.

5. SVG Diagrams: When needed (titration curves, phase diagrams, etc.), generate a single valid <svg> block. Use primitive shapes, <defs>/<use>, inline attributes (no CSS <style>), white background, single-quotes for JSON compat. Enclose in \`\`\`xml code blocks.

Difficulty scale: 1=Honors/early AP, 3=harder ACS Local, 5=harder USNCO Nationals, 10=hardest IChO.

6. Exemplar Questions (format reference):

{
  "id": "chem_ex1",
  "topic": "Chemical Bonding & Bond Order",
  "question": "Which species has the longest carbon-oxygen bond?",
  "type": "multiple_choice",
  "options": ["$\\\\ce{HCO2^-}$", "$\\\\ce{CO3^{2-}}$", "$\\\\ce{CO2}$", "$\\\\ce{COS}$"],
  "answer": "B",
  "difficulty": 5,
  "detailedSolution": "Bond length is inversely proportional to bond order. $\\\\ce{HCO2^-}$: avg C-O bond order = 1.5. $\\\\ce{CO3^{2-}}$: avg = 1.33. $\\\\ce{CO2}$: 2.0. $\\\\ce{COS}$: C-O is 2.0. Carbonate has the lowest bond order (1.33), hence the longest C-O bond."
}

{
  "id": "chem_ex2",
  "topic": "Acid-Base Titration & Gas Laws",
  "question": "A is an ionic compound containing only H, N, and O.\\\\n(a) A 1.000-g sample titrated with 0.5000 M NaOH reaches equivalence at 25.0 mL. Find the molar mass.\\\\n(b) Heating 1.000 g at 230°C in 1.50 L gives 784 mmHg. Find moles of gas.\\\\n(c) After drying with $\\\\ce{Mg(ClO4)2}$, 308 mL at 755 mmHg, 25°C. Find moles of dry gas.\\\\n(d) Determine the formula of A.\\\\n(e) Draw Lewis structures for cation, anion, and decomposition products.",
  "type": "free_response",
  "answer": "",
  "difficulty": 9,
  "detailedSolution": "(a) Moles OH- = 0.0125, so M = 80.0 g/mol. (b) PV=nRT gives 0.0375 mol total gas. (c) 0.0125 mol dry gas. (d) 1:3 total gas ratio, 1:2 water ratio → $\\\\ce{NH4NO3}$ (M=80.04), decomposing to $\\\\ce{N2O + 2H2O}$. (e) $\\\\ce{NH4+}$: tetrahedral N with +1 charge. $\\\\ce{NO3-}$: trigonal planar with resonance. $\\\\ce{N2O}$: two resonance structures ($\\\\ce{N#[N+][O-]}$ and $\\\\ce{[N-]=[N+]=O}$)."
}
`;
  }

  const allowedTypes = Array.isArray(examFormat)
    ? examFormat
    : (typeof examFormat === 'string' && examFormat.trim()
      ? (examFormat.includes(',') ? examFormat.split(',') : [examFormat])
      : ['multiple_choice', 'short_answer', 'free_response']);

  const parsedTypes = allowedTypes.map(t => t.trim()).filter(Boolean);

  let typeSchemaDesc = parsedTypes.map(t => `"${t}"`).join(' | ');
  let optionsSchemaDesc = parsedTypes.includes('multiple_choice')
    ? `\n    "options": ["Option A", "Option B", "Option C", "Option D"], // MUST be provided if type is multiple_choice`
    : ``;
  let keywordExpressionSchemaDesc = parsedTypes.includes('short_answer')
    ? `\n    "keywordExpression": "A logical boolean expression representing answer correctness (e.g., 'gravity AND newton' or 'O2 OR oxygen' or \"'carbon dioxide' OR CO2\"). Use AND, OR, NOT, parentheses, and single quotes for multi-word phrases. Required ONLY if type is short_answer.",`
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

  const systemInstruction = `You are an expert examiner creating questions for high-stakes competitive olympiad exams.

${subjectContext.replace(/"detailedSolution":\s*"[\s\S]*?"/g, '"detailedSolution": ""')}
${lessonInstructions}

For free_response questions, especially at high difficulty levels (such as IMO, USAMO, IPhO, IChO, etc.), the question MUST require the user to write out a comprehensive mathematical proof, detailed step-by-step physics derivation, or organic chemistry synthesis mechanism/conceptual proof, rather than just calculating a final numerical value.

All questions generated MUST adhere to these critical design directives:
1. QUESTION STYLE & TRICKINESS: Do NOT make every single question a trap question; instead, provide a mix of standard and tricky questions:
   - For difficulty levels 1 to 4: Standard, straightforward conceptual or algorithmic questions must be used.
   - For difficulty levels 5 to 10: Questions can either be tricky (presenting sophisticated conceptual traps or subtle edge cases that penalize rote formula-plugging) OR they can be standard, non-trick questions that are highly difficult and challenging in their own right (demanding deep logic, multi-step reasoning, or integration of multiple foundational concepts).
   - Under no circumstances should any question require obscure, highly specialized research-level details, graduate-level knowledge, or any college-level content. All questions must be strictly competitive high school level or below. Problems must be completely solvable and scientifically/mathematically rigorous if the student deeply understands core principles. For multiple_choice questions involving traps, craft the distractor options to precisely match the results of common conceptual mistakes.
2. BALANCED TOPIC DIVERSITY: The exam must cover a wide, diverse range of standard topics/subjects within the chosen field (e.g., for Chemistry, include thermodynamics, kinetics, stoichiometry, organic synthesis, coordination chemistry, etc.). Do NOT let any single topic dominate the entire exam. Distribute the questions evenly across a broad variety of core topics/subjects in the syllabus.
3. OPTIONS FORMATTING (LaTeX Delimiters): For multiple_choice questions, any mathematical expressions, chemical formulas, equations, physical units, or numerical values in the options list MUST be wrapped in LaTeX delimiters (e.g., $...$). Simple, purely qualitative text options that do not contain mathematical or chemical terms must NOT be wrapped in LaTeX.
4. QUESTION TYPES MIX: You MUST ensure that the generated questions contain a mix of all requested question types: ${parsedTypes.join(', ')}. Every requested type MUST appear at least once in the output array. For example, if the allowed types are multiple_choice and short_answer, you MUST generate at least one multiple_choice and at least one short_answer question.

The output must be a pure JSON array containing exactly the requested number of objects, with the following schema for each object:
{
    "id": "A unique string ID",
    "topic": "The brief sub-category or topic tested (e.g. 'Algebra', 'Stoichiometry', 'Mechanics')",
    "question": "The text of the question. It should be challenging, clear, and require working suitable for the question format.",
    "type": ${typeSchemaDesc},${optionsSchemaDesc}${keywordExpressionSchemaDesc}
    "answer": ${answerSchemaDesc},
    "difficulty": a number between 1 and 10 representing difficulty,
    "detailedSolution": "An empty string \"\""
}
Do not wrap the JSON in markdown code blocks. Return ONLY valid JSON.`;

  const prompt = `Generate exactly ${count} ${subject} problems. The difficulty should start around ${startingDifficulty} out of 10 and can vary slightly to provide a balanced test.
Follow these strict rules:
1. Question Style: Provide a balanced mix of standard and tricky questions. Standard questions should only be generated for difficulty levels 1-4. For difficulty levels 5-10, make questions either tricky with conceptual traps, or standard but highly difficult in their own right. Do NOT use obscure, highly specialized research-level details.
2. The exam must span a wide, diverse range of standard topics in ${subject}. Do NOT let any single topic dominate the entire exam. Distribute the questions across a broad variety of core topics in the standard syllabus.
3. Detailed Solutions: Do NOT generate detailed solutions. Always set the "detailedSolution" field to an empty string "".
4. You MUST ensure that the generated questions contain a mix of all requested question types: ${parsedTypes.join(', ')}. Every requested type MUST appear at least once in the output array.`;

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
          if (questionsSent < count) {
            questions.push(q);
            if (onQuestion) onQuestion(q, questionsSent);
          }
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
