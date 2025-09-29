// ux.js — tiny helpers shared across pages

// Auto-close native <input type="date"> pickers once a date is chosen.
// Works for Chrome/Edge/Safari/Firefox and modals added later.
document.addEventListener('DOMContentLoaded', () => {
  const wireDateInputs = () => {
    document.querySelectorAll('input[type="date"]').forEach((input) => {
      if (input.__wiredCloseOnPick) return; // idempotent
      input.__wiredCloseOnPick = true;

      const close = () => {
        // Small timeout helps iOS/Safari commit the selection before blur.
        setTimeout(() => {
          try { input.blur(); } catch (_) {}
        }, 0);
      };

      input.addEventListener('change', close); // fires when a date is picked
      input.addEventListener('input', close);  // some UAs fire 'input' first
    });
  };

  // Initial pass
  wireDateInputs();

  // If DOM changes (e.g., open a modal), wire any new date inputs too.
  const mo = new MutationObserver(wireDateInputs);
  mo.observe(document.body, { childList: true, subtree: true });
});