import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useApp, useData } from '../../context/AppContext';
import { getUser, listEmergencyMedications } from '../../db/queries';
import { daySchedule, summarise } from '../../services/schedule';
import { adherenceReport } from '../../services/adherence';
import { dateKey, age, fmtDate } from '../../utils/date';
import { colors, space, radius, adherenceColor } from '../../theme/theme';
import {
  Card, Row, Small, Overline, Segmented, Button, Loading, Pill, Avatar, EmptyState, H3,
} from '../../components/ui';
import { Donut } from '../../components/charts';
import { ShieldIcon, ChartIcon } from '../../components/icons';
import DoseCard from '../../components/DoseCard';

import HealthScreen from '../patient/HealthScreen';
import CarePlanScreen from '../patient/CarePlanScreen';

const TABS = [
  { value: 'today', label: 'Today' },
  { value: 'health', label: 'Health' },
  { value: 'plan', label: 'Care plan' },
];

/**
 * The caretaker's view of one patient. Deliberately reuses the patient's own
 * Health and Care plan screens rather than cloning them — one implementation
 * of "how a lab panel looks" is easier to keep correct than two.
 */
export default function PatientDetailScreen({ route }) {
  const { patientId } = route.params;
  const [tab, setTab] = useState('today');

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={s.tabBar}>
        <Segmented options={TABS} value={tab} onChange={setTab} />
      </View>
      <View style={{ flex: 1 }}>
        {tab === 'today' ? <TodayPane patientId={patientId} /> : null}
        {tab === 'health' ? (
          <HealthScreen route={{ params: { patientId, embedded: true } }} />
        ) : null}
        {tab === 'plan' ? (
          <CarePlanScreen route={{ params: { patientId, embedded: true } }} />
        ) : null}
      </View>
    </View>
  );
}

function TodayPane({ patientId }) {
  const nav = useNavigation();
  const { user, invalidate, sweep } = useApp();
  const today = dateKey();

  const { data, loading, reload } = useData(async () => {
    const [patient, schedule, report, rescue] = await Promise.all([
      getUser(patientId),
      daySchedule(patientId, today),
      adherenceReport(patientId, 90),
      listEmergencyMedications(patientId),
    ]);
    return { patient, schedule, report, rescue };
  }, [patientId]);

  const after = async () => { await reload(); invalidate(); sweep({ notify: false }); };

  if (loading || !data) return <Loading />;

  const { patient, schedule, report, rescue } = data;
  const stats = summarise(schedule);

  return (
    <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
      <Card>
        <Row gap={space.md}>
          <Avatar name={patient.name} color={patient.color} size={52} ring />
          <View style={{ flex: 1 }}>
            <Text style={s.name}>{patient.name}</Text>
            <Small>
              {age(patient.dob) ? `${age(patient.dob)} years` : ''}
              {patient.sex ? ` · ${patient.sex}` : ''}
              {patient.blood_group ? ` · ${patient.blood_group}` : ''}
            </Small>
            {patient.allergies ? (
              <Pill label={`Allergies: ${patient.allergies}`} color={colors.warn} small style={{ marginTop: 5 }} />
            ) : null}
          </View>
        </Row>

        <Row gap={space.lg} style={{ marginTop: space.lg }}>
          <Donut value={report.adherence} size={92} label="90-day" />
          <View style={{ flex: 1, gap: space.md }}>
            <Metric label="Doses missed" value={report.missed}
              color={report.missed ? colors.warn : colors.ok} />
            <Metric label="Longest clean run" value={`${report.longestStreak} days`} color={colors.text} />
            <Metric label="Today" value={`${stats.taken}/${Math.max(0, stats.total - stats.skipped)}`}
              color={colors.text} />
          </View>
        </Row>
      </Card>

      <Row gap={space.sm} style={{ marginTop: space.md }}>
        <Button
          title="Doctor view"
          icon="›"
          variant="primary"
          style={{ flex: 1 }}
          onPress={() => nav.navigate('DoctorSummary', { patientId })}
        />
        {rescue.length ? (
          <Button
            title="Rescue meds"
            variant="ghost"
            style={{ flex: 1 }}
            onPress={() => nav.navigate('Emergency', { patientId })}
          />
        ) : null}
      </Row>

      <Row gap={space.sm} style={{ marginTop: space.sm }}>
        <Button title="Log reading" variant="soft" size="sm" style={{ flex: 1 }}
          onPress={() => nav.navigate('LogVital', { patientId })} />
        <Button title="Log symptom" variant="soft" size="sm" style={{ flex: 1 }}
          onPress={() => nav.navigate('LogSymptom', { patientId })} />
      </Row>

      <Overline style={{ color: colors.muted, marginTop: space.xl, marginBottom: space.sm }}>
        Today’s doses
      </Overline>

      {schedule.length === 0 ? (
        <EmptyState icon="○" title="No scheduled medicines"
          action="Add one" onAction={() => nav.navigate('MedicationForm', { patientId })} />
      ) : (
        schedule.map((slot) => (
          <DoseCard key={slot.key} slot={slot} patient={patient} actor={user} onChanged={after} />
        ))
      )}
    </ScrollView>
  );
}

function Metric({ label, value, color }) {
  return (
    <View>
      <Text style={[s.metricValue, { color }]}>{value}</Text>
      <Text style={s.metricLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  tabBar: {
    paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm,
    backgroundColor: colors.bg,
  },
  body: { padding: space.lg, paddingTop: space.sm, paddingBottom: space.xxl * 2 },
  name: { fontSize: 19, fontWeight: '700', color: colors.text },
  metricValue: { fontSize: 19, fontWeight: '800', letterSpacing: -0.5 },
  metricLabel: { fontSize: 11.5, color: colors.muted, marginTop: -1 },
});
