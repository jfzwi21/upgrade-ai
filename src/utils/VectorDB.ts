import { NativeModules } from 'react-native';
import { SafeModeService } from '@/services/selfHealing/SafeModeService';

interface VectorEntity {
  id: number;
  embedding: number[];
  metadata?: string;
  workspaceSlug?: string;
}

export type SemanticSearchResult = {
  id: number;
  metadata: { content?: string; [key: string]: any };
  score: number;
};

interface VectorBoxInterface {
  insert(workspaceSlug: string, embedding: number[], metadata?: string): Promise<number>;
  bulkInsert(workspaceSlug: string, embeddings: { embedding: number[]; metadata: string }[]): Promise<number[]>;
  get(id: number): Promise<VectorEntity>;
  update(id: number, embedding: number[], metadata?: string): Promise<boolean>;
  remove(id: number): Promise<boolean>;
  getCount(): Promise<number>;
  workspaceVectorCount(workspaceSlug: string): Promise<number>;
  resetVectorsForWorkspace(workspaceSlug: string): Promise<boolean>;
  semanticSearch(
    workspaceSlug: string,
    queryVector: number[],
    topN: number,
  ): Promise<{ id: number; metadata: string; score: number }[]>;
  deleteVectorsByIds(ids: number[]): Promise<boolean>;
  reset(): Promise<boolean>;
}

export class SafeModeRestrictionError extends Error {
  constructor(feature: string) {
    super(`${feature} is disabled while Safe Mode is active.`);
    this.name = 'SafeModeRestrictionError';
  }
}

/**
 * ObjectBox is opened only when a non-safe-mode operation first requests it. The
 * former module-level NativeModules.VectorBox lookup instantiated its Android
 * module during import, before the Safe Mode gate could run.
 */
class VectorDB {
  private static instance: VectorDB;

  constructor() {
    if (VectorDB.instance) return VectorDB.instance;
    VectorDB.instance = this;
  }

  private get vectorBox(): VectorBoxInterface {
    if (SafeModeService.isEnabled()) throw new SafeModeRestrictionError('VectorDB');
    const vectorBox = NativeModules.VectorBox as VectorBoxInterface | undefined;
    if (!vectorBox) throw new Error('VectorBox native module is unavailable on this platform.');
    return vectorBox;
  }

  async getVectorCount(): Promise<number> {
    if (SafeModeService.isEnabled()) return 0;
    try {
      return await this.vectorBox.getCount();
    } catch (error) {
      console.error('Error getting vector count:', error);
      throw error;
    }
  }

  async getWorkspaceVectorCount(workspaceSlug: string): Promise<number> {
    if (SafeModeService.isEnabled()) return 0;
    try {
      return await this.vectorBox.workspaceVectorCount(workspaceSlug);
    } catch (error) {
      console.error('Error getting workspace vector count:', error);
      throw error;
    }
  }

  /** Insert one vector. Safe Mode rejects writes rather than silently claiming indexing succeeded. */
  async insertVector(workspaceSlug: string, embedding: number[], metadata: object = {}): Promise<number> {
    if (SafeModeService.isEnabled()) throw new SafeModeRestrictionError('Vector insertion');
    try {
      return await this.vectorBox.insert(workspaceSlug, embedding, JSON.stringify(metadata));
    } catch (error) {
      console.error('Error inserting vector:', error);
      throw error;
    }
  }

  /** Bulk insert vectors; the metadata is serialized before crossing the native bridge. */
  async bulkInsert(
    workspaceSlug: string,
    vectors: { embedding: number[]; metadata: object }[],
  ): Promise<{ count: number; ids: number[] }> {
    if (SafeModeService.isEnabled()) throw new SafeModeRestrictionError('Vector insertion');
    try {
      if (vectors.length === 0) return { count: 0, ids: [] };
      if (!vectors.every(vector => vector.embedding && vector.embedding.length > 0 && vector.metadata)) {
        throw new Error('Invalid vector schema');
      }

      const preparedVectors = vectors.map(vector => ({
        embedding: vector.embedding,
        metadata: typeof vector.metadata === 'string' ? vector.metadata : JSON.stringify(vector.metadata),
      }));
      const result = await this.vectorBox.bulkInsert(workspaceSlug, preparedVectors);
      return { count: result.length, ids: result };
    } catch (error) {
      console.error('Error inserting vectors:', error);
      throw error;
    }
  }

  /** Searches are skipped in Safe Mode so chat can continue without RAG retrieval. */
  async runSemanticSearch(
    workspaceSlug: string,
    queryVector: number[],
    topN: number = 2,
  ): Promise<SemanticSearchResult[]> {
    if (SafeModeService.isEnabled()) return [];
    try {
      const results = await this.vectorBox.semanticSearch(workspaceSlug, queryVector, topN);
      return results.map(result => ({
        id: result.id,
        metadata: JSON.parse(result.metadata),
        score: result.score,
      }));
    } catch (error) {
      console.error('Error running semantic search:', error);
      throw error;
    }
  }

  async resetVectorsForWorkspace(workspaceSlug: string): Promise<boolean> {
    if (SafeModeService.isEnabled()) return false;
    try {
      return await this.vectorBox.resetVectorsForWorkspace(workspaceSlug);
    } catch (error) {
      console.error('Error resetting vectors:', error);
      throw error;
    }
  }

  async deleteVectorsByIds(ids: number[]): Promise<boolean> {
    if (SafeModeService.isEnabled()) return false;
    try {
      return await this.vectorBox.deleteVectorsByIds(ids);
    } catch (error) {
      console.error('Error deleting vectors:', error);
      throw error;
    }
  }

  async reset(): Promise<boolean> {
    if (SafeModeService.isEnabled()) return false;
    try {
      return await this.vectorBox.reset();
    } catch (error) {
      console.error('Error deleting vectors:', error);
      throw error;
    }
  }
}

export default new VectorDB();
