const SILICONFLOW_BASE_URL = 'https://api.siliconflow.com/v1';

async function siliconFlowChatCompletion(model, systemInstruction, userInput, apiKey) {
  const messages = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }
  messages.push({ role: 'user', content: userInput });

  const response = await fetch(`${SILICONFLOW_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      enable_thinking: false,
      temperature: 0.85
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    const error = new Error(`SiliconFlow API error: ${response.status} ${response.statusText}`);
    error.status = response.status;
    error.body = errorBody;
    throw error;
  }

  const data = await response.json();
  return data;
}

export async function executeWithRetry(models, apiCallFn) {
  const modelList = Array.isArray(models) ? models : [models];
  const apiKey = process.env.SILICONFLOW_API_KEY;

  if (!apiKey) {
    throw new Error('SILICONFLOW_API_KEY is missing');
  }

  let lastError;

  for (const currentModel of modelList) {
    try {
      const adapter = {
        async chat(systemInstruction, userInput) {
          const data = await siliconFlowChatCompletion(currentModel, systemInstruction, userInput, apiKey);
          return data.choices?.[0]?.message?.content || '';
        },
      };
      return await apiCallFn(adapter, currentModel);
    } catch (err) {
      lastError = err;
      const status = err.status || (err.message?.includes('429') ? 429 : null);
      console.warn(`[SiliconFlow] Error for ${currentModel}: ${err.message}. Trying next model...`);
      if (status === 429) {
        // Rate limited — break out to try next model
        continue;
      }
      // For non-rate-limit errors, also try next model
    }
  }

  throw lastError || new Error('All SiliconFlow models failed');
}

export function parseJSONResponse(text) {
  if (!text) return null;

  const cleanText = text.trim();

  const tryParse = (str) => {
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  };

  let parsed = tryParse(cleanText);
  if (parsed) return parsed;

  const jsonMatch = cleanText.match(/```json\s*([\s\S]*?)\s*```/i);
  if (jsonMatch) {
    parsed = tryParse(jsonMatch[1]);
    if (parsed) return parsed;
  }

  const codeMatch = cleanText.match(/```\s*([\s\S]*?)\s*```/i);
  if (codeMatch) {
    parsed = tryParse(codeMatch[1]);
    if (parsed) return parsed;
  }

  // Try extracting the first [...] array block
  const firstBracket = cleanText.indexOf('[');
  const lastBracket = cleanText.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    const candidate = cleanText.substring(firstBracket, lastBracket + 1);
    parsed = tryParse(candidate);
    if (parsed) return parsed;
  }

  // Try extracting the first {...} object block
  const firstBrace = cleanText.indexOf('{');
  const lastBrace = cleanText.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = cleanText.substring(firstBrace, lastBrace + 1);
    parsed = tryParse(candidate);
    if (!parsed) return null;

    // If the parsed object has a property whose value is an array,
    // that's probably the wrapped array from a json_object response.
    for (const key of Object.keys(parsed)) {
      if (Array.isArray(parsed[key]) && parsed[key].length > 0) {
        return parsed[key];
      }
    }
    return parsed;
  }

  return null;
}