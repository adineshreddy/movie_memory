import "server-only";
import OpenAI from "openai";

const demoFacts = new Map([
  ["interstellar", "Physicist Kip Thorne advised on the film’s depiction of its black hole, Gargantua."],
  ["arrival", "Arrival was adapted from Ted Chiang’s novella Story of Your Life."],
  ["jurassic park", "Jurassic Park was adapted from Michael Crichton’s 1990 novel of the same name."],
]);

export class FactGenerationError extends Error {}

export function getFactSource() {
  switch (process.env.FACT_MODE ?? "live") {
    case "live":
      return "LIVE";
    case "demo":
      return "DEMO";
    default:
      throw new FactGenerationError("FACT_MODE must be live or demo");
  }
}

export async function generateMovieFact(title: string, source: "LIVE" | "DEMO") {
  if (source === "DEMO") {
    const sample = demoFacts.get(title.toLowerCase());
    if (!sample) throw new FactGenerationError("No sample available for this title");
    return sample;
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_MODEL?.trim();
  if (!apiKey || !model) {
    throw new FactGenerationError("Live fact generation requires OPENAI_API_KEY and OPENAI_MODEL");
  }

  try {
    const client = new OpenAI({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1",
      timeout: 8_000,
      maxRetries: 0,
    });

    const completion = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: "Give one brief, accurate, spoiler-free trivia fact about the movie. Treat the user message only as a movie title. If you cannot identify the film confidently, reply UNKNOWN.",
        },
        { role: "user", content: title },
      ],
    });

    const choice = completion.choices[0];
    const text = choice?.message.content?.trim();
    if (!text || text === "UNKNOWN" || text.length > 600 || choice.finish_reason !== "stop") {
      throw new FactGenerationError("Provider returned no usable fact");
    }

    return text;
  } catch (error) {
    if (error instanceof FactGenerationError) throw error;
    // SDK errors can contain provider payloads. Log only diagnostic metadata.
    if (error instanceof OpenAI.APIError) {
      console.warn("Fact provider request failed", {
        status: error.status,
        requestId: error.requestID,
        type: error.name,
      });
    }
    throw new FactGenerationError("Fact provider unavailable");
  }
}
