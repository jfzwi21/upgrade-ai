jest.mock('@/utils/paths', () => ({
  PATHS: {
    home: '/home',
    onboarding: {
      welcome: '/onboarding/welcome',
      model_selection: '/onboarding/model-selection',
      survey: '/onboarding/survey',
      data_handling: '/onboarding/data-handling',
    },
    workspace_chat: '/workspace-chat',
  },
}));
jest.mock('@/store/UIStore', () => ({
  __esModule: true,
  default: { getFromStorage: jest.fn() },
}));
jest.mock('@/utils/defaultChatRoute', () => ({ resolveDefaultChatRoute: jest.fn() }));
jest.mock('@/hooks/useOnboardingHook', () => ({ repairPartialOnboarding: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/services/selfHealing/SafeModeService', () => ({ SafeModeService: { isEnabled: () => false } }));

import { act, renderHook } from '@testing-library/react-hooks';
import uiStore from '@/store/UIStore';
import useInitialRoute from '@/hooks/useInitialRoute';

describe('useInitialRoute', () => {
  it('falls back to Home and releases the loading screen when storage rejects', async () => {
    (uiStore.getFromStorage as jest.Mock).mockRejectedValueOnce(new Error('storage unavailable'));

    const { result } = renderHook(() => useInitialRoute());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.initialRoute.path).toBe('/home');
  });
});
