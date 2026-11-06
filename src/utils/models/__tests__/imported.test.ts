jest.mock('@/store/UIStore', () => ({
  __esModule: true,
  default: {
    getFromStorage: jest.fn().mockResolvedValue([]),
    setToStorage: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('@/i18n', () => ({ __esModule: true, default: { t: (key: string) => key } }));

import { importedModelId } from '@/utils/models/imported';

describe('importedModelId', () => {
  it('keeps nested Hugging Face paths in the id so same-named files do not collide', () => {
    expect(importedModelId('org/repo', 'q4/model.gguf')).toBe('org/repo/q4/model.gguf');
    expect(importedModelId('org/repo', 'q8/model.gguf')).toBe('org/repo/q8/model.gguf');
    expect(importedModelId('org/repo', 'q4/model.gguf')).not.toBe(
      importedModelId('org/repo', 'q8/model.gguf'),
    );
  });

  it('rejects unsafe path segments', () => {
    expect(() => importedModelId('org/repo', '../model.gguf')).toThrow('Invalid Hugging Face model file path');
    expect(() => importedModelId('org/repo', 'folder\\model.gguf')).toThrow('Invalid Hugging Face model file path');
  });
});
