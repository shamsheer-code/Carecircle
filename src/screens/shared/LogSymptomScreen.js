import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useApp } from '../../context/AppContext';
import { addSymptom, getUser } from '../../db/queries';
import { raiseSymptomAlert } from '../../services/alerts';
import { RED_FLAG_SYMPTOMS, COMMON_SYMPTOMS } from '../../db/schema';
import { stamp } from '../../utils/date';
import { colors, space, radius } from '../../theme/theme';
import {
  Screen, Card, Row, Small, Overline, Button, Field, Input, Chip, Banner,
} from '../../components/ui';
import { AlertIcon } from '../../components/icons';

const SEVERITY_LABELS = ['', 'Barely there', 'Mild', 'Noticeable', 'Bad', 'Severe'];

/**
 * Red-flag symptoms are pre-classified rather than left to the person's
 * judgement, because someone frightened at 2am should not have to decide
 * whether chest tightness counts. Choosing one escalates to the caretaker
 * straight away.
 */
export default function LogSymptomScreen({ route }) {
  const nav = useNavigation();
  const { user, invalidate } = useApp();
  const patientId = route?.params?.patientId ?? user.id;

  const [name, setName] = useState('');
  const [custom, setCustom] = useState('');
  const [severity, setSeverity] = useState(3);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const effectiveName = (custom.trim() || name).trim();
  const isRedFlag = RED_FLAG_SYMPTOMS.includes(effectiveName);

  const save = async () => {
    if (!effectiveName) {
      setError('Pick a symptom or describe it in your own words.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const notedAt = stamp();
      await addSymptom({
        patient_id: patientId,
        name: effectiveName,
        severity,
        red_flag: isRedFlag ? 1 : 0,
        noted_at: notedAt,
        note: note.trim() || null,
        recorded_by: user.id,
      });

      if (isRedFlag) {
        const patient = await getUser(patientId);
        await raiseSymptomAlert({
          patient,
          name: effectiveName,
          severity,
          note: note.trim() || null,
          notedAt,
          reportedByName: user.id === patientId ? null : user.name,
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
      <Overline style={{ color: colors.danger }}>Needs help straight away</Overline>
      <Small style={{ marginTop: 4, marginBottom: space.sm }}>
        Choosing one of these alerts the caretaker immediately.
      </Small>
      <Row gap={space.sm} wrap>
        {RED_FLAG_SYMPTOMS.map((sx) => (
          <Chip
            key={sx}
            label={sx}
            color={colors.danger}
            active={effectiveName === sx}
            onPress={() => { setName(sx); setCustom(''); }}
          />
        ))}
      </Row>

      <Overline style={{ color: colors.muted, marginTop: space.xl, marginBottom: space.sm }}>
        Everyday symptoms
      </Overline>
      <Row gap={space.sm} wrap>
        {COMMON_SYMPTOMS.map((sx) => (
          <Chip
            key={sx}
            label={sx}
            active={effectiveName === sx}
            onPress={() => { setName(sx); setCustom(''); }}
          />
        ))}
      </Row>

      <Field label="Or describe it yourself" style={{ marginTop: space.xl }}>
        <Input
          value={custom}
          onChangeText={(v) => { setCustom(v); if (v) setName(''); }}
          placeholder="Burning in the stomach after the evening tablet"
        />
      </Field>

      {isRedFlag ? (
        <Banner
          tone="danger"
          title="This is a red-flag symptom"
          body="Saving it notifies the caretaker straight away. If the patient is in real trouble right now, call for medical help first — do not wait for the app."
        />
      ) : null}

      <Field label={`How bad is it? — ${SEVERITY_LABELS[severity]}`}>
        <Row gap={space.sm}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable
              key={n}
              onPress={() => setSeverity(n)}
              style={[
                s.sev,
                severity === n && {
                  backgroundColor: n >= 4 ? colors.dangerSoft : colors.primarySoft,
                  borderColor: n >= 4 ? colors.danger : colors.primary,
                },
              ]}
            >
              <Text style={[s.sevText, severity === n && { color: n >= 4 ? colors.danger : colors.primary }]}>
                {n}
              </Text>
            </Pressable>
          ))}
        </Row>
      </Field>

      <Field label="What happened?">
        <Input
          value={note}
          onChangeText={setNote}
          placeholder="Started after climbing the stairs, settled in ten minutes."
          multiline
        />
      </Field>

      {error ? <Small style={{ color: colors.danger, marginBottom: space.md }}>{error}</Small> : null}

      <Button
        title={isRedFlag ? 'Save and alert caretaker' : 'Save symptom'}
        variant={isRedFlag ? 'danger' : 'primary'}
        onPress={save}
        loading={saving}
        size="lg"
      />
      <Button title="Cancel" variant="ghost" onPress={() => nav.goBack()} style={{ marginTop: space.sm }} />
    </Screen>
  );
}

const s = StyleSheet.create({
  sev: {
    flex: 1, aspectRatio: 1.5, maxHeight: 54,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.md, borderWidth: 1.5,
    borderColor: colors.border, backgroundColor: colors.card,
  },
  sevText: { fontSize: 18, fontWeight: '800', color: colors.muted },
});
