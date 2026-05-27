/* eslint-disable */
import { BigQuery } from '@google-cloud/bigquery';
import { GoogleGenAI } from '@google/genai';

const projectId = process.env.BIGQUERY_PROJECT_ID || 'chronos-stress-sandbox';

const bq = new BigQuery({
  projectId,
  credentials: {
    client_email: process.env.BIGQUERY_CLIENT_EMAIL,
    private_key: process.env.BIGQUERY_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
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
- Do NOT introduce advanced graduate-level/specialized undergraduate topics outside the high-school/national olympiad purview:
  * Avoid advanced measure theory, abstract algebra (Galois theory, ring theory), general topology, or complex analysis.
- DO increase difficulty by forcing the integration of multiple foundational concepts:
  * Pair algebraic geometry (curves/conics) with modular arithmetic (finding integer points), or pair recursive sequence properties with combinatorics/pigeonhole principle, or use complex numbers to solve non-trivial coordinate geometry problems.
- Incorporate subtle conceptual traps:
  * Design problems with subtle domain/range constraints, non-obvious degeneracy in geometric configurations, off-by-one counting errors in combinatorics, or division-by-zero/modulo-zero pitfalls in systems of equations.

2. Authentic Style & Tone Mimicry
- Use the exact technical nomenclature, passive voice, and formal phrasing characteristic of official olympiads:
  * Mimic MAA Mathematics Olympiad (AMC 12, AIME, USAMO) exam phrasing (e.g. "Find the number of...", "Let S be the set of...", "Determine all functions f...").
- Avoid conversational language, contemporary idioms, or explicit hints within the text of the questions.
- Match the layout density and typographic conventions of genuine past papers. Use LaTeX strictly for all equations, formulas, physical units, and mathematical variables.

Calibrate the 1-10 difficulty scale exactly as follows:
- 1: MATHCOUNTS school/chapter level, 5: AMC 12 question 20-ish level, 8: Average USAJMO problem level, 10: Hardest problems on the IMO.
`;
    } else if (normSubject === 'physics') {
      subjectSpecificInstructions = `
Follow these strict Olympiad Design Philosophies:

1. Syllabus Boundaries (Difficulty via Depth, Not Scope)
- Do NOT introduce advanced graduate-level/specialized undergraduate topics outside the high-school/national olympiad purview:
  * Avoid general relativity, quantum field theory, particle physics standard model, or advanced Hamiltonian/Lagrangian mechanics.
- DO increase difficulty by forcing the integration of multiple foundational concepts:
  * Pair a thermodynamic PV-cycle with a magnetic induction loop or a spring-mass oscillator, or combine electrostatics/Lorentz force with rotational dynamics, or analyze buoyant forces in a rotating/accelerating frame.
- Incorporate subtle conceptual traps:
  * Design problems involving non-inertial reference frames, non-ideal frictional transitions (static vs kinetic), non-obvious geometric constraints, or cases requiring integration of first principles instead of basic formulas (e.g., non-uniform mass density).

2. Authentic Style & Tone Mimicry
- Use the exact technical nomenclature, passive voice, and formal phrasing characteristic of official olympiads:
  * Mimic AAPT Physics Olympiad (F=ma, USAPhO) exam phrasing.
- Avoid conversational language, contemporary idioms, or explicit hints within the text of the questions.
- Match the layout density and typographic conventions of genuine past papers. Use LaTeX strictly for all equations, formulas, physical units, and mathematical variables.

Calibrate the 1-10 difficulty scale exactly as follows:
- 1: introductory level, 3: AP Physics C level, 5: F=ma level, 8: USAPhO level, 10: hardest problem on the IPhO.
`;
    } else if (normSubject === 'chemistry') {
      subjectSpecificInstructions = `
Follow these strict Olympiad Design Philosophies:

1. Syllabus Boundaries (Difficulty via Depth, Not Scope)
- Do NOT introduce advanced graduate-level/specialized undergraduate topics outside the high-school/national olympiad purview:
  * Avoid full molecular orbital symmetry point groups, complex computational quantum mechanics derivations, advanced spectroscopic methods like 2D-NMR, overpotential calculations involving the Tafel equation, or Maxwell's relations.
- DO increase difficulty by forcing the integration of multiple foundational concepts:
  * Pair a non-trivial thermodynamic cycle with an electrochemistry cell, or force a non-obvious stereochemical outcome via steric/electronic shielding in reaction prediction.
- Incorporate subtle conceptual traps:
  * Design problems where standard shortcuts or rote formula-plugging yield tempting distractors, requiring exact tracking of assumptions (e.g., non-ideal gas behavior, temperature dependence of ΔH/ΔS, or structural rearrangements/hydride shifts).
- Mix conceptual qualitative questions with computational questions.

2. Authentic Style & Tone Mimicry
- Use the exact technical nomenclature, passive voice, and formal phrasing characteristic of official olympiads:
  * Mimic ACS Chemistry Olympiad (USNCO) exam phrasing.
- Avoid conversational language, contemporary idioms, or explicit hints within the text of the questions.
- Match the layout density and typographic conventions of genuine past papers. Use LaTeX strictly for all equations, formulas, physical units, and mathematical variables.

Calibrate the 1-10 difficulty scale exactly as follows:
- 1: simple Honors/early AP chem, 3: harder problems on the ACS Local Exam, 5: harder problems on the USNCO Nationals, 10: hardest problem on the IChO.

For Chemistry questions, represent ALL molecular structures (organic AND inorganic) strictly using SMILES notation so they render as structural diagrams. Use bracket notation for inorganic species with explicit hydrogens or charges (e.g., [OH2] for water, [NH3] for ammonia, [OH-] for hydroxide, [NH4+] for ammonium, OS(=O)(=O)O for sulfuric acid, [Na+].[Cl-] for NaCl, CC(=O)O for acetic acid). Do NOT use introductory phrases like "represented by the SMILES string..."; display the SMILES directly inline. For chemical reactions (organic or inorganic), represent strictly using Reaction SMILES syntax in the form Reactants>Reagents>Products or Reactants>>Products (e.g., C(C)O.CC(=O)O>[H+]>CC(=O)OCC.O for esterification). Use LaTeX ONLY for mathematical equations, equilibrium expressions, physical units, and variables (e.g., $\\Delta G^\\circ$, $E^\\circ$, $K_{\\text{sp}}$) — never for molecular structures.
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
1. QUESTION STYLE & TRICKINESS: Do NOT make every single question a trap question; instead, provide a mix of standard and tricky questions:
   - For difficulty levels 1 to 4: Standard, straightforward conceptual or algorithmic questions must be used.
   - For difficulty levels 5 to 10: Questions can either be tricky (presenting sophisticated conceptual traps or subtle edge cases that penalize rote formula-plugging) OR they can be standard, non-trick questions that are highly difficult and challenging in their own right (demanding deep logic, multi-step reasoning, or integration of multiple foundational concepts).
   - Under no circumstances should any question require obscure, highly specialized research-level details, graduate-level knowledge, or any college-level content. All questions must be strictly competitive high school level or below. Problems must be completely solvable and scientifically/mathematically rigorous if the student deeply understands core principles. For multiple_choice questions involving traps, craft the distractor options to precisely match the results of common conceptual mistakes.
2. BALANCED TOPIC DIVERSITY & WEAKNESS WEIGHTING: The exam must cover a wide, extremely diverse range of standard core subjects/topics within the chosen field. For example:
      - In Chemistry: You must select from stoichiometry, descriptive, states of matter, thermodynamics, kinetics, equilibrium, oxidation-reduction, atomic structure/periodicity, bonding/molecular structure, and organic/biochemistry.
      - In Physics: You must select from kinematics, forces, momentum, systems of particles, rotational kinematics, rotational dynamics, angular momentum, energy, fluid statics, gravitation, fluid dynamics, oscillations, waves, thermodynamics, electricity, and magnetism.
      - In Math: You must select from algebra, geometry, counting/probability, number theory.
   If a user's weak concepts are provided, allocate a minority of the questions (~30%, e.g., 1 out of 3, or 2 out of 5) to target those weaknesses, and dedicate the remaining majority (~70%) to a diverse selection of other core topics in the subject's standard syllabus, ensuring that no single topic (like electrochemistry) dominates the exam. If weaknesses are "None", distribute questions evenly across all core topics.

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

The user's identified weak concepts are: ${weaknesses}.
Follow these strict rules:
1. Question Style: Provide a balanced mix of standard and tricky questions. Standard questions should only be generated for difficulty levels 1-4. For difficulty levels 5-10, make questions either tricky with conceptual traps, or standard but highly difficult in their own right. Do NOT use obscure, highly specialized research-level details.
2. The exam must span a wide, diverse range of standard topics in ${subject}. Do NOT let any single topic dominate the entire exam.
3. Dedicated Distribution: Target the user's weak concepts (${weaknesses}) for approximately 30% of the questions. The remaining 70% of the questions MUST cover other diverse, standard subjects/topics in the ${subject} syllabus (e.g. for Chemistry, you MUST actively generate questions on other topics such as periodic trends, kinetics, thermodynamics, organic synthesis, chemical equilibrium, coordination chemistry, atomic structure, etc. instead of just stoichiometry and electrochemistry). If the weak concepts listed are "None", distribute all questions evenly across all main topics.`;

    // 3. Set SSE headers for streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // 4. Stream from Gemini and emit each complete question object as an SSE event
    const stream = await ai.models.generateContentStream({
      model: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        temperature: 0.3,
      },
    });

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
