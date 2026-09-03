import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useApp } from '../../context/AppContext';
import { addPanel } from '../../db/queries';
import { PANEL_TEMPLATES } from '../../db/schema';
import { dateKey } from '../../utils/date';
import { colors, space, radius } from '../../theme/theme';
import {
  Screen, Card, Row, Small, Overline, Button, Field, Input, Chip, Divider, Banner,
} from '../../components/ui';

const PANEL_NAMES = Object.keys(PANEL_TEMPLATES);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * Entering a lab report by hand is tedious, so the reference range for every
 * analyte is pre-filled and each field flags itself the moment the value
 * lands outside it. That feedback is the reason someone bothers to type it in.
 */
export default function LabPanelFormScreen({ route }) {
  const nav = useNavigation();
  const { user, invalidate, sweep } = useApp();
  const patientId = route?.params?.patientId ?? user.id;

  const [panel, setPanel] = useState(PANEL_NAMES[0]);
  const [collectedOn, setCollectedOn] = useState(dateKey());
  const [labName, setLabName] = useState('');
  const [note, setNote] = useState('');
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const template = PANEL_TEMPLATES[panel] || [];

  const flagFor = (row) => {
    const raw = values[row.analyte];
    if (raw === undefined || raw === '' || Number.isNaN(Number(raw))) return null;
    const v = Number(raw);
    if (row.ref_low != null && v < row.ref_low) return 'low';
    if (row.ref_high != null && v > row.ref_high) return 'high';
    return 'normal';
  };

  const filled = template.filter((r) => values[r.analyte] !== undefined && values[r.analyte] !== '');
  const abnormal = template.filter((r) => ['low', 'high'].includes(flagFor(r)));

  const save = async () => {
    const next = {};
    if (!isDate(collectedOn)) next.date = 'Use YYYY-MM-DD.';
    if (filled.length === 0) next.values = 'Enter at least one result.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    try {
      await addPanel(
        {
          patient_id: patientId,
          panel,
          collected_on: collectedOn,
          lab_name: labName.trim() || null,
          recorded_by: user.id,
          note: note.trim() || null,
        },
        template.map((r) => ({ ...r, value: values[r.analyte] }))
      );
      invalidate();
      // A dangerous value should reach the caretaker immediately, not at the
      // next scheduled sweep.
      await sweep({ notify: true });
      nav.goBack();
    } catch (err) {
      Alert.alert('Could not save', err?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen edges={[]}>
      <Field label="Panel">
        <Row gap={space.sm} wrap>
          {PANEL_NAMES.map((p) => (
            <Chip key={p} label={p} active={panel === p} onPress={() => { setPanel(p); setValues({}); }} />
          ))}
        </Row>
      </Field>

      <Row gap={space.md}>
        <Field label="Collected on" error={errors.date} style={{ flex: 1 }}>
          <Input value={collectedOn} onChangeText={setCollectedOn} placeholder="2026-09-01" maxLength={10} />
        </Field>
        <Field label="Laboratory" style={{ flex: 1 }}>
          <Input value={labName} onChangeText={setLabName} placeholder="Metropolis" />
        </Field>
      </Row>

      <Card>
        <Overline style={{ color: colors.muted, marginBottom: space.md }}>
          {panel} · {filled.length} of {template.length} entered
        </Overline>

        {template.map((row, i) => {
          const flag = flagFor(row);
          const tone = flag === 'normal' ? colors.ok : flag ? colors.warn : colors.border;
          return (
            <View key={row.analyte}>
              {i > 0 ? <Divider style={{ marginVertical: space.sm }} /> : null}
              <Row gap={space.sm} align="center">
                <View style={{ flex: 1 }}>
                  <Text style={s.analyte}>{row.analyte}</Text>
                  <Small>
                    {row.ref_low ?? '—'}–{row.ref_high ?? '—'} {row.unit}
                  </Small>
                </View>
                <Input
                  value={values[row.analyte] ?? ''}
                  onChangeText={(v) => setValues((p) => ({ ...p, [row.analyte]: v }))}
                  placeholder="—"
                  keyboardType="decimal-pad"
                  style={[s.valueInput, flag && { borderColor: tone }]}
                />
                <View style={s.flagBox}>
                  {flag ? (
                    <Text style={[s.flagText, { color: flag === 'normal' ? colors.ok : colors.warn }]}>
                      {flag === 'normal' ? 'ok' : flag}
                    </Text>
                  ) : null}
                </View>
              </Row>
            </View>
          );
        })}
      </Card>

      {errors.values ? <Small style={{ color: colors.danger, marginTop: space.sm }}>{errors.values}</Small> : null}

      {abnormal.length ? (
        <Banner
          tone="warn"
          title={`${abnormal.length} value${abnormal.length > 1 ? 's' : ''} outside the reference range`}
          body={abnormal.map((r) => `${r.analyte} ${values[r.analyte]} ${r.unit}`).join(' · ')}
        />
      ) : null}

      <Field label="Note" style={{ marginTop: space.md }}>
        <Input value={note} onChangeText={setNote} placeholder="Fasting sample. Repeat in 4 weeks." multiline />
      </Field>

      <Button title="Save panel" onPress={save} loading={saving} size="lg" />
      <Button title="Cancel" variant="ghost" onPress={() => nav.goBack()} style={{ marginTop: space.sm }} />
    </Screen>
  );
}

const s = StyleSheet.create({
  analyte: { fontSize: 14, fontWeight: '700', color: colors.text },
  valueInput: { width: 92, textAlign: 'right', fontWeight: '700', fontSize: 16 },
  flagBox: { width: 40, alignItems: 'flex-end' },
  flagText: { fontSize: 10.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
});
