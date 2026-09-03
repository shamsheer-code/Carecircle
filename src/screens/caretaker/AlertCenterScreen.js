import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useApp, useData } from '../../context/AppContext';
import { listAlerts, markAlertRead, markAllAlertsRead, resolveAlert } from '../../db/queries';
import { relative, fmtDateTime } from '../../utils/date';
import { colors, space, radius } from '../../theme/theme';
import {
  Screen, Card, Row, H2, Small, Overline, Segmented, Button, Loading, EmptyState, Pill, Avatar,
} from '../../components/ui';
import { AlertIcon, CheckIcon, PillIcon, FlaskIcon, CalendarIcon, ChartIcon, HeartIcon } from '../../components/icons';

const FILTERS = [
  { value: 'open', label: 'Open' },
  { value: 'critical', label: 'Critical' },
  { value: 'all', label: 'All' },
];

const SEV = {
  critical: { color: colors.danger, bg: colors.dangerSoft, label: 'Critical' },
  warn: { color: colors.warn, bg: colors.warnSoft, label: 'Attention' },
  info: { color: colors.info, bg: colors.infoSoft, label: 'Note' },
};

const KIND_ICON = {
  missed_dose: PillIcon,
  streak: PillIcon,
  adherence_drop: ChartIcon,
  red_flag: HeartIcon,
  followup_due: CalendarIcon,
  lab_out_of_range: FlaskIcon,
};

const KIND_LABEL = {
  missed_dose: 'Missed dose',
  streak: 'Repeated misses',
  adherence_drop: 'Adherence falling',
  red_flag: 'Red-flag symptom',
  followup_due: 'Follow-up',
  lab_out_of_range: 'Abnormal lab',
};

/**
 * The in-app source of truth for escalations.
 *
 * OS notifications can be denied, silenced, or swiped away. This list cannot —
 * every escalation the engine raises lands here and stays until someone
 * resolves it.
 */
export default function AlertCenterScreen() {
  const nav = useNavigation();
  const { user, isCaretaker, invalidate, sweep, notificationsEnabled } = useApp();
  const [filter, setFilter] = useState('open');

  const scope = isCaretaker ? null : user.id;

  const { data, loading, reload } = useData(
    () => listAlerts({ patientId: scope, includeResolved: filter === 'all', limit: 300 }),
    [scope, filter]
  );

  const after = async () => { await reload(); invalidate(); };

  const shown = useMemo(() => {
    if (!data) return [];
    if (filter === 'critical') return data.filter((a) => a.severity === 'critical');
    return data;
  }, [data, filter]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const a of shown) {
      if (!map.has(a.patient_id)) map.set(a.patient_id, { name: a.patient_name, color: a.patient_color, items: [] });
      map.get(a.patient_id).items.push(a);
    }
    return [...map.entries()];
  }, [shown]);

  if (loading || !data) return <Screen scroll={false}><Loading /></Screen>;

  const unread = data.filter((a) => !a.read_at).length;

  return (
    <Screen onRefresh={after}>
      <Row justify="space-between" align="flex-start">
        <View style={{ flex: 1 }}>
          <H2>Alerts</H2>
          <Small>
            {unread ? `${unread} unread` : 'Nothing unread'} · escalations raised automatically
          </Small>
        </View>
        {unread ? (
          <Pressable onPress={async () => { await markAllAlertsRead(scope); await after(); }} hitSlop={10}>
            <Text style={s.link}>Mark all read</Text>
          </Pressable>
        ) : null}
      </Row>

      <Segmented options={FILTERS} value={filter} onChange={setFilter} style={{ marginTop: space.md }} />

      <Button
        title="Check for missed doses now"
        variant="ghost"
        size="sm"
        style={{ marginTop: space.md }}
        onPress={async () => { await sweep({ notify: true }); await after(); }}
      />

      {shown.length === 0 ? (
        <EmptyState
          icon="✓"
          title={filter === 'open' ? 'Nothing needs your attention' : 'No alerts here'}
          body={
            notificationsEnabled
              ? 'Missed doses, red-flag symptoms, abnormal labs and overdue follow-ups appear here automatically, and as a phone notification.'
              : 'Missed doses, red-flag symptoms, abnormal labs and overdue follow-ups appear here automatically. Phone notifications are currently off — enable them in Settings.'
          }
        />
      ) : (
        grouped.map(([patientId, group]) => (
          <View key={patientId} style={{ marginTop: space.lg }}>
            <Row gap={space.sm} style={{ marginBottom: space.sm }}>
              <Avatar name={group.name} color={group.color} size={26} />
              <Overline style={{ color: colors.muted }}>{group.name}</Overline>
              <View style={{ flex: 1 }} />
              <Pressable
                onPress={() => nav.navigate('PatientDetail', { patientId, name: group.name })}
                hitSlop={8}
              >
                <Text style={s.link}>Open record</Text>
              </Pressable>
            </Row>

            {group.items.map((a) => {
              const sev = SEV[a.severity] || SEV.info;
              const Icon = KIND_ICON[a.kind] || AlertIcon;
              const isResolved = !!a.resolved_at;
              return (
                <Card
                  key={a.id}
                  style={[s.alert, isResolved && { opacity: 0.55 }]}
                  accent={sev.color}
                  onPress={async () => { if (!a.read_at) { await markAlertRead(a.id); await after(); } }}
                >
                  <Row justify="space-between" align="flex-start">
                    <Row gap={space.sm} style={{ flex: 1 }} align="flex-start">
                      <View style={[s.iconBox, { backgroundColor: sev.bg }]}>
                        <Icon size={17} color={sev.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Row gap={6} wrap>
                          <Text style={[s.kind, { color: sev.color }]}>
                            {KIND_LABEL[a.kind] || a.kind}
                          </Text>
                          {!a.read_at && !isResolved ? <View style={s.dot} /> : null}
                        </Row>
                        <Text style={s.title}>{a.title}</Text>
                        {a.body ? <Text style={s.body}>{a.body}</Text> : null}
                        <Small style={{ marginTop: 5 }}>{relative(a.created_at)}</Small>
                      </View>
                    </Row>
                  </Row>

                  {!isResolved ? (
                    <Row gap={space.sm} style={{ marginTop: space.md }}>
                      <Button
                        title="Mark handled"
                        variant="soft"
                        size="sm"
                        style={{ flex: 1 }}
                        onPress={async () => { await resolveAlert(a.id); await after(); }}
                      />
                      <Button
                        title="Open record"
                        variant="ghost"
                        size="sm"
                        style={{ flex: 1 }}
                        onPress={() => nav.navigate('PatientDetail', { patientId, name: group.name })}
                      />
                    </Row>
                  ) : (
                    <Row gap={5} style={{ marginTop: space.sm }}>
                      <CheckIcon size={13} color={colors.ok} />
                      <Small style={{ color: colors.ok }}>
                        Handled {fmtDateTime(a.resolved_at)}
                      </Small>
                    </Row>
                  )}
                </Card>
              );
            })}
          </View>
        ))
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  link: { color: colors.primary, fontWeight: '700', fontSize: 12.5 },
  alert: { marginBottom: space.sm, padding: space.md },
  iconBox: { width: 32, height: 32, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  kind: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  title: { fontSize: 14.5, fontWeight: '700', color: colors.text, marginTop: 2 },
  body: { fontSize: 12.5, color: colors.muted, marginTop: 3, lineHeight: 18 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.danger },
});
