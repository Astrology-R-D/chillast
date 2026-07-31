(function bootstrapTheme() {
  var memory = {};
  var storage;

  try {
    storage = window.localStorage;
  } catch (_error) {
    storage = null;
  }

  function read(key) {
    try {
      return storage ? storage.getItem(key) : memory[key] || null;
    } catch (_error) {
      return memory[key] || null;
    }
  }

  function write(key, value) {
    memory[key] = value;
    try {
      if (storage) storage.setItem(key, value);
    } catch (_error) {
      // The in-memory value remains available for this bootstrap run.
    }
  }

  var storedPreference = read('chillast.theme');
  var storedDensity = read('chillast.density');
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

  write('chillast.theme', preference);
  write('chillast.density', density);
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.density = density;
  document.documentElement.style.colorScheme = theme;
})();
