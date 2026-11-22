import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/utils";

export function useFetch<T>(
  loader: () => Promise<T>,
  deps: unknown[] = [],
  options: { immediate?: boolean } = {},
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(options.immediate !== false);
  const [error, setError] = useState("");
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reload = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const result = await loaderRef.current();
      if (mounted.current) {
        setData(result);
        setError("");
      }
      return result;
    } catch (err) {
      if (mounted.current) setError(errorMessage(err));
      return null;
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (options.immediate === false) return;
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, reload, setData };
}
