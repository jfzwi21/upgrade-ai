import * as RNFS from '@dr.pogodin/react-native-fs';
import { ImportedModel } from '@/utils/models/imported';
import ImportedModels from '@/utils/models/imported';
import { resolveDestinationPathFromGGUFUrl } from '@/utils/models/defaults';
import { downloadFileAtomic } from '@/utils/fs/atomicDownload';

export type ModelDownloadProgress = {
  bytesDownloaded: number;
  bytesTotal: number;
  progress: number;
};

type DownloadJob = {
  jobId: number | null;
  cancelled: boolean;
};

/** Downloads Hub GGUF files into the same per-repository path consumed by llama.rn. */
class ModelDownloadManager {
  private jobs = new Map<string, DownloadJob>();

  async download(
    model: ImportedModel,
    onProgress?: (progress: ModelDownloadProgress) => void,
  ): Promise<string> {
    if (this.jobs.has(model.modelId)) throw new Error('This model is already downloading.');
    const destination = resolveDestinationPathFromGGUFUrl(model.downloadUrl);
    if (await RNFS.exists(destination)) {
      await ImportedModels.add(model);
      onProgress?.({ bytesDownloaded: model.size, bytesTotal: model.size, progress: 100 });
      return destination;
    }

    const job: DownloadJob = { jobId: null, cancelled: false };
    this.jobs.set(model.modelId, job);
    const directory = destination.slice(0, destination.lastIndexOf('/'));
    try {
      await RNFS.mkdir(directory, { NSURLIsExcludedFromBackupKey: true });
      await downloadFileAtomic(
        {
          fromUrl: model.downloadUrl,
          toFile: destination,
          background: true,
          discretionary: true,
          progressInterval: 250,
          progress: result => {
            onProgress?.({
              bytesDownloaded: result.bytesWritten,
              bytesTotal: result.contentLength,
              progress: result.contentLength > 0
                ? Math.min(100, (result.bytesWritten / result.contentLength) * 100)
                : 0,
            });
          },
        },
        jobId => {
          job.jobId = jobId;
          if (job.cancelled) RNFS.stopDownload(jobId);
        },
      );
      if (job.cancelled) throw new Error('DOWNLOAD_CANCELLED');
      // The imported model ID is org/repo/file.gguf. llama.rn resolves it to
      // DocumentDirectoryPath/models/gguf/org/repo/file.gguf, matching this URL-based destination.
      await ImportedModels.add(model);
      onProgress?.({ bytesDownloaded: model.size, bytesTotal: model.size, progress: 100 });
      return destination;
    } catch (error) {
      if (job.cancelled) throw new Error('DOWNLOAD_CANCELLED');
      throw error;
    } finally {
      this.jobs.delete(model.modelId);
    }
  }

  async cancel(modelId: string): Promise<boolean> {
    const job = this.jobs.get(modelId);
    if (!job) return false;
    job.cancelled = true;
    if (job.jobId !== null) RNFS.stopDownload(job.jobId);
    return true;
  }
}

export default new ModelDownloadManager();
