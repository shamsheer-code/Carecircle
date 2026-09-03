/**
 * Local notifications.
 *
 * Design note: the OS notification is a *convenience*, never the source of
 * truth. Every escalation is also written to the `alerts` table, so if the
 * user denied permission, or is running in Expo Go on Android where local
 * notification support is limited, the caretaker still sees everything in the
 * in-app Alert Center. Nothing here is allowed to throw into the UI.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { parseTimes } from './schedule';

let configured = false;
let permissionGranted = null;

export const CHANNELS = {
  reminders: 'dose-reminders',
  escalations: 'caretaker-escalations',
};

export async function configureNotifications() {
  if (configured) return permissionGranted;
  configured = true;

  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        // legacy keys, harmless on newer SDKs
        shouldShowAlert: true,
      }),
    });

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNELS.reminders, {
        name: 'Dose reminders',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 220, 120, 220],
        lightColor: '#0F766E',
      });
      await Notifications.setNotificationChannelAsync(CHANNELS.escalations, {
        name: 'Caretaker alerts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 400, 150, 400],
        lightColor: '#C4372F',
      });
    }

    const current = await Notifications.getPermissionsAsync();
    let status = current.status;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    permissionGranted = status === 'granted';
  } catch (err) {
    console.warn('[notifications] setup unavailable:', err?.message);
    permissionGranted = false;
  }
  return permissionGranted;
}

function dailyTrigger(hour, minute) {
  const T = Notifications.SchedulableTriggerInputTypes;
  if (T?.DAILY) return { type: T.DAILY, hour, minute };
  return { hour, minute, repeats: true }; // older SDK shape
}

/**
 * Rebuild the daily reminder set for every scheduled medication.
 * Called on launch and whenever a medication is added or edited.
 */
export async function syncDoseReminders(patients, medicationsByPatient) {
  if (!(await configureNotifications())) return 0;
  let count = 0;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();

    for (const patient of patients) {
      const meds = medicationsByPatient[patient.id] || [];
      for (const med of meds) {
        if (med.is_emergency || !med.active) continue;
        for (const time of parseTimes(med)) {
          const [hour, minute] = time.split(':').map(Number);
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `${patient.name} · ${med.name} ${med.dose}`,
              body: med.instructions || 'Time for this dose. Open CareCircle to mark it taken.',
              data: { kind: 'dose', patientId: patient.id, medicationId: med.id, time },
              sound: true,
              ...(Platform.OS === 'android' ? { channelId: CHANNELS.reminders } : {}),
            },
            trigger: dailyTrigger(hour, minute),
          });
          count += 1;
        }
      }
    }
  } catch (err) {
    console.warn('[notifications] could not schedule reminders:', err?.message);
  }
  return count;
}

/** Immediate escalation — a missed critical dose, a red flag symptom. */
export async function pushEscalation({ title, body, data = {}, critical = false }) {
  if (!(await configureNotifications())) return false;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { kind: 'escalation', ...data },
        sound: true,
        ...(Platform.OS === 'android'
          ? { channelId: critical ? CHANNELS.escalations : CHANNELS.reminders }
          : {}),
      },
      trigger: null, // deliver now
    });
    return true;
  } catch (err) {
    console.warn('[notifications] could not deliver escalation:', err?.message);
    return false;
  }
}

export async function clearBadge() {
  try {
    await Notifications.setBadgeCountAsync(0);
  } catch {
    /* badge not supported everywhere */
  }
}

export async function scheduledCount() {
  try {
    const list = await Notifications.getAllScheduledNotificationsAsync();
    return list.length;
  } catch {
    return 0;
  }
}
