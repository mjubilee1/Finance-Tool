import { prisma } from "@/lib/prisma";

export type RelevantMemory = {
  title: string;
  content: string;
  type: string;
  importanceScore: number;
  updatedAt: string;
};

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "been",
  "could",
  "from",
  "have",
  "into",
  "just",
  "more",
  "should",
  "that",
  "their",
  "them",
  "then",
  "there",
  "they",
  "this",
  "today",
  "want",
  "what",
  "when",
  "where",
  "which",
  "with",
  "would",
  "your",
]);

function tokens(value: string) {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)),
  );
}

/**
 * Lightweight query-aware recall for coach and Growth prompts.
 * It keeps core context present while ranking user memories by message overlap,
 * importance, and recency. This works even when Pinecone is disabled.
 */
export async function loadRelevantMemories(
  userId: string,
  query: string,
  options?: { limit?: number; candidateLimit?: number },
): Promise<RelevantMemory[]> {
  const limit = options?.limit ?? 8;
  const candidateLimit = Math.max(limit, options?.candidateLimit ?? 50);
  const queryTokens = tokens(query);
  const now = Date.now();

  const select = {
    title: true,
    content: true,
    type: true,
    importanceScore: true,
    updatedAt: true,
  } as const;
  const [important, recent] = await Promise.all([
    prisma.financialMemory.findMany({
      where: { userId },
      orderBy: [{ importanceScore: "desc" }, { updatedAt: "desc" }],
      take: Math.ceil(candidateLimit / 2),
      select,
    }),
    prisma.financialMemory.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: Math.ceil(candidateLimit / 2),
      select,
    }),
  ]);
  const candidates = [
    ...new Map(
      [...important, ...recent].map((memory) => [
        `${memory.type}:${memory.title}:${memory.updatedAt.toISOString()}`,
        memory,
      ]),
    ).values(),
  ];

  return candidates
    .map((memory) => {
      const titleTokens = tokens(memory.title);
      const contentTokens = tokens(memory.content);
      let overlap = 0;
      for (const token of queryTokens) {
        if (titleTokens.has(token)) overlap += 4;
        else if (contentTokens.has(token)) overlap += 1;
      }

      const ageDays = Math.max(0, (now - memory.updatedAt.getTime()) / 86_400_000);
      const recency = Math.max(0, 3 - ageDays / 30);
      const coreBonus = memory.type === "CORE_CONTEXT" ? 5 : 0;

      return {
        memory,
        score: overlap + memory.importanceScore * 0.7 + recency + coreBonus,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ memory }) => ({
      ...memory,
      updatedAt: memory.updatedAt.toISOString(),
    }));
}
