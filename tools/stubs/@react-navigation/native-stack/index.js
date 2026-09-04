// Inert stub for the verification harness — the harness never renders/navigates.
module.exports = {
  createNativeStackNavigator: () => ({
    Navigator: 'Navigator',
    Screen: 'Screen',
  }),
};
