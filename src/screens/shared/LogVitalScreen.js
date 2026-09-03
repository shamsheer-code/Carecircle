import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useApp } from '../../context/AppContext';
import { addVital } from '../../db/queries';
import { VITAL_TYPES } from '../../db/schema';
import { stamp } from '../../utils/date';
import { colors, space, radius } from '../../theme/theme';
import { Screen, Card, Row, Small, Overline, Button, Field, Input, Chip, Banner } from '../../components/ui';

/**
 * Blood pressure is entered as one reading, not two, because that is how a
 * person reads it off the cuff. It is stored as two rows so each can be
 * charted and compared against its own range.
 */
const GROUPS = [
  { key: 'bp', label: 'Blood pressure', types: ['systolic', 'diastolic'], extra: 'pulse' },
  { key: 'glucose_fasting', label: 'Fasting sugar', types: ['glucose_fasting'] },
  { key: 'weight', label: 'Weight', types: ['weight'] },
  { key: 'spo2', label: 'Oxygen (SpO₂)', types: ['spo2'] },
  { key: 'temperature', label: 'Temperature', types: ['temperature'] },
  { key: 'pulse', label: 'Pulse only', types: ['pulse'] },
];

export default function LogVitalScreen({ route }) {
  const nav = useNavigation();
  const { user, invalidate } = useApp();
  const patientId = route?.params?.patientId ?? user.id;

  const [group, setGroup] = useState(GROUPS[0]);
  const [values, setValues] = useState({});
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const fields = [...group.types, ...(group.extra ? [group.extra] : [])];

  const set = (type, v) => setValues((prev) => ({ ...prev, [type]: v }));

  const outOfRange = fields
    .map((t) => {
      const meta = VITAL_TYPES[t];
      const v = Number(values[t]);
      if (!values[t] || Number.isNaN(v) || !meta) return null;
      if (meta.low != null && v < meta.low) return `${meta.label} ${v} is below the usual range.`;
      if (meta.high != null && v > meta.high) return `${meta.label} ${v} is above the usual range.`;
      return null;
    })
    .filter(Boolean);

  const save = async () => {
    const required = group.types;
    const missing = required.filter((t) => !values[t] || Number.isNaN(Number(values[t])));
    if (missing.length) {
      setError(`Enter a number for ${missing.map((t) => VITAL_TYPES[t].label).join(' and ')}.`);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const at = stamp();
      for (const t of fields) {
        if (!values[t] || Number.isNaN(Number(values[t]))) continue;
        await addVital({
          patient_id: patientId,
          type: t,
          value: Number(values[t]),
          unit: VITAL_TYPES[t].unit,
          recorded_at: at,
          recorded_by: user.id,
          note: note.trim() || null,
        });
      }
      invalidate();
      nav.goBack();
    } catch (err) {
      Alert.alert('Could not save', err?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen edges={[]}>
      <Field label="What are you logging?">
        <Row gap={space.sm} wrap>
          {GROUPS.map((g) => (
            <Chip
              key={g.key}
              label={g.label}
              active={group.key === g.key}
              onPress={() => { setGroup(g); setValues({}); setError(null); }}
            />
          ))}
        </Row>
      </Field>

      <Card>
        {fields.map((t) => {
          const meta = VITAL_TYPES[t];
          const optional = t === group.extra;
          return (
            <Field
              key={t}
              label={`${meta.label}${optional ? ' (optional)' : ''}`}
              hint={
                meta.low != null || meta.high != null
                  ? `Usual range ${meta.low ?? '—'}–${meta.high ?? '—'} ${meta.unit}`
                  : undefined
              }
              style={{ marginBottom: space.md }}
            >
              <Row gap={space.sm}>
                <Input
                  value={values[t] || ''}
                  onChangeText={(v) => set(t, v)}
                  placeholder="—"
                  keyboardType="decimal-pad"
                  style={{ flex: 1, fontSize: 20, fontWeight: '700' }}
                />
                <View style={s.unit}>
                  <Text style={s.unitText}>{meta.unit}</Text>
                </View>
              </Row>
            </Field>
          );
        })}
      </Card>

      {outOfRange.length ? (
        <View style={{ marginTop: space.md }}>
          {outOfRange.map((msg, i) => (
            <Banner key={i} tone="warn" title="Outside the usual range" body={msg} />
          ))}
          <Small style={{ marginTop: -space.sm, marginBottom: space.md }}>
            Save it anyway — an accurate record of a bad reading is more useful than no record.
            It will show on the doctor summary.
          </Small>
        </View>
      ) : null}

      <Field label="Note" style={{ marginTop: space.md }}>
        <Input
          value={note}
          onChangeText={setNote}
          placeholder="Before breakfast, sitting, left arm."
          multiline
        />
      </Field>

      {error ? <Small style={{ color: colors.danger, marginBottom: space.md }}>{error}</Small> : null}

      <Button title="Save reading" onPress={save} loading={saving} size="lg" />
      <Button title="Cancel" variant="ghost" onPress={() => nav.goBack()} style={{ marginTop: space.sm }} />
    </Screen>
  );
}

const s = StyleSheet.create({
  unit: {
    justifyContent: 'center', paddingHorizontal: space.md,
    backgroundColor: colors.bg, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.border, minWidth: 74, alignItems: 'center',
  },
  unitText: { color: colors.muted, fontWeight: '700', fontSize: 13 },
});
