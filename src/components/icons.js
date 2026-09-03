/**
 * Hand-drawn SVG icons.
 *
 * An icon font is a whole dependency and a whole set of licence questions for
 * twelve glyphs. These are stroke-based, inherit colour, and scale cleanly.
 */

import React from 'react';
import Svg, { Path, Circle, Rect, Line, Polyline } from 'react-native-svg';
import { colors } from '../theme/theme';

const Base = ({ size = 22, color = colors.muted, children, fill = 'none' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={fill}
    stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </Svg>
);

export const PillIcon = (p) => (
  <Base {...p}>
    <Path d="M10.5 3.5 3.5 10.5a5 5 0 0 0 7 7l7-7a5 5 0 0 0-7-7Z" />
    <Line x1="7" y1="7" x2="14" y2="14" />
  </Base>
);

export const BellIcon = (p) => (
  <Base {...p}>
    <Path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7" />
    <Path d="M13.7 20a2 2 0 0 1-3.4 0" />
  </Base>
);

export const ChartIcon = (p) => (
  <Base {...p}>
    <Line x1="4" y1="20" x2="20" y2="20" />
    <Rect x="6" y="12" width="3" height="6" rx="1" />
    <Rect x="11" y="8" width="3" height="10" rx="1" />
    <Rect x="16" y="4" width="3" height="14" rx="1" />
  </Base>
);

export const HeartIcon = (p) => (
  <Base {...p}>
    <Path d="M20.5 8.6c0 4.4-8.5 9.9-8.5 9.9S3.5 13 3.5 8.6a4.6 4.6 0 0 1 8.5-2.4 4.6 4.6 0 0 1 8.5 2.4Z" />
  </Base>
);

export const ClipboardIcon = (p) => (
  <Base {...p}>
    <Path d="M9 4h6v3H9z" />
    <Path d="M15 5.5h2A1.5 1.5 0 0 1 18.5 7v12A1.5 1.5 0 0 1 17 20.5H7A1.5 1.5 0 0 1 5.5 19V7A1.5 1.5 0 0 1 7 5.5h2" />
    <Line x1="9" y1="11" x2="15" y2="11" />
    <Line x1="9" y1="15" x2="13" y2="15" />
  </Base>
);

export const UserIcon = (p) => (
  <Base {...p}>
    <Circle cx="12" cy="8" r="3.6" />
    <Path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
  </Base>
);

export const UsersIcon = (p) => (
  <Base {...p}>
    <Circle cx="9" cy="8" r="3.2" />
    <Path d="M3 19.5a6 6 0 0 1 12 0" />
    <Path d="M16 5.5a3.2 3.2 0 0 1 0 6.2" />
    <Path d="M17.5 14.5a6 6 0 0 1 3.5 5" />
  </Base>
);

export const FlaskIcon = (p) => (
  <Base {...p}>
    <Path d="M10 3v6.2L4.9 18a1.7 1.7 0 0 0 1.5 2.5h11.2A1.7 1.7 0 0 0 19.1 18L14 9.2V3" />
    <Line x1="9" y1="3" x2="15" y2="3" />
    <Line x1="7" y1="14.5" x2="17" y2="14.5" />
  </Base>
);

export const CalendarIcon = (p) => (
  <Base {...p}>
    <Rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <Line x1="3.5" y1="9.5" x2="20.5" y2="9.5" />
    <Line x1="8" y1="3" x2="8" y2="6.5" />
    <Line x1="16" y1="3" x2="16" y2="6.5" />
  </Base>
);

export const AlertIcon = (p) => (
  <Base {...p}>
    <Path d="M12 3.5 21 19.5H3L12 3.5Z" />
    <Line x1="12" y1="10" x2="12" y2="14" />
    <Circle cx="12" cy="16.8" r="0.6" fill={p.color || colors.muted} />
  </Base>
);

export const CheckIcon = (p) => (
  <Base {...p}>
    <Polyline points="4.5 12.5 9.5 17.5 19.5 6.5" />
  </Base>
);

export const CloseIcon = (p) => (
  <Base {...p}>
    <Line x1="6" y1="6" x2="18" y2="18" />
    <Line x1="18" y1="6" x2="6" y2="18" />
  </Base>
);

export const PlusIcon = (p) => (
  <Base {...p}>
    <Line x1="12" y1="5" x2="12" y2="19" />
    <Line x1="5" y1="12" x2="19" y2="12" />
  </Base>
);

export const ChevronIcon = (p) => (
  <Base {...p}>
    <Polyline points="9 5 16 12 9 19" />
  </Base>
);

export const ClockIcon = (p) => (
  <Base {...p}>
    <Circle cx="12" cy="12" r="8.5" />
    <Polyline points="12 7 12 12 15.5 14" />
  </Base>
);

export const ShieldIcon = (p) => (
  <Base {...p}>
    <Path d="M12 3.2 19 6v6c0 4.3-3 7.4-7 8.8-4-1.4-7-4.5-7-8.8V6l7-2.8Z" />
    <Polyline points="9 12 11 14 15 10" />
  </Base>
);

export const ShareIcon = (p) => (
  <Base {...p}>
    <Path d="M12 3.5v11" />
    <Polyline points="8 7.5 12 3.5 16 7.5" />
    <Path d="M5.5 13v6a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5v-6" />
  </Base>
);

export const SettingsIcon = (p) => (
  <Base {...p}>
    <Circle cx="12" cy="12" r="3.2" />
    <Path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3" />
  </Base>
);
