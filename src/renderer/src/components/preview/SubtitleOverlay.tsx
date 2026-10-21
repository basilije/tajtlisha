import { computeSubtitleGeometry } from '../../../../shared/subtitle-geometry';
import type { SubtitleStyle } from '../../../../shared/types/style';
import { buildSubtitleBlockStyle, buildSubtitleBoxStyle } from './subtitleStyles';
import './preview.css';

export type SubtitleOverlayProps = {
  text: string;
  style: SubtitleStyle;
  /** Displayed frame size in CSS pixels (not the source resolution). */
  frameWidth: number;
  frameHeight: number;
};

/**
 * Subtitle text laid over the displayed video frame. Render it inside a
 * positioned element that has exactly the frame's size; the layer clips
 * anything that would run past the frame edges.
 */
export function SubtitleOverlay({ text, style, frameWidth, frameHeight }: SubtitleOverlayProps) {
  if (!text.trim()) return null;

  const geometry = computeSubtitleGeometry(style, frameWidth, frameHeight);

  return (
    <div className="subtitle-overlay">
      <div className="subtitle-block" style={buildSubtitleBlockStyle(style, geometry)}>
        <span className="subtitle-text" style={buildSubtitleBoxStyle(style, geometry)}>
          {text}
        </span>
      </div>
    </div>
  );
}
