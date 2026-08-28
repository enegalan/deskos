import React from 'react';
import { getIconSvg, getIconViewBox, type IconName } from '@core/icons';

/** Props for the shared {@link Icon} SVG/emoji renderer. */
export interface IconProps {
  name: IconName | string;
  size?: number | string;
  color?: string;
  className?: string;
  fallback?: string; // Emoji when no SVG icon exists
  style?: React.CSSProperties;
}

/**
 * Icon component for rendering SVG icons
 */
export function Icon({
  name,
  size = 16,
  color = 'currentColor',
  className = '',
  fallback,
  style,
}: IconProps) {
  const svgContent = getIconSvg(name as IconName);
  const viewBox = getIconViewBox(name as IconName);

  // If no SVG and no fallback, return null
  if (!svgContent && !fallback) {
    console.warn(`[Icon] Icon "${name}" not found and no fallback provided`);
    return null;
  }

  // If we have a fallback emoji and no SVG, render emoji
  if (!svgContent && fallback) {
    return (
      <span
        className={`icon-emoji ${className}`}
        style={{
          fontSize: typeof size === 'number' ? `${size}px` : size,
          color,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          ...style,
        }}
        role="img"
        aria-label={name}
      >
        {fallback}
      </span>
    );
  }

  // Render SVG icon
  // Replace currentColor in SVG content with actual color if provided
  const processedSvgContent =
    color && color !== 'currentColor'
      ? svgContent.replace(/fill="currentColor"/g, `fill="${color}"`)
      : svgContent;

  return (
    <svg
      className={`icon-svg ${className}`}
      width={size}
      height={size}
      viewBox={viewBox}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        flexShrink: 0,
        color: color,
        ...style,
      }}
      aria-hidden="true"
      role="img"
      aria-label={name}
      dangerouslySetInnerHTML={{ __html: processedSvgContent }}
    />
  );
}
