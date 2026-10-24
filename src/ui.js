const $ = (id) => document.getElementById(id);

const SCREENS = ['loading', 'title', 'pause', 'dead', 'win', 'note'];

export const ui = {
  el: {
    hud: $('hud'), objective: $('objective'), prompt: $('prompt'), toast: $('toast'),
    batteryBar: $('batteryBar'), batteryPct: $('batteryPct'), staminaBar: $('staminaBar'), keys: $('keys'),
    noteText: $('noteText'), loadBar: $('loadBar'), loadText: $('loadText'), deadText: $('deadText'), winText: $('winText'),
  },
  _toastTimer: 0,

  /** Show exactly one full-screen overlay (or none when name is null). */
  screen(name) {
    for (const s of SCREENS) $(s).classList.toggle('hidden', s !== name);
    this.el.hud.classList.toggle('hidden', name === 'loading' || name === 'title');
  },

  loading(frac, text) {
    this.el.loadBar.style.width = `${Math.round(frac * 100)}%`;
    if (text) this.el.loadText.textContent = text;
  },

  setPrompt(text) {
    this.el.prompt.classList.toggle('hidden', !text);
    if (text) this.el.prompt.textContent = text;
  },

  toast(text, ms = 4000) {
    this.el.toast.textContent = text;
    this.el.toast.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.el.toast.classList.add('hidden'), ms);
  },

  objective(text) { this.el.objective.textContent = text; },

  note(text) {
    this.el.noteText.textContent = text;
    this.screen(text ? 'note' : null);
  },

  hud({ battery, stamina, keys }) {
    this.el.batteryBar.style.transform = `scaleX(${Math.max(0, battery / 100)})`;
    this.el.batteryBar.classList.toggle('low', battery < 20);
    this.el.batteryPct.textContent = `${Math.ceil(battery)}%`;
    this.el.staminaBar.style.transform = `scaleX(${Math.max(0, stamina)})`;
    this.el.keys.textContent = `KEYS ${keys} / 3`;
  },
};
