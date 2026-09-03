import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useApp } from '../../context/AppContext';
import {
  addAppointment, updateAppointment, deleteAppointment, listAppointments, listConditions,
} from '../../db/queries';
import { dateKey } from '../../utils/date';
import { colors, space } from '../../theme/theme';
import {
  Screen, Card, Row, Small, Overline, Button, Field, Input, Chip, Loading, Divider,
} from '../../components/ui';

const STATUSES = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Attended' },
  { value: 'missed', label: 'Missed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const SPECIALTIES = [
  'General Medicine', 'Endocrinology', 'Nephrology', 'Cardiology',
  'Neurology', 'Orthopaedics', 'Ophthalmology', 'Physiotherapy',
];

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export default function AppointmentFormScreen({ route }) {
  const nav = useNavigation();
  const { user, invalidate, sweep } = useApp();
  const { patientId, appointmentId } = route.params;

  const [loading, setLoading] = useState(!!appointmentId);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [conditions, setConditions] = useState([]);

  const [doctor, setDoctor] = useState('');
  const [specialty, setSpecialty] = useState('General Medicine');
  const [scheduledFor, setScheduledFor] = useState(dateKey());
  const [purpose, setPurpose] = useState('');
  const [status, setStatus] = useState('scheduled');
  const [outcome, setOutcome] = useState('');
  const [nextFollowUp, setNextFollowUp] = useState('');
  const [conditionId, setConditionId] = useState(null);

  useEffect(() => {
    (async () => {
      setConditions(await listConditions(patientId));
      if (appointmentId) {
        const rows = await listAppointments(patientId);
        const a = rows.find((x) => x.id === appointmentId);
        if (a) {
          setDoctor(a.doctor_name);
          setSpecialty(a.specialty || 'General Medicine');
          setScheduledFor(a.scheduled_for);
          setPurpose(a.purpose || '');
          setStatus(a.status);
          setOutcome(a.outcome || '');
          setNextFollowUp(a.next_followup || '');
          setConditionId(a.condition_id);
        }
        setLoading(false);
      }
    })();
  }, [patientId, appointmentId]);

  const save = async () => {
    const next = {};
    if (!doctor.trim()) next.doctor = 'Who is the visit with?';
    if (!isDate(scheduledFor)) next.date = 'Use YYYY-MM-DD.';
    if (nextFollowUp && !isDate(nextFollowUp)) next.followup = 'Use YYYY-MM-DD, or leave it blank.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    try {
      const payload = {
        patient_id: patientId,
        condition_id: conditionId,
        doctor_name: doctor.trim(),
        specialty,
        scheduled_for: scheduledFor,
        purpose: purpose.trim() || null,
        status,
        outcome: outcome.trim() || null,
        next_followup: nextFollowUp || null,
        recorded_by: user.id,
      };
      if (appointmentId) {
        const { patient_id, recorded_by, ...patch } = payload;
        await updateAppointment(appointmentId, patch);
      } else {
        await addAppointment(payload);
      }
      invalidate();
      await sweep({ notify: false });
      nav.goBack();
    } catch (err) {
      Alert.alert('Could not save', err?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const remove = () =>
    Alert.alert('Delete this visit?', 'It stops counting towards the attendance rate.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => { await deleteAppointment(appointmentId); invalidate(); nav.goBack(); },
      },
    ]);

  if (loading) return <Screen scroll={false} edges={[]}><Loading /></Screen>;

  return (
    <Screen edges={[]}>
      <Field label="Doctor" error={errors.doctor}>
        <Input value={doctor} onChangeText={setDoctor} placeholder="Dr. S. Krishnan" autoCapitalize="words" />
      </Field>

      <Field label="Specialty">
        <Row gap={space.sm} wrap>
          {SPECIALTIES.map((sp) => (
            <Chip key={sp} label={sp} active={specialty === sp} onPress={() => setSpecialty(sp)} />
          ))}
        </Row>
      </Field>

      <Field label="Date" error={errors.date}>
        <Input value={scheduledFor} onChangeText={setScheduledFor} placeholder="2026-09-15" maxLength={10} />
      </Field>

      <Field label="For which condition?">
        <Row gap={space.sm} wrap>
          <Chip label="Not linked" active={conditionId == null} onPress={() => setConditionId(null)} />
          {conditions.map((c) => (
            <Chip key={c.id} label={c.name} active={conditionId === c.id} onPress={() => setConditionId(c.id)} />
          ))}
        </Row>
      </Field>

      <Field label="Purpose">
        <Input value={purpose} onChangeText={setPurpose} placeholder="Quarterly review with fresh labs" />
      </Field>

      <Field label="Status">
        <Row gap={space.sm} wrap>
          {STATUSES.map((st) => (
            <Chip key={st.value} label={st.label} active={status === st.value} onPress={() => setStatus(st.value)} />
          ))}
        </Row>
      </Field>

      {status === 'completed' ? (
        <Card style={{ marginBottom: space.lg }}>
          <Overline style={{ color: colors.primary }}>After the visit</Overline>
          <Small style={{ marginTop: 4, marginBottom: space.md }}>
            What the doctor said, and when they want to see the patient again. An unbooked
            follow-up date raises an alert once it passes.
          </Small>
          <Field label="Outcome" style={{ marginBottom: space.md }}>
            <Input
              value={outcome}
              onChangeText={setOutcome}
              placeholder="HbA1c up to 7.8%. Reviewing adherence before escalating therapy."
              multiline
            />
          </Field>
          <Field label="Follow-up by" error={errors.followup} style={{ marginBottom: 0 }}>
            <Input value={nextFollowUp} onChangeText={setNextFollowUp} placeholder="2026-10-15" maxLength={10} />
          </Field>
        </Card>
      ) : null}

      <Button title={appointmentId ? 'Save changes' : 'Add visit'} onPress={save} loading={saving} size="lg" />
      {appointmentId ? (
        <Button title="Delete visit" variant="ghost" onPress={remove} style={{ marginTop: space.sm }} />
      ) : null}
      <Button title="Cancel" variant="ghost" onPress={() => nav.goBack()} style={{ marginTop: space.sm }} />
    </Screen>
  );
}
