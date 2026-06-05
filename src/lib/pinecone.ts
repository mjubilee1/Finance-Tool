import { Pinecone } from "@pinecone-database/pinecone";

const apiKey = process.env.PINECONE_API_KEY || "";

export const pinecone = new Pinecone({
  apiKey,
});

export const getPineconeIndex = () => {
  return pinecone.Index(process.env.PINECONE_INDEX_NAME || "daily-financial-memory");
};
