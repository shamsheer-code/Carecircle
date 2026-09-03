import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Switch, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useApp } from '../../context/AppContext';
import {
  addMedication, updateMedication, getMedication, listConditions,
} from '../../db/queries';
import { parseTimes, parseDays } from '../../services/schedule';
import { fmtTime, DAY_NAMES, dateKey } from '../../utils/date';
import { colors, space, radius } from '../../theme/theme';
import {
  Screen, Card, Row, Small, Overline, Button, Field, Input, Chip, Loading, Divider, H3,
} from '../../components/ui';
import { CloseIcon, PlusIcon } from '../../components/icons';

const FORMS = ['tablet', 'capsule', 'syrup', 'injection', 'inhaler', 'gel', 'sublingual', 'patch'];
const QUICK_TIMES = ['06:00', '06:30', '08:00', '08:30', '09:00', '12:30', '14:00', '18:00', '20:00', '20:30', '21:00', '22:00'];

const isValidTime = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

export default function MedicationFormScreen({ route }) {
  const nav = useNavigation();
  const { user, invalidate, rescheduleReminders } = useApp();
  const { patientId, medicationId } = route.params;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [conditions, setConditions] = useState([]);
  const [errors, setErrors] = useState({});

  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [form, setForm] = useState('tablet');
  const [conditionId, setConditionId] = useState(null);
  const [instructions, setInstructions] = useState('');
  const [times, setTimes] = useState([]);
  const [days, setDays] = useState([0, 1, 2, 3, 4, 5, 6]);
  const [critical, setCritical] = useState(false);
  const [isEmergency, setIsEmergency] = useState(false);
  const [customTime, setCustomTime] = useState('');

  useEffect(() => {
    (async () => {
      const cs = await listConditions(patientId);
      setConditions(cs);
      if (medicationId) {
        const m = await getMedication(medicationId);
        if (m) {
          setName(m.name);
          setDose(m.dose);
          setForm(m.form || 'tablet');
          setConditionId(m.condition_id);
          setInstructions(m.instructions || '');
          setTimes(parseTimes(m));
          setDays(parseDays(m));
          setCritical(!!m.critical);
          setIsEmergency(!!m.is_emergency);
        }
      }
      setLoading(false);
    })();
  }, [patientId, medicationId]);

  const toggleTime = (t) =>
    setTimes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t].sort()));

  const addCustom = () => {
    const t = customTime.trim();
    if (!isValidTime(t)) {
      setErrors((e) => ({ ...e, time: 'Use 24-hour HH:MM, for example 07:45.' }));
      return;
    }
    if (!times.includes(t)) setTimes((prev) => [...prev, t].sort());
    setCustomTime('');
    setErrors((e) => ({ ...e, time: null }));
  };

  const toggleDay = (d) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));

  const save = async () => {
    const next = {};
    if (!name.trim()) next.name = 'Give the medicine a name.';
    if (!dose.trim()) next.dose = 'Add the dose, for example “75 mcg”.';
    if (!isEmergency && times.length === 0) {
      next.times = 'Add at least one time, or mark this as a rescue medicine taken only when needed.';
    }
    if (!isEmergency && days.length === 0) next.days = 'Pick at least one day.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    try {
      const payload = {
        patient_id: patientId,
        condition_id: conditionId,
        name: name.trim(),
        dose: dose.trim(),
        form,
        instructions: instructions.trim() || null,
        times: isEmergency ? [] : times,
        days_of_week: days,
        is_emergency: isEmergency,
        critical,
        recorded_by: user.id,
        start_date: dateKey(),
      };
      if (medicationId) {
        const { patient_id, start_date, recorded_by, ...patch } = payload;
        await updateMedication(medicationId, patch);
      } else {
        await addMedication(payload);
      }
      await rescheduleReminders();
      invalidate();
      nav.goBack();
    } catch (err) {
      Alert.alert('Could not save', err?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Screen scroll={false} edges={[]}><Loading /></Screen>;

  return (
    <Screen edges={[]}>
      <Field label="Medicine name" error={errors.name}>
        <Input value={name} onChangeText={setName} placeholder="Levothyroxine" autoCapitalize="words" />
      </Field>

      <Field label="Dose" error={errors.dose} hint="Include the unit — 500 mg, 75 mcg, 10 mL.">
        <Input value={dose} onChangeText={setDose} placeholder="75 mcg" />
      </Field>

      <Field label="Form">
        <Row gap={space.sm} wrap>
          {FORMS.map((f) => (
            <Chip key={f} label={f} active={form === f} onPress={() => setForm(f)} />
          ))}
        </Row>
      </Field>

      <Field
        label="Treating which condition?"
        hint="Linking the medicine lets the doctor summary judge adherence against the treatment goal."
      >
        <Row gap={space.sm} wrap>
          <Chip label="Not linked" active={conditionId == null} onPress={() => setConditionId(null)} />
          {conditions.map((c) => (
            <Chip key={c.id} label={c.name} active={conditionId === c.id} onPress={() => setConditionId(c.id)} />
          ))}
        </Row>
      </Field>

      <Card style={s.toggleCard}>
        <Row justify="space-between">
          <View style={{ flex: 1, paddingRight: space.md }}>
            <Text style={s.toggleTitle}>Rescue / as needed</Text>
            <Small>No fixed schedule. Appears on the Emergency screen instead, with its instructions in full.</Small>
          </View>
          <Switch
            value={isEmergency}
            onValueChange={setIsEmergency}
            trackColor={{ true: colors.primary, false: colors.border }}
          />
        </Row>
        <Divider />
        <Row justify="space-between">
          <View style={{ flex: 1, paddingRight: space.md }}>
            <Text style={s.toggleTitle}>Critical medicine</Text>
            <Small>
              Shortens the grace period to 45 minutes and escalates to the caretaker as a critical alert
              when a dose is missed.
            </Small>
          </View>
          <Switch
            value={critical}
            onValueChange={setCritical}
            trackColor={{ true: colors.danger, false: colors.border }}
          />
        </Row>
      </Card>

      {!isEmergency ? (
        <>
          <Field label="Times of day" error={errors.times}
            hint="Each time becomes a daily reminder and a dose slot in the adherence maths.">
            <Row gap={space.sm} wrap>
              {QUICK_TIMES.map((t) => (
                <Chip key={t} label={fmtTime(t)} active={times.includes(t)} onPress={() => toggleTime(t)} />
              ))}
            </Row>

            <Row gap={space.sm} style={{ marginTop: space.md }}>
              <Input
                value={customTime}
                onChangeText={setCustomTime}
                placeholder="HH:MM"
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                style={{ flex: 1 }}
              />
              <Button title="Add" variant="soft" onPress={addCustom} />
            </Row>
            {errors.time ? <Small style={{ color: colors.danger, marginTop: 5 }}>{errors.time}</Small> : null}

            {times.length ? (
              <View style={s.selected}>
                <Overline style={{ color: colors.muted, marginBottom: 6 }}>
                  {times.length} dose{times.length > 1 ? 's' : ''} a day
                </Overline>
                <Row gap={space.sm} wrap>
                  {times.map((t) => (
                    <Pressable key={t} onPress={() => toggleTime(t)} style={s.timeTag}>
                      <Text style={s.timeTagText}>{fmtTime(t)}</Text>
                      <CloseIcon size={12} color={colors.primaryDark} />
                    </Pressable>
                  ))}
                </Row>
              </View>
            ) : null}
          </Field>

          <Field label="Days" error={errors.days}>
            <Row gap={space.sm} wrap>
              {DAY_NAMES.map((d, i) => (
                <Chip key={d} label={d} active={days.includes(i)} onPress={() => toggleDay(i)} />
              ))}
            </Row>
          </Field>
        </>
      ) : null}

      <Field
        label="Instructions"
        hint="What the patient needs to remember — fasting rules, interactions, what to do if a dose is missed."
      >
        <Input
          value={instructions}
          onChangeText={setInstructions}
          placeholder="Empty stomach, 30 minutes before breakfast. Do not take with calcium or iron."
          multiline
        />
      </Field>

      <Button
        title={medicationId ? 'Save changes' : 'Add medicine'}
        onPress={save}
        loading={saving}
        size="lg"
      />
      <Button title="Cancel" variant="ghost" onPress={() => nav.goBack()} style={{ marginTop: space.sm }} />
    </Screen>
  );
}

const s = StyleSheet.create({
  toggleCard: { marginBottom: space.lg, gap: space.sm },
  toggleTitle: { fontSize: 14.5, fontWeight: '700', color: colors.text, marginBottom: 2 },
  selected: {
    marginTop: space.md, paddingTop: space.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  timeTag: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.primarySoft, paddingHorizontal: space.md,
    paddingVertical: 7, borderRadius: radius.pill,
  },
  timeTagText: { color: colors.primaryDark, fontWeight: '700', fontSize: 13 },
});
