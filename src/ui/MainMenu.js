/*
 * MainMenu — title menu (PLAY / OPTIONS / FULLSCREEN) built on the supplied ornate frame artwork.
 *
 * All three buttons use the same frame image and identical dimensions (styles in src/ui/style.css):
 * normal = black interior with gold lettering; selected = the frame's luminous gold interior,
 * black lettering, 12% larger, golden glow and a light sweep.
 *
 * Selection model (mouse and keyboard share it, so both look exactly the same):
 *  - hovering a button selects it; moving the pointer off the menu clears the highlight
 *  - Up/Down (W/S) select the previous/next item and keep it selected
 *  - Enter/Space or a click confirms (confirm sound + gold flash, then the action)
 * The navigation tick only plays when the highlighted item actually changes, so pointer jitter
 * over decorative parts or keyboard auto-repeat never produce repeated clicks.
 */
window.PAM = window.PAM || {};
PAM.MainMenu = class MainMenu {
  constructor(onActivate) {
    this.onActivate = onActivate;
    this.items = [...document.querySelectorAll('#mainMenu .km-item')];
    this.index = 0;          // item that Enter confirms
    this.lit = 0;            // highlighted item, or -1 when the pointer left the menu
    this.confirming = false;
    this.items.forEach((item, i) => {
      item.addEventListener('pointerenter', () => this.select(i));
      item.addEventListener('pointerleave', e => {
        // leaving onto another button is handled by that button's pointerenter (no flicker)
        if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('.km-item')) this.clear();
      });
      // clicks go through the same confirm path as Enter (sound + flash, then the action)
      item.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); this.select(i, true); this.activate(); }, true);
      item.addEventListener('focus', () => this.select(i, true));
    });
    this.select(0, true);
  }

  select(i, silent) {
    i = (i + this.items.length) % this.items.length;
    const changed = i !== this.lit;
    this.index = i; this.lit = i;
    this.items.forEach((el, k) => el.classList.toggle('selected', k === i));
    if (changed && !silent) PAM.AudioManager.resume().then(() => PAM.AudioManager.sfx.menuMove(i));
  }

  /** Pointer left the menu: back to the normal state (Enter still confirms the last item). */
  clear() {
    if (this.confirming) return;
    this.lit = -1;
    this.items.forEach(el => el.classList.remove('selected'));
  }

  move(d) { this.select((this.lit < 0 ? this.index - d : this.index) + d); }

  /** Confirm: stronger sound + a gold flash on the button, then run the item's action. */
  activate() {
    if (this.confirming) return;
    if (this.lit < 0) this.select(this.index, true);
    const item = this.items[this.index];
    this.confirming = true;
    PAM.AudioManager.resume().then(() => PAM.AudioManager.sfx.menuConfirm());
    item.classList.remove('confirmed'); void item.offsetWidth; item.classList.add('confirmed');
    // fullscreen must run inside the user gesture; the others wait for the flash to land
    const act = item.dataset.action;
    const run = () => { this.confirming = false; item.classList.remove('confirmed'); if (this.onActivate) this.onActivate(act); };
    if (act === 'fullscreen') { run(); item.classList.add('confirmed'); setTimeout(() => item.classList.remove('confirmed'), 450); }
    else setTimeout(run, 230);
  }
};
