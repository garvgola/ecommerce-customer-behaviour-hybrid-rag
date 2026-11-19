export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: "GEMINI_API_KEY is not configured. Retrieval will still work, but LLM answer generation is unavailable."
    });
  }

  const body = req.body || {};
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const contexts = Array.isArray(body.contexts) ? body.contexts.slice(0, 5) : [];
  const analysisSummary = typeof body.analysisSummary === "string" ? body.analysisSummary.slice(0, 8000) : "";

  if (!question || question.length > 2000) {
    return res.status(400).json({ error: "A question (up to 2,000 characters) is required." });
  }

  if (!contexts.length && !analysisSummary) {
    return res.status(400).json({ error: "No retrieved evidence or analysis result was provided." });
  }

  const evidence = contexts.map((item, index) => {
    const text = typeof item.text === "string" ? item.text.slice(0, 5000) : "";
    const source = typeof item.source === "string" ? item.source.slice(0, 200) : `Source ${index + 1}`;
    return `[Source ${index + 1}: ${source}]\n${text}`;
  }).join("\n\n");

  const prompt = [
    "You are Commerce Intelligence, an e-commerce knowledge assistant.",
    "Answer only from the evidence and computed analysis supplied below.",
    "Do not invent metrics, dates, products, customer identities, or causes.",
    "When using document excerpts, cite them as [Source 1], [Source 2], etc.",
    "When using calculated results, describe them as computed evidence.",
    "If the evidence is insufficient, say exactly what information is missing.",
    "",
    "USER QUESTION:",
    question,
    "",
    "RETRIEVED DOCUMENT EVIDENCE:",
    evidence || "No document evidence was retrieved.",
    "",
    "COMPUTED DATA ANALYSIS:",
    analysisSummary || "No computed analysis was supplied.",
    "",
    "Provide a concise, useful business answer with caveats where required."
  ].join("\n");

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 900
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(502).json({
        error: data?.error?.message || "The language model request failed."
      });
    }

    const answer = data?.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

    if (!answer) {
      return res.status(502).json({ error: "The model returned an empty response." });
    }

    return res.status(200).json({ answer, model: "gemini-2.5-flash" });
  } catch (error) {
    return res.status(500).json({
      error: "Unable to reach the language model service."
    });
  }
}
