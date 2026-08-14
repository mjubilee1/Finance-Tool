export const CHAT_MODELS = [
  {
    id: "gpt-5",
    label: "GPT-5",
    description: "Best reasoning",
  },
  {
    id: "gpt-5-mini",
    label: "GPT-5 mini",
    description: "Faster replies",
  },
] as const;

export type ChatModelId = (typeof CHAT_MODELS)[number]["id"];

export const DEFAULT_CHAT_MODEL: ChatModelId = "gpt-5";
export const CHAT_MODEL_STORAGE_KEY = "life-os-coach-model";

export function isChatModelId(value: unknown): value is ChatModelId {
  return CHAT_MODELS.some((model) => model.id === value);
}

export function resolveChatModel(value: unknown): ChatModelId {
  return isChatModelId(value) ? value : DEFAULT_CHAT_MODEL;
}
