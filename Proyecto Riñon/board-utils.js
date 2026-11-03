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
    if (!['#8c2626','#302b28','#23756a','#285c9b'].includes(stroke.color) || !Number.isFinite(stroke.width) || stroke.width < 1 || stroke.width > 12) return null;
    return {...stroke, points};
  } catch { return null; }
}
