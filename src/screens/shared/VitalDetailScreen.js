import React, { useState } from 'react';
import { View, Text, StyleSheet, useWindowDimensions, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useApp, useData } from '../../context/AppContext';
import { listVitals, deleteVital } from '../../db/queries';
import { adherenceReport } from '../../services/adherence';
import { stratifyVitalByAdherence } from '../../services/patterns';
import { VITAL_TYPES } from '../../db/schema';
import { fmtDateTime, relative } from '../../utils/date';
import { colors, space, radius } from '../../theme/theme';
import {
  Screen, Card, Row, H2, Small, Overline, Button, Loading, Pill, Divider, Segmented, EmptyState,
} from '../../components/ui';
import { LineChart, CompareBar } from '../../components/charts';

const RANGES = [
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 365, label: 'All' },
];

export default function VitalDetailScreen({ route }) {
  const nav = useNavigation();
  const { user, invalidate } = useApp();
  const { patientId, type } = route.params;
  const meta = VITAL_TYPES[type] || { label: type, unit: '', decimals: 1 };
  const [range, setRange] = useState(90);
  const { width } = useWindowDimensions();
  const chartW = width - space.lg * 2 - space.lg * 2;

  const { data, loading, reload } = useData(async () => {
    const rows = await listVitals(patientId, type, 400);
    const report = await adherenceReport(patientId, 90);
    const strat = stratifyVitalByAdherence(rows, report.daily, type);
    return { rows, strat };
  }, [patientId, type]);

  const after = async () => { await reload(); invalidate(); };

  if (loading || !data) return <Screen scroll={false}><Loading /></Screen>;

  const cutoff = Date.now() - range * 86400000;
  const rows = data.rows
    .filter((r) => new Date(r.recorded_at.replace(' ', 'T')).getTime() >= cutoff || range >= 365)
    .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));

  if (!rows.length) {
    return (
      <Screen>
        <EmptyState icon="○" title={`No ${meta.label.toLowerCase()} readings`}
          action="Log one" onAction={() => nav.navigate('LogVital', { patientId })} />
      </Screen>
    );
  }

  const values = rows.map((r) => r.value);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const outOfRange = rows.filter(
    (r) => (meta.low != null && r.value < meta.low) || (meta.high != null && r.value > meta.high)
  );
  const latest = rows[rows.length - 1];
  const half = Math.floor(rows.length / 2);
  const firstAvg = rows.slice(0, half).reduce((s, r) => s + r.value, 0) / Math.max(1, half);
  const lastAvg = rows.slice(half).reduce((s, r) => s + r.value, 0) / Math.max(1, rows.length - half);
  const drift = lastAvg - firstAvg;

  return (
    <Screen onRefresh={after}>
      <Row justify="space-between" align="flex-start">
        <View>
          <Overline style={{ color: colors.primary }}>{meta.label}</Overline>
          <H2 style={{ marginTop: 2 }}>
            {latest.value.toFixed(meta.decimals ?? 0)}
            <Text style={s.unit}> {meta.unit}</Text>
          </H2>
          <Small>{relative(latest.recorded_at)}</Small>
        </View>
        <Pill
          label={outOfRange.length ? `${outOfRange.length} out of range` : 'All in range'}
          color={outOfRange.length ? colors.warn : colors.ok}
        />
      </Row>

      <Segmented options={RANGES} value={range} onChange={setRange} style={{ marginTop: space.md }} />

      <Card style={{ marginTop: space.md }}>
        <LineChart
          data={rows.map((r) => ({ x: r.recorded_at, y: r.value }))}
          width={chartW}
          height={190}
          refLow={meta.low}
          refHigh={meta.high}
          unit={meta.unit}
          decimals={meta.decimals ?? 0}
          showDots={rows.length <= 40}
        />
        <Divider />
        <Row justify="space-around">
          <Stat label="Mean" value={avg.toFixed(meta.decimals ?? 0)} />
          <Stat label="Lowest" value={Math.min(...values).toFixed(meta.decimals ?? 0)} />
          <Stat label="Highest" value={Math.max(...values).toFixed(meta.decimals ?? 0)} />
          <Stat label="Readings" value={rows.length} />
        </Row>
        {Math.abs(drift) >= (meta.decimals ? 0.3 : 1) ? (
          <Small style={{ textAlign: 'center', marginTop: space.md }}>
            Second half of this window averages {Math.abs(drift).toFixed(meta.decimals ?? 0)} {meta.unit}{' '}
            {drift > 0 ? 'higher' : 'lower'} than the first half.
          </Small>
        ) : null}
      </Card>

      {data.strat ? (
        <Card style={{ marginTop: space.md }}>
          <Overline style={{ color: colors.muted }}>Against adherence</Overline>
          <Small style={{ marginTop: 4, marginBottom: space.md }}>
            Readings split by whether every scheduled dose that day was taken.
          </Small>
          <CompareBar
            unit={` ${meta.unit}`}
            items={[
              { label: 'All doses taken', value: data.strat.onTrackMean, n: data.strat.onTrackN, color: colors.ok },
              { label: 'A dose was missed', value: data.strat.missedMean, n: data.strat.missedN, color: colors.warn },
            ]}
          />
        </Card>
      ) : null}

      <Overline style={{ color: colors.muted, marginTop: space.xl, marginBottom: space.sm }}>
        All readings
      </Overline>
      <Card>
        {[...rows].reverse().slice(0, 60).map((r, i) => {
          const out = (meta.low != null && r.value < meta.low) || (meta.high != null && r.value > meta.high);
          return (
            <View key={r.id}>
              {i > 0 ? <Divider style={{ marginVertical: space.sm }} /> : null}
              <Row justify="space-between">
                <View style={{ flex: 1 }}>
                  <Text style={[s.rowValue, out && { color: colors.warn }]}>
                    {r.value.toFixed(meta.decimals ?? 0)} <Text style={s.rowUnit}>{meta.unit}</Text>
                  </Text>
                  <Small>{fmtDateTime(r.recorded_at)}{r.note ? ` · ${r.note}` : ''}</Small>
                </View>
                <Button
                  title="Delete"
                  variant="ghost"
                  size="sm"
                  onPress={() =>
                    Alert.alert('Delete this reading?', 'It will no longer count towards any average or chart.', [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: async () => { await deleteVital(r.id); await after(); },
                      },
                    ])
                  }
                />
              </Row>
            </View>
          );
        })}
      </Card>

      <Button
        title="Log a new reading"
        variant="soft"
        style={{ marginTop: space.md }}
        onPress={() => nav.navigate('LogVital', { patientId })}
      />
    </Screen>
  );
}

function Stat({ label, value }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  unit: { fontSize: 15, fontWeight: '600', color: colors.muted },
  statValue: { fontSize: 17, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 11, color: colors.muted, marginTop: 1 },
  rowValue: { fontSize: 15, fontWeight: '700', color: colors.text },
  rowUnit: { fontSize: 12, fontWeight: '600', color: colors.muted },
});
