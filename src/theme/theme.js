export const colors = {
  bg: '#F4F7F8',
  card: '#FFFFFF',
  border: '#E3E9EC',
  text: '#0E1A1F',
  muted: '#5F7480',
  faint: '#93A5AE',

  primary: '#0F766E',
  primarySoft: '#DCF1EE',
  primaryDark: '#0B564F',

  danger: '#C4372F',
  dangerSoft: '#FBE7E5',
  warn: '#B4700B',
  warnSoft: '#FDF1DC',
  ok: '#15803D',
  okSoft: '#DFF3E5',
  info: '#1D4ED8',
  infoSoft: '#E3EAFD',

  patientA: '#7C3AED',
  patientB: '#0369A1',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };

export const type = {
  h1: { fontSize: 26, fontWeight: '700', color: colors.text, letterSpacing: -0.4 },
  h2: { fontSize: 20, fontWeight: '700', color: colors.text, letterSpacing: -0.2 },
  h3: { fontSize: 16, fontWeight: '700', color: colors.text },
  body: { fontSize: 15, color: colors.text },
  small: { fontSize: 13, color: colors.muted },
  tiny: { fontSize: 11, color: colors.faint, letterSpacing: 0.4 },
  mono: { fontSize: 13, color: colors.text },
};

export const shadow = {
  shadowColor: '#0E1A1F',
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};

/** Semantic colour for an adherence percentage (0-100). */
export function adherenceColor(pct) {
  if (pct == null) return colors.faint;
  if (pct >= 90) return colors.ok;
  if (pct >= 75) return colors.warn;
  return colors.danger;
}

/** Semantic colour for a lab / vital flag. */
export function flagColor(flag) {
  switch (flag) {
    case 'high':
    case 'low':
      return colors.warn;
    case 'critical':
      return colors.danger;
    default:
      return colors.ok;
  }
}
