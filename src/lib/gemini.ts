import { GoogleGenAI } from "@google/genai";

// Note: GEMINI_API_KEY is injected by the platform
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function summarizeNote(content: string) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Please summarize the following note content in a clean, concise bullet-point format:\n\n${content}`,
    config: {
      systemInstruction: "You are a helpful AI assistant that summarizes notes. Provide concise, high-value bullet points. Maintain a professional yet friendly tone.",
    },
  });
  return response.text;
}

export async function* summarizeNoteStream(content: string) {
  const response = await ai.models.generateContentStream({
    model: "gemini-3-flash-preview",
    contents: `Please summarize the following note content in a clean, concise bullet-point format:\n\n${content}`,
    config: {
      systemInstruction: "You are a helpful AI assistant that summarizes notes. Provide concise, high-value bullet points. Maintain a professional yet friendly tone.",
    },
  });

  for await (const chunk of response) {
    if (chunk.text) {
      yield chunk.text;
    }
  }
}

export async function generateNoteFromPrompt(prompt: string) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Convert the following prompt into a well-structured note with a title and content:\n\nPrompt: ${prompt}`,
    config: {
      systemInstruction: "You are an expert note-taker. When a user gives you a prompt, create a structured note with a clear title and organized body content. Format your output as a JSON-like object with 'title' and 'content' fields, but just provide the text if it's easier to read as markdown.",
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          content: { type: "STRING" }
        },
        required: ["title", "content"]
      }
    },
  });
  
  try {
    return JSON.parse(response.text);
  } catch (e) {
    // Fallback if JSON parsing fails
    const text = response.text;
    const lines = text.split("\n");
    return {
      title: lines[0].replace(/^#\s*/, "").trim() || "Untitled Note",
      content: lines.slice(1).join("\n").trim()
    };
  }
}

export async function startNoteChat() {
  const chat = ai.chats.create({
    model: "gemini-3-flash-preview",
    config: {
      systemInstruction: "You are My Journal Assistant, a smart note and journaling assistant. Help the user brainstorm reflections and refine notes in a conversational way. When the user is ready to save, suggest a title and a structured body for the entry.",
    },
  });
  return chat;
}
