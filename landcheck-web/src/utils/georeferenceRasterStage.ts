export type RasterStageMetrics = {
  containerWidth: number;
  containerHeight: number;
  displayWidth: number;
  displayHeight: number;
  offsetLeft: number;
  offsetTop: number;
  naturalWidth: number;
  naturalHeight: number;
};

export type RasterStageProjection = {
  leftPx: number;
  topPx: number;
  leftPercent: number;
  topPercent: number;
};

export function getRasterStageMetrics(
  stageEl: HTMLElement | null,
  imageEl: HTMLImageElement | null,
  sourceWidth: number,
  sourceHeight: number,
): RasterStageMetrics | null {
  if (!stageEl || !imageEl) return null;

  const containerWidth = stageEl.clientWidth;
  const containerHeight = stageEl.clientHeight;
  const naturalWidth = imageEl.naturalWidth || sourceWidth || 0;
  const naturalHeight = imageEl.naturalHeight || sourceHeight || 0;

  if (!containerWidth || !containerHeight || !naturalWidth || !naturalHeight) {
    return null;
  }

  const imageAspect = naturalWidth / naturalHeight;
  const containerAspect = containerWidth / containerHeight;

  let displayWidth = containerWidth;
  let displayHeight = containerHeight;
  let offsetLeft = 0;
  let offsetTop = 0;

  if (imageAspect > containerAspect) {
    displayWidth = containerWidth;
    displayHeight = displayWidth / imageAspect;
    offsetTop = (containerHeight - displayHeight) / 2;
  } else {
    displayHeight = containerHeight;
    displayWidth = displayHeight * imageAspect;
    offsetLeft = (containerWidth - displayWidth) / 2;
  }

  return {
    containerWidth,
    containerHeight,
    displayWidth,
    displayHeight,
    offsetLeft,
    offsetTop,
    naturalWidth,
    naturalHeight,
  };
}

export function getRasterPixelFromStageClick(
  stageEl: HTMLElement | null,
  imageEl: HTMLImageElement | null,
  sourceWidth: number,
  sourceHeight: number,
  clientX: number,
  clientY: number,
): { pixelX: number; pixelY: number } | null {
  if (!stageEl || !imageEl) return null;

  const metrics = getRasterStageMetrics(stageEl, imageEl, sourceWidth, sourceHeight);
  if (!metrics) return null;

  const stageRect = stageEl.getBoundingClientRect();
  const scaleX = stageEl.clientWidth > 0 ? stageRect.width / stageEl.clientWidth : 1;
  const scaleY = stageEl.clientHeight > 0 ? stageRect.height / stageEl.clientHeight : 1;
  const relativeX = (clientX - stageRect.left - stageEl.clientLeft) / (scaleX || 1);
  const relativeY = (clientY - stageRect.top - stageEl.clientTop) / (scaleY || 1);

  if (
    relativeX < metrics.offsetLeft ||
    relativeX > metrics.offsetLeft + metrics.displayWidth ||
    relativeY < metrics.offsetTop ||
    relativeY > metrics.offsetTop + metrics.displayHeight
  ) {
    return null;
  }

  const normalizedX = Math.max(0, Math.min(1, (relativeX - metrics.offsetLeft) / metrics.displayWidth));
  const normalizedY = Math.max(0, Math.min(1, (relativeY - metrics.offsetTop) / metrics.displayHeight));
  const pixelLimitX = Math.max(metrics.naturalWidth - 1, 1);
  const pixelLimitY = Math.max(metrics.naturalHeight - 1, 1);

  return {
    pixelX: normalizedX * pixelLimitX,
    pixelY: normalizedY * pixelLimitY,
  };
}

export function projectRasterPixelToStage(
  pixelX: number,
  pixelY: number,
  metrics: RasterStageMetrics | null,
): RasterStageProjection | null {
  if (!metrics || !metrics.containerWidth || !metrics.containerHeight) return null;
  const pixelLimitX = Math.max(metrics.naturalWidth - 1, 1);
  const pixelLimitY = Math.max(metrics.naturalHeight - 1, 1);

  const normalizedX = Math.max(0, Math.min(1, pixelX / pixelLimitX));
  const normalizedY = Math.max(0, Math.min(1, pixelY / pixelLimitY));

  const leftPx = metrics.offsetLeft + normalizedX * metrics.displayWidth;
  const topPx = metrics.offsetTop + normalizedY * metrics.displayHeight;

  return {
    leftPx,
    topPx,
    leftPercent: (leftPx / metrics.containerWidth) * 100,
    topPercent: (topPx / metrics.containerHeight) * 100,
  };
}
