import React from 'react';
import { Platform, View, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppProvider } from './src/context/AppContext';
import RootNavigator from './src/navigation/RootNavigator';
import { colors } from './src/theme/theme';

/**
 * CareCircle is a phone application by design, not by accident.
 *
 * The dose flow assumes a device that is physically with the patient and can
 * raise a notification at 06:30. A desktop browser satisfies neither, so
 * rather than degrade quietly we refuse to run there — app.json also omits
 * "web" from platforms, and this guard covers anyone who forces a web bundle.
 */
export default function App() {
  if (Platform.OS === 'web') {
    return (
      <View style={styles.block}>
        <Text style={styles.blockTitle}>CareCircle runs on phones only</Text>
        <Text style={styles.blockBody}>
          Dose reminders and missed-dose escalation depend on a device that stays with the
          patient and can post notifications. Open this project with Expo Go on Android or
          iOS, or install a development build.
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </AppProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  block: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: 40, backgroundColor: colors.bg,
  },
  blockTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 10 },
  blockBody: { fontSize: 14, color: colors.muted, textAlign: 'center', maxWidth: 420, lineHeight: 21 },
});
