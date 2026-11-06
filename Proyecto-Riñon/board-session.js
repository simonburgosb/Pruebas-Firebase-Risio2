import {auth, database, withTimeout} from './firebase-client.js';
import {ref, get, set, update, remove, push, onValue, query, limitToLast, runTransaction, onDisconnect, serverTimestamp} from './vendor/firebase-sdk.js';
import {BOARD_MODELS, MIN_MODEL_SIZE, MAX_MODEL_SIZE, MODEL_SIZE_STEP, boardModelSize} from './board-model-catalog.js';
import {SLOT_KEYS, rgb, defaultBoardMinutes, validBoardDuration, boardExpired, boardLimit, activePeople} from './board-utils.js';

const emptyRoom = () => ({participants:{}, strokes:{}, messages:{}, permissions:{}, hands:{}, live:{}, texts:{}, highlights:{}, models:{}});

export class BoardSession {
  constructor(profile, changed) {
    this.profile = profile; this.changed = changed; this.uid = auth.currentUser.uid;
    this.meta = null; this.unsubscribers = []; this.pending = new Set(); this.online = false;
    this.generation = 0; this.state = emptyRoom();
  }
  path(suffix = '') { return `boardData/${this.profile.university}/${this.meta.id}${suffix ? '/' + suffix : ''}`; }
  get owner() { return this.meta?.ownerUid === this.uid; }
  get canDraw() { return Boolean(!this.removed && !this.expired && this.online && this.present && (this.meta?.kind === 'student' || this.owner || this.state.permissions[this.uid])); }
  get allowsModelSharing() { return this.meta?.kind === 'student' || this.profile.requestedRole === 'teacher'; }
  get canShareModels() { return Boolean(this.meta && this.allowsModelSharing && !this.removed && !this.expired && this.online && this.present); }
  get expired() {return Boolean(this.meta && boardExpired(this.meta,this.serverNow));}
  get serverNow() {return Date.now()+(this.clockOffset||0);}
  notify() { this.changed(this); }
  async create(title, course, durationMinutes = defaultBoardMinutes(this.profile.requestedRole)) {
    title = title.trim(); course = course.trim();
    if (title.length < 2 || title.length > 100 || course.length < 2 || course.length > 100) throw new Error('Escribe un título y una clase o materia, entre 2 y 100 caracteres.');
    if (!validBoardDuration(this.profile.requestedRole, durationMinutes)) {
      throw new Error('Selecciona una duración válida para este tablero.');
    }
    const target = push(ref(database, `boardDirectory/${this.profile.university}`));
    const meta = {title, course, kind: this.profile.requestedRole, ownerUid: this.uid, ownerName: this.profile.displayName, durationMinutes, createdAt: serverTimestamp()};
    await withTimeout(set(target, meta));
    const saved = (await withTimeout(get(target))).val();
    return {...saved, id: target.key};
  }
  async join(meta) {
    await this.leave();
    this.meta = meta;
    this.unsubscribers.push(onValue(ref(database,'.info/serverTimeOffset'),snap=>{this.clockOffset=snap.val()||0;}));
    this.expiryTimer=setInterval(()=>{if(this.expired){this.present=false;this.error='Este tablero ha alcanzado su duración máxima y ha caducado.';this.state=emptyRoom();this.notify();}},1000); const generation = ++this.generation;
    this.connectionId = push(ref(database)).key;
    this.removed=false;this.error = ''; this.present = false; this.connecting = false; this.notify();
    this.unsubscribers.push(onValue(ref(database, '.info/connected'), snapshot => {
      this.online = snapshot.val() === true; if(!this.online){this.classSeat=null;this.present=false;} this.notify();
      if (this.online && !this.connecting) {
        this.connecting = true;
        this.reserve(generation).then(() => {
          if (generation !== this.generation) return;
          this.present = true; this.error = ''; this.subscribe(generation); this.notify();
        }).catch(error => { if (generation === this.generation) { this.releaseClassSeat().catch(()=>{}); this.error = error.message; this.present = false; this.notify(); } })
          .finally(() => { this.connecting = false; });
      }
    }));
  }
  async releaseClassSeat() {
    if(!this.classSeat)return;
    const {target,disconnect}=this.classSeat;this.classSeat=null;
    await disconnect.cancel();await update(ref(database,this.path()),{[`classSlots/${target.key}`]:null,[`participants/${this.uid}`]:null});
  }
  async reserveClassSeat(generation) {
    if(this.classSeat)return;
    const occupied=(await withTimeout(get(ref(database,this.path('classSlots'))))).val()||{};
    for(let i=0;i<50;i++) {
      const existing=occupied[`c${i}`];
      if(existing && (existing.uid!==this.uid || existing.connectionId!==this.connectionId))continue;
      const target=ref(database,this.path(`classSlots/c${i}`)),disconnect=onDisconnect(ref(database,this.path()));
      try {
        await withTimeout(disconnect.update({[`classSlots/c${i}`]:null,[`participants/${this.uid}`]:null}));
        if(existing){this.classSeat={target,disconnect};return;}
        const record={uid:this.uid,connectionId:this.connectionId,displayName:this.profile.displayName,joinedAt:serverTimestamp()};
        const result=await withTimeout(runTransaction(target,current=>current===null?record:undefined,{applyLocally:false}));
        if(result.committed){
          if(generation!==this.generation){await disconnect.cancel();await remove(target);return;}
          this.classSeat={target,disconnect};return;
        }
      } catch(error) {if(!(await get(target)).exists())throw error;}
      finally {if(this.classSeat?.target!==target)await disconnect.cancel();}
    }
    throw new Error('Esta clase está completa: 50 personas, incluido el profesor.');
  }
  async reserve(generation) {
    const branch = this.meta.kind === 'student' ? 'slots' : 'participants';
    const data = (await withTimeout(get(ref(database, this.path(branch))))).val() || {};
    const own = Object.entries(data).find(([,value]) => value.uid === this.uid && !value.leftAt);
    if(!own && activePeople(data).length>=boardLimit(this.meta))throw new Error(`Este tablero está completo: ${boardLimit(this.meta)} personas conectadas.`);
    if (own && own[1].connectionId !== this.connectionId) throw new Error('Ya tienes este tablero abierto en otra pestaña o dispositivo. Sal de allí antes de entrar aquí.');
    if(this.meta.kind==='teacher') {await this.reserveClassSeat(generation);if(generation!==this.generation)return;}
    const candidates = own ? [own[0]] : this.meta.kind === 'student' ? SLOT_KEYS : [this.uid];
    for (const key of candidates) {
      if (generation !== this.generation) return;
      if (data[key] && !data[key].leftAt && !own) continue;
      const target = ref(database, this.path(`${branch}/${key}`));
      const disconnect = onDisconnect(target);
      try {
        const record = {uid: this.uid, connectionId: this.connectionId, displayName: this.profile.displayName, joinedAt: serverTimestamp()};
        const departed={...record,leftAt:serverTimestamp()};
        await withTimeout(this.meta.kind==='student'?disconnect.set(departed):disconnect.remove());
        const result = own ? {committed:true} : await withTimeout(runTransaction(target, current => current === null || current.leftAt ? record : undefined, {applyLocally:false}));
        if (result.committed) {
          if (generation !== this.generation) { await disconnect.cancel(); await (this.meta.kind==='student'?update(target,{leftAt:serverTimestamp()}):remove(target)); return; }
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
    throw new Error('Este tablero está completo. Intenta entrar cuando alguien salga.');
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
      this.state.participants = Object.fromEntries(activePeople(value).map(p => [p.uid, p]));
      this.present = activePeople(value).some(p => p.uid === this.uid && p.connectionId === this.connectionId);
    });
    listen(ref(database,this.path('strokes')), value => this.state.strokes = value);
    listen(query(ref(database,this.path('messages')), limitToLast(100)), value => this.state.messages = value);
    listen(ref(database,this.path('permissions')), value => this.state.permissions = value);
    listen(ref(database,this.path('hands')), value => this.state.hands = value);
    for(const key of ['live','texts','highlights','models'])listen(ref(database,this.path(key)),value=>this.state[key]=value);
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
  shareModel(id, shared) {
    if (!this.canShareModels) throw new Error('Necesitas estar conectado al grupo o participar como profesor en la clase para compartir modelos.');
    if (!Object.hasOwn(BOARD_MODELS, id)) throw new Error('Selecciona un modelo de Risio.');
    return this.save(() => set(ref(database, this.path(`models/${id}`)), shared ? true : null));
  }
  resizeModel(id, step) {
    if (!this.canShareModels) throw new Error('Necesitas permiso para ajustar el tamaño de los modelos.');
    if (!Object.hasOwn(BOARD_MODELS, id) || ![-1, 1].includes(step)) throw new Error('Ajuste de tamaño inválido.');
    const target = ref(database, this.path(`models/${id}`));
    return this.save(() => runTransaction(target, current => {
      const size = boardModelSize(current);
      if (!size) return; // A concurrent removal wins over resizing.
      const next = Math.max(MIN_MODEL_SIZE, Math.min(MAX_MODEL_SIZE, size + step * MODEL_SIZE_STEP));
      return next === size ? undefined : next === 100 ? true : next;
    }, {applyLocally:false}));
  }
  async deleteBoard(meta=this.meta) {
    if(!meta || meta.ownerUid!==this.uid)throw new Error('Solo el creador puede eliminar este grupo.');
    await this.removeBoard(meta);
  }
  async removeBoard(meta) {
    // One atomic update removes metadata AND all shared content. Rules authorize
    // the owner at any time, or another verified campus user after server expiry.
    const university=this.profile.university;
    await withTimeout(update(ref(database), {
      [`boardDirectory/${university}/${meta.id}`]:null,
      [`boardData/${university}/${meta.id}`]:null
    }));
  }
  async cleanExpired(boards, occupancy=new Map()) {
    if(this.cleaning)return;
    this.cleaning=true;
    try {
      for(const meta of boards.filter(b=>boardExpired(b,this.serverNow,occupancy.get(b.id)))) {
        try {await this.removeBoard(meta);} catch(error) {
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
    if (this.presenceRef && this.online && !this.removed) { await withTimeout(this.disconnect.cancel()); await withTimeout(this.meta.kind==='student'?update(this.presenceRef,{leftAt:serverTimestamp()}):remove(this.presenceRef)); }
    await this.releaseClassSeat().catch(()=>{});
    this.presenceRef = null; this.disconnect = null; this.meta = null; this.present = false;
    this.state = emptyRoom();
  }
}
