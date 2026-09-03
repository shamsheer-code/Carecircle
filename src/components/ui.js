import React from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, ScrollView,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, space, radius, type, shadow } from '../theme/theme';

/* ---------------- layout ---------------- */

export function Screen({ children, scroll = true, refreshing, onRefresh, style, edges = ['top'] }) {
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[s.scrollBody, style]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[s.plainBody, style]}>{children}</View>
  );
  return (
    <SafeAreaView style={s.screen} edges={edges}>
      {body}
    </SafeAreaView>
  );
}

export function Card({ children, style, onPress, accent }) {
  const content = (
    <View style={[s.card, accent && { borderLeftWidth: 4, borderLeftColor: accent }, style]}>
      {children}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && s.pressed}>
      {content}
    </Pressable>
  );
}

export function Row({ children, style, gap = space.sm, align = 'center', justify = 'flex-start', wrap }) {
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: align, justifyContent: justify, gap, flexWrap: wrap ? 'wrap' : 'nowrap' },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Spacer({ h = space.md }) {
  return <View style={{ height: h }} />;
}

export function Divider({ style }) {
  return <View style={[s.divider, style]} />;
}

/* ---------------- typography ---------------- */

export const H1 = ({ children, style }) => <Text style={[type.h1, style]}>{children}</Text>;
export const H2 = ({ children, style }) => <Text style={[type.h2, style]}>{children}</Text>;
export const H3 = ({ children, style }) => <Text style={[type.h3, style]}>{children}</Text>;
export const Body = ({ children, style, numberOfLines }) => (
  <Text style={[type.body, style]} numberOfLines={numberOfLines}>{children}</Text>
);
export const Small = ({ children, style, numberOfLines }) => (
  <Text style={[type.small, style]} numberOfLines={numberOfLines}>{children}</Text>
);
export const Overline = ({ children, style }) => (
  <Text style={[type.tiny, { textTransform: 'uppercase', fontWeight: '700' }, style]}>{children}</Text>
);

export function SectionTitle({ children, action, onAction }) {
  return (
    <Row justify="space-between" style={{ marginBottom: space.sm, marginTop: space.lg }}>
      <Overline style={{ color: colors.muted }}>{children}</Overline>
      {action ? (
        <Pressable onPress={onAction} hitSlop={10}>
          <Text style={s.linkText}>{action}</Text>
        </Pressable>
      ) : null}
    </Row>
  );
}

/* ---------------- atoms ---------------- */

export function Pill({ label, color = colors.primary, bg, style, small }) {
  return (
    <View
      style={[
        s.pill,
        { backgroundColor: bg || `${color}1A` },
        small && { paddingVertical: 2, paddingHorizontal: 7 },
        style,
      ]}
    >
      <Text style={[s.pillText, { color }, small && { fontSize: 10 }]}>{label}</Text>
    </View>
  );
}

export function Avatar({ name, color = colors.primary, size = 40, ring }) {
  const initials = String(name || '?')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return (
    <View
      style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: `${color}22`, alignItems: 'center', justifyContent: 'center',
        borderWidth: ring ? 2 : 0, borderColor: color,
      }}
    >
      <Text style={{ color, fontWeight: '700', fontSize: size * 0.36 }}>{initials}</Text>
    </View>
  );
}

export function Button({ title, onPress, variant = 'primary', size = 'md', disabled, loading, style, icon }) {
  const v = BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.button,
        size === 'sm' && s.buttonSm,
        size === 'lg' && s.buttonLg,
        { backgroundColor: v.bg, borderColor: v.border || 'transparent', borderWidth: v.border ? 1.5 : 0 },
        (disabled || loading) && { opacity: 0.45 },
        pressed && s.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.fg} />
      ) : (
        <Row gap={6}>
          {icon ? <Text style={{ color: v.fg, fontSize: 15 }}>{icon}</Text> : null}
          <Text style={[s.buttonText, { color: v.fg }, size === 'sm' && { fontSize: 13 }]}>{title}</Text>
        </Row>
      )}
    </Pressable>
  );
}

const BUTTON_VARIANTS = {
  primary: { bg: colors.primary, fg: '#fff' },
  danger: { bg: colors.danger, fg: '#fff' },
  success: { bg: colors.ok, fg: '#fff' },
  soft: { bg: colors.primarySoft, fg: colors.primaryDark },
  ghost: { bg: 'transparent', fg: colors.primary, border: colors.border },
  subtle: { bg: colors.bg, fg: colors.muted, border: colors.border },
};

export function Field({ label, hint, error, children, style }) {
  return (
    <View style={[{ marginBottom: space.lg }, style]}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      {children}
      {error ? (
        <Text style={[s.hint, { color: colors.danger }]}>{error}</Text>
      ) : hint ? (
        <Text style={s.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function Input(props) {
  return (
    <TextInput
      placeholderTextColor={colors.faint}
      {...props}
      style={[s.input, props.multiline && s.inputMulti, props.style]}
    />
  );
}

export function Segmented({ options, value, onChange, style }) {
  return (
    <View style={[s.segmented, style]}>
      {options.map((o) => {
        const val = o.value ?? o;
        const label = o.label ?? o;
        const active = val === value;
        return (
          <Pressable
            key={String(val)}
            onPress={() => onChange(val)}
            style={[s.segment, active && s.segmentActive]}
          >
            <Text style={[s.segmentText, active && s.segmentTextActive]} numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({ label, active, onPress, color = colors.primary }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.chip,
        active && { backgroundColor: `${color}1A`, borderColor: color },
        pressed && s.pressed,
      ]}
    >
      <Text style={[s.chipText, active && { color, fontWeight: '700' }]}>{label}</Text>
    </Pressable>
  );
}

export function StatTile({ label, value, unit, color = colors.text, sub, style, onPress }) {
  return (
    <Card style={[s.statTile, style]} onPress={onPress}>
      <Text style={[s.statValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
        {unit ? <Text style={s.statUnit}>{unit}</Text> : null}
      </Text>
      <Text style={s.statLabel} numberOfLines={2}>{label}</Text>
      {sub ? <Text style={s.statSub} numberOfLines={1}>{sub}</Text> : null}
    </Card>
  );
}

export function ListItem({ title, subtitle, right, left, onPress, accent, style, danger }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.listItem, accent && { borderLeftWidth: 3, borderLeftColor: accent }, pressed && onPress && s.pressed, style]}
    >
      {left ? <View style={{ marginRight: space.md }}>{left}</View> : null}
      <View style={{ flex: 1 }}>
        <Text style={[s.listTitle, danger && { color: colors.danger }]} numberOfLines={2}>{title}</Text>
        {subtitle ? <Text style={s.listSub} numberOfLines={3}>{subtitle}</Text> : null}
      </View>
      {right ? <View style={{ marginLeft: space.md }}>{right}</View> : null}
    </Pressable>
  );
}

export function EmptyState({ icon = '—', title, body, action, onAction }) {
  return (
    <View style={s.empty}>
      <Text style={s.emptyIcon}>{icon}</Text>
      <Text style={s.emptyTitle}>{title}</Text>
      {body ? <Text style={s.emptyBody}>{body}</Text> : null}
      {action ? <Button title={action} onPress={onAction} variant="soft" size="sm" style={{ marginTop: space.lg }} /> : null}
    </View>
  );
}

export function Loading({ label = 'Loading' }) {
  return (
    <View style={s.loading}>
      <ActivityIndicator color={colors.primary} />
      <Text style={[type.small, { marginTop: space.md }]}>{label}</Text>
    </View>
  );
}

export function Banner({ tone = 'info', title, body, action, onAction }) {
  const map = {
    info: { bg: colors.infoSoft, fg: colors.info },
    warn: { bg: colors.warnSoft, fg: colors.warn },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
    ok: { bg: colors.okSoft, fg: colors.ok },
  };
  const t = map[tone] || map.info;
  return (
    <View style={[s.banner, { backgroundColor: t.bg }]}>
      <View style={{ flex: 1 }}>
        <Text style={[s.bannerTitle, { color: t.fg }]}>{title}</Text>
        {body ? <Text style={[s.bannerBody, { color: t.fg }]}>{body}</Text> : null}
      </View>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={[s.bannerAction, { color: t.fg }]}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ---------------- styles ---------------- */

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scrollBody: { padding: space.lg, paddingBottom: space.xxl * 2 },
  plainBody: { flex: 1, padding: space.lg },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  pressed: { opacity: 0.65 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: space.md },
  linkText: { color: colors.primary, fontWeight: '700', fontSize: 13 },

  pill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' },
  pillText: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.2 },

  button: {
    paddingHorizontal: space.lg, paddingVertical: 13, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center', minHeight: 46,
  },
  buttonSm: { paddingVertical: 8, paddingHorizontal: space.md, minHeight: 36 },
  buttonLg: { paddingVertical: 16, minHeight: 54 },
  buttonText: { fontWeight: '700', fontSize: 15 },

  label: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 6 },
  hint: { fontSize: 12, color: colors.muted, marginTop: 5, lineHeight: 16 },
  input: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: space.md, paddingVertical: 12, fontSize: 15,
    color: colors.text, backgroundColor: colors.card, minHeight: 46,
  },
  inputMulti: { minHeight: 90, textAlignVertical: 'top', paddingTop: 12 },

  segmented: {
    flexDirection: 'row', backgroundColor: colors.bg, borderRadius: radius.md,
    padding: 3, borderWidth: 1, borderColor: colors.border,
  },
  segment: { flex: 1, paddingVertical: 9, borderRadius: radius.sm, alignItems: 'center' },
  segmentActive: { backgroundColor: colors.card, ...shadow, shadowOpacity: 0.08 },
  segmentText: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  segmentTextActive: { color: colors.text, fontWeight: '700' },

  chip: {
    paddingHorizontal: space.md, paddingVertical: 8, borderRadius: radius.pill,
    borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card,
  },
  chipText: { fontSize: 13, color: colors.muted, fontWeight: '600' },

  statTile: { flex: 1, padding: space.md, minWidth: 90 },
  statValue: { fontSize: 24, fontWeight: '800', letterSpacing: -0.8 },
  statUnit: { fontSize: 13, fontWeight: '600', color: colors.muted },
  statLabel: { fontSize: 11.5, color: colors.muted, marginTop: 3, fontWeight: '600' },
  statSub: { fontSize: 10.5, color: colors.faint, marginTop: 2 },

  listItem: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: space.md,
    paddingHorizontal: space.md, backgroundColor: colors.card,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: space.sm,
  },
  listTitle: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  listSub: { fontSize: 12.5, color: colors.muted, marginTop: 3, lineHeight: 17 },

  empty: { alignItems: 'center', paddingVertical: space.xxl, paddingHorizontal: space.xl },
  emptyIcon: { fontSize: 30, color: colors.faint, marginBottom: space.sm },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.text, textAlign: 'center' },
  emptyBody: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 6, lineHeight: 19 },

  loading: { paddingVertical: space.xxl * 2, alignItems: 'center' },

  banner: {
    flexDirection: 'row', alignItems: 'center', borderRadius: radius.md,
    padding: space.md, gap: space.md, marginBottom: space.md,
  },
  bannerTitle: { fontSize: 13.5, fontWeight: '700' },
  bannerBody: { fontSize: 12.5, marginTop: 2, lineHeight: 17, opacity: 0.9 },
  bannerAction: { fontSize: 13, fontWeight: '800' },
});
