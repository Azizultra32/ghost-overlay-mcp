export interface FieldDescriptor {
  selector: string
  label: string
  role: string
  editable: boolean
  visible: boolean
}

export interface DomMap {
  url: string
  title: string
  capturedAt: string
  fields: FieldDescriptor[]
  context?: string // The visible text of the page
}

export type FillActionType =
  | 'setValue'
  | 'click'
  | 'wait'
  | 'focus'
  | 'blur'
  | 'scroll'
  | 'select'
  | 'hover'
  | 'check'
  | 'uncheck'

export interface FillStep {
  selector: string
  action: FillActionType
  value: string
  label?: string
}

export interface FillPlan {
  id: string
  url: string
  createdAt: string
  steps: FillStep[]
  noteTargetSelector?: string
  meta?: Record<string, unknown>
}

export interface ExecutionError {
  selector: string
  message: string
}

export interface ExecutionResult {
  planId: string
  ok: boolean
  applied: number
  failed: number
  errors?: ExecutionError[]
  undoToken?: string
}

/**
 * Very small runtime validators to avoid exploding on nonsense input.
 * These are not meant to be full schema validators.
 */

export function isFieldDescriptor(value: unknown): value is FieldDescriptor {
  if (!value || typeof value !== 'object') return false
  const v = value as any
  return (
    typeof v.selector === 'string' &&
    typeof v.label === 'string' &&
    typeof v.role === 'string' &&
    typeof v.editable === 'boolean' &&
    typeof v.visible === 'boolean'
  )
}

export function normalizeDomMap(body: any): DomMap {
  if (!body || typeof body !== 'object') {
    throw new Error('Invalid DOM map payload: body is not an object')
  }
  if (typeof body.url !== 'string') {
    throw new Error("Invalid DOM map payload: 'url' must be a string")
  }
  // fields is now inside the object if we follow the new structure, 
  // BUT overlay.js sends { url, fields } directly. 
  // We need to adjust overlay.js OR adjust here. 
  // Let's adjust here to be flexible.

  const fields = Array.isArray(body.fields) ? body.fields.filter(isFieldDescriptor) : [];

  return {
    url: body.url,
    title: body.title || '',
    context: body.context || '',
    capturedAt: new Date().toISOString(),
    fields
  }
}
