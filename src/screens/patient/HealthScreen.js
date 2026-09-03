import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useApp, useData } from '../../context/AppContext';
import {
  vitalsSince, listPanels, panelResults, listSymptoms, deleteSymptom, deleteVital,
} from '../../db/queries';
import { summariseVitals } from '../../services/patterns';
import { VITAL_TYPES } from '../../db/schema';
import { dateKey, addDays, fmtDate, fmtShortDate, dayOf, relative } from '../../utils/date';
import { colors, space, radius, flagColor } from '../../theme/theme';
import {
  Screen, Card, Row, H2, Small, Overline, Segmented, Button, Loading,
  EmptyState, Pill, ListItem, Divider,
} from '../../components/ui';
import { LineChart } from '../../components/charts';
import { PlusIcon, FlaskIcon } from '../../components/icons';

const TABS = [
  { value: 'vitals', label: 'Vitals' },
  { value: 'labs', label: 'Labs' },
  { value: 'symptoms', label: 'Symptoms' },
];

export default function HealthScreen({ route }) {
  const nav = useNavigation();
  const { user, invalidate } = useApp();
  const patientId = route?.params?.patientId ?? user.id;
  const [tab, setTab] = useState(route?.params?.tab || 'vitals');
  const { width } = useWindowDimensions();
  const chartW = width - space.lg * 2 - space.lg * 2;

  const { data, loading, reload } = useData(async () => {
    const since = dateKey(addDays(new Date(), -89));
    const [vitals, panels, symptoms] = await Promise.all([
      vitalsSince(patientId, since),
      listPanels(patientId),
      listSymptoms(patientId, 60),
    ]);
    const panelsWithResults = [];
    for (const p of panels.slice(0, 12)) {
      panelsWithResults.push({ ...p, results: await panelResults(p.id) });
    }
    return { vitals, panels: panelsWithResults, symptoms };
  }, [patientId]);

  const summaries = useMemo(() => (data ? summariseVitals(data.vitals) : []), [data]);

  const after = async () => { await reload(); invalidate(); };

  // When rendered inside the caretaker's patient detail screen, the parent has
  // already consumed the top safe-area inset.
  const edges = route?.params?.embedded ? [] : ['top'];

  if (loading || !data) return <Screen scroll={false} edges={edges}><Loading /></Screen>;

  return (
    <Screen onRefresh={after} edges={edges}>
      <H2>Health record</H2>
      <Small style={{ marginBottom: space.md }}>Last 90 days, entered by hand</Small>

      <Segmented options={TABS} value={tab} onChange={setTab} />

      {tab === 'vitals' ? (
        <>
          <Button
            title="Log a reading"
            icon="+"
            variant="soft"
            onPress={() => nav.navigate('LogVital', { patientId })}
            style={{ marginTop: space.lg }}
          />
          {summaries.length === 0 ? (
            <EmptyState icon="○" title="No readings yet"
              body="Blood pressure, sugar, weight and oxygen readings you enter will chart here against their target range." />
          ) : (
            summaries.map((v) => {
              const meta = VITAL_TYPES[v.type] || {};
              return (
                <Card key={v.type} style={{ marginTop: space.md }}
                  onPress={() => nav.navigate('VitalDetail', { patientId, type: v.type, label: v.label })}>
                  <Row justify="space-between" align="flex-start">
                    <View>
                      <Text style={s.vitalLabel}>{v.label}</Text>
                      <Row gap={6} style={{ marginTop: 2 }}>
                        <Text style={s.vitalValue}>
                          {Number(v.latest.value).toFixed(v.decimals ?? 0)}
                          <Text style={s.vitalUnit}> {v.unit}</Text>
                        </Text>
                        <Small>{relative(v.latest.recorded_at)}</Small>
                      </Row>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Pill
                        label={v.outOfRangePct >= 30 ? `${v.outOfRangePct}% out of range` : 'Mostly in range'}
                        color={v.outOfRangePct >= 30 ? colors.warn : colors.ok}
                        small
                      />
                      <Small>mean {v.mean} {v.unit}</Small>
                    </View>
                  </Row>
                  <View style={{ marginTop: space.md }}>
                    <LineChart
                      data={v.series.slice(-45)}
                      width={chartW}
                      height={150}
                      refLow={meta.low}
                      refHigh={meta.high}
                      unit={v.unit}
                      decimals={v.decimals ?? 0}
                      showDots={v.series.length <= 30}
                    />
                  </View>
                </Card>
              );
            })
          )}
        </>
      ) : null}

      {tab === 'labs' ? (
        <>
          <Button
            title="Enter lab results"
            icon="+"
            variant="soft"
            onPress={() => nav.navigate('LabPanelForm', { patientId })}
            style={{ marginTop: space.lg }}
          />
          {data.panels.length === 0 ? (
            <EmptyState icon="○" title="No lab panels yet"
              body="Enter a Basic Metabolic Panel, thyroid, lipid or HbA1c report and each analyte will be tracked against its reference range." />
          ) : (
            data.panels.map((p) => {
              const abnormal = p.results.filter(
                (r) => (r.ref_low != null && r.value < r.ref_low) || (r.ref_high != null && r.value > r.ref_high)
              );
              return (
                <Card key={p.id} style={{ marginTop: space.md }}
                  onPress={() => nav.navigate('LabPanelDetail', { panelId: p.id, patientId })}>
                  <Row justify="space-between" align="flex-start">
                    <Row gap={space.sm} style={{ flex: 1 }}>
                      <FlaskIcon size={19} color={colors.primary} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.panelName}>{p.panel}</Text>
                        <Small>{fmtDate(p.collected_on)}{p.lab_name ? ` · ${p.lab_name}` : ''}</Small>
                      </View>
                    </Row>
                    <Pill
                      label={abnormal.length ? `${abnormal.length} out of range` : 'All normal'}
                      color={abnormal.length ? colors.warn : colors.ok}
                      small
                    />
                  </Row>
                  {abnormal.length ? (
                    <>
                      <Divider style={{ marginVertical: space.sm }} />
                      <Row gap={space.sm} wrap>
                        {abnormal.slice(0, 4).map((r) => (
                          <View key={r.id} style={s.abnormalChip}>
                            <Text style={s.abnormalName}>{r.analyte}</Text>
                            <Text style={s.abnormalValue}>{r.value} {r.unit}</Text>
                          </View>
                        ))}
                      </Row>
                    </>
                  ) : null}
                </Card>
              );
            })
          )}
        </>
      ) : null}

      {tab === 'symptoms' ? (
        <>
          <Button
            title="Log a symptom"
            icon="+"
            variant="soft"
            onPress={() => nav.navigate('LogSymptom', { patientId })}
            style={{ marginTop: space.lg }}
          />
          {data.symptoms.length === 0 ? (
            <EmptyState icon="○" title="Nothing logged"
              body="Symptoms build the picture the doctor reads. Red-flag symptoms alert the caretaker immediately." />
          ) : (
            <View style={{ marginTop: space.md }}>
              {data.symptoms.map((sym) => (
                <ListItem
                  key={sym.id}
                  accent={sym.red_flag ? colors.danger : colors.border}
                  title={sym.name}
                  subtitle={`${fmtShortDate(dayOf(sym.noted_at))} · severity ${sym.severity}/5${
                    sym.recorded_by_name ? ` · logged by ${sym.recorded_by_name}` : ''
                  }${sym.note ? `\n${sym.note}` : ''}`}
                  right={sym.red_flag ? <Pill label="Red flag" color={colors.danger} small /> : null}
                  onPress={() =>
                    Alert.alert(sym.name, sym.note || 'No further note.', [
                      { text: 'Close', style: 'cancel' },
                      {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: async () => { await deleteSymptom(sym.id); await after(); },
                      },
                    ])
                  }
                />
              ))}
            </View>
          )}
        </>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  vitalLabel: { fontSize: 13, fontWeight: '700', color: colors.muted },
  vitalValue: { fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.7 },
  vitalUnit: { fontSize: 13, fontWeight: '600', color: colors.muted },
  panelName: { fontSize: 15, fontWeight: '700', color: colors.text },
  abnormalChip: {
    backgroundColor: colors.warnSoft, borderRadius: radius.sm,
    paddingHorizontal: 8, paddingVertical: 5,
  },
  abnormalName: { fontSize: 10.5, color: colors.warn, fontWeight: '700' },
  abnormalValue: { fontSize: 12.5, color: colors.warn, fontWeight: '800' },
});
