const JSON_HEADERS = { "Content-Type": "application/json" };

function extractOpenAIContent(payload) {
  return payload?.choices?.[0]?.message?.content || "";
}

function extractAnthropicContent(payload) {
  const block = Array.isArray(payload?.content) ? payload.content.find((item) => item?.type === "text") : null;
  return block?.text || "";
}

function extractGoogleContent(payload) {
  return payload?.candidates?.[0]?.content?.parts?.map((part) => part?.text || "").join("\n") || "";
}

function extractGrokContent(payload) {
  return payload?.choices?.[0]?.message?.content || "";
}

async function postJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.error?.message || payload?.error || payload?.message || "Provider request failed.";
    const error = new Error(message);
    error.statusCode = response.status;
    throw error;
  }

  return payload;
}

export function getEnabledProviders() {
  return {
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY),
    google: Boolean(process.env.GOOGLE_API_KEY),
    grok: Boolean(process.env.XAI_API_KEY),
    ollama: true,
  };
}

export async function runCloudProvider({ provider, model, systemPrompt, userInput }) {
  if (provider === "anthropic") {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured.");

    const payload = await postJson("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        ...JSON_HEADERS,
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1200,
        system: systemPrompt,
        messages: [{ role: "user", content: userInput }],
      }),
    });

    return extractAnthropicContent(payload);
  }

  if (provider === "openai") {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured.");

    const payload = await postJson("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        ...JSON_HEADERS,
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userInput },
        ],
      }),
    });

    return extractOpenAIContent(payload);
  }

  if (provider === "google") {
    if (!process.env.GOOGLE_API_KEY) throw new Error("GOOGLE_API_KEY is not configured.");

    const payload = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: {
        ...JSON_HEADERS,
        "x-goog-api-key": process.env.GOOGLE_API_KEY,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            parts: [{ text: userInput }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
        },
      }),
    });

    return extractGoogleContent(payload);
  }

  if (provider === "grok") {
    if (!process.env.XAI_API_KEY) throw new Error("XAI_API_KEY is not configured.");

    const payload = await postJson("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        ...JSON_HEADERS,
        Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userInput },
        ],
      }),
    });

    return extractGrokContent(payload);
  }

  throw new Error("Unsupported cloud provider.");
}
