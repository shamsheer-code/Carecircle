import React from 'react';
import { View, Text, StyleSheet, Linking, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useApp, useData } from '../../context/AppContext';
import { getUser, listEmergencyMedications, listConditions, listSymptoms } from '../../db/queries';
import { RED_FLAG_SYMPTOMS } from '../../db/schema';
import { fmtShortDate, dayOf } from '../../utils/date';
import { colors, space, radius } from '../../theme/theme';
import { Screen, Card, Row, H2, H3, Small, Overline, Button, Loading, Pill, Divider } from '../../components/ui';
import { ShieldIcon, AlertIcon } from '../../components/icons';

/**
 * The screen someone opens while frightened.
 *
 * Rescue medication instructions come first and in full — no truncation, no
 * tapping through. Everything below it is context.
 */
export default function EmergencyScreen({ route }) {
  const nav = useNavigation();
  const { user } = useApp();
  const patientId = route?.params?.patientId ?? user.id;

  const { data, loading } = useData(async () => {
    const [patient, rescue, conditions, symptoms] = await Promise.all([
      getUser(patientId),
      listEmergencyMedications(patientId),
      listConditions(patientId),
      listSymptoms(patientId, 20),
    ]);
    return { patient, rescue, conditions, symptoms };
  }, [patientId]);

  if (loading || !data) return <Screen scroll={false}><Loading /></Screen>;

  const { patient, rescue, conditions, symptoms } = data;
  const recentFlags = symptoms.filter((s) => s.red_flag).slice(0, 3);
  const contact = patient.emergency_contact;

  const callContact = () => {
    const digits = String(contact || '').replace(/[^\d+]/g, '');
    if (!digits) {
      Alert.alert('No number saved', 'Add an emergency contact in Settings.');
      return;
    }
    Linking.openURL(`tel:${digits}`).catch(() =>
      Alert.alert('Could not open the dialler', `Call ${contact} manually.`)
    );
  };

  return (
    <Screen>
      <Card style={s.banner} accent={colors.danger}>
        <Row gap={space.sm}>
          <AlertIcon size={20} color={colors.danger} />
          <Text style={s.bannerText}>
            If this is a life-threatening emergency, call your local emergency number first.
            This screen is a reference, not a substitute for medical help.
          </Text>
        </Row>
      </Card>

      <H2 style={{ marginTop: space.lg }}>{patient.name}</H2>
      <Small>
        {patient.blood_group ? `Blood group ${patient.blood_group}` : 'Blood group not recorded'}
        {patient.allergies ? ` · Allergies: ${patient.allergies}` : ''}
      </Small>

      {contact ? (
        <Button
          title={`Call ${contact}`}
          variant="danger"
          size="lg"
          style={{ marginTop: space.md }}
          onPress={callContact}
        />
      ) : null}

      <Overline style={{ color: colors.danger, marginTop: space.xl, marginBottom: space.sm }}>
        Rescue medication
      </Overline>

      {rescue.length === 0 ? (
        <Card>
          <Small>
            No rescue or as-needed medication is recorded for {patient.name.split(' ')[0]}.
            Add one from the Care plan tab and mark it as “rescue / as needed”.
          </Small>
        </Card>
      ) : (
        rescue.map((m) => (
          <Card key={m.id} style={{ marginBottom: space.sm }} accent={colors.danger}>
            <Row justify="space-between" align="flex-start">
              <View style={{ flex: 1 }}>
                <H3>{m.name}</H3>
                <Small>{m.dose} · {m.form}</Small>
              </View>
              <Pill label="As needed" color={colors.danger} small />
            </Row>
            {m.instructions ? (
              <View style={s.instructionBox}>
                <Text style={s.instructionText}>{m.instructions}</Text>
              </View>
            ) : null}
          </Card>
        ))
      )}

      <Overline style={{ color: colors.muted, marginTop: space.xl, marginBottom: space.sm }}>
        Active conditions
      </Overline>
      <Card>
        {conditions.filter((c) => c.status === 'active').map((c, i) => (
          <View key={c.id}>
            {i > 0 ? <Divider style={{ marginVertical: space.sm }} /> : null}
            <Text style={s.condition}>{c.name}</Text>
            {c.icd_hint ? <Small>{c.icd_hint}</Small> : null}
          </View>
        ))}
        {conditions.filter((c) => c.status === 'active').length === 0 ? (
          <Small>No active conditions recorded.</Small>
        ) : null}
      </Card>

      {recentFlags.length ? (
        <>
          <Overline style={{ color: colors.warn, marginTop: space.xl, marginBottom: space.sm }}>
            Recent red-flag symptoms
          </Overline>
          <Card>
            {recentFlags.map((sym, i) => (
              <View key={sym.id}>
                {i > 0 ? <Divider style={{ marginVertical: space.sm }} /> : null}
                <Row justify="space-between">
                  <Text style={s.condition}>{sym.name}</Text>
                  <Small>{fmtShortDate(dayOf(sym.noted_at))}</Small>
                </Row>
                {sym.note ? <Small style={{ marginTop: 2 }}>{sym.note}</Small> : null}
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <Overline style={{ color: colors.muted, marginTop: space.xl, marginBottom: space.sm }}>
        Symptoms that need help immediately
      </Overline>
      <Card>
        {RED_FLAG_SYMPTOMS.map((name, i) => (
          <Row key={name} gap={space.sm} style={{ marginBottom: i === RED_FLAG_SYMPTOMS.length - 1 ? 0 : 6 }}>
            <View style={s.dot} />
            <Text style={s.flagText}>{name}</Text>
          </Row>
        ))}
        <Button
          title="Log a symptom now"
          variant="soft"
          size="sm"
          style={{ marginTop: space.md }}
          onPress={() => nav.navigate('LogSymptom', { patientId })}
        />
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  banner: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  bannerText: { flex: 1, fontSize: 13, color: colors.danger, lineHeight: 18.5, fontWeight: '600' },
  instructionBox: {
    backgroundColor: colors.dangerSoft, borderRadius: radius.sm,
    padding: space.md, marginTop: space.md,
  },
  instructionText: { fontSize: 14, color: colors.danger, lineHeight: 20, fontWeight: '600' },
  condition: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.warn },
  flagText: { fontSize: 13.5, color: colors.text, flex: 1 },
});
