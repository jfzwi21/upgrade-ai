import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, Text, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  DrawerContentScrollView,
} from '@react-navigation/drawer';
import { ClockCountdown, Gear, MagnifyingGlass, QrCode } from 'phosphor-react-native';
import useUnreadScheduledJobRuns from '@/hooks/useUnreadScheduledJobRuns';
import WorkspaceItem from './WorkspaceItem';
import useWorkspaces from '@/hooks/useWorkspaces';
import NewWorkspaceModal, { useNewWorkspaceModal } from '@/components/NewWorkspaceModal';
import SafeView from '@/components/SafeView';
import { useDrawerStatus } from '@react-navigation/drawer';
import { BOTTOM_SHEET_NAMES, useBottomSheet } from '@/contexts/BottomSheetContext';
import { PATHS } from '@/utils/paths';
import uiStore from '@/store/UIStore';
import { useTranslation } from 'react-i18next';
import { SafeModeService } from '@/services/selfHealing/SafeModeService';

export default function SidebarContent({ navigation }: { navigation: any }) {
  const { t } = useTranslation();
  const drawerStatus = useDrawerStatus();
  const { presentSheet, dismissAllSheets } = useBottomSheet();
  const { loadingWorkspaces, workspaces, quarantinedWorkspaces, activeWorkspaceSlug, activeThreadSlug, fetchWorkspaces } = useWorkspaces(true);
  const { showNewWorkspaceModal, openNewWorkspaceModal, closeNewWorkspaceModal } = useNewWorkspaceModal();
  const [refreshing, setRefreshing] = useState(false);
  const unseenJobRuns = useUnreadScheduledJobRuns();

  const goToScheduledJobs = () => {
    uiStore.emitter.emit(uiStore.globalEvents.REDIRECT, {
      path: PATHS.scheduled_jobs,
    });
    navigation.reset({
      index: 0,
      // @ts-ignore
      routes: [{ name: PATHS.scheduled_jobs }],
    });
  }

  const goToUserSettings = () => {
    uiStore.emitter.emit(uiStore.globalEvents.REDIRECT, {
      path: PATHS.user_settings,
    });
    navigation.reset({
      index: 0,
      // @ts-ignore
      routes: [{ name: PATHS.user_settings }],
    });
  }

  const goToWorkspaceImportStart = () => {
    uiStore.emitter.emit(uiStore.globalEvents.REDIRECT, {
      path: PATHS.connect_to_instance,
    });
    navigation.reset({
      index: 0,
      // @ts-ignore
      routes: [{ name: PATHS.connect_to_instance }],
    });
  }

  const goToModelExplorer = () => {
    uiStore.emitter.emit(uiStore.globalEvents.REDIRECT, { path: PATHS.model_explorer });
    navigation.reset({
      index: 0,
      // @ts-ignore
      routes: [{ name: PATHS.model_explorer }],
    });
  }

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchWorkspaces(true);
    } finally {
      setRefreshing(false);
    }
  }, [fetchWorkspaces]);

  useEffect(() => {
    if (drawerStatus === 'open') return dismissAllSheets();
    if (drawerStatus === 'closed') return presentSheet(BOTTOM_SHEET_NAMES.PRIMARY_PROMPT_INPUT, true);
  }, [drawerStatus]);

  useEffect(() => {
    uiStore.emitter.addListener(uiStore.globalEvents.REFRESH_WORKSPACES, onRefresh);
    return () => { uiStore.emitter.removeAllListeners(uiStore.globalEvents.REFRESH_WORKSPACES) };
  }, []);

  return (
    <SafeView applyInsets={false} safeAreaClassNames='bg-[--hex-gray-10]' containerClassNames='flex-1 flex-col flex px-2 pt-4' edges={['top', 'bottom']}>
      <GestureHandlerRootView>
        <View className='flex-1 justify-between'>
          {/* Topbar */}
          <View className='flex flex-row items-center justify-between pt-[20px] w-full p-[16px] border-b border-[--hex-gray-8] shrink-0'>
            <Text className='text-2xl font-semibold text-white'>{t('drawer.workspaces')}</Text>
            <View className='flex flex-row items-center' style={{ gap: 18 }}>
              <TouchableOpacity activeOpacity={0.6} onPress={goToScheduledJobs} accessibilityLabel={unseenJobRuns > 0 ? t('drawer.scheduled_jobs_unseen', { count: unseenJobRuns }) : t('drawer.scheduled_jobs')}>
                <ClockCountdown size={30} color='#FFF' />
                {unseenJobRuns > 0 && (
                  // Unseen job results - same accent as the dots on the job and run rows
                  <View style={{ position: 'absolute', top: -2, right: -2, width: 10, height: 10, borderRadius: 5, backgroundColor: '#E50914', borderWidth: 2, borderColor: '#1B1B1E' }} />
                )}
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.6} onPress={goToUserSettings}>
                <Gear size={30} color='#FFF' />
              </TouchableOpacity>
            </View>
          </View>

          {/* Workspaces List */}
          {loadingWorkspaces ? (
            <View className='flex-1 justify-center items-center'>
              <ActivityIndicator size='large' color='#FFF' />
            </View>
          ) : (
            <DrawerContentScrollView
              contentContainerStyle={{
                paddingTop: 21,
                flexDirection: 'column',
                gap: 32,
                paddingStart: 16,
                paddingEnd: 16,
              }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  colors={['#000']}
                  tintColor='#FFF'
                />
              }>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={goToModelExplorer}
                accessibilityRole='button'
                accessibilityLabel={t('model_explorer.title')}
                className='flex flex-row items-center rounded-xl px-4 py-3 bg-[#35121D] border border-[#702037]'
                style={{ gap: 10 }}>
                <MagnifyingGlass size={19} color='#FF6B8B' weight='bold' />
                <View className='flex-1'>
                  <Text className='text-white font-semibold'>{t('model_explorer.title')}</Text>
                  <Text className='text-[#C5AEB5] text-xs mt-0.5'>{t('model_explorer.drawer_subtitle')}</Text>
                </View>
              </TouchableOpacity>
              {quarantinedWorkspaces.length > 0 && (
                <TouchableOpacity
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  onPress={() => Alert.alert(
                    'إعادة إظهار المساحات المعزولة؟',
                    'لم تُحذف بياناتها. إذا كان سبب العطل ما زال موجودًا فقد يتكرر؛ هل تريد المتابعة؟',
                    [
                      { text: 'إلغاء', style: 'cancel' },
                      {
                        text: 'إعادة الإظهار',
                        onPress: () => {
                          void Promise.all(
                            quarantinedWorkspaces.map(workspace => SafeModeService.restoreWorkspace(workspace.slug)),
                          );
                        },
                      },
                    ],
                  )}
                  className="rounded-xl px-4 py-3 bg-[#27251B] border border-[#625A37]">
                  <Text className="text-[#F3E9B0] text-sm">
                    مساحات معزولة مؤقتًا ({quarantinedWorkspaces.length}) — إعادة إظهار
                  </Text>
                </TouchableOpacity>
              )}
              {workspaces.map((ws) => (
                <WorkspaceItem
                  key={ws.slug}
                  workspace={ws}
                  isActive={ws.slug === activeWorkspaceSlug}
                  currentThreadSlug={activeThreadSlug}
                />
              ))}
            </DrawerContentScrollView>
          )}

          {/* Sticky Bottom Icons */}
          <View style={{ paddingVertical: 16, height: 80, paddingHorizontal: 8, gap: 16 }} className='flex flex-row justify-between items-center border-t border-[--hex-gray-8]'>
            <TouchableOpacity activeOpacity={0.8} onPress={openNewWorkspaceModal} className='flex flex-1 flex-row items-center justify-center bg-white/10 rounded-lg py-[11px]'>
              <Text className='text-lg text-white'>{t('drawer.new_workspace')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={goToWorkspaceImportStart} activeOpacity={0.8} style={{ height: '100%', width: 42 }} className='flex items-center justify-center bg-white/10 rounded-lg p-[11px]'>
              <QrCode size={30} color='#FFF' />
            </TouchableOpacity>
          </View>
        </View>
      </GestureHandlerRootView>
      <NewWorkspaceModal showing={showNewWorkspaceModal} close={closeNewWorkspaceModal} />
    </SafeView>
  );
}
