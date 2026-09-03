import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useApp, useData } from '../../context/AppContext';
import {
  listConditions, listMedications, listAppointments,
  archiveMedication, updateAppointment, deleteAppointment, deleteCondition,
} from '../../db/queries';
import { adherenceReport } from '../../services/adherence';
import { followUpStats } from '../../services/patterns';
import { parseTimes } from '../../services/schedule';
import { fmtDate, fmtTime, dateKey } from '../../utils/date';
import { colors, space, radius, adherenceColor } from '../../theme/theme';
import {
  Screen, Card, Row, H2, H3, Small, Overline, Segmented, Button, Loading,
  EmptyState, Pill, ListItem, Divider, Banner,
} from '../../components/ui';
import { CalendarIcon, PillIcon, ClipboardIcon } from '../../components/icons';

const TABS = [
  { value: 'conditions', label: 'Conditions' },
  { value: 'medications', label: 'Medicines' },
  { value: 'visits', label: 'Visits' },
];

const SEVERITY_COLOR = { mild: colors.ok, moderate: colors.warn, severe: colors.danger };
const STATUS_COLOR = {
  completed: colors.ok, missed: colors.danger, scheduled: colors.primary, cancelled: colors.faint,
};

export default function CarePlanScreen({ route }) {
  const nav = useNavigation();
  const { user, invalidate, rescheduleReminders } = useApp();
  const patientId = route?.params?.patientId ?? user.id;
  const canEdit = user.role === 'caretaker' || user.id === patientId;
  const [tab, setTab] = useState(route?.params?.tab || 'conditions');

  const { data, loading, reload } = useData(async () => {
    const [conditions, medications, appointments, report] = await Promise.all([
      listConditions(patientId),
      listMedications(patientId, { includeInactive: true }),
      listAppointments(patientId),
      adherenceReport(patientId, 30),
    ]);
    return { conditions, medications, appointments, report, followUp: followUpStats(appointments) };
  }, [patientId]);

  const after = async () => {
    await reload();
    await rescheduleReminders();
    invalidate();
  };

  // Embedded inside the caretaker's patient detail screen, the top inset is
  // already handled by the parent.
  const edges = route?.params?.embedded ? [] : ['top'];

  if (loading || !data) return <Screen scroll={false} edges={edges}><Loading /></Screen>;

  const adherenceByMed = new Map(data.report.perMedication.map((m) => [m.id, m]));

  return (
    <Screen onRefresh={after} edges={edges}>
      <H2>Care plan</H2>
      <Small style={{ marginBottom: space.md }}>
        What is being treated, with what, and by whom
      </Small>

      <Segmented options={TABS} value={tab} onChange={setTab} />

      {/* ---------- conditions ---------- */}
      {tab === 'conditions' ? (
        <>
          {canEdit ? (
            <Button title="Add a condition" icon="+" variant="soft"
              onPress={() => nav.navigate('ConditionForm', { patientId })}
              style={{ marginTop: space.lg }} />
          ) : null}

          {data.conditions.length === 0 ? (
            <EmptyState icon="○" title="No conditions recorded"
              body="Add the diagnosis and its treatment goal so adherence can be judged against what the doctor actually asked for." />
          ) : (
            data.conditions.map((c) => {
              const meds = data.medications.filter((m) => m.condition_id === c.id && m.active);
              return (
                <Card key={c.id} style={{ marginTop: space.md }}
                  accent={SEVERITY_COLOR[c.severity] || colors.border}
                  onPress={canEdit ? () => nav.navigate('ConditionForm', { patientId, conditionId: c.id }) : undefined}>
                  <Row justify="space-between" align="flex-start">
                    <View style={{ flex: 1 }}>
                      <H3>{c.name}</H3>
                      <Small>
                        Diagnosed {fmtDate(c.diagnosed_on)}
                        {c.icd_hint ? ` · ${c.icd_hint}` : ''}
                      </Small>
                    </View>
                    <Row gap={5}>
                      {c.severity ? <Pill label={c.severity} color={SEVERITY_COLOR[c.severity]} small /> : null}
                      {c.status !== 'active' ? <Pill label={c.status} color={colors.faint} small /> : null}
                    </Row>
                  </Row>

                  {c.treatment_goal ? (
                    <View style={s.goalBox}>
                      <Overline style={{ color: colors.primary }}>Treatment goal</Overline>
                      <Text style={s.goalText}>{c.treatment_goal}</Text>
                      {c.target_metric ? (
                        <Small style={{ marginTop: 3 }}>
                          Target {c.target_metric}: {c.target_low ?? '—'}–{c.target_high ?? '—'}
                        </Small>
                      ) : null}
                    </View>
                  ) : null}

                  {meds.length ? (
                    <>
                      <Divider style={{ marginVertical: space.md }} />
                      <Overline style={{ color: colors.muted, marginBottom: 6 }}>Treated with</Overline>
                      {meds.map((m) => {
                        const a = adherenceByMed.get(m.id);
                        return (
                          <Row key={m.id} justify="space-between" style={{ marginBottom: 5 }}>
                            <Text style={s.medLine} numberOfLines={1}>
                              {m.name} <Text style={s.medDose}>{m.dose}</Text>
                            </Text>
                            {a?.adherence != null ? (
                              <Text style={[s.medPct, { color: adherenceColor(a.adherence) }]}>
                                {a.adherence}%
                              </Text>
                            ) : null}
                          </Row>
                        );
                      })}
                    </>
                  ) : (
                    <Small style={{ marginTop: space.sm, fontStyle: 'italic' }}>
                      No medication linked to this condition yet.
                    </Small>
                  )}

                  {c.notes ? <Small style={{ marginTop: space.sm }}>{c.notes}</Small> : null}
                </Card>
              );
            })
          )}
        </>
      ) : null}

      {/* ---------- medications ---------- */}
      {tab === 'medications' ? (
        <>
          {canEdit ? (
            <Button title="Add a medicine" icon="+" variant="soft"
              onPress={() => nav.navigate('MedicationForm', { patientId })}
              style={{ marginTop: space.lg }} />
          ) : null}

          {data.medications.length === 0 ? (
            <EmptyState icon="○" title="No medicines yet" />
          ) : (
            <View style={{ marginTop: space.md }}>
              {data.medications.map((m) => {
                const a = adherenceByMed.get(m.id);
                const times = parseTimes(m);
                return (
                  <Card key={m.id} style={{ marginBottom: space.sm }}
                    accent={m.is_emergency ? colors.danger : m.active ? colors.primary : colors.faint}
                    onPress={canEdit ? () => nav.navigate('MedicationForm', { patientId, medicationId: m.id }) : undefined}>
                    <Row justify="space-between" align="flex-start">
                      <View style={{ flex: 1 }}>
                        <Row gap={6} wrap>
                          <Text style={s.medName}>{m.name}</Text>
                          {m.critical ? <Pill label="Critical" color={colors.danger} small /> : null}
                          {m.is_emergency ? <Pill label="Rescue / PRN" color={colors.warn} small /> : null}
                          {!m.active ? <Pill label="Stopped" color={colors.faint} small /> : null}
                        </Row>
                        <Small style={{ marginTop: 2 }}>
                          {m.dose} · {m.form}
                          {m.condition_name ? ` · for ${m.condition_name}` : ''}
                        </Small>
                        <Small style={{ marginTop: 3 }}>
                          {times.length ? times.map(fmtTime).join('  ·  ') : 'As needed, no fixed schedule'}
                        </Small>
                      </View>
                      {a?.adherence != null ? (
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[s.bigPct, { color: adherenceColor(a.adherence) }]}>{a.adherence}%</Text>
                          <Small>{a.missed} missed</Small>
                        </View>
                      ) : null}
                    </Row>

                    {m.instructions ? (
                      <Text style={s.instructions}>{m.instructions}</Text>
                    ) : null}

                    {canEdit && m.active ? (
                      <Button
                        title="Stop this medicine"
                        variant="ghost"
                        size="sm"
                        style={{ marginTop: space.md }}
                        onPress={() =>
                          Alert.alert(
                            `Stop ${m.name}?`,
                            'It stays in the history and on the doctor summary, but no new doses will be expected or reminded.',
                            [
                              { text: 'Cancel', style: 'cancel' },
                              {
                                text: 'Stop',
                                style: 'destructive',
                                onPress: async () => { await archiveMedication(m.id); await after(); },
                              },
                            ]
                          )
                        }
                      />
                    ) : null}
                  </Card>
                );
              })}
            </View>
          )}
        </>
      ) : null}

      {/* ---------- visits ---------- */}
      {tab === 'visits' ? (
        <>
          <Card style={{ marginTop: space.lg }}>
            <Row justify="space-around">
              <Stat value={data.followUp.totalVisits} label="Attended" color={colors.ok} />
              <Stat value={data.followUp.missedVisits} label="Missed"
                color={data.followUp.missedVisits ? colors.danger : colors.muted} />
              <Stat value={`${data.followUp.attendanceRate ?? '—'}%`} label="Attendance"
                color={adherenceColor(data.followUp.attendanceRate)} />
            </Row>
            {data.followUp.daysSinceLastVisit != null ? (
              <Small style={{ textAlign: 'center', marginTop: space.md }}>
                Last seen {data.followUp.daysSinceLastVisit} days ago
              </Small>
            ) : null}
          </Card>

          {data.followUp.overdueFollowUps.map((a) => (
            <Banner
              key={a.id}
              tone="warn"
              title="Follow-up overdue"
              body={`${a.doctor_name} asked for a review by ${fmtDate(a.next_followup)}. Nothing is booked.`}
              action={canEdit ? 'Book' : undefined}
              onAction={() => nav.navigate('AppointmentForm', { patientId })}
            />
          ))}

          {canEdit ? (
            <Button title="Add a visit" icon="+" variant="soft"
              onPress={() => nav.navigate('AppointmentForm', { patientId })}
              style={{ marginTop: space.md }} />
          ) : null}

          {data.appointments.length === 0 ? (
            <EmptyState icon="○" title="No visits recorded" />
          ) : (
            <View style={{ marginTop: space.md }}>
              {data.appointments.map((a) => (
                <ListItem
                  key={a.id}
                  accent={STATUS_COLOR[a.status]}
                  left={<CalendarIcon size={19} color={STATUS_COLOR[a.status]} />}
                  title={`${a.doctor_name}${a.specialty ? ` · ${a.specialty}` : ''}`}
                  subtitle={[
                    fmtDate(a.scheduled_for),
                    a.purpose,
                    a.outcome ? `Outcome: ${a.outcome}` : null,
                    a.next_followup ? `Follow-up by ${fmtDate(a.next_followup)}` : null,
                  ].filter(Boolean).join('\n')}
                  right={<Pill label={a.status} color={STATUS_COLOR[a.status]} small />}
                  onPress={canEdit ? () => nav.navigate('AppointmentForm', { patientId, appointmentId: a.id }) : undefined}
                />
              ))}
            </View>
          )}
        </>
      ) : null}
    </Screen>
  );
}

function Stat({ value, label, color }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={[s.statValue, { color }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  goalBox: {
    backgroundColor: colors.primarySoft, borderRadius: radius.sm,
    padding: space.md, marginTop: space.md,
  },
  goalText: { fontSize: 13.5, color: colors.primaryDark, marginTop: 3, lineHeight: 19, fontWeight: '600' },
  medLine: { fontSize: 13.5, color: colors.text, flex: 1 },
  medDose: { color: colors.muted },
  medPct: { fontSize: 13.5, fontWeight: '800' },
  medName: { fontSize: 15.5, fontWeight: '700', color: colors.text },
  bigPct: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  instructions: {
    fontSize: 12.5, color: colors.muted, marginTop: space.sm, lineHeight: 17.5,
    backgroundColor: colors.bg, padding: space.sm, borderRadius: radius.sm,
  },
  statValue: { fontSize: 23, fontWeight: '800', letterSpacing: -0.6 },
  statLabel: { fontSize: 11.5, color: colors.muted, marginTop: 1 },
});
