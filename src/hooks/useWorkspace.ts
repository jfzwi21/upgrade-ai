import { useCallback, useEffect, useRef, useState } from "react";
import Workspace, { WorkspaceType } from "@/database/models/Workspace";
import uiStore from "@/store/UIStore";

export default function useWorkspace(wsSlug: string) {
  const [isLoading, setIsLoading] = useState(true);
  const [workspace, setWorkspace] = useState<WorkspaceType>();
  const [error, setError] = useState<any>(null);
  const requestId = useRef(0);

  const fetchWorkspace = useCallback(async () => {
    const currentRequestId = ++requestId.current;
    setIsLoading(true);
    setError(null);
    setWorkspace(undefined);
    try {
      if (!wsSlug) throw new Error('Workspace slug is required');
      const workspace = await Workspace.first([{ field: 'slug', value: wsSlug }]);
      if (!workspace) throw new Error('Workspace not found');
      if (requestId.current === currentRequestId) setWorkspace(workspace);
    } catch (error) {
      console.error('Error fetching workspaces', error);
      if (requestId.current === currentRequestId) setError(error);
    } finally {
      if (requestId.current === currentRequestId) setIsLoading(false);
    }
  }, [wsSlug]);

  useEffect(() => {
    void fetchWorkspace();
    return () => {
      requestId.current += 1;
    };
  }, [fetchWorkspace]);

  useEffect(() => {
    const workspaceListener = uiStore.emitter.addListener(
      'workspaceUpdate',
      (event) => {
        if (event.type === 'update') {
          const { workspace } = event.details;
          if (workspace.slug === wsSlug) setWorkspace(workspace);
        }
      }
    );
    return () => workspaceListener.remove();
  }, [wsSlug]);

  return { loadingWorkspace: isLoading, workspace, fetchWorkspace, error };
}
