import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useApp, useData } from '../../context/AppContext';
import { daySchedule, summarise } from '../../services/schedule';
import { adherenceReport } from '../../services/adherence';
import { listAlerts, upcomingAppointments, listEmergencyMedications } from '../../db/queries';
import { dateKey, fmtDate, fmtShortDate } from '../../utils/date';
import { colors, space, radius, adherenceColor } from '../../theme/theme';
import {
  Screen, Card, Row, H2, Small, Overline, Button, Banner, Loading, EmptyState, Pill,
} from '../../components/ui';
import { Donut, AdherenceStrip } from '../../components/charts';
import { HeartIcon, AlertIcon, CalendarIcon, ShieldIcon } from '../../components/icons';
import DoseCard from '../../components/DoseCard';

const BUCKETS = ['Morning', 'Afternoon', 'Evening', 'Night'];

export default function PatientTodayScreen() {
  const nav = useNavigation();
  const { user, invalidate, sweep } = useApp();
  const { width } = useWindowDimensions();
  const chartW = width - space.lg * 2 - space.lg * 2;

  const today = dateKey();

  const { data, loading, reload } = useData(async () => {
    const [schedule, report, alerts, appts, rescue] = await Promise.all([
      daySchedule(user.id, today),
      adherenceReport(user.id, 30),
      listAlerts({ patientId: user.id, limit: 4 }),
      upcomingAppointments(user.id),
      listEmergencyMedications(user.id),
    ]);
    return { schedule, report, alerts, appts, rescue };
  }, [user.id]);

  const grouped = useMemo(() => {
    if (!data) return [];
    const map = new Map(BUCKETS.map((b) => [b, []]));
    for (const slot of data.schedule) {
      if (!map.has(slot.bucket)) map.set(slot.bucket, []);
      map.get(slot.bucket).push(slot);
    }
    return [...map.entries()].filter(([, slots]) => slots.length);
  }, [data]);

  const onChanged = async () => {
    await reload();
    invalidate();
    sweep({ notify: false });
  };

  if (loading || !data) return <Screen scroll={false}><Loading /></Screen>;

  const stats = summarise(data.schedule);
  const todayPct = stats.total
    ? Math.round((stats.taken / Math.max(1, stats.total - stats.skipped - stats.upcoming)) * 100)
    : null;
  const nextUp = data.schedule.find((s) => s.status === 'due' || s.status === 'upcoming');
  const overdue = data.schedule.filter((s) => s.status === 'overdue');
  const nextVisit = data.appts[0];

  return (
    <Screen onRefresh={onChanged}>
      <Row justify="space-between" align="flex-start">
        <View style={{ flex: 1 }}>
          <Overline style={{ color: colors.primary }}>{fmtDate(today)}</Overline>
          <H2 style={{ marginTop: 2 }}>Hello, {user.name.split(' ')[0]}</H2>
        </View>
        {data.rescue.length ? (
          <Pressable
            onPress={() => nav.navigate('Emergency', { patientId: user.id })}
            style={({ pressed }) => [s.sos, pressed && { opacity: 0.7 }]}
          >
            <ShieldIcon size={16} color={colors.danger} />
            <Text style={s.sosText}>Rescue</Text>
          </Pressable>
        ) : null}
      </Row>

      {overdue.length ? (
        <Banner
          tone="danger"
          title={`${overdue.length} dose${overdue.length > 1 ? 's' : ''} overdue`}
          body={`${overdue.map((o) => o.medication.name).join(', ')}. Your caretaker has been notified.`}
        />
      ) : null}

      {/* progress + today counts */}
      <Card style={{ marginTop: space.md }}>
        <Row gap={space.lg}>
          <Donut
            value={todayPct}
            size={104}
            label="Today"
            sublabel={`${stats.taken}/${Math.max(0, stats.total - stats.skipped)} doses`}
          />
          <View style={{ flex: 1, gap: space.sm }}>
            <MiniStat label="30-day adherence" value={`${data.report.adherence ?? '—'}%`}
              color={adherenceColor(data.report.adherence)} />
            <MiniStat label="Days without a miss" value={`${data.report.currentStreak}`}
              color={data.report.currentStreak >= 7 ? colors.ok : colors.text} />
            <MiniStat label="Missed this month" value={`${data.report.missed}`}
              color={data.report.missed > 0 ? colors.warn : colors.ok} />
          </View>
        </Row>

        <View style={s.stripBox}>
          <Small style={{ marginBottom: 4 }}>Last 60 days</Small>
          <AdherenceStrip daily={data.report.daily} width={chartW} />
        </View>
      </Card>

      {nextUp && nextUp.status === 'upcoming' ? (
        <Card style={s.nextCard} accent={colors.primary}>
          <Overline style={{ color: colors.primary }}>Next dose</Overline>
          <Text style={s.nextText}>
            {nextUp.medication.name} {nextUp.medication.dose} at {nextUp.time}
          </Text>
          {nextUp.medication.instructions ? (
            <Small style={{ marginTop: 3 }}>{nextUp.medication.instructions}</Small>
          ) : null}
        </Card>
      ) : null}

      {/* doses */}
      {grouped.length === 0 ? (
        <EmptyState
          icon="○"
          title="No medications scheduled"
          body="Ask your caretaker to add your treatment plan, or add it yourself from the Care plan tab."
        />
      ) : (
        grouped.map(([bucket, slots]) => (
          <View key={bucket} style={{ marginTop: space.lg }}>
            <Row justify="space-between" style={{ marginBottom: space.sm }}>
              <Overline style={{ color: colors.muted }}>{bucket}</Overline>
              <Small>{slots.filter((x) => x.status === 'taken').length}/{slots.length} taken</Small>
            </Row>
            {slots.map((slot) => (
              <DoseCard key={slot.key} slot={slot} patient={user} actor={user} onChanged={onChanged} />
            ))}
          </View>
        ))
      )}

      {/* quick logging */}
      <Row gap={space.sm} style={{ marginTop: space.xl }}>
        <QuickAction
          icon={<HeartIcon size={19} color={colors.primary} />}
          label="Log a reading"
          onPress={() => nav.navigate('LogVital', { patientId: user.id })}
        />
        <QuickAction
          icon={<AlertIcon size={19} color={colors.warn} />}
          label="Log a symptom"
          onPress={() => nav.navigate('LogSymptom', { patientId: user.id })}
        />
      </Row>

      {nextVisit ? (
        <Card style={{ marginTop: space.md }} onPress={() => nav.navigate('CarePlan')}>
          <Row gap={space.md}>
            <CalendarIcon size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={s.visitTitle}>{nextVisit.doctor_name}</Text>
              <Small>{nextVisit.purpose || 'Review'} · {fmtShortDate(nextVisit.scheduled_for)}</Small>
            </View>
            <Pill label="Upcoming" color={colors.primary} small />
          </Row>
        </Card>
      ) : null}

      {data.alerts.length ? (
        <View style={{ marginTop: space.lg }}>
          <Overline style={{ color: colors.muted, marginBottom: space.sm }}>Recent alerts</Overline>
          {data.alerts.map((a) => (
            <Banner
              key={a.id}
              tone={a.severity === 'critical' ? 'danger' : a.severity === 'warn' ? 'warn' : 'info'}
              title={a.title}
              body={a.body}
            />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

function MiniStat({ label, value, color }) {
  return (
    <View>
      <Text style={[s.miniValue, { color }]}>{value}</Text>
      <Text style={s.miniLabel}>{label}</Text>
    </View>
  );
}

function QuickAction({ icon, label, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.quick, pressed && { opacity: 0.7 }]}>
      {icon}
      <Text style={s.quickText}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  sos: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.dangerSoft, paddingHorizontal: space.md,
    paddingVertical: 8, borderRadius: radius.pill,
  },
  sosText: { color: colors.danger, fontWeight: '800', fontSize: 12.5 },
  stripBox: { marginTop: space.lg, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.border },
  miniValue: { fontSize: 21, fontWeight: '800', letterSpacing: -0.6 },
  miniLabel: { fontSize: 11.5, color: colors.muted, marginTop: -1 },
  nextCard: { marginTop: space.md, paddingVertical: space.md },
  nextText: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 3 },
  quick: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: colors.card, borderRadius: radius.md, paddingVertical: space.md,
    borderWidth: 1, borderColor: colors.border,
  },
  quickText: { fontSize: 13.5, fontWeight: '700', color: colors.text },
  visitTitle: { fontSize: 14.5, fontWeight: '700', color: colors.text },
});
