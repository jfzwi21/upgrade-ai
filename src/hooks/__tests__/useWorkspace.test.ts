jest.mock('@/database/models/Workspace', () => ({
  __esModule: true,
  default: { first: jest.fn() },
}));
jest.mock('@/store/UIStore', () => ({
  __esModule: true,
  default: {
    emitter: { addListener: jest.fn(() => ({ remove: jest.fn() })) },
  },
}));

import { act, renderHook } from '@testing-library/react-hooks';
import Workspace from '@/database/models/Workspace';
import useWorkspace from '@/hooks/useWorkspace';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('useWorkspace', () => {
  it('ignores an older workspace request that finishes after the current one', async () => {
    const olderRequest = deferred<any>();
    const currentRequest = deferred<any>();
    const first = Workspace.first as jest.Mock;
    first.mockReturnValueOnce(olderRequest.promise).mockReturnValueOnce(currentRequest.promise);

    const { result, rerender } = renderHook(
      ({ slug }: { slug: string }) => useWorkspace(slug),
      { initialProps: { slug: 'older-workspace' } },
    );

    rerender({ slug: 'current-workspace' });
    const currentWorkspace = { slug: 'current-workspace' };
    await act(async () => {
      currentRequest.resolve(currentWorkspace);
      await currentRequest.promise;
    });
    expect(result.current.workspace).toBe(currentWorkspace);
    expect(result.current.loadingWorkspace).toBe(false);

    await act(async () => {
      olderRequest.resolve({ slug: 'older-workspace' });
      await olderRequest.promise;
    });
    expect(result.current.workspace).toBe(currentWorkspace);
  });
});
