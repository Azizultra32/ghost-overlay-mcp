# PHASE 2 - WEEK 1 KICKOFF CHECKLIST

**Timeline:** Nov 25 - Dec 1, 2025\
**Milestone:** Foundation (MCP docs complete, OSCAR environment ready)

---

## CRITICAL BLOCKERS (MUST RESOLVE BEFORE KICKOFF)

### 1. Assign Workstream Leads ⚠️ BLOCKING

- [ ] **Infrastructure Lead** (MCP completion) - 50% time, Week 1-2
- [ ] **DOM/Frontend Lead** (DOM mapper upgrades) - 100% time, Week 1-4
- [ ] **Engine Lead** (Fill engine hardening) - 100% time, Week 2-4
- [ ] **Clinical QA Lead** (OSCAR integration) - 50% time, Week 3-6
- [ ] **AI/LLM Lead** (LLM integration) - 75% time, Week 2-5
- [ ] **Security Lead** (PHI audits) - 25% time, Week 1-6
- [ ] **DevOps Lead** (Deployment automation) - 50% time, Week 4-6

**Action:** Project Manager assigns leads and confirms availability

---

### 2. Provision OSCAR Test Instance ⚠️ BLOCKING

- [ ] **Option A:** Self-hosted OSCAR on local server (free, requires DevOps
      setup)
- [ ] **Option B:** Cloud-hosted OSCAR instance ($100/mo, faster setup)
- [ ] Create test URL: `https://oscar-test.internal` or similar
- [ ] Generate SSL cert if self-hosted
- [ ] Test accessibility from development machines

**Action:** DevOps Lead provisions by Nov 25

---

### 3. Obtain OpenAI API Key ⚠️ BLOCKING

- [ ] Create OpenAI account (or use existing)
- [ ] Purchase API credits (~$50 for dev testing)
- [ ] Store API key in agent `.env` file
- [ ] Test API connectivity:
      `curl https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY"`
- [ ] Set usage limits ($500/mo cap for prod)

**Action:** AI Lead obtains key by Nov 25

---

### 4. Budget Approval ⚠️ BLOCKING

**Monthly Costs:**

- OpenAI API: $50 (dev) + $500 (prod) = $550/mo
- OSCAR Cloud Hosting (if chosen): $100/mo
- **Total: $650/mo**

**Action:** Finance approves budget by Nov 25

---

## WEEK 1 DELIVERABLES

### Workstream 1: MCP Completion (Infrastructure Lead)

- [ ] Document all MCP tools in `MCP_TOOLS_REFERENCE.md`:
  - `navigate(url)` - Navigate to URL
  - `click(selector)` - Click element
  - `type(selector, text)` - Type into field
  - `screenshot()` - Capture screenshot
  - `evaluate(js)` - Run JavaScript
  - `getDOM()` - Get page HTML
- [ ] Add usage examples for each tool
- [ ] Test each tool on demo/ehr.html
- [ ] Create integration guide for external clients

**Acceptance:** All MCP tools documented with working examples

---

### Workstream 2: OSCAR Environment Setup (DevOps)

- [ ] Install OSCAR on test server (or provision cloud instance)
- [ ] Load synthetic patient data (Mockaroo/Faker.js):
  - 100 test patients
  - No real PHI
  - Diverse demographics (age, gender, conditions)
- [ ] Create test clinician accounts (3 users)
- [ ] Document OSCAR navigation flows:
  - Login → Patient Search → Encounter Note
  - Appointment Booking
  - Demographics Update
- [ ] Take screenshots of 20 most common forms

**Acceptance:** OSCAR accessible at test URL, 100 synthetic patients loaded

---

### Workstream 3: PHI Audit Suite (Security Lead)

- [ ] Create `scripts/phi-audit.mjs`:
  - Monitor network traffic during smoke test
  - Assert: zero outbound requests except localhost:8787
  - Parse agent /dom payload, validate only metadata (no values)
- [ ] Add to CI/CD pipeline (run on every commit)
- [ ] Create PHI audit report template
- [ ] Document PHI flow diagram (Mermaid)

**Acceptance:** Automated PHI audit passes on current codebase

---

### Workstream 4: DOM Mapper Heuristics Design (Frontend Lead)

- [ ] Research OSCAR field patterns:
  - Analyze screenshots from DevOps
  - Document field naming conventions
  - Identify dynamic/AJAX-loaded fields
- [ ] Design fallback selector strategy:
  - Priority 1: ID
  - Priority 2: name attribute
  - Priority 3: ARIA label
  - Priority 4: XPath
- [ ] Create unit test suite structure
- [ ] Draft `DOM_MAPPER_UPGRADE_SPEC.md`

**Acceptance:** Design doc approved, ready for Week 2 implementation

---

### Workstream 5: LLM Prompt Engineering (AI Lead)

- [ ] Test OpenAI GPT-4 API with sample prompt:
  ```
  You are a clinical AI assistant. Given the following page context:

  Context: "Patient Summary: Name: John Doe, DOB: 1980-01-01, Chief Complaint: Headache"

  Generate a SOAP note for this encounter.
  ```
- [ ] Iterate on prompt to generate high-quality SOAP notes
- [ ] Define prompt template format
- [ ] Document LLM integration architecture
- [ ] Create fallback strategy (local model if API down)

**Acceptance:** GPT-4 generates valid SOAP note from context

---

## WEEK 1 ACCEPTANCE TESTS

### Test 1: MCP Documentation Complete

```bash
# Verify all tools documented
ls docs/MCP_TOOLS_REFERENCE.md
grep -c "navigate\|click\|type\|screenshot" docs/MCP_TOOLS_REFERENCE.md
# Should return 4+ matches
```

### Test 2: OSCAR Accessible

```bash
# Test OSCAR URL
curl -I https://oscar-test.internal
# Should return 200 OK

# Verify patient count
# (SQL query or OSCAR admin panel)
# Should show 100 test patients
```

### Test 3: PHI Audit Passes

```bash
npm run phi-audit
# Should output: ✅ PHI AUDIT PASS - Zero PHI transmitted
```

### Test 4: OpenAI API Connected

```bash
curl https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4","messages":[{"role":"user","content":"Test"}]}'
# Should return valid JSON response
```

---

## DAILY STANDUP FORMAT

**Time:** 10:00 AM (every weekday)\
**Duration:** 15 minutes max

**Agenda:**

1. What did you accomplish yesterday?
2. What are you working on today?
3. Any blockers?

**Attendees:** All 7 workstream leads + PM

---

## WEEK 1 DEMO (Friday Dec 1)

**Demo Agenda:**

1. **MCP Tools** - Live demo of all documented tools
2. **OSCAR Instance** - Walkthrough of test environment, show 100 patients
3. **PHI Audit** - Run automated audit, show green checkmark
4. **LLM Test** - Generate SOAP note from sample context
5. **Week 2 Preview** - Show DOM mapper design, fill engine plan

**Time:** 2:00 PM Friday\
**Duration:** 30 minutes\
**Attendees:** All leads + stakeholders

---

## RISKS & MITIGATION (WEEK 1)

| Risk                            | Mitigation                                   | Owner   |
| ------------------------------- | -------------------------------------------- | ------- |
| OSCAR provision delayed         | Start with self-hosted, parallel cloud setup | DevOps  |
| OpenAI API key approval delayed | Use GPT-3.5-turbo for dev (cheaper)          | AI Lead |
| Lead assignments incomplete     | PM escalates to exec team                    | PM      |
| Budget not approved             | Defer prod spending, use dev-only budget     | Finance |

---

## CONTACTS & ESCALATION

**Project Manager:** [Name] - [Email] - [Phone]\
**Technical Lead:** [Name] - [Email]\
**Escalation Path:** PM → Tech Lead → Exec Sponsor

---

## STATUS TRACKING

- 🔴 **Blocker** - Cannot proceed without resolution
- 🟡 **At Risk** - May cause delays if not addressed
- 🟢 **On Track** - Proceeding as planned

**Current Status:** 🔴 BLOCKED (waiting for lead assignments, OSCAR, API key,
budget)

---

**Last Updated:** Nov 20, 2025\
**Next Update:** Nov 25, 2025 (Kickoff Day)
