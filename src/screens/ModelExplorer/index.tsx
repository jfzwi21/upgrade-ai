import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  I18nManager,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft, ArrowSquareOut, ArrowsClockwise, CheckCircle, DownloadSimple, Lock, MagnifyingGlass } from 'phosphor-react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';
import SafeView from '@/components/SafeView';
import useRedirect from '@/hooks/useRedirect';
import useLLMPreference from '@/hooks/useLLMPreference';
import useModelManager from '@/hooks/useModelManager';
import HFHubService, { WeeklyTrendingSnapshot } from '@/services/HFHubService';
import ModelDownloadManager, { type ModelDownloadProgress } from '@/services/ModelDownloadManager';
import { buildImportedModel, importedModelId } from '@/utils/models/imported';
import { resolveDestinationPathFromGGUFUrl } from '@/utils/models/defaults';
import { formatBytes, formatNumber } from '@/utils/formatters';
import type { HfGGUFRepo, HfGGUFSearchResult } from '@/utils/api/hfGguf';
import { showToast } from '@/utils/Notification';
import { PATHS } from '@/utils/paths';
import { useTranslation } from 'react-i18next';

const ACCENT = '#E11D48';
const BACKGROUND = '#0A0A0A';
const CARD = '#171719';

type DownloadState = ModelDownloadProgress & { modelId: string; name: string };

export default function ModelExplorer() {
  useRedirect();
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { llmPreferences, LLMProvider, fetchLLMPreference } = useLLMPreference();
  const { runPreDownloadConfirmations } = useModelManager({ llmPreferences, LLMProvider, fetchLLMPreference });
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<HfGGUFSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [searchRetry, setSearchRetry] = useState(0);
  const [snapshot, setSnapshot] = useState<WeeklyTrendingSnapshot | null>(null);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [trendingError, setTrendingError] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<HfGGUFSearchResult | null>(null);
  const [repoDetails, setRepoDetails] = useState<HfGGUFRepo | null>(null);
  const [repoLoading, setRepoLoading] = useState(false);
  const [repoError, setRepoError] = useState(false);
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
  const [activeDownload, setActiveDownload] = useState<DownloadState | null>(null);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const searchRequest = useRef(0);

  const refreshTrending = async (force = false) => {
    setTrendingLoading(true);
    setTrendingError(false);
    try {
      const next = await HFHubService.getWeeklyTrendingModels(force);
      setSnapshot(next);
      setTrendingError(false);
    } catch {
      setTrendingError(true);
    } finally {
      setTrendingLoading(false);
    }
  };

  useEffect(() => {
    refreshTrending();
  }, []);

  useEffect(() => {
    const value = query.trim();
    const requestId = ++searchRequest.current;
    if (!value) {
      setSearchResults([]);
      setSearchError(false);
      setSearching(false);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError(false);
      try {
        const results = await HFHubService.searchGGUFModels(value);
        if (requestId === searchRequest.current) setSearchResults(results);
      } catch {
        if (requestId === searchRequest.current) setSearchError(true);
      } finally {
        if (requestId === searchRequest.current) setSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [query, searchRetry]);

  const openRepository = async (model: HfGGUFSearchResult) => {
    setSelectedRepo(model);
    setRepoDetails(null);
    setRepoError(false);
    setRepoLoading(true);
    setNotice(null);
    try {
      const details = await HFHubService.fetchGGUFDetails(model.id);
      setRepoDetails(details);
      const statuses = await Promise.all(details.quants.map(async quant => {
        const modelId = importedModelId(details.repo.id, quant.filename);
        const path = resolveDestinationPathFromGGUFUrl(quant.downloadUrl);
        return [modelId, await RNFS.exists(path)] as const;
      }));
      setInstalledIds(previous => {
        const next = new Set(previous);
        statuses.forEach(([modelId, installed]) => installed ? next.add(modelId) : next.delete(modelId));
        return next;
      });
    } catch {
      setRepoError(true);
    } finally {
      setRepoLoading(false);
    }
  };

  const goBack = () => {
    if (selectedRepo) {
      setSelectedRepo(null);
      setRepoDetails(null);
      setNotice(null);
      return;
    }
    navigation.reset({ index: 0, routes: [{ name: PATHS.home }] });
  };

  const downloadQuant = async (quantIndex: number) => {
    if (!repoDetails || !selectedRepo || activeDownload) return;
    const quant = repoDetails.quants[quantIndex];
    if (!quant || repoDetails.repo.gated) return;
    const model = buildImportedModel(repoDetails.repo, quant);
    const modelId = model.modelId;
    if (installedIds.has(modelId)) return;
    const approved = await runPreDownloadConfirmations({
      id: modelId,
      modelId,
      name: model.name,
      size: model.size,
      downloadUrl: model.downloadUrl,
    });
    if (!approved) return;

    setNotice(null);
    setActiveDownload({ modelId, name: model.name, bytesDownloaded: 0, bytesTotal: quant.size, progress: 0 });
    try {
      await ModelDownloadManager.download(model, progress => {
        setActiveDownload({ ...progress, modelId, name: model.name });
      });
      setInstalledIds(previous => new Set(previous).add(modelId));
      setNotice({ kind: 'success', text: t('model_explorer.download_complete') });
      showToast(t('model_explorer.download_complete'));
    } catch (error) {
      const cancelled = error instanceof Error && error.message === 'DOWNLOAD_CANCELLED';
      setNotice({
        kind: cancelled ? 'error' : 'error',
        text: cancelled ? t('model_explorer.download_cancelled') : t('model_explorer.download_failed'),
      });
    } finally {
      setActiveDownload(null);
    }
  };

  const currentModels = query.trim() ? searchResults : (snapshot?.models || []);
  const isLoadingList = query.trim() ? searching : trendingLoading;
  const listError = query.trim() ? searchError : trendingError;

  return (
    <SafeView
      scrollable={false}
      safeAreaClassNames="pt-[12px]"
      containerClassNames="flex-1"
      safeAreaStyle={{ backgroundColor: BACKGROUND }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 10, gap: 12 }}>
        <TouchableOpacity onPress={goBack} accessibilityRole="button" accessibilityLabel={t('model_explorer.back')} style={{ padding: 7 }}>
          <ArrowLeft size={22} color="#FFFFFF" weight="bold" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 21, fontWeight: '700' }}>{t('model_explorer.title')}</Text>
          <Text style={{ color: '#A4A4A8', fontSize: 12, marginTop: 2 }}>{t('model_explorer.subtitle')}</Text>
        </View>
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 8, paddingBottom: 36, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1D', borderRadius: 12, borderWidth: 1, borderColor: '#303034', paddingHorizontal: 12, gap: 9 }}>
          <MagnifyingGlass size={19} color="#B7B7BC" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('model_explorer.search_placeholder')}
            placeholderTextColor="#7C7C82"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel={t('model_explorer.search_placeholder')}
            style={{ flex: 1, minHeight: 48, color: '#FFFFFF', textAlign: I18nManager.isRTL ? 'right' : 'left' }}
          />
        </View>

        {selectedRepo ? (
          <RepositoryDetails
            model={selectedRepo}
            details={repoDetails}
            isLoading={repoLoading}
            hasError={repoError}
            activeDownload={activeDownload}
            installedIds={installedIds}
            notice={notice}
            onBack={() => { setSelectedRepo(null); setRepoDetails(null); setNotice(null); }}
            onRetry={() => { openRepository(selectedRepo); }}
            onDownload={downloadQuant}
            onCancelDownload={modelId => { ModelDownloadManager.cancel(modelId); }}
            t={t}
          />
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '700' }}>
                  {query.trim() ? t('model_explorer.search_results_title') : t('model_explorer.trending_title')}
                </Text>
                {!query.trim() && (
                  <Text style={{ color: '#A4A4A8', fontSize: 12, marginTop: 3 }}>
                    {snapshot?.refreshedAt
                      ? t('model_explorer.updated', { date: new Date(snapshot.refreshedAt).toLocaleDateString() })
                      : t('model_explorer.weekly_refresh')}
                  </Text>
                )}
              </View>
              {!query.trim() && (
                <TouchableOpacity
                  onPress={() => { refreshTrending(true); }}
                  disabled={trendingLoading}
                  accessibilityRole="button"
                  accessibilityLabel={t('model_explorer.refresh')}
                  style={{ padding: 9, backgroundColor: '#261117', borderRadius: 10 }}>
                  {trendingLoading
                    ? <ActivityIndicator size="small" color={ACCENT} />
                  : <ArrowsClockwise size={18} color={ACCENT} weight="bold" />}
                </TouchableOpacity>
              )}
            </View>
            {snapshot?.isStale && !query.trim() && (
              <View style={{ backgroundColor: '#261D10', padding: 11, borderRadius: 9 }}>
                <Text style={{ color: '#F1C77A', fontSize: 12 }}>{t('model_explorer.cached_offline')}</Text>
              </View>
            )}
            {isLoadingList && (
              <View style={{ paddingVertical: 28, alignItems: 'center', gap: 9 }}>
                <ActivityIndicator color={ACCENT} />
                <Text style={{ color: '#A4A4A8', fontSize: 13 }}>{t('model_explorer.loading')}</Text>
              </View>
            )}
            {!isLoadingList && listError && (
              <View style={{ backgroundColor: '#261117', borderRadius: 12, padding: 14, gap: 10 }}>
                <Text style={{ color: '#F4B6C2', fontSize: 13 }}>{t('model_explorer.load_error')}</Text>
                <TouchableOpacity onPress={() => {
                  if (query.trim()) setSearchRetry(retry => retry + 1);
                  else refreshTrending(true);
                }}>
                  <Text style={{ color: '#FF6B8B', fontWeight: '700' }}>{t('model_explorer.retry')}</Text>
                </TouchableOpacity>
              </View>
            )}
            {!isLoadingList && !listError && currentModels.length === 0 && (
              <View style={{ paddingVertical: 24, alignItems: 'center', gap: 8 }}>
                <Text style={{ color: '#E7E7EA', fontSize: 14, textAlign: 'center' }}>
                  {query.trim() ? t('model_explorer.no_results') : t('model_explorer.no_trending')}
                </Text>
              </View>
            )}
            {currentModels.map(model => (
              <ModelResultCard key={model.id} model={model} onPress={() => { openRepository(model); }} t={t} />
            ))}
          </>
        )}
      </ScrollView>
    </SafeView>
  );
}

function ModelResultCard({
  model,
  onPress,
  t,
}: {
  model: HfGGUFSearchResult;
  onPress: () => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      style={{ backgroundColor: CARD, borderColor: '#303034', borderWidth: 1, borderRadius: 13, padding: 14, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: '#32121C', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#FF6688', fontSize: 17, fontWeight: '800' }}>GG</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>{model.title}</Text>
          <Text numberOfLines={1} style={{ color: '#A4A4A8', fontSize: 11, marginTop: 2 }}>{model.id}</Text>
        </View>
        {model.gated
          ? <Lock size={17} color="#E7B85E" weight="bold" />
          : <ArrowSquareOut size={17} color="#9B9BA1" />}
      </View>
      <Text style={{ color: '#8D8D93', fontSize: 11 }}>
        {t('model_explorer.downloads', { value: formatNumber(model.downloads, 1, true, false) })}
      </Text>
    </TouchableOpacity>
  );
}

function RepositoryDetails({
  model,
  details,
  isLoading,
  hasError,
  activeDownload,
  installedIds,
  notice,
  onBack,
  onRetry,
  onDownload,
  onCancelDownload,
  t,
}: {
  model: HfGGUFSearchResult;
  details: HfGGUFRepo | null;
  isLoading: boolean;
  hasError: boolean;
  activeDownload: DownloadState | null;
  installedIds: Set<string>;
  notice: { kind: 'success' | 'error'; text: string } | null;
  onBack: () => void;
  onRetry: () => void;
  onDownload: (index: number) => void;
  onCancelDownload: (modelId: string) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  return (
    <View style={{ gap: 12 }}>
      <TouchableOpacity onPress={onBack} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', paddingVertical: 4 }}>
        <ArrowLeft size={17} color={ACCENT} />
        <Text style={{ color: '#FF6B8B', fontSize: 13, fontWeight: '600' }}>{t('model_explorer.back_to_models')}</Text>
      </TouchableOpacity>
      <View style={{ backgroundColor: CARD, borderColor: '#303034', borderWidth: 1, borderRadius: 13, padding: 14, gap: 5 }}>
        <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>{details?.repo.title || model.title}</Text>
        <Text style={{ color: '#A4A4A8', fontSize: 12 }}>{model.id}</Text>
        {!!details?.repo.architecture && <Text style={{ color: '#8D8D93', fontSize: 11 }}>{details.repo.architecture}</Text>}
        {details?.repo.gated && <Text style={{ color: '#E7B85E', fontSize: 12 }}>{t('model_explorer.gated')}</Text>}
      </View>
      {notice && (
        <View style={{ backgroundColor: notice.kind === 'success' ? '#12271B' : '#261117', padding: 11, borderRadius: 9 }}>
          <Text style={{ color: notice.kind === 'success' ? '#9BE1B6' : '#F4B6C2', fontSize: 12 }}>{notice.text}</Text>
          {notice.kind === 'success' && <Text style={{ color: '#A4A4A8', fontSize: 11, marginTop: 4 }}>{t('model_explorer.available_in_picker')}</Text>}
        </View>
      )}
      {isLoading && <ActivityIndicator color={ACCENT} style={{ marginVertical: 18 }} />}
      {hasError && !isLoading && (
        <View style={{ backgroundColor: '#261117', padding: 13, borderRadius: 10, gap: 8 }}>
          <Text style={{ color: '#F4B6C2', fontSize: 13 }}>{t('model_explorer.details_error')}</Text>
          <TouchableOpacity onPress={onRetry}><Text style={{ color: '#FF6B8B', fontWeight: '700' }}>{t('model_explorer.retry')}</Text></TouchableOpacity>
        </View>
      )}
      {!!details && !isLoading && (
        <>
          <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700', marginTop: 3 }}>{t('model_explorer.quant_title')}</Text>
          {!details.quants.length && <Text style={{ color: '#A4A4A8', fontSize: 13 }}>{t('model_explorer.no_gguf_files')}</Text>}
          {details.quants.map((quant, index) => {
            const modelId = importedModelId(details.repo.id, quant.filename);
            const isInstalled = installedIds.has(modelId);
            const isDownloading = activeDownload?.modelId === modelId;
            const disabled = details.repo.gated || (!!activeDownload && !isDownloading) || isInstalled;
            return (
              <View key={quant.path} style={{ backgroundColor: CARD, borderColor: '#303034', borderWidth: 1, borderRadius: 12, padding: 13, gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={2} style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>{quant.quant || quant.filename}</Text>
                    <Text numberOfLines={1} style={{ color: '#A4A4A8', fontSize: 11, marginTop: 3 }}>{quant.filename}</Text>
                  </View>
                  <Text style={{ color: '#C4C4C9', fontSize: 11 }}>{formatBytes(quant.size)}</Text>
                  <TouchableOpacity
                    onPress={() => isDownloading ? onCancelDownload(modelId) : onDownload(index)}
                    disabled={disabled && !isDownloading}
                    accessibilityRole="button"
                    accessibilityLabel={isInstalled ? t('model_explorer.downloaded') : isDownloading ? t('model_explorer.cancel') : t('model_explorer.download')}
                    style={{ minWidth: 42, height: 38, paddingHorizontal: 10, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: isInstalled ? '#17301F' : isDownloading ? '#30202A' : disabled ? '#29292C' : ACCENT }}>
                    {isInstalled
                      ? <CheckCircle size={19} color="#8FDEA9" weight="fill" />
                      : isDownloading
                        ? <Text style={{ color: '#FF8FA7', fontSize: 11, fontWeight: '700' }}>{t('model_explorer.cancel')}</Text>
                        : details.repo.gated
                          ? <Lock size={17} color="#9B9BA1" />
                          : <DownloadSimple size={18} color="#FFFFFF" weight="bold" />}
                  </TouchableOpacity>
                </View>
                {isDownloading && (
                  <View style={{ gap: 5 }}>
                    <View style={{ height: 4, backgroundColor: '#343438', borderRadius: 2, overflow: 'hidden' }}>
                      <View style={{ height: 4, width: `${Math.max(0, Math.min(100, activeDownload.progress))}%`, backgroundColor: ACCENT }} />
                    </View>
                    <Text style={{ color: '#A4A4A8', fontSize: 10, textAlign: 'right' }}>
                      {activeDownload.bytesTotal > 0
                        ? `${Math.round(activeDownload.progress)}% · ${formatBytes(activeDownload.bytesDownloaded)} / ${formatBytes(activeDownload.bytesTotal)}`
                        : t('model_explorer.downloading')}
                    </Text>
                  </View>
                )}
                {isInstalled && <Text style={{ color: '#8FDEA9', fontSize: 10 }}>{t('model_explorer.downloaded')}</Text>}
              </View>
            );
          })}
        </>
      )}
    </View>
  );
}
