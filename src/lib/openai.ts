import OpenAI from "openai";

let client: OpenAI | null = null;

function getApiKey() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY is missing. Add it to .env and restart `next dev`.",
    );
  }
  return key;
}

/** Lazy client so the key is read at request time, not module-load time. */
export function getOpenAI() {
  if (!client) {
    client = new OpenAI({ apiKey: getApiKey() });
  }
  return client;
}

/** @deprecated Prefer getOpenAI() — kept for existing imports. */
export const openai = new Proxy({} as OpenAI, {
  get(_target, prop, receiver) {
    const instance = getOpenAI();
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export async function getEmbedding(text: string) {
  const response = await getOpenAI().embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
}
