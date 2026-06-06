import { getEmbedding } from "./openai";
import { getPineconeIndex } from "./pinecone";
import { prisma } from "./prisma";
import { getCostControlConfig } from "./env";

export type FinancialMemoryInput = {
  title: string;
  content: string;
  importanceScore: number;
};

type StoreMemoriesOptions = {
  source: string;
  type?: string;
  minImportance?: number;
  limit?: number;
};

export async function storeFinancialMemories(
  userId: string,
  memories: FinancialMemoryInput[],
  options: StoreMemoriesOptions,
): Promise<string[]> {
  const {
    aiDailyMemoryLimit,
    aiMemoryMinImportance,
    enablePineconeMemory,
  } = getCostControlConfig();

  const minImportance = options.minImportance ?? aiMemoryMinImportance;
  const limit = options.limit ?? aiDailyMemoryLimit;
  const memoryType = options.type ?? "AI_GENERATED";

  const memoriesToStore = memories
    .filter((memory) => (memory.importanceScore ?? 0) >= minImportance)
    .slice(0, limit);

  if (memoriesToStore.length === 0) {
    return [];
  }

  const index = enablePineconeMemory ? getPineconeIndex() : null;
  const savedTitles: string[] = [];

  for (const memory of memoriesToStore) {
    const existing = await prisma.financialMemory.findFirst({
      where: {
        userId,
        title: memory.title,
      },
    });

    if (existing) {
      await prisma.financialMemory.update({
        where: { id: existing.id },
        data: {
          content: memory.content,
          importanceScore: Math.max(existing.importanceScore, memory.importanceScore),
          source: options.source,
          type: memoryType,
        },
      });
      savedTitles.push(memory.title);
      continue;
    }

    let vectorId: string | null = null;

    if (index) {
      vectorId = crypto.randomUUID();
      const embedding = await getEmbedding(memory.content);

      try {
        await index.upsert({
          records: [{
            id: vectorId,
            values: embedding,
            metadata: {
              userId,
              content: memory.content,
              type: memoryType,
              createdAt: new Date().toISOString(),
            },
          }],
        });
      } catch (pineconeErr) {
        console.error("Pinecone upsert failed, continuing without it:", pineconeErr);
        vectorId = null;
      }
    }

    await prisma.financialMemory.create({
      data: {
        userId,
        type: memoryType,
        title: memory.title,
        content: memory.content,
        source: options.source,
        importanceScore: memory.importanceScore,
        pineconeVectorId: vectorId,
      },
    });

    savedTitles.push(memory.title);
  }

  return savedTitles;
}
