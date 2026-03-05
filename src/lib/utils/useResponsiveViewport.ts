"use client";

import { useEffect, useMemo, useState } from 'react';

export type ScreenSize = 'small' | 'medium' | 'large';

type ResponsiveValueMap<T> = {
  small: T;
  medium: T;
  large: T;
};

const SMALL_MAX_WIDTH = 767;
const MEDIUM_MAX_WIDTH = 1279;

const getScreenSize = (width: number): ScreenSize => {
  if (width <= SMALL_MAX_WIDTH) return 'small';
  if (width <= MEDIUM_MAX_WIDTH) return 'medium';
  return 'large';
};

export const pickResponsiveValue = <T>(screen: ScreenSize, values: ResponsiveValueMap<T>): T => {
  return values[screen];
};

export const useResponsiveViewport = (initialWidth = 1024) => {
  const [width, setWidth] = useState(initialWidth);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const updateViewportWidth = () => setWidth(window.innerWidth);
    updateViewportWidth();
    window.addEventListener('resize', updateViewportWidth, { passive: true });
    return () => window.removeEventListener('resize', updateViewportWidth);
  }, []);

  const screen = useMemo(() => getScreenSize(width), [width]);

  return {
    width,
    screen,
    isSmall: screen === 'small',
    isMedium: screen === 'medium',
    isLarge: screen === 'large',
  };
};
