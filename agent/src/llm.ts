import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || ''
})

/**
 * Generate a SOAP note from page context.
 * Includes retry with exponential backoff and graceful fallback to demo mode.
 */
export async function generateSOAPNote(context: string): Promise<string> {
  // If API key missing, return demo note immediately
  if (!process.env.OPENAI_API_KEY) {
    console.warn('OpenAI API key not configured, using demo mode')
    return `DEMO SOAP NOTE (LLM not configured)\n\nSubjective: Patient reports symptoms based on context.\nObjective: Vitals pending.\nAssessment: Requires clinical evaluation.\nPlan: Continue monitoring.`
  }

  const maxRetries = parseInt(process.env.LLM_MAX_RETRIES || '3')
  const baseDelayMs = parseInt(process.env.LLM_RETRY_DELAY_MS || '500')

  const attemptCall = async (attempt: number): Promise<string> => {
    try {
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.3'),
        max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS || '2000'),
        messages: [
          {
            role: 'system',
            content: `You are a clinical AI assistant. Generate a professional SOAP note based on the provided page context. Be concise and clinically relevant. Format as:\n\nSubjective: [Patient's reported symptoms/complaints]\nObjective: [Observable data from context]\nAssessment: [Clinical impression]\nPlan: [Proposed next steps]\n\nKeep it brief and professional.`
          },
          { role: 'user', content: `Generate a SOAP note from this page context:\n\n${context}` }
        ]
      })
      return completion.choices[0]?.message?.content || 'Unable to generate note'
    } catch (error: any) {
      // Handle rate limiting (429) with exponential backoff
      if (error.statusCode === 429 && attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1)
        console.warn(`⚠️ OpenAI rate‑limit hit, retry ${attempt}/${maxRetries} after ${delay}ms`)
        await new Promise(res => setTimeout(res, delay))
        return attemptCall(attempt + 1)
      }
      console.error('OpenAI API error:', error.message)
      // Fallback to demo note on any other error
      return `DEMO SOAP NOTE (LLM failed)\n\nSubjective: Patient reports symptoms based on context.\nObjective: Vitals pending.\nAssessment: Requires clinical evaluation.\nPlan: Continue monitoring.`
    }
  }

  return attemptCall(1)
}

/**
 * Generate intelligent field values from context.
 */
export async function generateFieldValue(
  fieldLabel: string,
  pageContext: string,
  previousFields?: Record<string, string>
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    return `DEMO_${fieldLabel.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`
  }
  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 100,
      messages: [
        {
          role: 'system',
          content: `You are a form‑filling assistant. Extract or infer the value for a specific field based on page context. Return ONLY the value, nothing else. If you cannot determine a value, return "UNKNOWN".`
        },
        {
          role: 'user',
          content: `Field: ${fieldLabel}\nPage Context: ${pageContext}\n\nWhat value should this field have?`
        }
      ]
    })
    const value = completion.choices[0]?.message?.content?.trim() || ''
    return value === 'UNKNOWN' ? `DEMO_${fieldLabel.toUpperCase().replace(/[^A-Z0-9]/g, '_')}` : value
  } catch (error) {
    console.error('OpenAI field value error:', (error as any).message)
    return `DEMO_${fieldLabel.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`
  }
}

/**
 * Health check for LLM service.
 */
export async function checkLLMHealth(): Promise<boolean> {
  if (!process.env.OPENAI_API_KEY) return false
  try {
    await openai.models.list()
    return true
  } catch {
    return false
  }
}

/**
 * Estimate cost for a request (GPT‑4o‑mini pricing).
 */
export function estimateCost(inputTokens: number, outputTokens: number): number {
  const inputCostPerMillion = 0.150
  const outputCostPerMillion = 0.600
  const inputCost = (inputTokens / 1_000_000) * inputCostPerMillion
  const outputCost = (outputTokens / 1_000_000) * outputCostPerMillion
  return inputCost + outputCost
}
