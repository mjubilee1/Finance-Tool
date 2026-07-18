import "server-only";

import { Pinecone } from "@pinecone-database/pinecone";

let client: Pinecone | null = null;

function getApiKey() {
  const key = process.env.PINECONE_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "PINECONE_API_KEY is missing. Add it to the environment and restart the server.",
    );
  }
  return key;
}

/** Lazy client so Next build can collect route data without a Pinecone key. */
export function getPinecone() {
  if (!client) {
    client = new Pinecone({ apiKey: getApiKey() });
  }
  return client;
}

export const getPineconeIndex = () => {
  return getPinecone().Index(process.env.PINECONE_INDEX_NAME || "daily-financial-memory");
};
