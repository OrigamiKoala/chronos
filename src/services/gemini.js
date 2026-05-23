import { GoogleGenAI } from '@google/genai';

const apiKey = import.meta.env.GEMINI_API_KEY;

let ai;
if (apiKey) {
    ai = new GoogleGenAI({ apiKey });
} else {
    console.warn("GEMINI_API_KEY is not set. Problem generation will fail unless set.");
}

export async function generateProblem(difficultyLevel, subject = "Math and Logic") {
    if (!ai) {
        // Fallback for missing API key to allow UI testing
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
    You are an expert examiner creating questions for high-stakes competitive exams (e.g., Olympiad, advanced STEM).
    Generate a single ${subject} problem with a difficulty level of ${difficultyLevel} out of 10.
    
    The output must be pure JSON with the following schema:
    {
        "id": "A unique string ID",
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
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                temperature: 0.7
            }
        });
        
        return JSON.parse(response.text);
    } catch (error) {
        console.error("Error generating problem:", error);
        throw error;
    }
}
