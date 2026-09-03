import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useApp, useData } from '../../context/AppContext';
import { panelResults, listPanels, analyteHistory, deletePanel } from '../../db/queries';
import { fmtDate, fmtShortDate } from '../../utils/date';
import { colors, space, radius } from '../../theme/theme';
import {
  Screen, Card, Row, H2, H3, Small, Overline, Button, Loading, Pill, Divider,
} from '../../components/ui';
import { LineChart } from '../../components/charts';

export default function LabPanelDetailScreen({ route }) {
  const nav = useNavigation();
  const { panelId, patientId } = route.params;
  const { invalidate } = useApp();
  const { width } = useWindowDimensions();
  const chartW = width - space.lg * 2 - space.lg * 2;

  const { data, loading } = useData(async () => {
    const panels = await listPanels(patientId);
    const panel = panels.find((p) => p.id === panelId);
    const results = await panelResults(panelId);
    const histories = {};
    for (const r of results) {
      histories[r.analyte] = await analyteHistory(patientId, r.analyte);
    }
    return { panel, results, histories };
  }, [panelId, patientId]);

  if (loading || !data || !data.panel) return <Screen scroll={false}><Loading /></Screen>;

  const { panel, results, histories } = data;
  const abnormal = results.filter(
    (r) => (r.ref_low != null && r.value < r.ref_low) || (r.ref_high != null && r.value > r.ref_high)
  );

  const remove = () =>
    Alert.alert('Delete this panel?', 'Every result in it is removed from the trends and the doctor summary.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => { await deletePanel(panelId); invalidate(); nav.goBack(); },
      },
    ]);

  return (
    <Screen>
      <Overline style={{ color: colors.primary }}>{fmtDate(panel.collected_on)}</Overline>
      <H2 style={{ marginTop: 2 }}>{panel.panel}</H2>
      <Small>
        {panel.lab_name || 'Laboratory not recorded'}
        {panel.recorded_by_name ? ` · entered by ${panel.recorded_by_name}` : ''}
      </Small>

      <Pill
        label={abnormal.length ? `${abnormal.length} outside the reference range` : 'All results within range'}
        color={abnormal.length ? colors.warn : colors.ok}
        style={{ marginTop: space.md }}
      />

      {panel.note ? (
        <Card style={{ marginTop: space.md }}>
          <Small>{panel.note}</Small>
        </Card>
      ) : null}

      {results.map((r) => {
        const history = histories[r.analyte] || [];
        const low = r.ref_low != null && r.value < r.ref_low;
        const high = r.ref_high != null && r.value > r.ref_high;
        const out = low || high;
        return (
          <Card key={r.id} style={{ marginTop: space.md }} accent={out ? colors.warn : colors.border}>
            <Row justify="space-between" align="flex-start">
              <View style={{ flex: 1 }}>
                <H3>{r.analyte}</H3>
                <Small>Reference {r.ref_low ?? '—'}–{r.ref_high ?? '—'} {r.unit}</Small>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[s.value, out && { color: colors.warn }]}>
                  {r.value} <Text style={s.unit}>{r.unit}</Text>
                </Text>
                {out ? <Pill label={low ? 'Low' : 'High'} color={colors.warn} small /> : null}
              </View>
            </Row>

            {history.length > 1 ? (
              <>
                <Divider />
                <Small style={{ marginBottom: 4 }}>
                  {history.length} results since {fmtShortDate(history[0].collected_on)}
                </Small>
                <LineChart
                  data={history.map((h) => ({ x: h.collected_on, y: h.value }))}
                  width={chartW}
                  height={140}
                  refLow={r.ref_low}
                  refHigh={r.ref_high}
                  unit={r.unit}
                  decimals={Math.abs(r.value) < 10 ? 2 : 0}
                />
              </>
            ) : null}
          </Card>
        );
      })}

      <Button title="Delete this panel" variant="ghost" onPress={remove} style={{ marginTop: space.xl }} />
    </Screen>
  );
}

const s = StyleSheet.create({
  value: { fontSize: 20, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  unit: { fontSize: 12, fontWeight: '600', color: colors.muted },
});
