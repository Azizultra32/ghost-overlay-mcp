# LLM Integration Setup Guide

## Quick Start (5 Minutes)

### Step 1: Add Your OpenAI API Key

Open `/Users/ali/GHOST/agent/.env` and add your API key:

```bash
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxx
```

### Step 2: Restart the Agent

```bash
cd /Users/ali/GHOST
./scripts/anchor-stack.sh
```

### Step 3: Test LLM Integration

The agent will now:

- ✅ Generate intelligent SOAP notes from page context (instead of demo
  placeholders)
- ✅ Use AI to fill fields based on page content
- ✅ Fall back to demo mode gracefully if API is unavailable

---

## What Changed

### New Files Created

1. **`agent/.env`** - Your API key goes here (NOT COMMITTED TO GIT)
2. **`agent/.env.example`** - Template showing all available options
3. **`agent/src/llm.ts`** - LLM service for SOAP note generation
4. **`agent/.gitignore`** - Protects your API key from being committed

### Updated Files

- **`agent/src/server.ts`** - Now imports and uses LLM service
- **`agent/package.json`** - Added `dotenv` dependency

---

## Testing LLM Integration

### Test 1: Health Check

```bash
curl http://localhost:8787/health
```

Should return:

```json
{
    "ok": true,
    "llm": true,
    "model": "gpt-4o-mini"
}
```

### Test 2: Generate SOAP Note

```bash
curl -X POST http://localhost:8787/api/generate-note \
  -H "Content-Type: application/json" \
  -d '{
    "context": "Patient Summary: Name: Jane Doe, DOB: 1990-05-15, Chief Complaint: Persistent cough for 3 days"
  }'
```

Should return a properly formatted SOAP note.

### Test 3: Smart Fill (via Smoke Test)

```bash
npm run smoke
```

Fields should now contain intelligent values instead of `DEMO_*` placeholders.

---

## Configuration Options

Edit `agent/.env` to customize:

```bash
# Model Selection
OPENAI_MODEL=gpt-4o-mini           # Fast, cheap ($0.15/M input tokens)
# OPENAI_MODEL=gpt-4o              # More capable, more expensive

# Generation Settings
OPENAI_MAX_TOKENS=2000             # Max length of generated notes
OPENAI_TEMPERATURE=0.3             # Lower = more consistent (0.0-2.0)

# Cost Controls
OPENAI_MONTHLY_LIMIT=100           # Max spend per month (USD)
OPENAI_PER_REQUEST_LIMIT=0.10      # Max cost per request (USD)

# Feature Flags
ENABLE_LLM=true                    # Set to false to disable LLM
ENABLE_DEMO_MODE=false             # true = always use demo placeholders
```

---

## Cost Estimates

Using **gpt-4o-mini** (recommended for development):

| Action                       | Tokens                    | Cost     |
| ---------------------------- | ------------------------- | -------- |
| Generate SOAP note           | ~500 input + ~300 output  | ~$0.0003 |
| Smart fill 10 fields         | ~200 input + ~50 output   | ~$0.0001 |
| Full form (20 fields + note) | ~1000 input + ~500 output | ~$0.0005 |

**Daily testing (100 fills):** ~$0.05/day = **$1.50/month**

**Production (1000 patients/month):** ~$0.50/month

---

## How It Works

### Before (Phase 1):

```
Page Context → Regex Extraction → DEMO_PATIENT_NAME
```

### After (Phase 2):

```
Page Context → OpenAI GPT-4o-mini → "Sarah Connor"
              → OpenAI GPT-4o-mini → SOAP Note
```

### Smart Fill Logic:

1. **Context Capture** - Extension sends page text to Agent
2. **LLM Analysis** - GPT-4o-mini reads context and extracts:
   - Patient name
   - Date of birth
   - Chief complaint
   - Other relevant data
3. **Field Mapping** - Agent matches extracted data to form fields
4. **Plan Generation** - Creates fill plan with intelligent values
5. **Execution** - Extension fills form with AI-generated data

---

## Troubleshooting

### "OpenAI API key not configured"

- Check that `.env` file exists in `/Users/ali/GHOST/agent/`
- Verify API key starts with `sk-proj-` or `sk-`
- Restart agent after adding key

### "LLM returns demo mode"

- API key might be invalid
- Check OpenAI account has credits
- Check rate limits on OpenAI dashboard

### "Costs too high"

- Lower `OPENAI_MAX_TOKENS` (e.g., 1000 instead of 2000)
- Switch to `gpt-4o-mini` if using `gpt-4o`
- Set `OPENAI_MONTHLY_LIMIT` to enforce budget cap

---

## Next Steps

### Immediate (Week 1):

- [ ] **Add API key** and test health check
- [ ] **Run smoke test** with LLM enabled
- [ ] **Verify costs** on OpenAI dashboard

### Week 2-3:

- [ ] **Tune prompts** for better SOAP note quality
- [ ] **Add field-specific prompts** (e.g., ICD-10 codes, medication dosages)
- [ ] **Implement caching** to reduce API calls for repeated content

### Week 4-5:

- [ ] **Test on OSCAR** forms with real clinical workflows
- [ ] **Collect clinician feedback** on note quality
- [ ] **Iterate prompts** based on feedback

---

## OSCAR Onboarding → Autopilot (Compact Blueprint)

1. **Template Bootstrap** – Start every deployment from a shared OSCAR baseline (known screens, popups, navigation quirks). Store it centrally and version it via changelog entries.
2. **Monitoring Window (≈48 h)** – Let the clinician drive naturally while the extension logs non-PHI telemetry: which screens open, how popups are triggered, field fill order, navigation loops. All traces stay local/hashed but summarized in the central changelog.
3. **Confidence Gate** – Compute per-doctor coverage stats (e.g., ≥99 % of unique surfaces seen, selectors stable <1 % drift). Until that bar is met, Anchor stays in “assist + monitor” mode.
4. **Autopilot Handoff** – Once thresholds pass, enable automatic Map → Plan → Execute for the learned workflow. Keep watching for layout drift; any novel screen or OSCAR update flips the doctor back into monitoring, updates the changelog, and retrains the profile.

Result: every doctor inherits the OSCAR template, the system learns their personal path over two days, and autopilot only lights up when both the shared template and the individual telemetry say “safe”.

---

## Security Notes

✅ **API Key Protection:**

- `.env` file is in `.gitignore` (never committed)
- Only the agent server has access to the key
- Extension never sees the API key

✅ **PHI Safety:**

- Agent only receives page metadata (labels, selectors)
- LLM receives page context text (titles, visible text)
- **No PHI is ever sent to OpenAI** (only synthetic/demo data)

✅ **Cost Controls:**

- Monthly and per-request limits in `.env`
- Monitor usage on OpenAI dashboard
- Agent logs all LLM requests with token counts

---

**Status:** ✅ LLM Integration Ready\
**Next Action:** Add your OpenAI API key to `agent/.env`
