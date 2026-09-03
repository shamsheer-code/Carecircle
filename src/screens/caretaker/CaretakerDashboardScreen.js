import React from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useApp, useData } from '../../context/AppContext';
import { daySchedule, summarise } from '../../services/schedule';
import { adherenceReport } from '../../services/adherence';
import { listAlerts, upcomingAppointments } from '../../db/queries';
import { dateKey, fmtDate, fmtShortDate, fmtTime } from '../../utils/date';
import { colors, space, radius, adherenceColor } from '../../theme/theme';
import {
  Screen, Card, Row, H2, Small, Overline, Loading, Pill, Avatar, Banner, Divider,
} from '../../components/ui';
import { Donut, AdherenceStrip } from '../../components/charts';
import { ChevronIcon, CalendarIcon, AlertIcon } from '../../components/icons';
import DoseCard from '../../components/DoseCard';

/**
 * The caretaker's home. Two patients, side by side, answering the only
 * question that matters at 9am: has everything been taken, and if not, what.
 */
export default function CaretakerDashboardScreen() {
  const nav = useNavigation();
  const { user, patients, invalidate, sweep } = useApp();
  const { width } = useWindowDimensions();
  const stripW = width - space.lg * 2 - space.lg * 2;
  const today = dateKey();

  const { data, loading, reload } = useData(async () => {
    const rows = [];
    for (const p of patients) {
      const [schedule, report, alerts, appts] = await Promise.all([
        daySchedule(p.id, today),
        adherenceReport(p.id, 30),
        listAlerts({ patientId: p.id, limit: 20 }),
        upcomingAppointments(p.id),
      ]);
      rows.push({ patient: p, schedule, report, alerts, nextVisit: appts[0] || null });
    }
    return rows;
  }, [patients.map((p) => p.id).join(',')]);

  const after = async () => {
    await reload();
    invalidate();
    sweep({ notify: false });
  };

  if (loading || !data) return <Screen scroll={false}><Loading /></Screen>;

  const totalActionable = data.reduce(
    (n, r) => n + r.schedule.filter((s) => s.status === 'overdue' || s.status === 'due').length,
    0
  );
  const criticalAlerts = data.reduce(
    (n, r) => n + r.alerts.filter((a) => a.severity === 'critical').length, 0
  );

  return (
    <Screen onRefresh={after}>
      <Overline style={{ color: colors.primary }}>{fmtDate(today)}</Overline>
      <H2 style={{ marginTop: 2 }}>Good day, {user.name.split(' ')[0]}</H2>
      <Small style={{ marginBottom: space.md }}>
        {totalActionable === 0
          ? 'Nothing needs your attention right now.'
          : `${totalActionable} dose${totalActionable > 1 ? 's need' : ' needs'} attention across both patients.`}
      </Small>

      {criticalAlerts > 0 ? (
        <Banner
          tone="danger"
          title={`${criticalAlerts} critical alert${criticalAlerts > 1 ? 's' : ''}`}
          body="Missed critical doses, red-flag symptoms or abnormal labs."
          action="Review"
          onAction={() => nav.navigate('Alerts')}
        />
      ) : null}

      {data.map(({ patient, schedule, report, alerts, nextVisit }) => {
        const stats = summarise(schedule);
        const denom = Math.max(1, stats.total - stats.skipped - stats.upcoming);
        const todayPct = stats.total ? Math.round((stats.taken / denom) * 100) : null;
        const needsAction = schedule.filter((s) => s.status === 'overdue' || s.status === 'due');
        const unread = alerts.filter((a) => !a.read_at).length;

        return (
          <Card key={patient.id} style={{ marginTop: space.lg }} accent={patient.color}>
            <Pressable
              onPress={() => nav.navigate('PatientDetail', { patientId: patient.id, name: patient.name })}
            >
              <Row justify="space-between">
                <Row gap={space.md} style={{ flex: 1 }}>
                  <Avatar name={patient.name} color={patient.color} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.name}>{patient.name}</Text>
                    <Small>
                      {stats.taken} of {Math.max(0, stats.total - stats.skipped)} doses today
                    </Small>
                  </View>
                </Row>
                <Row gap={6}>
                  {unread ? <Pill label={`${unread} new`} color={colors.danger} small /> : null}
                  <ChevronIcon size={18} color={colors.faint} />
                </Row>
              </Row>
            </Pressable>

            <Divider />

            <Row gap={space.lg}>
              <Donut value={todayPct} size={92} label="Today" />
              <View style={{ flex: 1, gap: space.md }}>
                <Metric
                  label="30-day adherence"
                  value={`${report.adherence ?? '—'}%`}
                  color={adherenceColor(report.adherence)}
                  sub={`${report.missed} missed of ${report.expected - report.skipped}`}
                />
                <Metric
                  label="Worst medicine"
                  value={report.worstMedication?.name || '—'}
                  color={colors.text}
                  small
                  sub={
                    report.worstMedication?.adherence != null
                      ? `${report.worstMedication.adherence}% taken`
                      : 'Not enough history'
                  }
                />
              </View>
            </Row>

            <View style={s.stripBox}>
              <AdherenceStrip daily={report.daily} width={stripW} height={44} />
            </View>

            {needsAction.length ? (
              <View style={{ marginTop: space.md }}>
                <Overline style={{ color: colors.danger, marginBottom: space.sm }}>
                  Needs action now
                </Overline>
                {needsAction.map((slot) => (
                  <DoseCard
                    key={slot.key}
                    slot={slot}
                    patient={patient}
                    actor={user}
                    onChanged={after}
                    compact
                  />
                ))}
              </View>
            ) : (
              <View style={s.allClear}>
                <Text style={s.allClearText}>
                  {stats.upcoming > 0
                    ? `On track. ${stats.upcoming} dose${stats.upcoming > 1 ? 's' : ''} still to come today.`
                    : 'All of today’s doses are accounted for.'}
                </Text>
              </View>
            )}

            {nextVisit ? (
              <Row gap={space.sm} style={{ marginTop: space.md }}>
                <CalendarIcon size={16} color={colors.muted} />
                <Small style={{ flex: 1 }}>
                  {nextVisit.doctor_name} · {fmtShortDate(nextVisit.scheduled_for)}
                  {nextVisit.purpose ? ` · ${nextVisit.purpose}` : ''}
                </Small>
              </Row>
            ) : null}
          </Card>
        );
      })}
    </Screen>
  );
}

function Metric({ label, value, sub, color, small }) {
  return (
    <View>
      <Text style={[s.metricValue, { color }, small && { fontSize: 15 }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={s.metricLabel}>{label}</Text>
      {sub ? <Text style={s.metricSub}>{sub}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  name: { fontSize: 17, fontWeight: '700', color: colors.text },
  stripBox: { marginTop: space.md },
  metricValue: { fontSize: 21, fontWeight: '800', letterSpacing: -0.6 },
  metricLabel: { fontSize: 11.5, color: colors.muted, marginTop: -1, fontWeight: '600' },
  metricSub: { fontSize: 10.5, color: colors.faint, marginTop: 1 },
  allClear: {
    marginTop: space.md, backgroundColor: colors.okSoft,
    borderRadius: radius.sm, padding: space.md,
  },
  allClearText: { fontSize: 13, color: colors.ok, fontWeight: '600', textAlign: 'center' },
});
