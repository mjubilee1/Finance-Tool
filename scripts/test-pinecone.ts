import "dotenv/config";
import { getPineconeIndex } from "../src/lib/pinecone";
import { getEmbedding } from "../src/lib/openai";

async function main() {
  const index = getPineconeIndex();
  const embedding = await getEmbedding("test");
  console.log("Embedding length:", embedding?.length);
  
  try {
    await index.upsert({ records: [{ id: "test-1", values: embedding }] });
    console.log("Upsert successful");
  } catch (e) {
    console.error("Upsert failed:", e);
  }
}
main();
