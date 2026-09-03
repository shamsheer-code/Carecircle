import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, Linking } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useApp, useData } from '../../context/AppContext';
import { updateUser, getUser } from '../../db/queries';
import { scheduledCount, configureNotifications } from '../../services/notifications';
import { age } from '../../utils/date';
import { colors, space, radius } from '../../theme/theme';
import {
  Screen, Card, Row, H2, H3, Small, Overline, Button, Loading, Avatar, Divider,
  Field, Input, Pill, Banner,
} from '../../components/ui';
import { ShieldIcon, BellIcon } from '../../components/icons';

export default function SettingsScreen() {
  const nav = useNavigation();
  const {
    user, isCaretaker, signOut, patients, resetDemoData,
    notificationsEnabled, rescheduleReminders, sweep, invalidate,
  } = useApp();

  const [reminderCount, setReminderCount] = useState(0);
  const [busy, setBusy] = useState(null);
  const [contact, setContact] = useState(user.emergency_contact || '');
  const [allergies, setAllergies] = useState(user.allergies || '');

  useEffect(() => {
    scheduledCount().then(setReminderCount);
  }, [notificationsEnabled]);

  const saveProfile = async () => {
    setBusy('profile');
    await updateUser(user.id, {
      emergency_contact: contact.trim() || null,
      allergies: allergies.trim() || null,
    });
    invalidate();
    setBusy(null);
    Alert.alert('Saved', 'Your details are updated on this device.');
  };

  const resync = async () => {
    setBusy('sync');
    const granted = await configureNotifications();
    if (!granted) {
      setBusy(null);
      Alert.alert(
        'Notifications are off',
        'CareCircle can still track everything and show alerts inside the app, but it cannot ring the phone. Turn notifications on for CareCircle in your phone settings.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open settings', onPress: () => Linking.openSettings() },
        ]
      );
      return;
    }
    const n = await rescheduleReminders();
    setReminderCount(n);
    setBusy(null);
    Alert.alert('Reminders rebuilt', `${n} daily reminder${n === 1 ? '' : 's'} are scheduled on this phone.`);
  };

  const runSweep = async () => {
    setBusy('sweep');
    const result = await sweep({ notify: true });
    setBusy(null);
    Alert.alert(
      'Check complete',
      result
        ? `${result.missedDoses} overdue dose${result.missedDoses === 1 ? '' : 's'} recorded, ${result.alertsRaised} new alert${result.alertsRaised === 1 ? '' : 's'} raised.`
        : 'Nothing to report.'
    );
  };

  const confirmReset = () =>
    Alert.alert(
      'Reset all data?',
      'Every record on this device is deleted and replaced with the original demo data for Anita, Meera and Ravi. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            setBusy('reset');
            await resetDemoData();
            setBusy(null);
            Alert.alert('Done', 'The demo data has been restored.');
          },
        },
      ]
    );

  return (
    <Screen>
      <H2>{isCaretaker ? 'Settings' : 'Me'}</H2>

      <Card style={{ marginTop: space.md }}>
        <Row gap={space.md}>
          <Avatar name={user.name} color={user.color} size={52} ring />
          <View style={{ flex: 1 }}>
            <Text style={s.name}>{user.name}</Text>
            <Small>
              {isCaretaker ? 'Caretaker' : 'Patient'}
              {user.dob && age(user.dob) ? ` · ${age(user.dob)} years` : ''}
              {user.blood_group ? ` · ${user.blood_group}` : ''}
            </Small>
          </View>
        </Row>

        {!isCaretaker ? (
          <>
            <Divider />
            <Field label="Emergency contact" style={{ marginBottom: space.md }}>
              <Input value={contact} onChangeText={setContact} placeholder="Anita Rao · +91 98450 11111" />
            </Field>
            <Field label="Allergies" style={{ marginBottom: space.md }}>
              <Input value={allergies} onChangeText={setAllergies} placeholder="Sulfa drugs (rash)" />
            </Field>
            <Button title="Save my details" variant="soft" size="sm"
              loading={busy === 'profile'} onPress={saveProfile} />
          </>
        ) : null}
      </Card>

      {/* notifications */}
      <Overline style={{ color: colors.muted, marginTop: space.xl, marginBottom: space.sm }}>
        Reminders and alerts
      </Overline>

      {!notificationsEnabled ? (
        <Banner
          tone="warn"
          title="Phone notifications are off"
          body="Everything still works inside the app — doses are tracked and alerts appear in the Alert Center — but the phone will not ring at dose time."
          action="Fix"
          onAction={resync}
        />
      ) : null}

      <Card>
        <Row gap={space.md}>
          <BellIcon size={20} color={notificationsEnabled ? colors.ok : colors.faint} />
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle}>
              {notificationsEnabled ? 'Notifications allowed' : 'Notifications blocked'}
            </Text>
            <Small>
              {reminderCount} daily dose reminder{reminderCount === 1 ? '' : 's'} scheduled on this phone
            </Small>
          </View>
        </Row>
        <Divider />
        <Button title="Rebuild reminders" variant="ghost" size="sm"
          loading={busy === 'sync'} onPress={resync} />
        <Button title="Check for missed doses now" variant="ghost" size="sm"
          loading={busy === 'sweep'} onPress={runSweep} style={{ marginTop: space.sm }} />
      </Card>

      {/* how escalation works */}
      <Card style={{ marginTop: space.md }}>
        <Overline style={{ color: colors.muted }}>How escalation works</Overline>
        <Text style={s.explain}>
          Each dose gets a grace window after its scheduled time — 45 minutes for a medicine marked
          critical, 90 minutes otherwise. If nothing is logged by then, the dose is recorded as
          missed, an alert is raised for the caretaker, and the phone is notified. The alert stays in
          the Alert Center until someone marks it handled, so a silenced or swiped notification never
          loses the escalation.
        </Text>
      </Card>

      {isCaretaker ? (
        <>
          <Overline style={{ color: colors.muted, marginTop: space.xl, marginBottom: space.sm }}>
            Patients on this device
          </Overline>
          {patients.map((p) => (
            <Card key={p.id} style={{ marginBottom: space.sm }} accent={p.color}
              onPress={() => nav.navigate('PatientDetail', { patientId: p.id, name: p.name })}>
              <Row gap={space.md}>
                <Avatar name={p.name} color={p.color} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>{p.name}</Text>
                  <Small>
                    {age(p.dob) ? `${age(p.dob)} years · ` : ''}{p.sex}
                    {p.allergies && p.allergies !== 'None known' ? ` · allergic to ${p.allergies}` : ''}
                  </Small>
                </View>
              </Row>
            </Card>
          ))}
        </>
      ) : null}

      {/* privacy */}
      <Card style={{ marginTop: space.xl }}>
        <Row gap={space.md}>
          <ShieldIcon size={20} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle}>Everything stays on this phone</Text>
            <Text style={s.explain}>
              CareCircle has no account and no server. Records live in a local database on this
              device and are never uploaded. Uninstalling the app deletes them permanently — there
              is no backup and no way to recover them. Export a PDF of anything you need to keep.
            </Text>
            <Text style={s.explain}>
              The PIN separates household members from each other's records. It is stored in plain
              text in that local database, so treat it as a courtesy lock, not clinical-grade
              security.
            </Text>
          </View>
        </Row>
      </Card>

      <Button title="Sign out" variant="ghost" onPress={signOut} style={{ marginTop: space.xl }} />

      {isCaretaker ? (
        <Button title="Reset to demo data" variant="ghost"
          loading={busy === 'reset'} onPress={confirmReset} style={{ marginTop: space.sm }} />
      ) : null}

      <Text style={s.version}>CareCircle 1.0.0 · local-only build</Text>
    </Screen>
  );
}

const s = StyleSheet.create({
  name: { fontSize: 18, fontWeight: '700', color: colors.text },
  rowTitle: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  explain: { fontSize: 12.5, color: colors.muted, lineHeight: 18.5, marginTop: space.sm },
  version: {
    textAlign: 'center', fontSize: 11, color: colors.faint,
    marginTop: space.xl, marginBottom: space.lg,
  },
});
