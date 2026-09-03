import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useApp, useData } from '../../context/AppContext';
import { adherenceTrend } from '../../services/adherence';
import { followUpStats } from '../../services/patterns';
import { listAppointments } from '../../db/queries';
import { colors, space, radius, adherenceColor } from '../../theme/theme';
import {
  Screen, Card, Row, H2, Small, Overline, Button, Loading, Pill, Avatar, Divider,
} from '../../components/ui';
import { Donut, AdherenceBars } from '../../components/charts';

/**
 * Caretaker's analytics entry point. Both patients side by side, then through
 * to the full Doctor View for whichever one needs the conversation.
 */
export default function InsightsHubScreen() {
  const nav = useNavigation();
  const { patients } = useApp();
  const { width } = useWindowDimensions();
  const chartW = width - space.lg * 2 - space.lg * 2;

  const { data, loading } = useData(async () => {
    const rows = [];
    for (const p of patients) {
      const { current, delta } = await adherenceTrend(p.id, 30);
      const appts = await listAppointments(p.id);
      rows.push({ patient: p, report: current, delta, followUp: followUpStats(appts) });
    }
    return rows;
  }, [patients.map((p) => p.id).join(',')]);

  if (loading || !data) return <Screen scroll={false}><Loading /></Screen>;

  return (
    <Screen>
      <H2>Insights</H2>
      <Small style={{ marginBottom: space.md }}>
        Thirty-day view. Open a patient for the full analysis you can hand to their doctor.
      </Small>

      {data.map(({ patient, report, delta, followUp }) => (
        <Card key={patient.id} style={{ marginTop: space.md }} accent={patient.color}>
          <Row gap={space.md}>
            <Avatar name={patient.name} color={patient.color} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{patient.name}</Text>
              <Small>
                {report.perMedication.length} medicine{report.perMedication.length === 1 ? '' : 's'} ·{' '}
                {followUp.totalVisits} visits attended
              </Small>
            </View>
            {delta != null ? (
              <Pill
                label={`${delta > 0 ? '+' : ''}${delta} pts`}
                color={delta >= 0 ? colors.ok : colors.danger}
                small
              />
            ) : null}
          </Row>

          <Divider />

          <Row gap={space.lg}>
            <Donut value={report.adherence} size={96} label="30-day" />
            <View style={{ flex: 1, gap: space.sm }}>
              <Line label="Doses missed" value={report.missed}
                color={report.missed ? colors.warn : colors.ok} />
              <Line label="Clean-run streak" value={`${report.currentStreak} d`} color={colors.text} />
              <Line
                label="Weakest link"
                value={report.worstMedication?.name || '—'}
                sub={report.worstMedication?.adherence != null ? `${report.worstMedication.adherence}%` : null}
                color={colors.text}
                small
              />
            </View>
          </Row>

          <Small style={{ marginTop: space.lg, marginBottom: space.sm }}>Adherence by time of day</Small>
          <AdherenceBars data={report.byBucket} labelKey="bucket" width={chartW} height={120} />

          <Button
            title={`Doctor view for ${patient.name.split(' ')[0]}`}
            variant="primary"
            style={{ marginTop: space.md }}
            onPress={() => nav.navigate('DoctorSummary', { patientId: patient.id })}
          />
        </Card>
      ))}

      <Card style={s.note}>
        <Overline style={{ color: colors.muted }}>What the Doctor View adds</Overline>
        <Text style={s.noteText}>
          Per-drug and per-time-slot breakdowns, the day-of-week pattern, laboratory trends, a
          comparison of home readings on adherent versus non-adherent days, and a stated method so
          the clinician knows exactly how each figure was produced. Exportable as a PDF.
        </Text>
      </Card>
    </Screen>
  );
}

function Line({ label, value, sub, color, small }) {
  return (
    <View>
      <Row gap={5} align="baseline">
        <Text style={[s.lineValue, { color }, small && { fontSize: 14 }]} numberOfLines={1}>{value}</Text>
        {sub ? <Text style={[s.lineSub, { color: adherenceColor(parseFloat(sub)) }]}>{sub}</Text> : null}
      </Row>
      <Text style={s.lineLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  name: { fontSize: 16.5, fontWeight: '700', color: colors.text },
  lineValue: { fontSize: 19, fontWeight: '800', letterSpacing: -0.5 },
  lineSub: { fontSize: 13, fontWeight: '800' },
  lineLabel: { fontSize: 11.5, color: colors.muted, marginTop: -1 },
  note: { marginTop: space.xl, backgroundColor: colors.bg },
  noteText: { fontSize: 12.5, color: colors.muted, lineHeight: 18.5, marginTop: space.sm },
});
