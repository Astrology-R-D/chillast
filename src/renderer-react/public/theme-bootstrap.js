(function bootstrapTheme() {
  var preference = localStorage.getItem('chillast.theme') || 'system';
  var density = localStorage.getItem('chillast.density') || 'compact';
  var theme = preference;

  if (preference === 'system') {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.density = density;
})();
