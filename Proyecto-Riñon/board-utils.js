export const SLOT_KEYS = ['s0', 's1', 's2', 's3', 's4'];
export const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
export function selectBoards(items, {search = '', sort = 'new', mine = false, uid} = {}) {
  const term = normalize(search.trim());
  return items.filter(b => (!mine || b.ownerUid === uid) && normalize(`${b.title} ${b.course} ${b.ownerName}`).includes(term))
    .sort((a,b) => sort === 'az' ? a.title.localeCompare(b.title,'es') : sort === 'old' ? a.createdAt-b.createdAt : b.createdAt-a.createdAt);
}
export function parseStroke(stroke) {
  try {
    const points = JSON.parse(stroke.pointsJson);
    if (!Array.isArray(points) || points.length < 1 || points.length > 2000 || !points.every(p => Array.isArray(p) && p.length === 2 && p.every(n => Number.isFinite(n) && n >= 0 && n <= 1))) return null;
    if (!Number.isFinite(stroke.width) || stroke.width < 1 || stroke.width > 120) return null;
    return {...stroke, color:inkColor(stroke), points};
  } catch { return null; }
}
export const TEACHER_BLUE = '#285c9b';
export const BOARD_TTL = 45*60*1000;
export function rgb(color) {
  if(!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Selecciona un color válido.');
  return {red:parseInt(color.slice(1,3),16),green:parseInt(color.slice(3,5),16),blue:parseInt(color.slice(5,7),16)};
}
export function inkColor(value) {
  if(['red','green','blue'].every(k=>Number.isInteger(value[k]) && value[k]>=0 && value[k]<=255))return '#'+['red','green','blue'].map(k=>value[k].toString(16).padStart(2,'0')).join('');
  return /^#[0-9a-f]{6}$/i.test(value.color||'')?value.color:'#302b28';
}
export function isBlue(color) {const {red,green,blue}=rgb(color);return blue>red && blue>green;}

export const CLASS_TTL = 60*60*1000;
export const EMPTY_TTL = 2*60*1000;
export const boardLimit = meta => meta.kind==='teacher'?50:5;
export const boardLifetime = meta => meta.kind==='teacher'?CLASS_TTL:BOARD_TTL;
export const activePeople = values => Object.values(values||{}).filter(v=>!v.leftAt);
export function boardExpired(meta, now, slots) {
  if(now >= meta.createdAt+boardLifetime(meta))return true;
  if(meta.kind!=='student' || !slots || activePeople(slots).length)return false;
  return now >= Math.max(meta.createdAt,...Object.values(slots).map(v=>v.leftAt||meta.createdAt))+EMPTY_TTL;
}
