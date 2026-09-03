import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useApp } from '../context/AppContext';
import { verifyPin } from '../db/queries';
import { colors, space, radius, shadow } from '../theme/theme';
import { Avatar, Button, Row, Small } from '../components/ui';
import { ShieldIcon } from '../components/icons';

/**
 * One device, three people. Everyone picks their tile and enters a 4-digit PIN.
 *
 * This is a household-device lock, not real authentication — the PIN lives in
 * the local database in plain text. That is an honest fit for a shared phone
 * on a kitchen table, and it is stated plainly on screen so nobody mistakes it
 * for clinical-grade access control.
 */
export default function LoginScreen() {
  const { users, signIn } = useApp();
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const choose = (u) => {
    setSelected(u);
    setPin('');
    setError(null);
  };

  const pressKey = async (k) => {
    if (busy) return;
    setError(null);
    if (k === 'del') {
      setPin((p) => p.slice(0, -1));
      return;
    }
    const next = (pin + k).slice(0, 4);
    setPin(next);
    if (next.length === 4) {
      setBusy(true);
      const match = await verifyPin(selected.id, next);
      if (match) {
        await signIn(match);
      } else {
        setError('That PIN does not match.');
        setPin('');
      }
      setBusy(false);
    }
  };

  const caretakers = users.filter((u) => u.role === 'caretaker');
  const patients = users.filter((u) => u.role === 'patient');

  return (
    <SafeAreaView style={s.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={s.header}>
          <Text style={s.brand}>CARECIRCLE</Text>
          <Text style={s.tagline}>
            {selected ? `Enter ${selected.name.split(' ')[0]}'s PIN` : 'Who is using the phone?'}
          </Text>
        </View>

        {!selected ? (
          <View style={s.body}>
            <Text style={s.groupLabel}>CARETAKER</Text>
            {caretakers.map((u) => (
              <UserTile key={u.id} user={u} onPress={() => choose(u)} subtitle="Sees both patients" />
            ))}

            <Text style={[s.groupLabel, { marginTop: space.xl }]}>PATIENTS</Text>
            {patients.map((u) => (
              <UserTile key={u.id} user={u} onPress={() => choose(u)} subtitle="Sees only their own record" />
            ))}

            <View style={s.notice}>
              <ShieldIcon size={16} color={colors.muted} />
              <Text style={s.noticeText}>
                Everything stays on this phone. No account, no server, no data leaves the device.
                The PIN keeps household members out of each other's records — it is not
                clinical-grade security.
              </Text>
            </View>
          </View>
        ) : (
          <View style={s.body}>
            <View style={s.selectedCard}>
              <Avatar name={selected.name} color={selected.color} size={56} ring />
              <Text style={s.selectedName}>{selected.name}</Text>
              <Small>{selected.role === 'caretaker' ? 'Caretaker' : 'Patient'}</Small>
            </View>

            <Row gap={space.md} justify="center" style={{ marginVertical: space.xl }}>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={[s.dot, i < pin.length && s.dotFilled, error && s.dotError]} />
              ))}
            </Row>

            {error ? <Text style={s.error}>{error}</Text> : null}

            <View style={s.keypad}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((k, i) =>
                k === '' ? (
                  <View key={i} style={s.key} />
                ) : (
                  <Pressable
                    key={i}
                    onPress={() => pressKey(k)}
                    style={({ pressed }) => [s.key, pressed && s.keyPressed]}
                  >
                    <Text style={s.keyText}>{k === 'del' ? '⌫' : k}</Text>
                  </Pressable>
                )
              )}
            </View>

            <Button title="Back" variant="ghost" onPress={() => setSelected(null)} style={{ marginTop: space.lg }} />
          </View>
        )}

        <Text style={s.hint}>Demo PINs — Anita 1111 · Meera 2222 · Ravi 3333</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function UserTile({ user, subtitle, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.tile, pressed && { opacity: 0.7 }]}>
      <Avatar name={user.name} color={user.color} size={44} />
      <View style={{ flex: 1 }}>
        <Text style={s.tileName}>{user.name}</Text>
        <Text style={s.tileSub}>{subtitle}</Text>
      </View>
      <Text style={s.tileChevron}>›</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingTop: space.xxl, paddingHorizontal: space.xl, paddingBottom: space.lg },
  brand: { fontSize: 12, fontWeight: '800', color: colors.primary, letterSpacing: 3 },
  tagline: { fontSize: 25, fontWeight: '700', color: colors.text, marginTop: 6, letterSpacing: -0.5 },
  body: { flex: 1, paddingHorizontal: space.xl },
  groupLabel: {
    fontSize: 10.5, fontWeight: '800', color: colors.faint,
    letterSpacing: 1.4, marginBottom: space.sm,
  },
  tile: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    backgroundColor: colors.card, borderRadius: radius.lg, padding: space.md,
    borderWidth: 1, borderColor: colors.border, marginBottom: space.sm, ...shadow,
  },
  tileName: { fontSize: 16, fontWeight: '700', color: colors.text },
  tileSub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  tileChevron: { fontSize: 24, color: colors.faint, fontWeight: '300' },

  notice: {
    flexDirection: 'row', gap: space.sm, marginTop: space.xl,
    backgroundColor: colors.card, borderRadius: radius.md, padding: space.md,
    borderWidth: 1, borderColor: colors.border,
  },
  noticeText: { flex: 1, fontSize: 11.5, color: colors.muted, lineHeight: 17 },

  selectedCard: { alignItems: 'center', gap: 6, marginTop: space.lg },
  selectedName: { fontSize: 19, fontWeight: '700', color: colors.text, marginTop: space.sm },

  dot: {
    width: 15, height: 15, borderRadius: 8,
    borderWidth: 2, borderColor: colors.border, backgroundColor: 'transparent',
  },
  dotFilled: { backgroundColor: colors.primary, borderColor: colors.primary },
  dotError: { borderColor: colors.danger },
  error: { color: colors.danger, textAlign: 'center', fontSize: 13, fontWeight: '600', marginBottom: space.sm },

  keypad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.md },
  key: {
    width: '28%', aspectRatio: 1.7, maxHeight: 62,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  keyPressed: { backgroundColor: colors.primarySoft },
  keyText: { fontSize: 22, fontWeight: '600', color: colors.text },

  hint: {
    textAlign: 'center', fontSize: 11.5, color: colors.faint,
    paddingVertical: space.lg, paddingHorizontal: space.xl,
  },
});
