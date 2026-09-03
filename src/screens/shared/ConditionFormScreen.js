import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useApp } from '../../context/AppContext';
import { addCondition, updateCondition, getCondition, deleteCondition } from '../../db/queries';
import { dateKey } from '../../utils/date';
import { colors, space } from '../../theme/theme';
import {
  Screen, Row, Small, Button, Field, Input, Chip, Loading, Card, Overline,
} from '../../components/ui';

const SEVERITIES = ['mild', 'moderate', 'severe'];
const STATUSES = ['active', 'remission', 'resolved'];
const TARGETS = [
  { value: null, label: 'None' },
  { value: 'systolic', label: 'Systolic BP' },
  { value: 'hba1c', label: 'HbA1c' },
  { value: 'tsh', label: 'TSH' },
  { value: 'ldl', label: 'LDL' },
  { value: 'egfr', label: 'eGFR' },
  { value: 'glucose_fasting', label: 'Fasting glucose' },
  { value: 'weight', label: 'Weight' },
];

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export default function ConditionFormScreen({ route }) {
  const nav = useNavigation();
  const { user, invalidate } = useApp();
  const { patientId, conditionId } = route.params;

  const [loading, setLoading] = useState(!!conditionId);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const [name, setName] = useState('');
  const [icd, setIcd] = useState('');
  const [diagnosedOn, setDiagnosedOn] = useState(dateKey());
  const [severity, setSeverity] = useState('moderate');
  const [status, setStatus] = useState('active');
  const [goal, setGoal] = useState('');
  const [metric, setMetric] = useState(null);
  const [low, setLow] = useState('');
  const [high, setHigh] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!conditionId) return;
    (async () => {
      const c = await getCondition(conditionId);
      if (c) {
        setName(c.name);
        setIcd(c.icd_hint || '');
        setDiagnosedOn(c.diagnosed_on || dateKey());
        setSeverity(c.severity || 'moderate');
        setStatus(c.status || 'active');
        setGoal(c.treatment_goal || '');
        setMetric(c.target_metric);
        setLow(c.target_low != null ? String(c.target_low) : '');
        setHigh(c.target_high != null ? String(c.target_high) : '');
        setNotes(c.notes || '');
      }
      setLoading(false);
    })();
  }, [conditionId]);

  const save = async () => {
    const next = {};
    if (!name.trim()) next.name = 'Name the condition.';
    if (!isDate(diagnosedOn)) next.date = 'Use YYYY-MM-DD.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    try {
      const payload = {
        patient_id: patientId,
        name: name.trim(),
        icd_hint: icd.trim() || null,
        diagnosed_on: diagnosedOn,
        severity,
        status,
        treatment_goal: goal.trim() || null,
        target_metric: metric,
        target_low: low === '' ? null : Number(low),
        target_high: high === '' ? null : Number(high),
        notes: notes.trim() || null,
        recorded_by: user.id,
      };
      if (conditionId) {
        const { patient_id, recorded_by, ...patch } = payload;
        await updateCondition(conditionId, patch);
      } else {
        await addCondition(payload);
      }
      invalidate();
      nav.goBack();
    } catch (err) {
      Alert.alert('Could not save', err?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const remove = () =>
    Alert.alert(
      `Delete ${name}?`,
      'The condition is removed. Medicines linked to it stay, but lose the link and the treatment goal.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => { await deleteCondition(conditionId); invalidate(); nav.goBack(); },
        },
      ]
    );

  if (loading) return <Screen scroll={false} edges={[]}><Loading /></Screen>;

  return (
    <Screen edges={[]}>
      <Field label="Condition" error={errors.name}>
        <Input value={name} onChangeText={setName} placeholder="Type 2 Diabetes Mellitus" autoCapitalize="words" />
      </Field>

      <Row gap={space.md}>
        <Field label="Diagnosed on" error={errors.date} style={{ flex: 1 }}>
          <Input value={diagnosedOn} onChangeText={setDiagnosedOn} placeholder="2024-03-15" maxLength={10} />
        </Field>
        <Field label="ICD hint" style={{ flex: 1 }}>
          <Input value={icd} onChangeText={setIcd} placeholder="E11.9" autoCapitalize="characters" />
        </Field>
      </Row>

      <Field label="Severity">
        <Row gap={space.sm}>
          {SEVERITIES.map((v) => (
            <Chip key={v} label={v} active={severity === v} onPress={() => setSeverity(v)} />
          ))}
        </Row>
      </Field>

      <Field label="Status">
        <Row gap={space.sm}>
          {STATUSES.map((v) => (
            <Chip key={v} label={v} active={status === v} onPress={() => setStatus(v)} />
          ))}
        </Row>
      </Field>

      <Card style={s.goalCard}>
        <Overline style={{ color: colors.primary }}>Treatment goal</Overline>
        <Small style={{ marginTop: 4, marginBottom: space.md }}>
          Write what the doctor is actually trying to achieve. The summary reports adherence
          against this, not against a generic target.
        </Small>
        <Input
          value={goal}
          onChangeText={setGoal}
          placeholder="Bring HbA1c below 7.0% without adding a second agent, by fixing evening dosing."
          multiline
        />
      </Card>

      <Field label="Tracked measure" hint="Optional. Links the goal to a number the app already records.">
        <Row gap={space.sm} wrap>
          {TARGETS.map((t) => (
            <Chip key={String(t.value)} label={t.label} active={metric === t.value} onPress={() => setMetric(t.value)} />
          ))}
        </Row>
      </Field>

      {metric ? (
        <Row gap={space.md}>
          <Field label="Target low" style={{ flex: 1 }}>
            <Input value={low} onChangeText={setLow} placeholder="0" keyboardType="numeric" />
          </Field>
          <Field label="Target high" style={{ flex: 1 }}>
            <Input value={high} onChangeText={setHigh} placeholder="7.0" keyboardType="numeric" />
          </Field>
        </Row>
      ) : null}

      <Field label="Notes">
        <Input value={notes} onChangeText={setNotes} placeholder="Anything the next reader needs to know." multiline />
      </Field>

      <Button title={conditionId ? 'Save changes' : 'Add condition'} onPress={save} loading={saving} size="lg" />
      {conditionId ? (
        <Button title="Delete condition" variant="ghost" onPress={remove} style={{ marginTop: space.sm }} />
      ) : null}
      <Button title="Cancel" variant="ghost" onPress={() => nav.goBack()} style={{ marginTop: space.sm }} />
    </Screen>
  );
}

const s = StyleSheet.create({
  goalCard: { marginBottom: space.lg, backgroundColor: colors.card },
});
