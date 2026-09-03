import React, { useState } from 'react';
import { View, Text, StyleSheet, useWindowDimensions, Alert, Share } from 'react-native';

import { useApp, useData } from '../../context/AppContext';
import { buildPatientSummary } from '../../services/patterns';
import { exportSummaryPdf, summaryToText } from '../../services/pdf';
import { fmtDate, fmtShortDate, age } from '../../utils/date';
import { colors, space, radius, adherenceColor } from '../../theme/theme';
import {
  Screen, Card, Row, H2, H3, Small, Overline, Button, Loading, Pill, Divider, Segmented, Banner,
} from '../../components/ui';
import { Donut, AdherenceBars, AdherenceStrip, CompareBar } from '../../components/charts';
import { ShareIcon } from '../../components/icons';

const WINDOWS = [
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 180, label: '6 months' },
];

const SEV = {
  critical: { color: colors.danger, bg: colors.dangerSoft, label: 'Needs action' },
  warn: { color: colors.warn, bg: colors.warnSoft, label: 'Watch' },
  info: { color: colors.info, bg: colors.infoSoft, label: 'Note' },
  ok: { color: colors.ok, bg: colors.okSoft, label: 'Stable' },
};

/**
 * Doctor View.
 *
 * Written to be handed across a desk. The answer sits at the top, the working
 * underneath, and the method is stated at the bottom so a clinician can decide
 * how much weight the numbers deserve.
 */
export default function DoctorSummaryScreen({ route }) {
  const { user } = useApp();
  const patientId = route?.params?.patientId ?? user.id;
  const [days, setDays] = useState(90);
  const [exporting, setExporting] = useState(false);
  const { width } = useWindowDimensions();
  const chartW = width - space.lg * 2 - space.lg * 2;

  const { data: summary, loading } = useData(
    () => buildPatientSummary(patientId, { days }),
    [patientId, days]
  );

  const onExport = async () => {
    setExporting(true);
    try {
      const { shared } = await exportSummaryPdf(summary);
      if (!shared) {
        Alert.alert('PDF created', 'Sharing is not available on this device, so the file was saved locally.');
      }
    } catch (err) {
      Alert.alert('Could not create the PDF', err?.message || 'Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const onShareText = async () => {
    try {
      await Share.share({ message: summaryToText(summary) });
    } catch {
      /* user dismissed */
    }
  };

  if (loading || !summary) return <Screen scroll={false}><Loading label="Analysing the record" /></Screen>;

  const { patient, adherence, trend, followUp, findings, labs, vitalSummaries, stratified, commitment } = summary;
  const criticals = findings.filter((f) => f.severity === 'critical');
  const others = findings.filter((f) => f.severity !== 'critical');

  return (
    <Screen>
      {/* header */}
      <Row justify="space-between" align="flex-start">
        <View style={{ flex: 1 }}>
          <Overline style={{ color: colors.primary }}>Clinical summary</Overline>
          <H2 style={{ marginTop: 2 }}>{patient.name}</H2>
          <Small>
            {age(patient.dob) ? `${age(patient.dob)} yrs · ` : ''}
            {patient.sex}
            {patient.blood_group ? ` · ${patient.blood_group}` : ''}
            {` · ${fmtShortDate(adherence.from)} – ${fmtShortDate(adherence.to)}`}
          </Small>
        </View>
      </Row>

      <Segmented options={WINDOWS} value={days} onChange={setDays} style={{ marginTop: space.md }} />

      {/* the answer, first */}
      <Card style={s.headline} accent={criticals.length ? colors.danger : colors.ok}>
        <Overline style={{ color: colors.muted }}>Bottom line</Overline>
        <Text style={s.headlineText}>{summary.headline}</Text>
      </Card>

      {/* numbers */}
      <Card style={{ marginTop: space.md }}>
        <Row gap={space.lg}>
          <Donut value={adherence.adherence} size={104} label="Adherence"
            sublabel={`${adherence.taken}/${adherence.expected - adherence.skipped}`} />
          <View style={{ flex: 1, gap: space.md }}>
            <KV label="vs previous period"
              value={trend.delta == null ? '—' : `${trend.delta > 0 ? '+' : ''}${trend.delta} pts`}
              color={trend.delta == null ? colors.muted : trend.delta >= 0 ? colors.ok : colors.danger} />
            <KV label="Visits attended" value={`${followUp.totalVisits} of ${followUp.totalVisits + followUp.missedVisits}`}
              color={colors.text} />
            <KV label="Commitment score" value={commitment ?? '—'} color={adherenceColor(commitment)} />
          </View>
        </Row>

        <Divider />
        <Overline style={{ color: colors.muted, marginBottom: 6 }}>Daily pattern</Overline>
        <AdherenceStrip daily={adherence.daily} width={chartW} height={50} />
      </Card>

      {/* export */}
      <Row gap={space.sm} style={{ marginTop: space.md }}>
        <Button
          title="Export PDF"
          icon="↑"
          loading={exporting}
          onPress={onExport}
          style={{ flex: 1.4 }}
        />
        <Button title="Send as text" variant="ghost" onPress={onShareText} style={{ flex: 1 }} />
      </Row>

      {/* critical findings */}
      {criticals.length ? (
        <>
          <Overline style={{ color: colors.danger, marginTop: space.xl, marginBottom: space.sm }}>
            Needs attention
          </Overline>
          {criticals.map((f) => <Finding key={f.id} f={f} />)}
        </>
      ) : (
        <Banner tone="ok" title="No critical findings this period"
          body="Nothing in the record meets the threshold for immediate escalation." />
      )}

      {/* where the misses happen */}
      <Overline style={{ color: colors.muted, marginTop: space.xl, marginBottom: space.sm }}>
        Where the misses happen
      </Overline>
      <Card>
        <Small style={{ marginBottom: space.sm }}>By time of day</Small>
        <AdherenceBars data={adherence.byBucket} labelKey="bucket" width={chartW} height={130} />
        <Divider />
        <Small style={{ marginBottom: space.sm }}>By day of the week</Small>
        <AdherenceBars data={adherence.byWeekday} labelKey="label" width={chartW} height={130} />
      </Card>

      {/* per-drug */}
      <Overline style={{ color: colors.muted, marginTop: space.xl, marginBottom: space.sm }}>
        Per medication
      </Overline>
      <Card>
        {adherence.perMedication.length === 0 ? (
          <Small>No scheduled medication in this window.</Small>
        ) : (
          adherence.perMedication.map((m, i) => (
            <View key={m.id}>
              {i > 0 ? <Divider style={{ marginVertical: space.sm }} /> : null}
              <Row justify="space-between" align="flex-start">
                <View style={{ flex: 1 }}>
                  <Row gap={6} wrap>
                    <Text style={s.medName}>{m.name}</Text>
                    {m.critical ? <Pill label="Critical" color={colors.danger} small /> : null}
                  </Row>
                  <Small>{m.dose} · {m.taken} taken, {m.missed} missed{m.skipped ? `, ${m.skipped} held` : ''}</Small>
                  {m.byTime.length > 1 ? (
                    <Row gap={space.sm} wrap style={{ marginTop: 5 }}>
                      {m.byTime.map((t) => (
                        <View key={t.time} style={s.timeChip}>
                          <Text style={s.timeChipTime}>{t.time}</Text>
                          <Text style={[s.timeChipPct, { color: adherenceColor(t.adherence) }]}>
                            {t.adherence}%
                          </Text>
                        </View>
                      ))}
                    </Row>
                  ) : null}
                </View>
                <Text style={[s.medPct, { color: adherenceColor(m.adherence) }]}>
                  {m.adherence ?? '—'}%
                </Text>
              </Row>
            </View>
          ))
        )}
      </Card>

      {/* adherence vs outcome */}
      {stratified.length ? (
        <>
          <Overline style={{ color: colors.muted, marginTop: space.xl, marginBottom: space.sm }}>
            Does adherence move the numbers?
          </Overline>
          <Card>
            <Small style={{ marginBottom: space.md }}>
              Readings split by whether every scheduled dose that day was taken. Observational,
              unadjusted — but it separates a control problem from a dosing problem.
            </Small>
            {stratified.map((st, i) => (
              <View key={st.type} style={{ marginTop: i ? space.lg : 0 }}>
                <Text style={s.stratLabel}>{st.label}</Text>
                <CompareBar
                  unit={` ${st.unit}`}
                  items={[
                    { label: 'All doses taken', value: st.onTrackMean, n: st.onTrackN, color: colors.ok },
                    { label: 'A dose was missed', value: st.missedMean, n: st.missedN, color: colors.warn },
                  ]}
                />
                <Small style={{ marginTop: 5 }}>
                  Difference {st.difference > 0 ? '+' : ''}{st.difference} {st.unit} on missed-dose days
                </Small>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {/* labs */}
      {labs.trends.length ? (
        <>
          <Overline style={{ color: colors.muted, marginTop: space.xl, marginBottom: space.sm }}>
            Laboratory trends
          </Overline>
          <Card>
            {labs.trends.map((t, i) => {
              const abnormal = t.flag !== 'normal';
              return (
                <View key={t.analyte}>
                  {i > 0 ? <Divider style={{ marginVertical: space.sm }} /> : null}
                  <Row justify="space-between" align="flex-start">
                    <View style={{ flex: 1 }}>
                      <Text style={s.analyte}>{t.analyte}</Text>
                      <Small>
                        ref {t.refLow ?? '—'}–{t.refHigh ?? '—'} {t.unit} · {t.n} draw{t.n > 1 ? 's' : ''}
                        {' · '}{fmtShortDate(t.latestOn)}
                      </Small>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[s.analyteValue, { color: abnormal ? colors.warn : colors.text }]}>
                        {t.latest} <Text style={s.analyteUnit}>{t.unit}</Text>
                      </Text>
                      {t.change != null ? (
                        <Small>
                          {t.direction === 'up' ? '↑' : t.direction === 'down' ? '↓' : '→'}{' '}
                          {t.change > 0 ? '+' : ''}{t.change} since {fmtShortDate(t.firstOn)}
                        </Small>
                      ) : null}
                    </View>
                  </Row>
                </View>
              );
            })}
          </Card>
        </>
      ) : null}

      {/* everything else */}
      {others.length ? (
        <>
          <Overline style={{ color: colors.muted, marginTop: space.xl, marginBottom: space.sm }}>
            Other observations
          </Overline>
          {others.map((f) => <Finding key={f.id} f={f} />)}
        </>
      ) : null}

      {/* method */}
      <Card style={s.method}>
        <Overline style={{ color: colors.muted }}>How these numbers were derived</Overline>
        <Text style={s.methodText}>
          Adherence % = taken ÷ (expected − clinically held) × 100. Expected doses come from the
          prescribed schedule stored in this app. A dose counts as missed only once its grace window
          closes — 45 minutes for medications flagged critical, 90 minutes otherwise. Doses a clinician
          instructed the patient to hold are excluded from the denominator; doses not yet due are
          excluded entirely.
        </Text>
        <Text style={s.methodText}>
          Vitals and lab values are entered by hand by the patient or caretaker and are not verified
          against a device or laboratory feed. Treat them as a self-reported record, not a source
          document.
        </Text>
      </Card>
    </Screen>
  );
}

function Finding({ f }) {
  const sev = SEV[f.severity] || SEV.info;
  return (
    <Card style={{ marginBottom: space.sm }} accent={sev.color}>
      <Row gap={space.sm} style={{ marginBottom: 5 }}>
        <View style={[s.sevChip, { backgroundColor: sev.bg }]}>
          <Text style={[s.sevText, { color: sev.color }]}>{sev.label}</Text>
        </View>
        <Text style={s.category}>{f.category}</Text>
      </Row>
      <H3>{f.headline}</H3>
      <Text style={s.detail}>{f.detail}</Text>
      {f.evidence?.length ? (
        <View style={s.evidence}>
          {f.evidence.slice(0, 8).map((e, i) => (
            <Row key={i} gap={6} align="flex-start">
              <Text style={s.bullet}>·</Text>
              <Text style={s.evidenceText}>{e}</Text>
            </Row>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function KV({ label, value, color }) {
  return (
    <View>
      <Text style={[s.kvValue, { color }]}>{value}</Text>
      <Text style={s.kvLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  headline: { marginTop: space.md },
  headlineText: { fontSize: 15.5, fontWeight: '600', color: colors.text, marginTop: 4, lineHeight: 22 },
  kvValue: { fontSize: 18, fontWeight: '800', letterSpacing: -0.4 },
  kvLabel: { fontSize: 11.5, color: colors.muted, marginTop: -1 },
  sevChip: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.sm },
  sevText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
  category: { fontSize: 9.5, color: colors.faint, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase' },
  detail: { fontSize: 13.5, color: colors.muted, marginTop: 5, lineHeight: 19.5 },
  evidence: {
    marginTop: space.sm, paddingTop: space.sm,
    borderTopWidth: 1, borderTopColor: colors.border, gap: 2,
  },
  bullet: { color: colors.faint, fontSize: 13 },
  evidenceText: { flex: 1, fontSize: 12, color: colors.faint, lineHeight: 17 },
  medName: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  medPct: { fontSize: 19, fontWeight: '800', letterSpacing: -0.5 },
  timeChip: {
    flexDirection: 'row', gap: 5, alignItems: 'center',
    backgroundColor: colors.bg, paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.sm,
  },
  timeChipTime: { fontSize: 11, color: colors.muted, fontWeight: '600' },
  timeChipPct: { fontSize: 11.5, fontWeight: '800' },
  stratLabel: { fontSize: 13.5, fontWeight: '700', color: colors.text, marginBottom: space.sm },
  analyte: { fontSize: 14, fontWeight: '700', color: colors.text },
  analyteValue: { fontSize: 16.5, fontWeight: '800' },
  analyteUnit: { fontSize: 11, fontWeight: '600', color: colors.muted },
  method: { marginTop: space.xl, backgroundColor: colors.bg, borderStyle: 'dashed' },
  methodText: { fontSize: 12, color: colors.muted, lineHeight: 18, marginTop: space.sm },
});
