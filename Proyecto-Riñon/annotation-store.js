// Cola durable por UID. La web de RTDB no conserva escrituras sin enviar al
// cerrar una pestaña: este caché conserva esos cambios hasta la próxima sesión.
export function validStrokes(value) {
  return Array.isArray(value) && value.length <= 3000 && value.every(s =>
    /^#[0-9a-f]{6}$/i.test(s.color) && Number.isFinite(s.width) && s.width >= 1 && s.width <= 50 &&
    typeof s.eraser === 'boolean' && Array.isArray(s.points) && s.points.length <= 15000 &&
    s.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1));
}
export function noteId(resource) {
  return Array.from(new TextEncoder().encode(resource), b => b.toString(16).padStart(2, '0')).join('');
}
const clone = value => JSON.parse(JSON.stringify(value));
export class AccountAnnotationStore {
  constructor(backend, cache, status = () => {}) {
    this.backend = backend; this.cache = cache; this.status = status;
    this.entries = new Map(); this.listeners = new Set(); this.uid = null;
    this.generation = 0; this.serial = 0; this.timer = null; this.running = null;
    this.cacheFailed = false; this.cloudError = false;
    this.loading = true;
  }
  subscribe(callback) { this.listeners.add(callback); return () => this.listeners.delete(callback); }
  notify() { this.listeners.forEach(fn => fn()); this.report(); }
  get pending() { return [...this.entries.values()].filter(e => e.dirty).length; }
  report() { this.status({pending: this.pending, loading: this.loading, cacheFailed: this.cacheFailed, cloudError: this.cloudError}); }
  persist() {
    if (!this.uid) return;
    try { this.cache.setItem(`risio:notes:v1:${this.uid}`, JSON.stringify([...this.entries])); this.cacheFailed = false; }
    catch { this.cacheFailed = true; }
    this.report();
  }
  async start(uid) {
    this.stop(); this.uid = uid; const generation = this.generation;
    try {
      const cached = JSON.parse(this.cache.getItem(`risio:notes:v1:${uid}`) || '[]');
      for (const [key, entry] of cached) if (typeof key === 'string' && validStrokes(entry.strokes)) {
        this.entries.set(key, {...entry, version: ++this.serial});
      }
    } catch { /* Solo se descarta un caché ilegible; no se usa el de otra cuenta. */ }
    this.notify();
    this.unsubscribe = this.backend.listen(uid, snapshot => {
      if (generation !== this.generation) return;
      const received = new Set();
      for (const entry of Object.values(snapshot || {})) {
        try {
          if (typeof entry.resource !== 'string') continue;
          const strokes = JSON.parse(entry.strokesJson);
          if (!validStrokes(strokes)) continue;
          const key = entry.resource; received.add(key);
          if (!this.entries.get(key)?.dirty) this.entries.set(key, {strokes, dirty: false, version: ++this.serial});
        } catch { /* Un recurso dañado no afecta los demás. */ }
      }
      for (const [key, value] of this.entries) if (!received.has(key) && !value.dirty) this.entries.delete(key);
      this.loading = false; this.cloudError = false; this.persist(); this.notify(); this.flush();
    }, () => {
      if (generation !== this.generation) return;
      this.loading = false; this.cloudError = true; this.report();
    });
    this.flush();
  }
  stop() {
    this.generation++; clearTimeout(this.timer); this.unsubscribe?.(); this.unsubscribe = null;
    this.uid = null; this.entries.clear(); this.running = null; this.cloudError = false; this.loading = true;
  }
  read(key) { return this.entries.get(key)?.strokes || []; }
  keys() { return [...this.entries.keys()]; }
  save(key, strokes) {
    if (!this.uid) throw new Error('Inicia sesión antes de anotar.');
    if (!validStrokes(strokes)) throw new Error('Este trazo supera el límite permitido. Deshazlo o divide tus notas.');
    if (new TextEncoder().encode(JSON.stringify(strokes)).length > 900000) throw new Error('Esta página tiene demasiados trazos. Borra algunos antes de continuar.');
    this.entries.set(key, {strokes: clone(strokes), dirty: true, version: ++this.serial});
    this.persist(); this.notify(); clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 250);
  }
  async flush() {
    if (!this.uid) return;
    if (this.running) return this.running;
    const uid = this.uid, generation = this.generation;
    const run = async () => {
      for (const [key, entry] of this.entries) {
        if (!entry.dirty || generation !== this.generation) continue;
        const version = entry.version;
        try {
          await this.backend.write(uid, noteId(key), {resource: key, strokesJson: JSON.stringify(entry.strokes)});
          if (generation !== this.generation) return;
          if (this.entries.get(key)?.version === version) this.entries.get(key).dirty = false;
          this.cloudError = false; this.persist();
        } catch {
          if (generation === this.generation) { this.cloudError = true; this.report(); }
          break;
        }
      }
    };
    this.running = run();
    try { await this.running; }
    finally {
      if (generation === this.generation) {
        this.running = null; this.report();
        if (this.pending) { clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), this.cloudError ? 15000 : 300); }
      }
    }
  }
}
