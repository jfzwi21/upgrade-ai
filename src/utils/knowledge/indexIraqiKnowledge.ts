import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import getEmbedder from "@/utils/Embedder";
import VectorDB from "@/utils/VectorDB";
import { IRAQI_KNOWLEDGE, IRAQI_KNOWLEDGE_VERSION } from "./iraqiKnowledge";

type IraqiWorkspace = {
  slug: string;
  systemPrompt?: string | null;
  isRemote?: boolean;
};

type IndexMarker = {
  version: string;
  vectorIds: number[];
};

const INDEX_KEY_PREFIX = "@upgrade-ai/iraqi-knowledge/";
const VECTOR_DIMENSIONS = 768;
const inFlightIndexes = new Map<string, Promise<boolean>>();

function markerKey(workspaceSlug: string): string {
  return `${INDEX_KEY_PREFIX}${workspaceSlug}`;
}

function parseMarker(value: string | null): IndexMarker | null {
  if (!value) return null;
  try {
    const marker = JSON.parse(value) as Partial<IndexMarker>;
    if (typeof marker.version !== "string" || !Array.isArray(marker.vectorIds))
      return null;
    return {
      version: marker.version,
      vectorIds: marker.vectorIds.map(Number).filter(Number.isFinite),
    };
  } catch {
    return null;
  }
}

/** Iraqi workspaces are identified by their saved Iraqi Arabic system instructions. */
export function isIraqiWorkspace(workspace: IraqiWorkspace): boolean {
  if (workspace.isRemote || !workspace.systemPrompt) return false;
  return /iraqi|عراق|عراقي/i.test(workspace.systemPrompt);
}

/**
 * Add the curated Iraqi Arabic reference to this workspace's local VectorBox index.
 * This is intentionally fire-and-forget friendly: failures are logged and never block chat or
 * workspace loading. The existing Nomic embedder computes vectors on-device; if its model is not
 * present, that embedder follows its existing model-download flow before computing them locally.
 */
export function ensureIraqiKnowledgeIndexed(
  workspace: IraqiWorkspace,
): Promise<boolean> {
  if (
    Platform.OS !== "android" ||
    !workspace.slug ||
    !isIraqiWorkspace(workspace)
  ) {
    return Promise.resolve(false);
  }

  const pending = inFlightIndexes.get(workspace.slug);
  if (pending) return pending;

  const task = indexWorkspace(workspace.slug)
    .catch(error => {
      console.warn(
        "[IraqiKnowledge] Local indexing failed; workspace remains usable.",
        error,
      );
      return false;
    })
    .finally(() => inFlightIndexes.delete(workspace.slug));
  inFlightIndexes.set(workspace.slug, task);
  return task;
}

async function indexWorkspace(workspaceSlug: string): Promise<boolean> {
  const key = markerKey(workspaceSlug);
  const previousMarker = parseMarker(await AsyncStorage.getItem(key));
  if (previousMarker?.version === IRAQI_KNOWLEDGE_VERSION) return true;

  // Replace this feature's old vectors only; preserve documents and other workspace vectors.
  if (previousMarker?.vectorIds.length) {
    await VectorDB.deleteVectorsByIds(previousMarker.vectorIds);
  }

  const embedder = getEmbedder("native");
  const vectors: { embedding: number[]; metadata: object }[] = [];
  for (const record of IRAQI_KNOWLEDGE) {
    const embedding = await embedder.embed(record.content, "embed_document");
    if (!Array.isArray(embedding) || embedding.length !== VECTOR_DIMENSIONS) {
      throw new Error(
        `Expected a ${VECTOR_DIMENSIONS}-dimension local embedding for ${record.id}`,
      );
    }
    vectors.push({
      embedding,
      metadata: {
        content: record.content,
        name: `Iraqi Arabic · ${record.title}`,
        source: "iraqi-knowledge",
        knowledgeId: record.id,
        category: record.category,
      },
    });
  }

  const { ids } = await VectorDB.bulkInsert(workspaceSlug, vectors);
  if (ids.length !== vectors.length) {
    throw new Error(
      `VectorBox stored ${ids.length} of ${vectors.length} Iraqi knowledge entries`,
    );
  }
  await AsyncStorage.setItem(
    key,
    JSON.stringify({ version: IRAQI_KNOWLEDGE_VERSION, vectorIds: ids }),
  );
  return true;
}

/** Call after clearing a workspace's vectors so the next load rebuilds its Iraqi reference index. */
export async function invalidateIraqiKnowledgeIndex(
  workspaceSlug: string,
): Promise<void> {
  const pending = inFlightIndexes.get(workspaceSlug);
  if (pending) await pending;
  await AsyncStorage.removeItem(markerKey(workspaceSlug));
}
