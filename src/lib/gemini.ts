const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

if (!apiKey) {
  throw new Error("Missing VITE_GEMINI_API_KEY in environment variables");
}

// ---------------- CORE API CALL ----------------
async function callGemini(prompt: string) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
      }),
    }
  );

  const data = await res.json();

  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// ---------------- FUNCTIONS ----------------

export async function summarizeNote(content: string) {
  const text = await callGemini(
    `Please summarize the following note in clean bullet points:\n\n${content}`
  );

  return text;
}

export async function generateNoteFromPrompt(prompt: string) {
  const text = await callGemini(
    `Convert this into a structured note with title and content:\n\n${prompt}`
  );

  const lines = text.split("\n");

  return {
    title: lines[0]?.replace(/^#\s*/, "").trim() || "Untitled Note",
    content: lines.slice(1).join("\n").trim() || text,
  };
}

// ---------------- SIMPLE CHAT ----------------

export async function startNoteChat() {
  let history: any[] = [];

  return {
    send: async (message: string) => {
      history.push({
        role: "user",
        parts: [{ text: message }],
      });

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ contents: history }),
        }
      );

      const data = await res.json();

      const reply =
        data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

      history.push({
        role: "model",
        parts: [{ text: reply }],
      });

      return reply;
    },
  };
}