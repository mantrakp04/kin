import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { timingSafeEqual, createHash } from 'node:crypto'
import pino from 'pino'
import makeWASocket, {
  Browsers,
  DisconnectReason,
  useMultiFileAuthState,
  normalizeMessageContent,
  jidDecode,
  jidNormalizedUser,
  isJidGroup,
  isLidUser,
  isPnUser,
  isJidBroadcast,
  isJidNewsletter,
  isJidStatusBroadcast,
} from '@whiskeysockets/baileys'

const PORT = Number(process.env.PORT || 8790)
const USER_KEY = process.env.USER_KEY || 'alex'
const AUTH_DIR = process.env.AUTH_DIR || '/home/user/.capy/work/whatsapp-bridge/auth'
const BRIDGE_SECRET = process.env.BRIDGE_SECRET || ''
const CONVEX_SITE_URL = (process.env.CONVEX_SITE_URL || '').replace(/\/+$/, '')
const FLUSH_MS = 5000
const MAX_PER_CHAT = 2000
const MAX_BODY = 1_500_000

if (!BRIDGE_SECRET || !CONVEX_SITE_URL) {
  console.error('BRIDGE_SECRET and CONVEX_SITE_URL are required')
  process.exit(1)
}

const log = (...args) => console.log(new Date().toISOString(), ...args)
const waLogger = pino({ level: process.env.WA_LOG_LEVEL || 'warn' })

let sock = null
let generation = 0
let state = 'idle'
let lastSyncAt
let lastError
let reconnectDelay = 2000
let pendingPair = null

const chatNames = new Map()
const contactNames = new Map()
const lidToPn = new Map()
const pnToLid = new Map()
const groups = new Map()
const groupSenders = new Map()
const groupLookups = new Set()
const knownThreads = new Set()
const seen = new Set()
const pending = new Map()
const dirtyMeta = new Set()
let backoffUntil = 0
let flushing = false

const hasRegisteredCreds = () => {
  try {
    return JSON.parse(fs.readFileSync(path.join(AUTH_DIR, 'creds.json'), 'utf8')).registered === true
  } catch {
    return false
  }
}

const wipeAuth = () => fs.rmSync(AUTH_DIR, { recursive: true, force: true })

const phoneOf = (jid) => {
  if (!jid || !isPnUser(jid)) return undefined
  const user = jidDecode(jid)?.user
  return user ? `+${user}` : undefined
}

const myJids = () => {
  const ids = new Set()
  for (const j of [sock?.user?.id, sock?.user?.lid, sock?.authState?.creds?.me?.id, sock?.authState?.creds?.me?.lid]) {
    if (j) ids.add(jidNormalizedUser(j))
  }
  return ids
}

const addLidMapping = (lid, pn) => {
  if (!lid || !pn) return
  const l = jidNormalizedUser(lid)
  const p = jidNormalizedUser(pn)
  if (!isLidUser(l) || !isPnUser(p)) return
  lidToPn.set(l, p)
  pnToLid.set(p, l)
}

const canon = (jid) => {
  if (!jid) return jid
  const j = jidNormalizedUser(jid)
  return isLidUser(j) ? lidToPn.get(j) || j : j
}

const resolveLid = async (jid) => {
  if (!jid || !isLidUser(jid) || lidToPn.has(jid)) return
  try {
    const pn = await sock?.signalRepository?.lidMapping?.getPNForLID(jid)
    if (pn) addLidMapping(jid, pn)
  } catch {}
}

const nameOf = (jid) => {
  const j = jidNormalizedUser(jid)
  const keys = [j, canon(j), pnToLid.get(j)].filter(Boolean)
  for (const k of keys) if (contactNames.has(k)) return contactNames.get(k)
  for (const k of keys) if (chatNames.has(k)) return chatNames.get(k)
}

const skipChat = (jid) =>
  !jid || isJidStatusBroadcast(jid) || isJidBroadcast(jid) || isJidNewsletter(jid) || jid.endsWith('@newsletter')

const textOf = (message) => {
  const m = normalizeMessageContent(message)
  if (!m) return ''
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    ''
  ).trim()
}

const noteContact = (c) => {
  if (!c?.id) return
  addLidMapping(c.lid, c.phoneNumber)
  addLidMapping(c.id, c.phoneNumber)
  addLidMapping(c.lid, c.id)
  const name = c.name || c.notify || c.verifiedName
  if (!name) return
  for (const id of [c.id, c.lid, c.phoneNumber]) {
    if (!id) continue
    const j = jidNormalizedUser(id)
    if (c.name || !contactNames.has(j)) contactNames.set(j, name)
    if (knownThreads.has(j)) dirtyMeta.add(j)
  }
}

const noteChat = (c) => {
  if (!c?.id || skipChat(c.id) || !c.name) return
  const j = jidNormalizedUser(c.id)
  chatNames.set(j, c.name)
  if (knownThreads.has(j)) dirtyMeta.add(j)
}

const noteGroup = (meta) => {
  if (!meta?.id) return
  for (const p of meta.participants || []) addLidMapping(p.lid || p.id, p.phoneNumber)
  groups.set(meta.id, meta)
  if (meta.subject) chatNames.set(meta.id, meta.subject)
  if (knownThreads.has(meta.id)) dirtyMeta.add(meta.id)
}

const noteMessage = (msg) => {
  const key = msg?.key
  if (!key?.remoteJid || !msg.message) return false
  const chat = jidNormalizedUser(key.remoteJid)
  if (skipChat(chat)) return false
  addLidMapping(key.remoteJid, key.remoteJidAlt)
  addLidMapping(key.remoteJidAlt, key.remoteJid)
  addLidMapping(key.participant, key.participantAlt)
  addLidMapping(key.participantAlt, key.participant)
  const text = textOf(msg.message)
  if (!text || !key.id) return false
  const group = isJidGroup(chat)
  const sender = key.fromMe ? undefined : group ? key.participant && jidNormalizedUser(key.participant) : chat
  if (msg.pushName && sender && !contactNames.has(sender)) contactNames.set(sender, msg.pushName)
  if (group && sender) {
    if (!groupSenders.has(chat)) groupSenders.set(chat, new Set())
    groupSenders.get(chat).add(sender)
  }
  const dedupe = `${chat}|${key.id}`
  if (seen.has(dedupe)) return false
  seen.add(dedupe)
  knownThreads.add(chat)
  if (!pending.has(chat)) pending.set(chat, new Map())
  const ts = msg.messageTimestamp
  const at = (typeof ts === 'number' ? ts : Number(ts?.toString?.() || 0)) * 1000 || Date.now()
  pending.get(chat).set(key.id, { id: key.id, at, fromMe: !!key.fromMe, sender, text })
  return true
}

const ingestMessages = (messages) => {
  let added = 0
  for (const m of messages || []) if (noteMessage(m)) added++
  return added
}

const buildThreads = async () => {
  const chats = new Set([...pending.keys(), ...[...dirtyMeta].filter((j) => knownThreads.has(j))])
  const me = myJids()
  for (const chat of chats) {
    await resolveLid(chat)
    for (const s of groupSenders.get(chat) || []) await resolveLid(s)
    if (isJidGroup(chat) && !groups.has(chat) && !groupLookups.has(chat) && sock && state === 'connected') {
      groupLookups.add(chat)
      try {
        noteGroup(await sock.groupMetadata(chat))
      } catch {}
    }
  }
  const out = new Map()
  for (const chat of chats) {
    const isGroup = !!isJidGroup(chat)
    const externalId = canon(chat)
    let thread = out.get(externalId)
    if (!thread) {
      let ids
      if (isGroup) {
        const set = new Set()
        for (const p of groups.get(chat)?.participants || []) set.add(canon(p.phoneNumber || p.id))
        for (const s of groupSenders.get(chat) || []) set.add(canon(s))
        ids = [...set].filter((id) => id && !me.has(id))
      } else {
        ids = me.has(externalId) ? [] : [externalId]
      }
      thread = {
        externalId,
        title: nameOf(chat) || nameOf(externalId) || phoneOf(externalId) || jidDecode(externalId)?.user || externalId,
        isGroup,
        participants: ids.map((id) => {
          const p = { id }
          const name = nameOf(id)
          const phone = phoneOf(id)
          if (name) p.name = name
          if (phone) p.phone = phone
          return p
        }),
        messages: [],
      }
      out.set(externalId, thread)
    }
    for (const m of pending.get(chat)?.values() || []) {
      thread.messages.push(m.sender ? { ...m, sender: canon(m.sender) } : { id: m.id, at: m.at, fromMe: m.fromMe, text: m.text })
    }
  }
  for (const t of out.values()) {
    t.messages.sort((a, b) => b.at - a.at)
    t.messages = t.messages.slice(0, MAX_PER_CHAT).reverse()
  }
  return { chats, threads: [...out.values()] }
}

const chunk = (threads) => {
  const batches = []
  let cur = []
  let size = 0
  const push = (t) => {
    const s = JSON.stringify(t).length
    if (size + s > MAX_BODY && cur.length) {
      batches.push(cur)
      cur = []
      size = 0
    }
    cur.push(t)
    size += s
  }
  for (const t of threads) {
    const head = JSON.stringify({ ...t, messages: [] }).length
    let part = []
    let partSize = head
    for (const m of t.messages) {
      const s = JSON.stringify(m).length + 1
      if (partSize + s > MAX_BODY && part.length) {
        push({ ...t, messages: part })
        part = []
        partSize = head
      }
      part.push(m)
      partSize += s
    }
    push({ ...t, messages: part })
  }
  if (cur.length) batches.push(cur)
  return batches
}

const postBatch = async (threads) => {
  const res = await fetch(`${CONVEX_SITE_URL}/chats/ingest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${BRIDGE_SECRET}` },
    body: JSON.stringify({ userKey: USER_KEY, source: 'whatsapp', via: 'bridge', threads }),
    signal: AbortSignal.timeout(60_000),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  let json
  try {
    json = JSON.parse(body)
  } catch {}
  if (json?.ok === false) throw new Error('response ok:false')
}

const requeue = (threads) => {
  for (const t of threads) {
    if (!pending.has(t.externalId)) pending.set(t.externalId, new Map())
    const map = pending.get(t.externalId)
    for (const m of t.messages) if (!map.has(m.id)) map.set(m.id, m)
    if (map.size > MAX_PER_CHAT * 2) {
      const keep = [...map.values()].sort((a, b) => b.at - a.at).slice(0, MAX_PER_CHAT)
      pending.set(t.externalId, new Map(keep.map((m) => [m.id, m])))
    }
  }
}

const flush = async () => {
  if (flushing || Date.now() < backoffUntil) return
  if (!pending.size && ![...dirtyMeta].some((j) => knownThreads.has(j))) return
  flushing = true
  try {
    const { chats, threads } = await buildThreads()
    for (const c of chats) {
      pending.delete(c)
      dirtyMeta.delete(c)
    }
    const batches = chunk(threads)
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]
      const count = batch.reduce((n, t) => n + t.messages.length, 0)
      try {
        await postBatch(batch)
        lastSyncAt = Date.now()
        lastError = undefined
        log(`ingest ok: ${batch.length} threads, ${count} messages`)
      } catch (e) {
        lastError = `ingest failed: ${e.message}`
        log(`${lastError}; requeued ${batches.length - i} batch(es), retrying in 30s`)
        for (const b of batches.slice(i)) requeue(b)
        backoffUntil = Date.now() + 30_000
        break
      }
    }
  } catch (e) {
    log('flush error', e.message)
  } finally {
    flushing = false
  }
}

setInterval(flush, FLUSH_MS)

const failPair = (err) => {
  if (!pendingPair) return
  clearTimeout(pendingPair.timer)
  pendingPair.reject(err)
  pendingPair = null
}

const requestCode = async () => {
  if (!pendingPair || pendingPair.requested || !sock) return
  const p = pendingPair
  p.requested = true
  try {
    const code = await sock.requestPairingCode(p.digits)
    clearTimeout(p.timer)
    if (pendingPair === p) pendingPair = null
    p.resolve(code)
  } catch (e) {
    failPair(e)
  }
}

const startSocket = async () => {
  const gen = ++generation
  fs.mkdirSync(AUTH_DIR, { recursive: true })
  const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
  if (gen !== generation) return
  const s = makeWASocket({
    auth: authState,
    logger: waLogger,
    browser: Browsers.macOS('Chrome'),
    syncFullHistory: true,
    shouldSyncHistoryMessage: () => true,
    markOnlineOnConnect: false,
    qrTimeout: 60_000,
  })
  sock = s
  state = authState.creds.registered ? 'connecting' : 'pairing'
  const live = () => gen === generation

  s.ev.on('creds.update', saveCreds)

  s.ev.on('connection.update', async (u) => {
    if (!live()) return
    if (u.qr) await requestCode()
    if (u.connection === 'open') {
      state = 'connected'
      reconnectDelay = 2000
      log('whatsapp connected')
      try {
        const all = await s.groupFetchAllParticipating()
        for (const meta of Object.values(all)) noteGroup(meta)
        log(`fetched ${Object.keys(all).length} groups`)
      } catch (e) {
        log('group fetch failed', e.message)
      }
    }
    if (u.connection === 'close') {
      const code = u.lastDisconnect?.error?.output?.statusCode
      log(`connection closed (${code ?? 'unknown'})`)
      sock = null
      if (code === DisconnectReason.loggedOut) {
        state = 'logged_out'
        wipeAuth()
        failPair(new Error('logged out'))
        return
      }
      if (code === DisconnectReason.restartRequired) {
        log('restart required (normal right after pairing), reconnecting')
        startSocket().catch((e) => log('restart failed', e.message))
        return
      }
      if (code === DisconnectReason.connectionReplaced) {
        state = 'idle'
        lastError = 'connection replaced by another session'
        return
      }
      if (hasRegisteredCreds()) {
        state = 'connecting'
        const delay = reconnectDelay
        reconnectDelay = Math.min(reconnectDelay * 2, 60_000)
        setTimeout(() => live() && startSocket().catch((e) => log('reconnect failed', e.message)), delay)
        return
      }
      state = 'idle'
      failPair(new Error('socket closed before pairing'))
    }
  })

  s.ev.on('messaging-history.set', ({ chats, contacts, messages, lidPnMappings, syncType, progress }) => {
    if (!live()) return
    for (const m of lidPnMappings || []) addLidMapping(m.lid, m.pn)
    for (const c of contacts || []) noteContact(c)
    for (const c of chats || []) noteChat(c)
    const added = ingestMessages(messages)
    log(`history sync type=${syncType} progress=${progress ?? '-'}: ${chats?.length || 0} chats, ${contacts?.length || 0} contacts, ${messages?.length || 0} msgs, ${added} text msgs queued`)
  })
  s.ev.on('messages.upsert', ({ messages, type }) => {
    if (!live()) return
    const added = ingestMessages(messages)
    if (added) log(`messages.upsert (${type}): ${added} text msgs queued`)
  })
  s.ev.on('contacts.upsert', (cs) => live() && cs.forEach(noteContact))
  s.ev.on('contacts.update', (cs) => live() && cs.forEach(noteContact))
  s.ev.on('chats.upsert', (cs) => live() && cs.forEach(noteChat))
  s.ev.on('chats.update', (cs) => live() && cs.forEach(noteChat))
  s.ev.on('lid-mapping.update', (m) => live() && addLidMapping(m.lid, m.pn))
  s.ev.on('groups.upsert', (gs) => live() && gs.forEach(noteGroup))
  s.ev.on('groups.update', (gs) => {
    if (!live()) return
    for (const g of gs) {
      if (!g.id || !g.subject) continue
      chatNames.set(g.id, g.subject)
      if (knownThreads.has(g.id)) dirtyMeta.add(g.id)
    }
  })
  s.ev.on('group-participants.update', ({ id }) => {
    if (!live()) return
    groups.delete(id)
    groupLookups.delete(id)
    if (knownThreads.has(id)) dirtyMeta.add(id)
  })
}

const stopSocket = () => {
  generation++
  const s = sock
  sock = null
  try {
    s?.end(undefined)
  } catch {}
}

const pair = async (phone) => {
  const digits = String(phone || '').replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 15) throw Object.assign(new Error('phone must be E.164, e.g. +15551234567'), { status: 400 })
  if (state === 'connected' || hasRegisteredCreds()) throw Object.assign(new Error('already linked; POST /logout first'), { status: 409 })
  failPair(new Error('superseded by a new /pair request'))
  stopSocket()
  wipeAuth()
  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => failPair(new Error('timed out waiting for WhatsApp')), 30_000)
    pendingPair = { digits, resolve, reject, timer, requested: false }
    startSocket().catch((e) => failPair(e))
  })
  return { code, codeDisplay: code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code }
}

const logout = async () => {
  failPair(new Error('logged out'))
  if (sock && state === 'connected') {
    try {
      await sock.logout()
    } catch (e) {
      log('logout request failed', e.message)
    }
  }
  stopSocket()
  wipeAuth()
  state = 'logged_out'
}

const status = () => {
  const out = {
    state: state === 'connecting' ? 'connected' : state,
    threads: knownThreads.size,
    messages: seen.size,
    pendingThreads: pending.size,
  }
  if (state === 'connecting') out.reconnecting = true
  const me = sock?.authState?.creds?.me?.id
  const phone = me && hasRegisteredCreds() ? phoneOf(jidNormalizedUser(me)) : undefined
  if (phone) out.phone = phone
  if (lastSyncAt) out.lastSyncAt = lastSyncAt
  if (lastError) out.lastError = lastError
  return out
}

const digest = (s) => createHash('sha256').update(s).digest()
const authorized = (req) => {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  return timingSafeEqual(digest(token), digest(BRIDGE_SECRET))
}

const readJson = (req) =>
  new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => {
      data += c
      if (data.length > 100_000) req.destroy()
    })
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {})
      } catch {
        reject(Object.assign(new Error('invalid JSON'), { status: 400 }))
      }
    })
    req.on('error', reject)
  })

const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    try {
      if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true })
      if (!authorized(req)) return send(res, 401, { error: 'unauthorized' })
      if (req.method === 'GET' && url.pathname === '/status') return send(res, 200, status())
      if (req.method === 'POST' && url.pathname === '/pair') {
        const { phone } = await readJson(req)
        const result = await pair(phone)
        log('pairing code issued')
        return send(res, 200, result)
      }
      if (req.method === 'POST' && url.pathname === '/logout') {
        await logout()
        log('logged out')
        return send(res, 200, { ok: true })
      }
      return send(res, 404, { error: 'not found' })
    } catch (e) {
      log(`${req.method} ${url.pathname} failed: ${e.message}`)
      return send(res, e.status || 500, { error: e.message })
    }
  })
  .listen(PORT, () => {
    log(`whatsapp bridge listening on :${PORT} (userKey=${USER_KEY})`)
    if (hasRegisteredCreds()) {
      log('registered creds found, connecting')
      startSocket().catch((e) => log('connect failed', e.message))
    }
  })

process.on('unhandledRejection', (e) => log('unhandledRejection', e?.message || e))
process.on('uncaughtException', (e) => log('uncaughtException', e?.message || e))
