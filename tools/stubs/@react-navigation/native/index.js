// Inert stub for the verification harness — the harness never renders/navigates.
module.exports = {
  NavigationContainer: 'NavigationContainer',
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {} }),
  useRoute: () => ({ params: {} }),
  useFocusEffect: () => {},
  useIsFocused: () => true,
  DefaultTheme: {},
  DarkTheme: {},
};
