/**
 * Charts, drawn directly with react-native-svg.
 *
 * Deliberately dependency-free beyond the SVG primitives: a charting library
 * is one more thing to break on an SDK upgrade, and everything here needs
 * clinical reference bands, which most libraries make awkward.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Line, Circle, Rect, G, Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg';
import { colors, space, radius, adherenceColor } from '../theme/theme';
import { fmtShortDate, dayOf } from '../utils/date';

const niceBounds = (min, max) => {
  if (min === max) return [min - 1, max + 1];
  const pad = (max - min) * 0.15;
  return [min - pad, max + pad];
};

/* ---------------- line chart with a reference band ---------------- */

export function LineChart({
  data = [], height = 170, width = 320, color = colors.primary,
  refLow, refHigh, unit = '', decimals = 0, showDots = true, label,
}) {
  const pad = { l: 38, r: 12, t: 14, b: 24 };

  const model = useMemo(() => {
    const pts = data.filter((d) => d && Number.isFinite(Number(d.y)));
    if (pts.length === 0) return null;
    const ys = pts.map((p) => Number(p.y));
    let lo = Math.min(...ys);
    let hi = Math.max(...ys);
    if (refLow != null) lo = Math.min(lo, refLow);
    if (refHigh != null) hi = Math.max(hi, refHigh);
    const [yMin, yMax] = niceBounds(lo, hi);
    const w = width - pad.l - pad.r;
    const h = height - pad.t - pad.b;
    const x = (i) => pad.l + (pts.length === 1 ? w / 2 : (i / (pts.length - 1)) * w);
    const y = (v) => pad.t + h - ((v - yMin) / (yMax - yMin || 1)) * h;
    return { pts, ys, yMin, yMax, x, y, w, h };
  }, [data, width, height, refLow, refHigh]);

  if (!model) {
    return (
      <View style={[st.chartEmpty, { height }]}>
        <Text style={st.emptyText}>No readings yet</Text>
      </View>
    );
  }

  const { pts, yMin, yMax, x, y, w, h } = model;
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(Number(p.y))}`).join(' ');
  const areaPath = `${linePath} L ${x(pts.length - 1)} ${pad.t + h} L ${x(0)} ${pad.t + h} Z`;

  const bandTop = refHigh != null ? y(Math.min(refHigh, yMax)) : null;
  const bandBottom = refLow != null ? y(Math.max(refLow, yMin)) : null;

  const ticks = [yMax, (yMax + yMin) / 2, yMin];
  const gid = `grad-${color.replace('#', '')}`;

  return (
    <View>
      {label ? <Text style={st.chartLabel}>{label}</Text> : null}
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.22" />
            <Stop offset="1" stopColor={color} stopOpacity="0.02" />
          </LinearGradient>
        </Defs>

        {/* target band */}
        {bandTop != null && bandBottom != null ? (
          <Rect
            x={pad.l} y={bandTop} width={w} height={Math.max(0, bandBottom - bandTop)}
            fill={colors.ok} opacity={0.08}
          />
        ) : null}
        {refHigh != null ? (
          <Line x1={pad.l} y1={y(refHigh)} x2={pad.l + w} y2={y(refHigh)}
            stroke={colors.ok} strokeWidth={1} strokeDasharray="4 4" opacity={0.5} />
        ) : null}
        {refLow != null ? (
          <Line x1={pad.l} y1={y(refLow)} x2={pad.l + w} y2={y(refLow)}
            stroke={colors.ok} strokeWidth={1} strokeDasharray="4 4" opacity={0.5} />
        ) : null}

        {/* gridlines + axis labels */}
        {ticks.map((t, i) => (
          <G key={i}>
            <Line x1={pad.l} y1={y(t)} x2={pad.l + w} y2={y(t)} stroke={colors.border} strokeWidth={0.75} />
            <SvgText x={pad.l - 6} y={y(t) + 3.5} fontSize="9" fill={colors.faint} textAnchor="end">
              {t.toFixed(decimals)}
            </SvgText>
          </G>
        ))}

        <Path d={areaPath} fill={`url(#${gid})`} />
        <Path d={linePath} stroke={color} strokeWidth={2.2} fill="none"
          strokeLinejoin="round" strokeLinecap="round" />

        {showDots && pts.length <= 40
          ? pts.map((p, i) => {
              const v = Number(p.y);
              const out = (refLow != null && v < refLow) || (refHigh != null && v > refHigh);
              return (
                <Circle key={i} cx={x(i)} cy={y(v)} r={out ? 3.4 : 2.6}
                  fill={out ? colors.warn : colors.card} stroke={out ? colors.warn : color} strokeWidth={1.8} />
              );
            })
          : null}

        <SvgText x={pad.l} y={height - 6} fontSize="9" fill={colors.faint}>
          {fmtShortDate(dayOf(pts[0].x))}
        </SvgText>
        <SvgText x={pad.l + w} y={height - 6} fontSize="9" fill={colors.faint} textAnchor="end">
          {fmtShortDate(dayOf(pts[pts.length - 1].x))}
        </SvgText>
      </Svg>
      <Text style={st.chartFoot}>
        Latest {Number(pts[pts.length - 1].y).toFixed(decimals)} {unit}
        {refLow != null || refHigh != null
          ? `  ·  target ${refLow ?? '—'}–${refHigh ?? '—'} ${unit}` : ''}
      </Text>
    </View>
  );
}

/* ---------------- adherence bars ---------------- */

export function AdherenceBars({ data = [], height = 140, width = 320, labelKey = 'label' }) {
  const pad = { l: 30, r: 8, t: 10, b: 22 };
  const rows = data.filter((d) => d.adherence != null);
  if (!rows.length) {
    return (
      <View style={[st.chartEmpty, { height }]}>
        <Text style={st.emptyText}>Not enough history yet</Text>
      </View>
    );
  }
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const slot = w / rows.length;
  const barW = Math.max(5, Math.min(28, slot * 0.62));

  return (
    <Svg width={width} height={height}>
      {[100, 75, 50, 25, 0].map((t) => {
        const yy = pad.t + h - (t / 100) * h;
        return (
          <G key={t}>
            <Line x1={pad.l} y1={yy} x2={pad.l + w} y2={yy}
              stroke={t === 100 ? colors.border : colors.border} strokeWidth={0.7}
              strokeDasharray={t === 100 ? undefined : '3 5'} />
            {t % 50 === 0 ? (
              <SvgText x={pad.l - 5} y={yy + 3.5} fontSize="9" fill={colors.faint} textAnchor="end">{t}</SvgText>
            ) : null}
          </G>
        );
      })}
      {rows.map((d, i) => {
        const bh = Math.max(2, (d.adherence / 100) * h);
        const x = pad.l + slot * i + (slot - barW) / 2;
        return (
          <G key={i}>
            <Rect x={x} y={pad.t + h - bh} width={barW} height={bh}
              rx={3} fill={adherenceColor(d.adherence)} />
            <SvgText x={x + barW / 2} y={height - 7} fontSize="8.5" fill={colors.faint} textAnchor="middle">
              {String(d[labelKey] ?? '').slice(0, 3)}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

/* ---------------- daily adherence strip (90 tiny bars) ---------------- */

export function AdherenceStrip({ daily = [], height = 56, width = 320 }) {
  const rows = daily.slice(-60);
  if (!rows.length) return null;
  const slot = width / rows.length;
  const barW = Math.max(1.5, slot - 1.2);

  return (
    <View>
      <Svg width={width} height={height}>
        {rows.map((d, i) => {
          if (d.expected === 0) {
            return (
              <Rect key={i} x={i * slot} y={height / 2 - 1} width={barW} height={2}
                rx={1} fill={colors.border} />
            );
          }
          const pctVal = d.adherence ?? 0;
          const bh = Math.max(3, (pctVal / 100) * (height - 8));
          return (
            <Rect key={i} x={i * slot} y={height - 4 - bh} width={barW} height={bh}
              rx={1.5} fill={adherenceColor(pctVal)} opacity={pctVal === 100 ? 0.85 : 1} />
          );
        })}
      </Svg>
      <View style={st.stripAxis}>
        <Text style={st.stripAxisText}>{fmtShortDate(rows[0].day)}</Text>
        <Text style={st.stripAxisText}>{fmtShortDate(rows[rows.length - 1].day)}</Text>
      </View>
    </View>
  );
}

/* ---------------- donut ---------------- */

export function Donut({ value, size = 116, stroke = 11, color, label, sublabel, track = colors.border }) {
  const pctVal = value == null ? 0 : Math.max(0, Math.min(100, value));
  const c = color || adherenceColor(value);
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pctVal / 100) * circ;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
          <Circle
            cx={size / 2} cy={size / 2} r={r} stroke={c} strokeWidth={stroke} fill="none"
            strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
          />
        </G>
      </Svg>
      <Text style={[st.donutValue, { color: c, fontSize: size * 0.25 }]}>
        {value == null ? '—' : Math.round(value)}
        {value != null ? <Text style={{ fontSize: size * 0.13 }}>%</Text> : null}
      </Text>
      {label ? <Text style={st.donutLabel}>{label}</Text> : null}
      {sublabel ? <Text style={st.donutSub}>{sublabel}</Text> : null}
    </View>
  );
}

/* ---------------- horizontal comparison bar ---------------- */

export function CompareBar({ items = [], width = 320, unit = '' }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <View style={{ gap: space.sm }}>
      {items.map((it, i) => (
        <View key={i}>
          <View style={st.compareTop}>
            <Text style={st.compareLabel} numberOfLines={1}>{it.label}</Text>
            <Text style={[st.compareValue, { color: it.color || colors.text }]}>
              {it.value}{unit} {it.n != null ? <Text style={st.compareN}>n={it.n}</Text> : null}
            </Text>
          </View>
          <View style={st.compareTrack}>
            <View
              style={[
                st.compareFill,
                { width: `${(it.value / max) * 100}%`, backgroundColor: it.color || colors.primary },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  chartEmpty: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.bg, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
  },
  emptyText: { color: colors.faint, fontSize: 12.5 },
  chartLabel: { fontSize: 12.5, fontWeight: '700', color: colors.muted, marginBottom: 4 },
  chartFoot: { fontSize: 11, color: colors.faint, marginTop: 4 },
  stripAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  stripAxisText: { fontSize: 9.5, color: colors.faint },
  donutValue: { fontWeight: '800', letterSpacing: -1 },
  donutLabel: { fontSize: 11, color: colors.muted, fontWeight: '700', marginTop: 1 },
  donutSub: { fontSize: 9.5, color: colors.faint },
  compareTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  compareLabel: { fontSize: 12.5, color: colors.muted, flex: 1 },
  compareValue: { fontSize: 13, fontWeight: '700' },
  compareN: { fontSize: 10, color: colors.faint, fontWeight: '500' },
  compareTrack: { height: 8, backgroundColor: colors.bg, borderRadius: 4, overflow: 'hidden' },
  compareFill: { height: 8, borderRadius: 4 },
});
