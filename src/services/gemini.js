import { GoogleGenAI } from '@google/genai';

const apiKey = import.meta.env.GEMINI_API_KEY;

let ai;
if (apiKey) {
    ai = new GoogleGenAI({ apiKey });
} else {
    console.warn("GEMINI_API_KEY is not set. Problem generation will fail unless set.");
}

function extractCompleteObjects(jsonStr) {
  const objects = [];
  let depth = 0;
  let inString = false;
  let escape = false;
  let objStart = -1;

  for (let i = 0; i < jsonStr.length; i++) {
    const ch = jsonStr[i];

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

export async function generateProblem(difficultyLevel, subject = "Math") {
    if (!ai) {
        console.warn("Using fallback mock data due to missing API key.");
        return {
            id: Date.now().toString(),
            question: `Mock Problem (Difficulty: ${difficultyLevel}): If 3x + 4 = 19, what is x?`,
            type: "short_answer",
            answer: "5",
            difficulty: difficultyLevel
        };
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
- Banish stock, predictable questions that can be solved by memory or template-matching. 
- Every problem must center on a non-obvious conceptual trick, a hidden limiting factor, or a subtle breakdown of a standard textbook assumption.
- The question text must remain entirely neutral. NEVER include hints, warnings, or clarifying instructions (e.g., "Do not assume...", "Account for...", "Do not rely on..."). 
- Incorporate a deceptive path: design the problem so that the most common rote formula shortcut yields an exact numerical value or structural choice that perfectly matches one of the incorrect distractor options.

2. Difficulty-Dependent Syllabus Boundaries
- IF DIFFICULTY < 8 (USNCO National Level):
  - Maintain the USNCO scope but test to maximum depth.
  - EXCLUDE named physical chemistry rules/equations outside standard AP/USNCO curricula (e.g., Trouton's rule, Eyring-Polanyi equation, explicit activity coefficients).
  - EXCLUDE advanced stereochemical control and transition-state geometry (e.g., Bürgi-Dunitz trajectories, advanced diastereoselectivity, stereospecific enolate alkylations).
  - EXCLUDE advanced coordination chemistry (e.g., Crystal Field Theory, $t_{2g}$/$e_g$ orbital splitting, high-spin/low-spin complexes, Jahn-Teller effects). Confine coordination questions to basic nomenclature, coordination number, and oxidation states.
  - EXCLUDE all calculus-based derivations or principles.
  - EXCLUDE advanced spectroscopy (e.g., 2D-NMR).
  - Increase difficulty by coupling unexpected systems (e.g., matching a non-trivial stoichiometry with an electrochemical change that alters concentration ratios, or an organic reaction where a common functional group exhibits atypical reactivity due to adjacent electronic effects).
- IF DIFFICULTY >= 8 (IChO Level):
  - Pivot to completely original, concept-first designs leveraging advanced chemical phenomena.
  - The "First-Principles" Guardrail: Introduce advanced, extra-syllabus topics using self-contained, axiomatic background information within the problem preamble. A student must be able to deduce the correct path using standard prerequisites combined with the provided context.

3. Structural Representation (SMILES Rules)
- NEVER replace simple chemical names or basic empirical formulas in standard prose with SMILES (e.g., do not write "a liquid like O" for water; use $\text{H}_2\text{O}$).
- ONLY use SMILES notation (or Reaction SMILES) for complex organic molecules, coordination complexes, or standalone reaction schemes where a 2D structural diagram is explicitly required.
- When required, display SMILES directly inline without introductory phrases like "represented by the SMILES string...", ensuring it does not disrupt the grammatical flow of the text.
- Use LaTeX strictly for all mathematical equations, equilibrium expressions, simple empirical chemical formulas in prose, physical units, and variables (e.g., $\Delta G^\circ$, $E^\circ$, $K_{\text{sp}}$, $1.0 \times 10^{-3} \text{ M}$).

Calibrate the 1-10 difficulty scale exactly as follows:
- 1: simple Honors/early AP chem, 3: harder problems on the ACS Local Exam, 5: harder problems on the USNCO Nationals, 10: hardest problem on the IChO.
`;
    }

    const systemInstruction = `You are an expert examiner creating questions for high-stakes competitive olympiad exams.

${subjectContext}

All questions generated MUST adhere to this critical design directive:
- TRICKY BUT SOLVABLE: The question must be intentionally tricky, presenting sophisticated conceptual traps or subtle edge cases that penalize rote formula-plugging. Do NOT use obscure, highly specialized research-level details. Unless explicitly permitted in the syllabus boundaries above, all questions must be strictly competitive high school level or below. Problems must be completely solvable and scientifically rigorous if the student deeply understands core principles. Craft distractor options (for multiple_choice) to precisely match the results of common conceptual mistakes.
- OPTIONS FORMATTING (LaTeX Delimiters): For multiple_choice questions, any mathematical expressions, chemical formulas, equations, physical units, or numerical values in the options list MUST be wrapped in LaTeX delimiters (e.g., $...$). Simple, purely qualitative text options that do not contain mathematical or chemical terms must NOT be wrapped in LaTeX.

The output must be pure JSON with the following schema:
{
    "id": "A unique string ID",
    "topic": "The brief sub-category or topic tested (e.g. 'Algebra', 'Stoichiometry', 'Mechanics')",
    "question": "The text of the question. It should be challenging, clear, and feature clever conceptual traps.",
    "type": "multiple_choice" or "short_answer",
    "options": ["Option A", "Option B", "Option C", "Option D"], // Provide ONLY if type is multiple_choice
    "answer": "For multiple_choice, this MUST be exactly 'A', 'B', 'C', or 'D' corresponding to the correct option index. For short_answer, this must be the exact correct numeric or short text answer string.",
    "difficulty": a number representing difficulty
}
Do not wrap the JSON in markdown code blocks. Return ONLY valid JSON.`;

    const prompt = `Generate a single tricky ${subject} problem with a difficulty level of ${difficultyLevel} out of 10. The question must feature a clever conceptual trap but remain completely solvable using standard core Olympiad syllabus knowledge. Do NOT use obscure research-level details.`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: prompt,
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                temperature: 0.7,
            }
        });

        return JSON.parse(response.text);
    } catch (error) {
        console.error("Error generating problem:", error);
        throw error;
    }
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

    if (!ai) {
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
- Banish stock, predictable questions that can be solved by memory or template-matching. 
- Every problem must center on a non-obvious conceptual trick, a hidden limiting factor, or a subtle breakdown of a standard textbook assumption.
- The question text must remain entirely neutral. NEVER include hints, warnings, or clarifying instructions (e.g., "Do not assume...", "Account for...", "Do not rely on..."). 
- Incorporate a deceptive path: design the problem so that the most common rote formula shortcut yields an exact numerical value or structural choice that perfectly matches one of the incorrect distractor options.

2. Difficulty-Dependent Syllabus Boundaries
- IF DIFFICULTY < 8 (USNCO National Level):
  - Maintain the USNCO scope but test to maximum depth.
  - EXCLUDE named physical chemistry rules/equations outside standard AP/USNCO curricula (e.g., Trouton's rule, Eyring-Polanyi equation, explicit activity coefficients).
  - EXCLUDE advanced stereochemical control and transition-state geometry (e.g., Bürgi-Dunitz trajectories, advanced diastereoselectivity, stereospecific enolate alkylations).
  - EXCLUDE advanced coordination chemistry (e.g., Crystal Field Theory, $t_{2g}$/$e_g$ orbital splitting, high-spin/low-spin complexes, Jahn-Teller effects). Confine coordination questions to basic nomenclature, coordination number, and oxidation states.
  - EXCLUDE all calculus-based derivations or principles.
  - EXCLUDE advanced spectroscopy (e.g., 2D-NMR).
  - Increase difficulty by coupling unexpected systems (e.g., matching a non-trivial stoichiometry with an electrochemical change that alters concentration ratios, or an organic reaction where a common functional group exhibits atypical reactivity due to adjacent electronic effects).
- IF DIFFICULTY >= 8 (IChO Level):
  - Pivot to completely original, concept-first designs leveraging advanced chemical phenomena.
  - The "First-Principles" Guardrail: Introduce advanced, extra-syllabus topics using self-contained, axiomatic background information within the problem preamble. A student must be able to deduce the correct path using standard prerequisites combined with the provided context.

3. Structural Representation (SMILES Rules)
- NEVER replace simple chemical names or basic empirical formulas in standard prose with SMILES (e.g., do not write "a liquid like O" for water; use $\text{H}_2\text{O}$).
- ONLY use SMILES notation (or Reaction SMILES) for complex organic molecules, coordination complexes, or standalone reaction schemes where a 2D structural diagram is explicitly required.
- When required, display SMILES directly inline without introductory phrases like "represented by the SMILES string...", ensuring it does not disrupt the grammatical flow of the text.
- Use LaTeX strictly for all mathematical equations, equilibrium expressions, simple empirical chemical formulas in prose, physical units, and variables (e.g., $\Delta G^\circ$, $E^\circ$, $K_{\text{sp}}$, $1.0 \times 10^{-3} \text{ M}$).

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
    "difficulty": a number between 1 and 10 representing difficulty
}
Do not wrap the JSON in markdown code blocks. Return ONLY valid JSON.`;

    const prompt = `Generate exactly ${count} ${subject} problems. The difficulty should start around ${startingDifficulty} out of 10 and can vary slightly to provide a balanced test.
Follow these strict rules:
1. Question Style: Provide a balanced mix of standard and tricky questions. Standard questions should only be generated for difficulty levels 1-4. For difficulty levels 5-10, make questions either tricky with conceptual traps, or standard but highly difficult in their own right. Do NOT use obscure, highly specialized research-level details.
2. The exam must span a wide, diverse range of standard topics in ${subject}. Do NOT let any single topic dominate the entire exam. Distribute the questions across a broad variety of core topics in the standard syllabus.`;

    try {
        const stream = await ai.models.generateContentStream({
            model: 'gemini-3.5-flash',
            contents: prompt,
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                temperature: 0.7,
            }
        });

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
