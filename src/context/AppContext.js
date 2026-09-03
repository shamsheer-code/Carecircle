import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { initDatabase, resetDatabase } from '../db/database';
import { listUsers, listPatients, unreadAlertCount, listScheduledMedications } from '../db/queries';
import { runAlertSweep } from '../services/alerts';
import { configureNotifications, syncDoseReminders, clearBadge } from '../services/notifications';

const SESSION_KEY = 'carecircle.session.userId';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState(null);
  const [users, setUsers] = useState([]);
  const [patients, setPatients] = useState([]);
  const [user, setUser] = useState(null);
  const [alertCount, setAlertCount] = useState(0);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);

  const sweeping = useRef(false);

  /** Bump this to make every mounted screen refetch. */
  const invalidate = useCallback(() => setDataVersion((v) => v + 1), []);

  const loadUsers = useCallback(async () => {
    const [u, p] = await Promise.all([listUsers(), listPatients()]);
    setUsers(u);
    setPatients(p);
    return { u, p };
  }, []);

  const refreshAlertCount = useCallback(async (forUser = user) => {
    // A patient only sees alerts about themselves; the caretaker sees all.
    const scope = forUser && forUser.role === 'patient' ? forUser.id : null;
    setAlertCount(await unreadAlertCount(scope));
  }, [user]);

  /** Detect overdue doses, raise alerts, then refresh the badge. */
  const sweep = useCallback(async ({ notify = true } = {}) => {
    if (sweeping.current) return null;
    sweeping.current = true;
    try {
      const result = await runAlertSweep({ notify });
      await refreshAlertCount();
      if (result.missedDoses > 0 || result.alertsRaised > 0) invalidate();
      return result;
    } catch (err) {
      console.warn('[sweep] failed:', err?.message);
      return null;
    } finally {
      sweeping.current = false;
    }
  }, [refreshAlertCount, invalidate]);

  /** Rebuild every daily reminder from the current medication list. */
  const rescheduleReminders = useCallback(async () => {
    try {
      const ps = await listPatients();
      const byPatient = {};
      for (const p of ps) byPatient[p.id] = await listScheduledMedications(p.id);
      const n = await syncDoseReminders(ps, byPatient);
      return n;
    } catch (err) {
      console.warn('[reminders] failed:', err?.message);
      return 0;
    }
  }, []);

  /* ---------------- boot ---------------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await initDatabase();
        const { u } = await loadUsers();

        const savedId = await AsyncStorage.getItem(SESSION_KEY);
        if (savedId) {
          const found = u.find((x) => String(x.id) === String(savedId));
          if (found) setUser(found);
        }

        const granted = await configureNotifications();
        if (!cancelled) setNotificationsEnabled(!!granted);

        await rescheduleReminders();
        await runAlertSweep({ notify: false }); // silent on cold start
        const scope = null;
        if (!cancelled) setAlertCount(await unreadAlertCount(scope));
      } catch (err) {
        console.error('[boot] failed:', err);
        if (!cancelled) setBootError(err?.message || 'Could not open the local database.');
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [loadUsers, rescheduleReminders]);

  /* ---------------- sweep when the app comes back to the foreground ---------------- */
  useEffect(() => {
    if (!ready) return undefined;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        sweep({ notify: true });
        clearBadge();
      }
    });
    return () => sub.remove();
  }, [ready, sweep]);

  /* ---------------- periodic sweep while open ---------------- */
  useEffect(() => {
    if (!ready) return undefined;
    const id = setInterval(() => sweep({ notify: true }), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [ready, sweep]);

  useEffect(() => {
    if (ready) refreshAlertCount();
  }, [ready, user, dataVersion, refreshAlertCount]);

  /* ---------------- session ---------------- */

  const signIn = useCallback(async (nextUser) => {
    setUser(nextUser);
    await AsyncStorage.setItem(SESSION_KEY, String(nextUser.id));
    await clearBadge();
  }, []);

  const signOut = useCallback(async () => {
    setUser(null);
    await AsyncStorage.removeItem(SESSION_KEY);
  }, []);

  const resetDemoData = useCallback(async () => {
    await resetDatabase();
    await loadUsers();
    await rescheduleReminders();
    await runAlertSweep({ notify: false });
    invalidate();
  }, [loadUsers, rescheduleReminders, invalidate]);

  const isCaretaker = user?.role === 'caretaker';

  /** Patients this session is allowed to see. */
  const visiblePatients = isCaretaker
    ? patients
    : patients.filter((p) => p.id === user?.id);

  const value = {
    ready, bootError, users, patients, visiblePatients,
    user, isCaretaker, signIn, signOut,
    alertCount, refreshAlertCount,
    dataVersion, invalidate,
    sweep, rescheduleReminders, resetDemoData,
    notificationsEnabled,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

/**
 * Refetch helper: runs `fn` on mount and whenever the global data version
 * changes, so any write anywhere refreshes every open screen.
 */
export function useData(fn, deps = []) {
  const { dataVersion, ready } = useApp();
  const [state, setState] = useState({ data: null, loading: true, error: null });

  const reload = useCallback(async () => {
    try {
      const data = await fn();
      setState({ data, loading: false, error: null });
    } catch (err) {
      console.warn('[useData]', err?.message);
      setState({ data: null, loading: false, error: err?.message || 'Something went wrong' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    (async () => {
      try {
        const data = await fn();
        if (alive) setState({ data, loading: false, error: null });
      } catch (err) {
        if (alive) setState({ data: null, loading: false, error: err?.message || 'Something went wrong' });
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, dataVersion, ...deps]);

  return { ...state, reload };
}
