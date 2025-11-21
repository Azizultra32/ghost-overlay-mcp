import 'dotenv/config'
import express, { Request, Response } from 'express'
import cors from 'cors'
import { promises as fs } from 'fs'
import path from 'path'
import {
  DomMap,
  FieldDescriptor,
  FillPlan,
  FillStep,
  ExecutionResult,
  normalizeDomMap
} from './schema'
import { generateSOAPNote, checkLLMHealth } from './llm'

const app = express()
const PORT = process.env.PORT || 8787
const DATA_DIR = process.env.TELEMETRY_DIR || path.resolve(process.cwd(), 'telemetry-data')
const PROFILE_DIR = path.join(DATA_DIR, 'doctor-profiles')
const TELEMETRY_HISTORY_LIMIT = parseInt(process.env.TELEMETRY_HISTORY_LIMIT || '100')
const MIN_EVENTS = parseInt(process.env.TELEMETRY_MIN_EVENTS || '30')
const MIN_SURFACES = parseInt(process.env.TELEMETRY_MIN_SURFACES || '5')
const COVERAGE_THRESHOLD = parseFloat(process.env.TELEMETRY_COVERAGE_THRESHOLD || '0.9')
const MIN_REPEATS = parseInt(process.env.TELEMETRY_MIN_REPEATS || '3')

app.use(cors())
app.use(express.json({ limit: '2mb' }))

let latestDomMap: DomMap | null = null
let lastPlanIdCounter = 0
const storedPlans = new Map<string, FillPlan>()
interface SurfaceTelemetry {
  url: string
  title: string
  capturedAt: string
  surfaceId?: string
  activeTab?: string | null
  headings: string[]
  tabCount: number
  popupCount: number
  doctorId: string
}

interface DoctorProfile {
  doctorId: string
  events: number
  surfaces: Record<string, number>
  lastSeen: string
  coverage: number
  autopilotReady: boolean
  lastSamples: SurfaceTelemetry[]
}

const telemetryLog: SurfaceTelemetry[] = []
const profileCache = new Map<string, DoctorProfile>()

function nextPlanId(): string {
  lastPlanIdCounter += 1
  return `plan_${Date.now()}_${lastPlanIdCounter}`
}

function slug(label: string): string {
  return (
    label
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'FIELD'
  )
}

function pickNoteTarget(fields: FieldDescriptor[]): FieldDescriptor | null {
  const lc = (s: string) => s.toLowerCase()
  const candidates = fields.filter((f) => f.editable)

  const patterns = [
    'note',
    'assessment',
    'plan',
    'a/p',
    'subjective',
    'hpi',
    'history of present illness'
  ]

  for (const f of candidates) {
    const label = lc(f.label)
    if (patterns.some((p) => label.includes(p))) {
      return f
    }
  }

  const textareaLike = candidates.find((f) =>
    ['textarea', 'textbox', 'text'].includes(lc(f.role))
  )
  if (textareaLike) return textareaLike

  return null
}

function extractContextData(context: string): Record<string, string> {
  const data: Record<string, string> = {}
  if (!context) return data

  const nameMatch = context.match(/Name:\s*([^\n<]+)/i)
  if (nameMatch) data.name = nameMatch[1].trim()

  const dobMatch = context.match(/DOB:\s*([^\n<]+)/i)
  if (dobMatch) data.dob = dobMatch[1].trim()

  const reasonMatch = context.match(/Reason for Visit:\s*([^\n<]+)/i)
  if (reasonMatch) data.cc = reasonMatch[1].trim()

  return data
}

async function buildDemoPlan(
  url: string,
  fields: FieldDescriptor[],
  note: string | undefined,
  mode: string | undefined,
  context: string | undefined
): Promise<FillPlan> {
  const editable = fields.filter((f) => f.editable)
  const noteTarget = pickNoteTarget(editable)
  const contextData = context ? extractContextData(context) : {}

  // Generate AI note if context available and no note provided
  let aiGeneratedNote: string | undefined
  if (!note && context && process.env.ENABLE_LLM === 'true') {
    try {
      aiGeneratedNote = await generateSOAPNote(context)
      console.log('✅ Generated AI SOAP note:', aiGeneratedNote.substring(0, 100) + '...')
    } catch (error) {
      console.warn('⚠️ LLM note generation failed, using demo mode')
    }
  }

  const finalNote = note || aiGeneratedNote

  const steps: FillStep[] = []

  for (const field of editable) {
    // 1. Scroll into view
    steps.push({
      selector: field.selector,
      action: 'scroll',
      value: 'center',
      label: `Scroll to ${field.label}`
    })

    // 2. Focus
    steps.push({
      selector: field.selector,
      action: 'focus',
      value: '',
      label: `Focus ${field.label}`
    })

    // 3. Set Value
    const isNote =
      noteTarget && field.selector === noteTarget.selector && finalNote !== undefined
    
    let value = `DEMO_${slug(field.label || field.selector)}`
    
    if (isNote) {
        value = finalNote!
    } else {
        // Smart Fill Logic
        const label = (field.label || '').toLowerCase()
        if (contextData.name && (label.includes('name') || label.includes('patient'))) {
            value = contextData.name
        } else if (contextData.dob && (label.includes('dob') || label.includes('birth'))) {
            value = contextData.dob
        } else if (contextData.cc && (label.includes('complaint') || label.includes('reason') || label.includes('visit'))) {
            value = contextData.cc
        }
    }

    steps.push({
      selector: field.selector,
      action: 'setValue',
      value,
      label: `Type into ${field.label}`
    })

    // 4. Wait (simulating thought/typing - SNAIL PACE)
    steps.push({
      selector: field.selector,
      action: 'wait',
      value: '800',
      label: 'Thinking...'
    })

    // 5. Blur
    steps.push({
      selector: field.selector,
      action: 'blur',
      value: '',
      label: `Blur ${field.label}`
    })
  }

  const id = nextPlanId()
  const createdAt = new Date().toISOString()

  const plan: FillPlan = {
    id,
    url,
    createdAt,
    steps,
    noteTargetSelector: noteTarget ? noteTarget.selector : undefined,
    meta: {
      mode: mode || 'demo',
      strategy: 'single-note-target'
    }
  }

  storedPlans.set(id, plan)
  return plan
}

app.get('/', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    service: 'anchor-agent',
    version: '0.1.0'
  })
})

app.get('/health', async (_req: Request, res: Response) => {
  const llm = await checkLLMHealth()
  res.json({
    ok: true,
    llm,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
  })
})

app.get('/dom', (_req: Request, res: Response) => {
  if (!latestDomMap) {
    res.status(404).json({ ok: false, error: 'No DOM map recorded yet' })
    return
  }
  res.json(latestDomMap)
})

app.get('/telemetry', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    samples: telemetryLog
  })
})

app.get('/telemetry/:doctorId', async (req: Request, res: Response) => {
  try {
    const doctorId = req.params.doctorId || 'local-clinician'
    const profile = await loadProfile(doctorId)
    res.json({ ok: true, profile })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Unable to load profile' })
  }
})

app.get('/autopilot/:doctorId', async (req: Request, res: Response) => {
  try {
    const doctorId = req.params.doctorId || 'local-clinician'
    const profile = await loadProfile(doctorId)
    res.json({
      ok: true,
      doctorId,
      autopilotReady: profile.autopilotReady,
      coverage: profile.coverage,
      events: profile.events,
      uniqueSurfaces: Object.keys(profile.surfaces).length
    })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Unable to compute readiness' })
  }
})

app.post('/dom', (req: Request, res: Response) => {
  try {
    const domMap = normalizeDomMap(req.body)
    latestDomMap = domMap
    recordTelemetry(domMap).catch((err) =>
      console.error('Telemetry write failed:', err?.message || err)
    )
    res.json({
      ok: true,
      fields: domMap.fields.length,
      capturedAt: domMap.capturedAt
    })
  } catch (err: any) {
    res.status(400).json({
      ok: false,
      error: err?.message || 'Invalid DOM map payload'
    })
  }
})

app.post('/actions/plan', async (req: Request, res: Response) => {
  try {
    const body = req.body || {}
    const url: string | undefined = body.url || latestDomMap?.url
    const note: string | undefined = body.note
    const mode: string | undefined = body.mode

    let fields: FieldDescriptor[] | undefined = undefined
    if (Array.isArray(body.fields)) {
      fields = body.fields.filter(
        (f: any) =>
          f &&
          typeof f.selector === 'string' &&
          typeof f.label === 'string' &&
          typeof f.role === 'string' &&
          typeof f.editable === 'boolean' &&
          typeof f.visible === 'boolean'
      )
    } else if (latestDomMap) {
      fields = latestDomMap.fields
    }

    if (!url || !fields || fields.length === 0) {
      res.status(400).json({
        ok: false,
        error:
          'Missing url/fields and no previous DOM map available; call /dom first or pass fields in the request.'
      })
      return
    }

    const plan = await buildDemoPlan(url, fields, note, mode, latestDomMap?.context)
    res.json(plan)
  } catch (err: any) {
    res.status(500).json({
      ok: false,
      error: err?.message || 'Failed to build plan'
    })
  }
})

app.post('/actions/fill', async (req: Request, res: Response) => {
  try {
    const body = req.body || {}
    const url = body.url || latestDomMap?.url
    const fields = Array.isArray(body.fields)
      ? body.fields
      : latestDomMap?.fields
    if (!url || !fields) {
      res.status(400).json({
        ok: false,
        error: 'Missing url/fields and no previous DOM map available.'
      })
      return
    }
    const plan = await buildDemoPlan(url, fields, body.note, body.mode, latestDomMap?.context)
    res.json(plan)
  } catch (err: any) {
    res.status(500).json({
      ok: false,
      error: err?.message || 'Failed to build fill plan'
    })
  }
})

app.post('/actions/execute', (req: Request, res: Response) => {
  const body = req.body || {}
  const planId: string | undefined = body.planId
  const plan: FillPlan | undefined = planId
    ? storedPlans.get(planId)
    : body.plan

  if (!plan) {
    const result: ExecutionResult = {
      planId: planId || 'unknown',
      ok: false,
      applied: 0,
      failed: 0,
      errors: [
        {
          selector: '',
          message: 'No plan found; executor not implemented in this POC.'
        }
      ]
    }
    res.status(400).json(result)
    return
  }

  const result: ExecutionResult = {
    planId: plan.id,
    ok: false,
    applied: 0,
    failed: plan.steps.length,
    errors: [
      {
        selector: '',
        message:
          'Execution is not implemented in the agent; run steps in the content script.'
      }
    ]
  }

  res.status(501).json(result)
})

async function recordTelemetry(domMap: DomMap) {
  if (!domMap.ux) return
  const doctorId = domMap.doctorId || 'local-clinician'
  const entry: SurfaceTelemetry = {
    url: domMap.url,
    title: domMap.title || '',
    capturedAt: domMap.capturedAt,
    surfaceId: domMap.ux.surfaceId,
    activeTab: domMap.ux.activeTab,
    headings: domMap.ux.headings || [],
    tabCount: domMap.ux.tabs?.length || 0,
    popupCount: domMap.ux.popups?.length || 0,
    doctorId
  }
  telemetryLog.push(entry)
  if (telemetryLog.length > TELEMETRY_HISTORY_LIMIT) {
    telemetryLog.shift()
  }

  const profile = await loadProfile(doctorId)
  updateProfileWithEntry(profile, entry)
  await saveProfile(profile)
}

async function loadProfile(doctorId: string): Promise<DoctorProfile> {
  if (profileCache.has(doctorId)) return profileCache.get(doctorId)!
  await ensureDir(PROFILE_DIR)
  const file = path.join(PROFILE_DIR, `${doctorId}.json`)
  try {
    const raw = await fs.readFile(file, 'utf8')
    const parsed = JSON.parse(raw) as DoctorProfile
    profileCache.set(doctorId, parsed)
    return parsed
  } catch {
    const fresh: DoctorProfile = {
      doctorId,
      events: 0,
      surfaces: {},
      lastSeen: '',
      coverage: 0,
      autopilotReady: false,
      lastSamples: []
    }
    profileCache.set(doctorId, fresh)
    return fresh
  }
}

async function saveProfile(profile: DoctorProfile) {
  await ensureDir(PROFILE_DIR)
  const file = path.join(PROFILE_DIR, `${profile.doctorId}.json`)
  await fs.writeFile(file, JSON.stringify(profile, null, 2), 'utf8')
}

function updateProfileWithEntry(profile: DoctorProfile, entry: SurfaceTelemetry) {
  profile.events += 1
  profile.lastSeen = entry.capturedAt

  const key = entry.surfaceId || 'unknown'
  profile.surfaces[key] = (profile.surfaces[key] || 0) + 1

  profile.lastSamples.push(entry)
  if (profile.lastSamples.length > 20) profile.lastSamples.shift()

  const surfaceCounts = Object.values(profile.surfaces)
  const repeated = surfaceCounts.filter((count) => count >= MIN_REPEATS)
  const coverageValue =
    profile.events > 0 ? repeated.reduce((sum, count) => sum + count, 0) / profile.events : 0
  profile.coverage = Number(coverageValue.toFixed(3))

  profile.autopilotReady =
    profile.events >= MIN_EVENTS &&
    Object.keys(profile.surfaces).length >= MIN_SURFACES &&
    profile.coverage >= COVERAGE_THRESHOLD
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true })
}

app.listen(PORT, () => {
  console.log(`Anchor agent listening on http://localhost:${PORT}`)
})
