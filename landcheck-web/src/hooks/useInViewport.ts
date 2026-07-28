import { useEffect, useRef, useState } from "react";

type UseInViewportOptions = {
  rootMargin?: string;
  threshold?: number;
  once?: boolean;
};

export function useInViewport<T extends HTMLElement>({
  rootMargin = "0px",
  threshold = 0,
  once = true,
}: UseInViewportOptions = {}) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return undefined;
    }
    if (once && inView) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting) {
          setInView(true);
          if (once) observer.disconnect();
          return;
        }
        if (!once) setInView(false);
      },
      { rootMargin, threshold },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [inView, once, rootMargin, threshold]);

  return { ref, inView };
}
