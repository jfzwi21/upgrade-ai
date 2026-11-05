import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee, {
  AndroidImportance,
  AuthorizationStatus,
  RepeatFrequency,
  TriggerType,
} from '@notifee/react-native';
import { HfGGUFRepo, HfGGUFSearchResult, fetchGGUFRepo, humanizeRepoName } from '@/utils/api/hfGguf';
import i18n from '@/i18n';

const HUB_MODELS_ENDPOINT = 'https://huggingface.co/api/models';
const TRENDING_CACHE_KEY = '@hfHub:weeklyTrending';
const TRENDING_UPDATED_AT_KEY = '@hfHub:weeklyTrendingUpdatedAt';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const REMINDER_ID = 'hf-weekly-trending-reminder';
const REMINDER_CHANNEL = 'hf-weekly-models';

type HubModel = {
  id?: string;
  modelId?: string;
  author?: string;
  downloads?: number;
  likes?: number;
  gated?: boolean | string;
  pipeline_tag?: string;
};

export type WeeklyTrendingSnapshot = {
  models: HfGGUFSearchResult[];
  refreshedAt: number | null;
  isStale: boolean;
};

function isGated(value: unknown): boolean {
  return value === true || typeof value === 'string';
}

function normalizeModel(item: HubModel): HfGGUFSearchResult | null {
  const id = item.id || item.modelId;
  if (!id || typeof id !== 'string') return null;
  return {
    id,
    author: item.author || id.split('/')[0],
    title: humanizeRepoName(id),
    downloads: item.downloads ?? 0,
    likes: item.likes ?? 0,
    gated: isGated(item.gated),
    pipelineTag: item.pipeline_tag,
  };
}

async function requestModelList(url: string): Promise<HfGGUFSearchResult[]> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch {
    throw new Error('Hugging Face is unavailable. Check your internet connection and try again.');
  }
  if (!response.ok) throw new Error(`Hugging Face returned ${response.status}. Try again later.`);
  const payload = await response.json();
  if (!Array.isArray(payload)) throw new Error('Hugging Face returned an invalid model list.');
  return (payload as HubModel[]).map(normalizeModel).filter((model): model is HfGGUFSearchResult => !!model);
}

class HFHubService {
  private trendingRequest: Promise<WeeklyTrendingSnapshot> | null = null;

  /** Searches public Hub repositories tagged as GGUF. */
  async searchGGUFModels(query: string, limit = 20): Promise<HfGGUFSearchResult[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return [];
    const url = `${HUB_MODELS_ENDPOINT}?search=${encodeURIComponent(normalizedQuery)}&filter=gguf&limit=${limit}`;
    return requestModelList(url);
  }

  /** Fetches Hugging Face's current trending GGUF repositories, capped at ten. */
  async fetchTrendingGGUFModels(): Promise<HfGGUFSearchResult[]> {
    // The live Hub API rejects sort=trending (HTTP 400); trendingScore is its supported property key.
    return requestModelList(`${HUB_MODELS_ENDPOINT}?filter=gguf&sort=trendingScore&limit=10`);
  }

  /** Reads repository metadata and lists supported GGUF files and quantizations. */
  async fetchGGUFDetails(repoId: string): Promise<HfGGUFRepo> {
    return fetchGGUFRepo(repoId);
  }

  /**
   * Refreshes the on-device cache no more than once every seven days unless forced.
   * The refresh runs when the app is opened; the OS is not asked to run network code in the background.
   */
  async getWeeklyTrendingModels(force = false): Promise<WeeklyTrendingSnapshot> {
    const [cachedValue, timestampValue] = await Promise.all([
      AsyncStorage.getItem(TRENDING_CACHE_KEY),
      AsyncStorage.getItem(TRENDING_UPDATED_AT_KEY),
    ]);
    const cachedModels = this.parseCachedModels(cachedValue);
    const refreshedAt = timestampValue ? Number(timestampValue) : null;
    const isFresh = refreshedAt !== null && Date.now() - refreshedAt < WEEK_MS;
    if (!force && cachedModels.length && isFresh) {
      return { models: cachedModels, refreshedAt, isStale: false };
    }
    if (this.trendingRequest) return this.trendingRequest;

    this.trendingRequest = (async () => {
      try {
        const models = await this.fetchTrendingGGUFModels();
        const updatedAt = Date.now();
        await Promise.all([
          AsyncStorage.setItem(TRENDING_CACHE_KEY, JSON.stringify(models)),
          AsyncStorage.setItem(TRENDING_UPDATED_AT_KEY, String(updatedAt)),
        ]);
        return { models, refreshedAt: updatedAt, isStale: false };
      } catch (error) {
        if (cachedModels.length) return { models: cachedModels, refreshedAt, isStale: true };
        throw error;
      } finally {
        this.trendingRequest = null;
      }
    })();
    return this.trendingRequest;
  }

  /** Schedules a repeating Monday reminder when notification permission is already available. */
  async scheduleWeeklyReminder(): Promise<void> {
    try {
      const settings = await notifee.getNotificationSettings();
      if (settings.authorizationStatus !== AuthorizationStatus.AUTHORIZED) return;
      const channelId = await notifee.createChannel({
        id: REMINDER_CHANNEL,
        name: i18n.t('model_explorer.reminder_channel'),
        importance: AndroidImportance.DEFAULT,
      });
      const now = new Date();
      const nextMonday = new Date(now);
      const daysUntilMonday = (8 - now.getDay()) % 7;
      nextMonday.setDate(now.getDate() + daysUntilMonday);
      nextMonday.setHours(10, 0, 0, 0);
      if (nextMonday.getTime() <= now.getTime()) nextMonday.setDate(nextMonday.getDate() + 7);
      await notifee.cancelTriggerNotification(REMINDER_ID);
      await notifee.createTriggerNotification(
        {
          id: REMINDER_ID,
          title: i18n.t('model_explorer.reminder_title'),
          body: i18n.t('model_explorer.reminder_body'),
          data: { screen: 'ModelExplorer' },
          android: {
            channelId,
            pressAction: { id: 'default' },
          },
          ios: { sound: 'default' },
        },
        {
          type: TriggerType.TIMESTAMP,
          timestamp: nextMonday.getTime(),
          repeatFrequency: RepeatFrequency.WEEKLY,
        },
      );
    } catch (error) {
      // Notification scheduling is optional; it must never block model discovery.
      console.warn('[HFHubService] Could not schedule the weekly reminder:', error);
    }
  }

  private parseCachedModels(value: string | null): HfGGUFSearchResult[] {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((model): model is HfGGUFSearchResult =>
        !!model && typeof model.id === 'string' && typeof model.title === 'string',
      );
    } catch {
      return [];
    }
  }
}

export default new HFHubService();
