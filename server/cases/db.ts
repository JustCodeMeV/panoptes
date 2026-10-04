import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Feature } from '../../shared/feature.ts'

/**
 * Local-first case file. Evidence is stored as a FROZEN snapshot of the feature
 * at save time (live data keeps changing; an investigation needs what was seen
 * when). Every action is written to an audit log.
 */
const DB = process.env.PANOPTES_DB ?? 'data/panoptes.db'
if (DB !== ':memory:') mkdirSync(dirname(DB), { recursive: true })
const db = new DatabaseSync(DB)
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS cases (id INTEGER PRIMARY KEY, title TEXT NOT NULL, created TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY, case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    feature_id TEXT NOT NULL, snapshot TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', added TEXT NOT NULL,
    UNIQUE (case_id, feature_id)
  );
  CREATE TABLE IF NOT EXISTS watches (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL,
    radius_km REAL NOT NULL, layers TEXT NOT NULL DEFAULT '[]', created TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, ts TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL);
`)
db.exec('PRAGMA foreign_keys = ON')

const now = () => new Date().toISOString()
const log = (action: string, detail: string) => db.prepare('INSERT INTO audit (ts, action, detail) VALUES (?, ?, ?)').run(now(), action, detail)

export type CaseRow = { id: number; title: string; created: string; items: number }
export type ItemRow = { id: number; feature_id: string; feature: Feature; note: string; added: string }

export function listCases(): CaseRow[] {
  return db
    .prepare('SELECT c.id, c.title, c.created, (SELECT COUNT(*) FROM items i WHERE i.case_id = c.id) AS items FROM cases c ORDER BY c.id DESC')
    .all() as CaseRow[]
}

export function createCase(title: string): CaseRow {
  const r = db.prepare('INSERT INTO cases (title, created) VALUES (?, ?)').run(title.slice(0, 120), now())
  log('case.create', `#${r.lastInsertRowid} ${title}`)
  return { id: Number(r.lastInsertRowid), title, created: now(), items: 0 }
}

export function getCase(id: number) {
  const c = db.prepare('SELECT id, title, created FROM cases WHERE id = ?').get(id) as Omit<CaseRow, 'items'> | undefined
  if (!c) return null
  const rows = db.prepare('SELECT id, feature_id, snapshot, note, added FROM items WHERE case_id = ? ORDER BY id DESC').all(id) as {
    id: number; feature_id: string; snapshot: string; note: string; added: string
  }[]
  const items: ItemRow[] = rows.map((r) => ({ id: r.id, feature_id: r.feature_id, feature: JSON.parse(r.snapshot) as Feature, note: r.note, added: r.added }))
  log('case.view', `#${id}`)
  return { ...c, items }
}

export function addItem(caseId: number, feature: Feature, note = '') {
  db.prepare(
    `INSERT INTO items (case_id, feature_id, snapshot, note, added) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (case_id, feature_id) DO UPDATE SET snapshot = excluded.snapshot, added = excluded.added`,
  ).run(caseId, feature.id, JSON.stringify(feature), note.slice(0, 2000), now())
  log('item.add', `case #${caseId} ${feature.id}`)
}

export function setNote(itemId: number, note: string) {
  db.prepare('UPDATE items SET note = ? WHERE id = ?').run(note.slice(0, 2000), itemId)
  log('item.note', `#${itemId}`)
}

export function removeItem(itemId: number) {
  db.prepare('DELETE FROM items WHERE id = ?').run(itemId)
  log('item.remove', `#${itemId}`)
}

export function deleteCase(id: number) {
  db.prepare('DELETE FROM cases WHERE id = ?').run(id)
  log('case.delete', `#${id}`)
}

export function exportCase(id: number) {
  const c = getCase(id)
  if (!c) return null
  log('case.export', `#${id}`)
  return {
    exportedAt: now(),
    tool: 'panoptes',
    note: 'Snapshots are frozen at save time. Verdicts are heuristic evidence summaries; verify against the linked primary sources.',
    case: { id: c.id, title: c.title, created: c.created },
    evidence: c.items.map((i) => ({
      savedAt: i.added,
      analystNote: i.note,
      id: i.feature.id,
      layer: i.feature.layerId,
      title: i.feature.title,
      observedAt: i.feature.observedAt,
      position: i.feature.position,
      geo: { precision: i.feature.geoPrecision, basis: i.feature.geoBasis },
      source: i.feature.source,
      tags: i.feature.tags,
      analysis: i.feature.props,
    })),
  }
}

// ---- region watches ----

export type WatchRow = { id: number; name: string; lat: number; lon: number; radiusKm: number; layers: string[]; created: string }

export function listWatches(): WatchRow[] {
  const rows = db.prepare('SELECT id, name, lat, lon, radius_km, layers, created FROM watches ORDER BY id').all() as {
    id: number; name: string; lat: number; lon: number; radius_km: number; layers: string; created: string
  }[]
  return rows.map((r) => ({ id: r.id, name: r.name, lat: r.lat, lon: r.lon, radiusKm: r.radius_km, layers: JSON.parse(r.layers) as string[], created: r.created }))
}

export function createWatch(w: Omit<WatchRow, 'id' | 'created'>): WatchRow {
  const created = now()
  const r = db.prepare('INSERT INTO watches (name, lat, lon, radius_km, layers, created) VALUES (?, ?, ?, ?, ?, ?)').run(w.name.slice(0, 80), w.lat, w.lon, w.radiusKm, JSON.stringify(w.layers), created)
  log('watch.create', `#${r.lastInsertRowid} ${w.name} (${w.lat.toFixed(2)}, ${w.lon.toFixed(2)}) r=${w.radiusKm} km`)
  return { ...w, id: Number(r.lastInsertRowid), created }
}

export function deleteWatch(id: number) {
  db.prepare('DELETE FROM watches WHERE id = ?').run(id)
  log('watch.delete', `#${id}`)
}

export const auditLog = (limit = 200) => db.prepare('SELECT ts, action, detail FROM audit ORDER BY id DESC LIMIT ?').all(limit)

// ---- Apify spend ledger (the key has a small prepaid credit: every run is recorded) ----
db.exec(`CREATE TABLE IF NOT EXISTS apify_spend (id INTEGER PRIMARY KEY, ts TEXT NOT NULL, actor TEXT NOT NULL, query TEXT NOT NULL, items INTEGER NOT NULL, usd REAL NOT NULL)`)
export function logApifySpend(actor: string, query: string, items: number, usd: number) {
  db.prepare('INSERT INTO apify_spend (ts, actor, query, items, usd) VALUES (?, ?, ?, ?, ?)').run(now(), actor, query, items, usd)
  log('apify.run', `${actor} "${query}" ${items} items $${usd.toFixed(4)}`)
}
export const apifySpent = (): number => (db.prepare('SELECT COALESCE(SUM(usd), 0) AS s FROM apify_spend').get() as { s: number }).s
export const apifyRunsSince = (sinceIso: string): number => (db.prepare('SELECT COUNT(*) AS n FROM apify_spend WHERE ts >= ?').get(sinceIso) as { n: number }).n

// Workbench state per case: status, notes, hypotheses, evidence tags and the investigation graph (JSON).
db.exec(`CREATE TABLE IF NOT EXISTS case_workspace (case_id INTEGER PRIMARY KEY REFERENCES cases(id) ON DELETE CASCADE, data TEXT NOT NULL, updated TEXT NOT NULL)`)
export function getWorkspace(caseId: number): unknown {
  const r = db.prepare('SELECT data FROM case_workspace WHERE case_id = ?').get(caseId) as { data: string } | undefined
  return r ? JSON.parse(r.data) : null
}
export function setWorkspace(caseId: number, data: unknown) {
  const json = JSON.stringify(data)
  if (json.length > 2_000_000) throw new Error('workspace too large')
  db.prepare('INSERT INTO case_workspace (case_id, data, updated) VALUES (?, ?, ?) ON CONFLICT (case_id) DO UPDATE SET data = excluded.data, updated = excluded.updated').run(caseId, json, now())
}
/** Re-creates a case from the browser's copy (the host's disk is wiped on restart). */
export function importCase(title: string, items: { feature: Feature; note?: string }[], workspace: unknown): number {
  const c = createCase(title)
  for (const i of items.slice(0, 500)) addItem(c.id, i.feature, i.note ?? '')
  if (workspace) setWorkspace(c.id, workspace)
  log('case.import', `#${c.id} ${title} (${items.length} items)`)
  return c.id
}
