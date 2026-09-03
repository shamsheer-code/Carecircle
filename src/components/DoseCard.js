import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { colors, space, radius } from '../theme/theme';
import { Row, Pill, Small } from './ui';
import { CheckIcon, CloseIcon, ClockIcon, AlertIcon } from './icons';
import { fmtTime } from '../utils/date';
import { recordDose } from '../db/queries';
import { confirmDoseTaken } from '../services/alerts';

const STATUS = {
  taken: { label: 'Taken', color: colors.ok, bg: colors.okSoft },
  skipped: { label: 'Held on advice', color: colors.info, bg: colors.infoSoft },
  missed: { label: 'Missed', color: colors.danger, bg: colors.dangerSoft },
  overdue: { label: 'Overdue', color: colors.danger, bg: colors.dangerSoft },
  due: { label: 'Due now', color: colors.warn, bg: colors.warnSoft },
  upcoming: { label: 'Upcoming', color: colors.muted, bg: colors.bg },
};

/**
 * One dose slot. The two big buttons are the whole point of the app for a
 * patient, so they stay large and unambiguous rather than hiding in a menu.
 */
export default function DoseCard({ slot, patient, actor, onChanged, compact }) {
  const [busy, setBusy] = useState(false);
  const meta = STATUS[slot.status] || STATUS.upcoming;
  const med = slot.medication;
  const resolved = ['taken', 'skipped'].includes(slot.status);
  const actionable = !resolved && slot.status !== 'upcoming';

  const act = async (status, reason) => {
    setBusy(true);
    try {
      await recordDose({
        medicationId: slot.medicationId,
        patientId: patient.id,
        scheduledFor: slot.scheduledFor,
        status,
        reason,
        recordedBy: actor.id,
      });
      if (status === 'taken') {
        await confirmDoseTaken({
          patient,
          medication: med,
          time: slot.time,
          byCaretaker: actor.role === 'caretaker' && actor.id !== patient.id,
        });
      }
      onChanged?.();
    } catch (err) {
      Alert.alert('Could not save', err?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const confirmSkip = () => {
    Alert.alert(
      `Hold ${med.name}?`,
      'Only mark a dose as held if a clinician told you to. Held doses are excluded from the adherence calculation, so using this to hide a missed dose will mislead the doctor.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'It was missed', style: 'destructive', onPress: () => act('missed') },
        { text: 'Clinician said hold', onPress: () => act('skipped', 'Clinician advised hold') },
      ]
    );
  };

  return (
    <View style={[s.card, { borderLeftColor: meta.color }, compact && s.compact]}>
      <Row justify="space-between" align="flex-start">
        <View style={{ flex: 1 }}>
          <Row gap={7}>
            <Text style={s.time}>{fmtTime(slot.time)}</Text>
            {med.critical ? <Pill label="Critical" color={colors.danger} small /> : null}
          </Row>
          <Text style={s.name} numberOfLines={2}>
            {med.name} <Text style={s.dose}>{med.dose}</Text>
          </Text>
          {med.condition_name ? (
            <Small style={{ marginTop: 1 }}>for {med.condition_name}</Small>
          ) : null}
        </View>
        <View style={[s.statusPill, { backgroundColor: meta.bg }]}>
          {slot.status === 'taken' ? <CheckIcon size={13} color={meta.color} /> : null}
          {slot.status === 'overdue' || slot.status === 'missed' ? <AlertIcon size={13} color={meta.color} /> : null}
          {slot.status === 'due' ? <ClockIcon size={13} color={meta.color} /> : null}
          <Text style={[s.statusText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </Row>

      {!compact && med.instructions ? (
        <Text style={s.instructions} numberOfLines={3}>{med.instructions}</Text>
      ) : null}

      {actionable ? (
        <Row gap={space.sm} style={{ marginTop: space.md }}>
          <Pressable
            onPress={() => act('taken')}
            disabled={busy}
            style={({ pressed }) => [s.action, s.actionTake, pressed && { opacity: 0.7 }]}
          >
            <CheckIcon size={17} color="#fff" />
            <Text style={s.actionTakeText}>Taken</Text>
          </Pressable>
          <Pressable
            onPress={confirmSkip}
            disabled={busy}
            style={({ pressed }) => [s.action, s.actionSkip, pressed && { opacity: 0.7 }]}
          >
            <CloseIcon size={15} color={colors.muted} />
            <Text style={s.actionSkipText}>Not taken</Text>
          </Pressable>
        </Row>
      ) : null}

      {resolved && slot.log?.reason ? (
        <Small style={{ marginTop: space.sm, fontStyle: 'italic' }}>{slot.log.reason}</Small>
      ) : null}

      {resolved ? (
        <Pressable onPress={() => act(slot.status === 'taken' ? 'missed' : 'taken')} hitSlop={8}>
          <Text style={s.undo}>Change to {slot.status === 'taken' ? 'not taken' : 'taken'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    padding: space.md,
    marginBottom: space.sm,
  },
  compact: { padding: space.md - 2 },
  time: { fontSize: 12.5, fontWeight: '800', color: colors.muted, letterSpacing: 0.3 },
  name: { fontSize: 15.5, fontWeight: '700', color: colors.text, marginTop: 2 },
  dose: { fontSize: 14, fontWeight: '600', color: colors.muted },
  instructions: { fontSize: 12.5, color: colors.muted, marginTop: 6, lineHeight: 17.5 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill,
  },
  statusText: { fontSize: 11, fontWeight: '800' },
  action: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 11, borderRadius: radius.sm,
  },
  actionTake: { backgroundColor: colors.ok },
  actionTakeText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  actionSkip: { backgroundColor: colors.bg, borderWidth: 1.5, borderColor: colors.border },
  actionSkipText: { color: colors.muted, fontWeight: '700', fontSize: 14 },
  undo: { fontSize: 11.5, color: colors.faint, marginTop: space.sm, fontWeight: '600' },
});
