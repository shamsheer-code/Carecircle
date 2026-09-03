import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { useApp } from '../context/AppContext';
import { colors, radius } from '../theme/theme';
import { Loading, Screen, EmptyState } from '../components/ui';
import {
  PillIcon, BellIcon, ChartIcon, HeartIcon, ClipboardIcon, UsersIcon, SettingsIcon,
} from '../components/icons';

import LoginScreen from '../screens/LoginScreen';
import PatientTodayScreen from '../screens/patient/PatientTodayScreen';
import HealthScreen from '../screens/patient/HealthScreen';
import CarePlanScreen from '../screens/patient/CarePlanScreen';
import CaretakerDashboardScreen from '../screens/caretaker/CaretakerDashboardScreen';
import AlertCenterScreen from '../screens/caretaker/AlertCenterScreen';
import PatientDetailScreen from '../screens/caretaker/PatientDetailScreen';
import DoctorSummaryScreen from '../screens/shared/DoctorSummaryScreen';
import InsightsHubScreen from '../screens/shared/InsightsHubScreen';
import MedicationFormScreen from '../screens/shared/MedicationFormScreen';
import ConditionFormScreen from '../screens/shared/ConditionFormScreen';
import LogVitalScreen from '../screens/shared/LogVitalScreen';
import VitalDetailScreen from '../screens/shared/VitalDetailScreen';
import LabPanelFormScreen from '../screens/shared/LabPanelFormScreen';
import LabPanelDetailScreen from '../screens/shared/LabPanelDetailScreen';
import AppointmentFormScreen from '../screens/shared/AppointmentFormScreen';
import LogSymptomScreen from '../screens/shared/LogSymptomScreen';
import EmergencyScreen from '../screens/shared/EmergencyScreen';
import SettingsScreen from '../screens/shared/SettingsScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.card,
    text: colors.text,
    border: colors.border,
    primary: colors.primary,
  },
};

function Badge({ count }) {
  if (!count) return null;
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text>
    </View>
  );
}

function TabIcon({ Icon, focused, badge }) {
  return (
    <View>
      <Icon size={23} color={focused ? colors.primary : colors.faint} />
      <Badge count={badge} />
    </View>
  );
}

const tabScreenOptions = {
  headerShown: false,
  tabBarActiveTintColor: colors.primary,
  tabBarInactiveTintColor: colors.faint,
  tabBarStyle: {
    backgroundColor: colors.card,
    borderTopColor: colors.border,
    height: 62,
    paddingBottom: 8,
    paddingTop: 6,
  },
  tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
};

function CaretakerTabs() {
  const { alertCount } = useApp();
  return (
    <Tab.Navigator screenOptions={tabScreenOptions}>
      <Tab.Screen
        name="CareToday"
        component={CaretakerDashboardScreen}
        options={{
          title: 'Today',
          tabBarIcon: ({ focused }) => <TabIcon Icon={PillIcon} focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Alerts"
        component={AlertCenterScreen}
        options={{
          title: 'Alerts',
          tabBarIcon: ({ focused }) => <TabIcon Icon={BellIcon} focused={focused} badge={alertCount} />,
        }}
      />
      <Tab.Screen
        name="Insights"
        component={InsightsHubScreen}
        options={{
          title: 'Insights',
          tabBarIcon: ({ focused }) => <TabIcon Icon={ChartIcon} focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused }) => <TabIcon Icon={SettingsIcon} focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

function PatientTabs() {
  const { alertCount } = useApp();
  return (
    <Tab.Navigator screenOptions={tabScreenOptions}>
      <Tab.Screen
        name="Today"
        component={PatientTodayScreen}
        options={{
          title: 'Today',
          tabBarIcon: ({ focused }) => <TabIcon Icon={PillIcon} focused={focused} badge={alertCount} />,
        }}
      />
      <Tab.Screen
        name="Health"
        component={HealthScreen}
        options={{
          title: 'Health',
          tabBarIcon: ({ focused }) => <TabIcon Icon={HeartIcon} focused={focused} />,
        }}
      />
      <Tab.Screen
        name="CarePlan"
        component={CarePlanScreen}
        options={{
          title: 'Care plan',
          tabBarIcon: ({ focused }) => <TabIcon Icon={ClipboardIcon} focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Me',
          tabBarIcon: ({ focused }) => <TabIcon Icon={SettingsIcon} focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

const modalOptions = {
  headerShown: true,
  presentation: 'modal',
  headerStyle: { backgroundColor: colors.card },
  headerTitleStyle: { fontSize: 16, fontWeight: '700', color: colors.text },
  headerTintColor: colors.primary,
};

const pushOptions = {
  headerShown: true,
  headerStyle: { backgroundColor: colors.card },
  headerTitleStyle: { fontSize: 16, fontWeight: '700', color: colors.text },
  headerTintColor: colors.primary,
  headerBackTitle: 'Back',
};

export default function RootNavigator() {
  const { ready, user, bootError } = useApp();

  if (!ready) {
    return (
      <Screen scroll={false}>
        <Loading label="Opening your local records" />
      </Screen>
    );
  }

  if (bootError) {
    return (
      <Screen scroll={false}>
        <EmptyState
          icon="!"
          title="Could not open the database"
          body={bootError}
        />
      </Screen>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen
              name="Home"
              component={user.role === 'caretaker' ? CaretakerTabs : PatientTabs}
            />

            <Stack.Screen name="PatientDetail" component={PatientDetailScreen}
              options={({ route }) => ({ ...pushOptions, title: route.params?.name || 'Patient' })} />
            <Stack.Screen name="DoctorSummary" component={DoctorSummaryScreen}
              options={{ ...pushOptions, title: 'Doctor view' }} />
            <Stack.Screen name="VitalDetail" component={VitalDetailScreen}
              options={({ route }) => ({ ...pushOptions, title: route.params?.label || 'Vital' })} />
            <Stack.Screen name="LabPanelDetail" component={LabPanelDetailScreen}
              options={{ ...pushOptions, title: 'Lab panel' }} />
            <Stack.Screen name="Emergency" component={EmergencyScreen}
              options={{ ...pushOptions, title: 'Emergency' }} />

            <Stack.Screen name="MedicationForm" component={MedicationFormScreen}
              options={({ route }) => ({ ...modalOptions, title: route.params?.medicationId ? 'Edit medication' : 'Add medication' })} />
            <Stack.Screen name="ConditionForm" component={ConditionFormScreen}
              options={({ route }) => ({ ...modalOptions, title: route.params?.conditionId ? 'Edit condition' : 'Add condition' })} />
            <Stack.Screen name="LogVital" component={LogVitalScreen}
              options={{ ...modalOptions, title: 'Log a reading' }} />
            <Stack.Screen name="LabPanelForm" component={LabPanelFormScreen}
              options={{ ...modalOptions, title: 'Enter lab results' }} />
            <Stack.Screen name="AppointmentForm" component={AppointmentFormScreen}
              options={({ route }) => ({ ...modalOptions, title: route.params?.appointmentId ? 'Edit visit' : 'Add visit' })} />
            <Stack.Screen name="LogSymptom" component={LogSymptomScreen}
              options={{ ...modalOptions, title: 'Log a symptom' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute', top: -5, right: -9, minWidth: 17, height: 17,
    borderRadius: radius.pill, backgroundColor: colors.danger,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
