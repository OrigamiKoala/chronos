import { GoogleGenAI } from '@google/genai';

const apiKey = import.meta.env.GEMINI_API_KEY;

let ai;
if (apiKey) {
    ai = new GoogleGenAI({ apiKey });
} else {
    console.warn("GEMINI_API_KEY is not set. Problem generation will fail unless set.");
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

    const prompt = `
    You are an expert examiner creating questions for high-stakes competitive olympiad exams.
    Generate a single ${subject} problem with a difficulty level of ${difficultyLevel} out of 10.
    
    If the subject is "Math", calibrate the 1-10 difficulty scale exactly as follows:
    - 1: MATHCOUNTS school/chapter level
    - 5: AMC 12 question 20-ish level
    - 8: Average USAJMO problem level
    - 10: Hardest problems on the IMO
    
    If the subject is "Physics", calibrate the 1-10 difficulty scale exactly as follows:
    - 1: introductory level
    - 3: AP Physics C level
    - 5: F=ma level
    - 8: USAPhO level
    - 10: hardest problem on the IPhO
    
    If the subject is "Chemistry", calibrate the 1-10 difficulty scale exactly as follows:
    - 1: simple Honors/early AP chem
    - 3: harder problems on the ACS Local Exam
    - 5: harder problems on the USNCO Nationals
    - 10: hardest problem on the IChO
    For Chemistry questions, represent organic molecules strictly using SMILES notation (e.g., C(C)O for ethanol, CC(=O)O for acetic acid). Do NOT use introductory or verbose phrases like "represented by the SMILES string..." or "whose SMILES representation is...". Instead, display the SMILES directly and let it render the question inline. Represent inorganic molecules, structures, and reaction equations strictly using LaTeX (e.g., $\\text{H}_2\\text{SO}_4$, $\\text{Fe}^{3+}$).
    
    The output must be pure JSON with the following schema:
    {
        "id": "A unique string ID",
        "topic": "The brief sub-category or topic tested (e.g. 'Algebra', 'Stoichiometry', 'Mechanics')",
        "question": "The text of the question. It should be challenging and clear.",
        "type": "multiple_choice" or "short_answer",
        "options": ["Option A", "Option B", "Option C", "Option D"], // Provide ONLY if type is multiple_choice
        "answer": "The exact correct answer string",
        "difficulty": ${difficultyLevel}
    }
    Do not wrap the JSON in markdown code blocks. Return ONLY valid JSON.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                temperature: 0.7,
                thinkingConfig: {
                    thinkingBudget: 1024
                }
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
export async function generateProblems(count, startingDifficulty, subject = "Math", username = "default_user", onQuestion = null) {
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
                    targetUserId: username
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
            mockProblems.push({
                id: `${Date.now()}-${i}`,
                question: `Mock ${subject} Problem ${i + 1} (Difficulty: ${diff}): What is ${i + 1} + ${diff}?`,
                type: i % 2 === 0 ? "multiple_choice" : "short_answer",
                options: i % 2 === 0 ? [`${i + 1 + diff}`, `${i + 2 + diff}`, `${i + 3 + diff}`, `${i + 4 + diff}`] : undefined,
                answer: `${i + 1 + diff}`,
                difficulty: diff
            });
        }
        if (onQuestion) mockProblems.forEach((q, i) => onQuestion(q, i));
        return mockProblems;
    }

    const prompt = `
    You are an expert examiner creating questions for high-stakes competitive olympiad exams.
    Generate exactly ${count} ${subject} problems. The difficulty should start around ${startingDifficulty} out of 10 and can vary slightly to provide a balanced test.
    
    If the subject is "Math", calibrate the 1-10 difficulty scale exactly as follows:
    - 1: MATHCOUNTS school/chapter level
    - 5: AMC 12 question 20-ish level
    - 8: Average USAJMO problem level
    - 10: Hardest problems on the IMO
    
    If the subject is "Physics", calibrate the 1-10 difficulty scale exactly as follows:
    - 1: introductory level
    - 3: AP Physics C level
    - 5: F=ma level
    - 8: USAPhO level
    - 10: hardest problem on the IPhO
    
    If the subject is "Chemistry", calibrate the 1-10 difficulty scale exactly as follows:
    - 1: simple Honors/early AP chem
    - 3: harder problems on the ACS Local Exam
    - 5: harder problems on the USNCO Nationals
    - 10: hardest problem on the IChO
    For Chemistry questions, represent organic molecules strictly using SMILES notation (e.g., C(C)O for ethanol, CC(=O)O for acetic acid). Do NOT use introductory or verbose phrases like "represented by the SMILES string..." or "whose SMILES representation is...". Instead, display the SMILES directly and let it render the question inline. Represent inorganic molecules, structures, and reaction equations strictly using LaTeX (e.g., $\\text{H}_2\\text{SO}_4$, $\\text{Fe}^{3+}$).
    
    The output must be a pure JSON array containing exactly ${count} objects, with the following schema for each object:
    {
        "id": "A unique string ID",
        "topic": "The brief sub-category or topic tested (e.g. 'Algebra', 'Stoichiometry', 'Mechanics')",
        "question": "The text of the question. It should be challenging and clear.",
        "type": "multiple_choice" or "short_answer",
        "options": ["Option A", "Option B", "Option C", "Option D"], // Provide ONLY if type is multiple_choice
        "answer": "The exact correct answer string",
        "difficulty": a number between 1 and 10 representing difficulty
    }
    Do not wrap the JSON in markdown code blocks. Return ONLY valid JSON.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                temperature: 0.7,
                thinkingConfig: {
                    thinkingBudget: 1024
                }
            }
        });

        const data = JSON.parse(response.text);
        const questions = Array.isArray(data) ? data : [data];
        if (onQuestion) questions.forEach((q, i) => onQuestion(q, i));
        return questions;
    } catch (error) {
        console.error("Error generating problems:", error);
        throw error;
    }
}
