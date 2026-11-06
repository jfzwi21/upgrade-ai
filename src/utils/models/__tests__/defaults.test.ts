jest.mock('@dr.pogodin/react-native-fs', () => ({ DocumentDirectoryPath: '/documents' }));
jest.mock('phosphor-react-native', () => ({ Feather: 'Feather', Scales: 'Scales', Barbell: 'Barbell' }));

import { resolveDestinationPathFromGGUFUrl } from '@/utils/models/defaults';

describe('resolveDestinationPathFromGGUFUrl', () => {
  it('preserves nested paths from Hugging Face resolve URLs', () => {
    expect(
      resolveDestinationPathFromGGUFUrl(
        'https://huggingface.co/org/repo/resolve/main/quants/Q4/model.gguf?download=true',
      ),
    ).toBe('/documents/models/gguf/org/repo/quants/Q4/model.gguf');
  });

  it('keeps the existing destination for a root-level model file', () => {
    expect(
      resolveDestinationPathFromGGUFUrl(
        'https://huggingface.co/org/repo/resolve/main/model.gguf',
      ),
    ).toBe('/documents/models/gguf/org/repo/model.gguf');
  });
});
