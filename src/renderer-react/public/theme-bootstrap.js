(function bootstrapTheme() {
  var storedPreference = localStorage.getItem('chillast.theme');
  var storedDensity = localStorage.getItem('chillast.density');
  var preference = ['system', 'light', 'dark'].includes(storedPreference)
    ? storedPreference
    : 'system';
  var density = ['compact', 'comfortable'].includes(storedDensity)
    ? storedDensity
    : 'compact';
  var theme = preference;

  if (preference === 'system') {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  localStorage.setItem('chillast.theme', preference);
  localStorage.setItem('chillast.density', density);
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.density = density;
})();
