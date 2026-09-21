import { useCallback, useEffect, useRef, useState } from 'react';

interface ApiDataState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  // Same refetch, but flagged as timer-driven so it is not counted as human activity (see
  // BACKGROUND_REQUEST in lib/api.ts). A separate function, not a flag on reload(), so that
  // `onClick={reload}` can never pass a click event in as the flag.
  reloadInBackground: () => void;
}

export function useApiData<T>(fetcher: (ctx: { background: boolean }) => Promise<T>, deps: unknown[] = []): ApiDataState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const backgroundNext = useRef(false);

  const load = useCallback(() => {
    let cancelled = false;
    const background = backgroundNext.current;
    backgroundNext.current = false;
    setLoading(true);
    setError(null);

    fetcher({ background })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.response?.data?.message || 'Failed to load data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadToken]);

  useEffect(() => load(), [load]);

  const reload = useCallback(() => {
    backgroundNext.current = false;
    setReloadToken((t) => t + 1);
  }, []);
  const reloadInBackground = useCallback(() => {
    backgroundNext.current = true;
    setReloadToken((t) => t + 1);
  }, []);

  return { data, loading, error, reload, reloadInBackground };
}
