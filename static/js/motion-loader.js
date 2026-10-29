// Keep the content and static backgrounds usable even if the optional island cannot load.
if (document.querySelector('[data-cyber-background], #global-motion')) {
  import('./motion-system.js').catch(() => {
    document.documentElement.dataset.motion = 'off';
  });
}
