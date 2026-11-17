// Runs before first paint so a saved theme never flashes the other one.
// External on purpose: the CSP allows scripts from 'self' only.
try {
  var saved = localStorage.getItem('esign:theme')
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved
} catch (e) {}
