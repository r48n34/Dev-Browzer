import { useCallback, useEffect, useRef } from 'react';
import { setPreviewLayout } from '../native/bridge';
import type { PreviewLayout, ViewportDefinition } from '../types';

export function usePreviewGeometry(viewports: ViewportDefinition[], previewsVisible: boolean) {
  const surfacesRef = useRef(new Map<string, HTMLElement>());
  const frameRef = useRef<number | null>(null);

  const measure = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
    }

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const layouts: PreviewLayout[] = viewports.map((viewport) => {
        const element = surfacesRef.current.get(viewport.id);
        if (!element) {
          return {
            id: viewport.id,
            x: 0,
            y: 0,
            width: 1,
            height: 1,
            viewportWidth: viewport.width,
            viewportHeight: viewport.height,
            scale: 0.25,
            visible: false,
          };
        }

        const rect = element.getBoundingClientRect();
        const requestedScale = Number(element.dataset.previewScale);
        const scale = Number.isFinite(requestedScale)
          ? requestedScale
          : rect.width / viewport.width;
        const visible =
          previewsVisible &&
          rect.width > 0 &&
          rect.height > 0 &&
          rect.right > 0 &&
          rect.bottom > 0 &&
          rect.left < window.innerWidth &&
          rect.top < window.innerHeight;

        return {
          id: viewport.id,
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.max(1, Math.round(rect.width)),
          height: Math.max(1, Math.round(rect.height)),
          viewportWidth: viewport.width,
          viewportHeight: viewport.height,
          scale,
          visible,
        };
      });

      void setPreviewLayout(layouts);
    });
  }, [previewsVisible, viewports]);

  const registerSurface = useCallback(
    (id: string) => (element: HTMLDivElement | null) => {
      if (element) {
        surfacesRef.current.set(id, element);
      } else {
        surfacesRef.current.delete(id);
      }
      measure();
    },
    [measure],
  );

  useEffect(() => {
    const observer = new ResizeObserver(measure);
    for (const element of surfacesRef.current.values()) {
      observer.observe(element);
    }
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    document.addEventListener('visibilitychange', measure);
    measure();

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      document.removeEventListener('visibilitychange', measure);
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [measure]);

  useEffect(() => {
    const observer = new ResizeObserver(measure);
    for (const element of surfacesRef.current.values()) {
      observer.observe(element);
    }
    measure();
    return () => observer.disconnect();
  }, [measure, viewports]);

  return { registerSurface, measure };
}
