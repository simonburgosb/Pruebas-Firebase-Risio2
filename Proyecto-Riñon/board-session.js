import {auth, database, withTimeout} from './firebase-client.js';
import {ref, get, set, update, remove, push, onValue, query, limitToLast, runTransaction, onDisconnect, serverTimestamp} from './vendor/firebase-sdk.js';
import {SLOT_KEYS, rgb, BOARD_TTL} from './board-utils.js';

export class BoardSession {
  constructor(profile, changed) {
    this.profile = profile; this.changed = changed; this.uid = auth.currentUser.uid;
    this.meta = null; this.unsubscribers = []; this.pending = new Set(); this.online = false;
    this.generation = 0; this.state = {participants: {}, strokes: {}, messages: {}, permissions: {}, hands: {}, live: {}, texts: {}, highlights: {}};
  }
  path(suffix = '') { return `boardData/${this.profile.university}/${this.meta.id}${suffix ? '/' + suffix : ''}`; }
  get owner() { return this.meta?.ownerUid === this.uid; }
  get canDraw() { return Boolean(!this.removed && !this.expired && this.online && this.present && (this.meta?.kind === 'student' || this.owner || this.state.permissions[this.uid])); }
  get expired() {return this.meta?.kind==='student' && this.serverNow>=this.meta.createdAt+BOARD_TTL;}
  get serverNow() {return Date.now()+(this.clockOffset||0);}
  notify() { this.changed(this); }
  async create(title, course) {
    title = title.trim(); course = course.trim();
    if (title.length < 2 || title.length > 100 || course.length < 2 || course.length > 100) throw new Error('Escribe un título y una clase o materia, entre 2 y 100 caracteres.');
    const target = push(ref(database, `boardDirectory/${this.profile.university}`));
    const meta = {title, course, kind: this.profile.requestedRole, ownerUid: this.uid, ownerName: this.profile.displayName, createdAt: serverTimestamp()};
    await withTimeout(set(target, meta));
    const saved = (await withTimeout(get(target))).val();
    return {...saved, id: target.key};
  }
  async join(meta) {
    await this.leave();
    this.meta = meta;
    this.unsubscribers.push(onValue(ref(database,'.info/serverTimeOffset'),snap=>{this.clockOffset=snap.val()||0;}));
    this.expiryTimer=setInterval(()=>{if(this.expired){this.present=false;this.error='Este tablero alcanzó sus 45 minutos y ha caducado.';this.state={participants:{},strokes:{},messages:{},permissions:{},hands:{},live:{},texts:{},highlights:{}};this.notify();}},1000); const generation = ++this.generation;
    this.connectionId = push(ref(database)).key;
    this.removed=false;this.error = ''; this.present = false; this.connecting = false; this.notify();
    this.unsubscribers.push(onValue(ref(database, '.info/connected'), snapshot => {
      this.online = snapshot.val() === true; this.notify();
      if (this.online && !this.connecting) {
        this.connecting = true;
        this.reserve(generation).then(() => {
          if (generation !== this.generation) return;
          this.present = true; this.error = ''; this.subscribe(generation); this.notify();
        }).catch(error => { if (generation === this.generation) { this.error = error.message; this.present = false; this.notify(); } })
          .finally(() => { this.connecting = false; });
      }
    }));
  }
  async reserve(generation) {
    const branch = this.meta.kind === 'student' ? 'slots' : 'participants';
    const data = (await withTimeout(get(ref(database, this.path(branch))))).val() || {};
    const own = Object.entries(data).find(([,value]) => value.uid === this.uid);
    if (own && own[1].connectionId !== this.connectionId) throw new Error('Ya tienes este tablero abierto en otra pestaña o dispositivo. Sal de allí antes de entrar aquí.');
    const candidates = own ? [own[0]] : this.meta.kind === 'student' ? SLOT_KEYS : [this.uid];
    for (const key of candidates) {
      if (generation !== this.generation) return;
      if (data[key] && !own) continue;
      const target = ref(database, this.path(`${branch}/${key}`));
      const disconnect = onDisconnect(target);
      try {
        await withTimeout(disconnect.remove());
        const record = {uid: this.uid, connectionId: this.connectionId, displayName: this.profile.displayName, joinedAt: serverTimestamp()};
        const result = own ? {committed:true} : await withTimeout(runTransaction(target, current => current === null ? record : undefined, {applyLocally:false}));
        if (result.committed) {
          if (generation !== this.generation) { await disconnect.cancel(); await remove(target); return; }
          this.presenceRef = target; this.disconnect = disconnect; return;
        }
      } catch (error) {
        await disconnect.cancel();
        // A simultaneous successful reservation may win after the initial read.
        if (!(await get(target)).exists()) throw error;
        continue;
      }
      await disconnect.cancel();
    }
    throw new Error('Este grupo está completo: hay 5 personas conectadas. Intenta entrar cuando alguien salga.');
  }
  subscribe(generation) {
    for (const stop of this.roomSubscriptions || []) stop();
    this.roomSubscriptions = [];
    const listen = (target, assign) => this.roomSubscriptions.push(onValue(target, snapshot => {
      if (generation !== this.generation || this.expired) return;
      assign(snapshot.val() || {}); this.notify();
    }, error => { if (generation === this.generation) { this.error = 'No pudimos sincronizar el tablero. Revisa la conexión y las reglas de Firebase.'; this.present = false; this.notify(); } }));
    const branch = this.meta.kind === 'student' ? 'slots' : 'participants';
    listen(ref(database, this.path(branch)), value => {
      this.state.participants = Object.fromEntries(Object.values(value).map(p => [p.uid, p]));
      this.present = Object.values(value).some(p => p.uid === this.uid && p.connectionId === this.connectionId);
    });
    listen(ref(database,this.path('strokes')), value => this.state.strokes = value);
    listen(query(ref(database,this.path('messages')), limitToLast(100)), value => this.state.messages = value);
    listen(ref(database,this.path('permissions')), value => this.state.permissions = value);
    listen(ref(database,this.path('hands')), value => this.state.hands = value);
    for(const key of ['live','texts','highlights'])listen(ref(database,this.path(key)),value=>this.state[key]=value);
    this.liveRef=ref(database,this.path(`live/${this.uid}`));
    onDisconnect(this.liveRef).remove().catch(()=>{});
  }
  async save(action) {
    if (!this.online || !this.present) throw new Error('Espera a recuperar la conexión para continuar.');
    const operation=action();
    this.pending.add(operation); this.notify();
    try { return await withTimeout(operation); }
    finally { this.pending.delete(operation); this.notify(); }
  }
  stroke(points, color, width, tool='pen') {
    if (!this.canDraw) throw new Error('Necesitas permiso para anotar.');
    return this.save(()=>set(push(ref(database,this.path('strokes'))), {authorUid:this.uid, pointsJson:JSON.stringify(points), ...rgb(color), width, tool, createdAt:serverTimestamp()}));
  }
  async liveStroke(points,color,width,tool='pen') {
    if(!this.canDraw)return;
    if(this.liveBusy){this.liveQueued={points:[...points],color,width,tool};return;}
    this.liveBusy=true;
    try {await withTimeout(set(this.liveRef,{authorUid:this.uid,pointsJson:JSON.stringify(points),...rgb(color),width,tool,createdAt:serverTimestamp()}), 'No se pudo sincronizar el trazo en vivo.', 8000);}
    finally {this.liveBusy=false;const queued=this.liveQueued;this.liveQueued=null;if(queued)await this.liveStroke(queued.points,queued.color,queued.width,queued.tool);}
  }
  async finishLive() {this.liveQueued=null;while(this.liveBusy)await new Promise(r=>setTimeout(r,20));if(this.liveRef && this.online)await remove(this.liveRef);}
  async text(value,id) {
    if(!this.canDraw)throw new Error('Necesitas permiso para anotar.');
    const target=id?ref(database,this.path(`texts/${id}`)):push(ref(database,this.path('texts')));
    return this.save(()=>set(target,{authorUid:this.uid,text:value.text,x:value.x,y:value.y,fontSize:value.fontSize,...rgb(value.color),updatedAt:serverTimestamp()}));
  }
  highlightText(id,color) {
    if(!this.canDraw)throw new Error('Necesitas permiso para anotar.');
    const value=this.state.highlights[id]?.[this.uid]?null:rgb(color);
    return this.save(()=>set(ref(database,this.path(`highlights/${id}/${this.uid}`)),value));
  }
  async deleteBoard(meta=this.meta) {
    if(!meta || meta.kind!=='student' || meta.ownerUid!==this.uid)throw new Error('Solo el creador puede eliminar este grupo.');
    await this.removeStudentBoard(meta);
  }
  async removeStudentBoard(meta) {
    // One atomic update removes metadata AND all shared content. Rules authorize
    // the owner at any time, or another verified campus user after server expiry.
    const university=this.profile.university;
    await withTimeout(update(ref(database), {
      [`boardDirectory/${university}/${meta.id}`]:null,
      [`boardData/${university}/${meta.id}`]:null
    }));
  }
  async cleanExpired(boards) {
    if(this.cleaning)return;
    this.cleaning=true;
    try {
      for(const meta of boards.filter(b=>b.kind==='student' && this.serverNow>=b.createdAt+BOARD_TTL)) {
        try {await this.removeStudentBoard(meta);} catch(error) {
          // A clock estimate never authorizes deletion: Firebase rules use now.
          console.warn('No se pudo limpiar un tablero vencido:',error.code||'connection');
        }
      }
    } finally {this.cleaning=false;}
  }
  undo() {
    const last = Object.entries(this.state.strokes).reverse().find(([,s]) => s.authorUid === this.uid);
    return last ? this.save(()=>remove(ref(database,this.path(`strokes/${last[0]}`)))) : Promise.resolve();
  }
  clear() { if (!this.owner) throw new Error('Solo quien creó el tablero puede vaciarlo.'); return this.save(()=>Promise.all(['strokes','texts','highlights','live'].map(key=>remove(ref(database,this.path(key)))))); }
  message(text) {
    text = text.trim(); if (!text || text.length > 1000) throw new Error('Escribe un mensaje de hasta 1000 caracteres.');
    return this.save(()=>set(push(ref(database,this.path('messages'))), {uid:this.uid, authorName:this.profile.displayName, text, createdAt:serverTimestamp()}));
  }
  hand() { return this.save(()=>set(ref(database,this.path(`hands/${this.uid}`)), this.state.hands[this.uid] ? null : true)); }
  async permission(uid,grant=false) {
    if (!this.owner || this.meta.kind !== 'teacher') throw new Error('Solo el profesor de esta clase puede cambiar permisos.');
    await this.save(()=>set(ref(database,this.path(`permissions/${uid}`)), !grant && this.state.permissions[uid] ? null : true));
    if (this.state.hands[uid]) await this.save(()=>remove(ref(database,this.path(`hands/${uid}`))));
  }
  async leave() {
    if (this.pending.size) await withTimeout(Promise.all([...this.pending]), 'Todavía hay cambios por guardar. Recupera la conexión antes de salir.', 12000);
    clearInterval(this.expiryTimer);
    await this.finishLive().catch(()=>{});
    ++this.generation;
    for (const stop of [...this.unsubscribers, ...(this.roomSubscriptions || [])]) stop();
    this.unsubscribers = []; this.roomSubscriptions = [];
    // Cancel first, then remove: a stale disconnect must not remove a later reservation.
    if (this.presenceRef && this.online && !this.removed) { await withTimeout(this.disconnect.cancel()); await withTimeout(remove(this.presenceRef)); }
    this.presenceRef = null; this.disconnect = null; this.meta = null; this.present = false;
    this.state = {participants:{}, strokes:{}, messages:{}, permissions:{}, hands:{}, live:{}, texts:{}, highlights:{}};
  }
}
