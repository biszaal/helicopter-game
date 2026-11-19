import { useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

/** Clear space kept above and below the column — enough to stay off the
 * home indicator / gesture bar in landscape. */
const FIT_MARGIN = 20;

/**
 * Uniform shrink-to-fit for the menu's right-hand column (title + action
 * area). Once BEST and COINS lines appear, the column outgrows the height
 * of a standard landscape phone (~393 pt), clipping the title and the
 * bottom button. Taller screens keep scale 1, so nothing changes there.
 *
 * Layout ignores transforms, so `onLayout` always reports the natural
 * height and the scale can't feed back into its own measurement.
 * MenuScreen and LoadingScreen lay out the same column, so both get the
 * same scale and the boot crossfade still lines up.
 */
export function useColumnFit(screenHeight: number) {
  const [naturalHeight, setNaturalHeight] = useState(0);
  const onLayout = (e: LayoutChangeEvent) =>
    setNaturalHeight(e.nativeEvent.layout.height);
  const scale =
    naturalHeight > 0
      ? Math.min(1, (screenHeight - 2 * FIT_MARGIN) / naturalHeight)
      : 1;
  // Hidden for the single frame before the first measurement, so a
  // too-tall column never flashes at full size.
  return { onLayout, scale, measured: naturalHeight > 0 };
}
