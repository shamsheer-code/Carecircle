// Inert stub for the verification harness — notifications.js wraps every call
// in try/catch by design, so async no-ops are enough to exercise it safely.
module.exports = {
  AndroidImportance: { MIN: 1, LOW: 2, DEFAULT: 3, HIGH: 4, MAX: 5 },
  SchedulableTriggerInputTypes: { DAILY: 'daily', TIME_INTERVAL: 'timeInterval', DATE: 'date' },
  setNotificationHandler: () => {},
  setNotificationChannelAsync: async () => {},
  getPermissionsAsync: async () => ({ status: 'granted' }),
  requestPermissionsAsync: async () => ({ status: 'granted' }),
  cancelAllScheduledNotificationsAsync: async () => {},
  scheduleNotificationAsync: async () => 'stub-notification-id',
  setBadgeCountAsync: async () => {},
  getAllScheduledNotificationsAsync: async () => [],
};
