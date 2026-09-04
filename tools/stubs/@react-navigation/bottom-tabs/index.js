// Inert stub for the verification harness — the harness never renders/navigates.
module.exports = {
  createBottomTabNavigator: () => ({
    Navigator: 'Navigator',
    Screen: 'Screen',
  }),
};
