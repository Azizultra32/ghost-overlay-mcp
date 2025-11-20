# OSCAR Integration Guide

## What is OSCAR?

**OSCAR** = Open Source Clinical Application Resource

- Open-source EMR system (primarily used in Canada)
- Web-based, runs in any modern browser
- Target platform for Anchor Browser
- Goal: Anchor should fill OSCAR forms as easily as demo/ehr.html

---

## Option 1: Local OSCAR Setup (Recommended for Development)

### Quick Docker Setup (~15 minutes)

```bash
# Clone OSCAR repository
git clone https://github.com/oscaremr/oscar.git
cd oscar

# Start OSCAR with Docker Compose
docker-compose up -d

# Wait for services to start (~2 minutes)
# OSCAR will be available at: http://localhost:8080/oscar
```

### Login Credentials (Default)

- **URL:** `http://localhost:8080/oscar`
- **Username:** `oscardoc`
- **Password:** `mac2002`
- **PIN:** `1117`

---

## Option 2: Use Existing OSCAR Demo Instance

If you have access to a hosted OSCAR instance, you can test directly against it.

**Setup:**

1. Get URL from user (e.g., `https://oscar-demo.example.com`)
2. Get test credentials
3. Update smoke test to navigate to OSCAR instead of localhost:8788

---

## Option 3: Supervised Access to Real OSCAR

**User mentioned they can provide brief supervised access to real OSCAR.**

This would be ideal for:

- Understanding real-world form complexity
- Testing with actual clinical workflows
- Validating selector strategies on production markup

**Safety:**

- Only during supervised sessions
- Use Anchor in "mapping only" mode (no fills)
- Document field patterns for offline development

---

## OSCAR Forms to Test

### Priority 1 (Most Common):

1. **Encounter Note (SOAP)** - `casemgmt/forward.jsp`
2. **Patient Demographics** - `demographic/demographiccontrol.jsp`
3. **Appointment Booking** - `appointment/addappointment.jsp`

### Priority 2:

4. **Lab Requisitions** - `oscarLab/Requisition.jsp`
5. **eForms (Custom Forms)** - Platform for custom form definitions
6. **Prescription Entry** - `oscarRx/WriteScript.do`

### Priority 3:

7. **Billing** - `billing/CA/ON/billingON.jsp`
8. **Prevention Module** - `prevention/index.jsp`
9. **Ticklers (Reminders)** - `tickler/ticklerMain.jsp`

---

## Testing Plan

### Phase 1: Reconnaissance (Week 1)

**Goal:** Understand OSCAR form structure

- [ ] Install local OSCAR instance
- [ ] Navigate to 5 most common forms
- [ ] Take screenshots
- [ ] Inspect HTML (selectors, field naming)
- [ ] Document dynamic elements (AJAX, SPAs)

### Phase 2: Mapping (Week 2-3)

**Goal:** Anchor can map OSCAR fields

- [ ] Test DOM mapper on OSCAR pages
- [ ] Verify field detection accuracy (target: 90%+)
- [ ] Add OSCAR-specific heuristics if needed
- [ ] Handle dynamic fields (loaded after page load)

### Phase 3: Filling (Week 4)

**Goal:** Anchor can fill OSCAR forms

- [ ] Test fill engine on OSCAR
- [ ] Verify event triggers (React/jQuery validation)
- [ ] Test undo/redo
- [ ] Measure success rate (target: 95%+)

---

## OSCAR-Specific Challenges

### 1. **jQuery Heavy**

OSCAR uses jQuery for form validation and dynamic content. Ensure:

- Anchor dispatches jQuery events (`$(...).trigger('change')`)
- Wait for AJAX responses before continuing

### 2. **Dynamic Field Loading**

Some fields load after page render. Strategies:

- Wait for DOM mutations
- Retry mapping if fields < expected
- Use MutationObserver for dynamic detection

### 3. **Custom eForms**

OSCAR allows clinics to define custom forms. These have:

- Unpredictable markup
- Custom validation rules
- Variable field naming

**Solution:** Focus on standard OSCAR forms first, handle eForms in Phase 3.

### 4. **Multi-Page Workflows**

Some processes span multiple pages (e.g., patient intake). Need:

- Session persistence
- Cross-page undo
- Navigation tracking

---

## Integration with Anchor

### Current State:

```javascript
// Smoke test targets demo/ehr.html
const DEMO_URL = "http://localhost:8788/ehr.html";
```

### With OSCAR:

```javascript
// Updated to target OSCAR
const OSCAR_URL = "http://localhost:8080/oscar/casemgmt/forward.jsp";
```

### Multi-Environment Support:

```javascript
const TEST_TARGETS = {
    demo: "http://localhost:8788/ehr.html",
    oscar_local: "http://localhost:8080/oscar/casemgmt/forward.jsp",
    oscar_staging: "https://oscar-staging.internal/oscar",
    oscar_prod: "https://real-oscar.example.com/oscar", // Supervised only
};

const target = process.env.TEST_TARGET || "demo";
const url = TEST_TARGETS[target];
```

---

## Data Requirements

### Synthetic Test Patients

For local testing, create realistic but fake patient data:

**Tool:** Mockaroo (https://www.mockaroo.com/)

**Schema:**

```
Name: Full Name (Canadian)
DOB: Date (1940-2010)
Sex: M/F
Address: Canadian Address
Phone: Canadian Phone Number
Health Card: Ontario Health Number (10 digits)
```

Generate 100 patients and import into local OSCAR.

---

## Next Actions

### Immediate (Today):

1. **Get OSCAR Access:**
   - [ ] User provides URL for supervised session, OR
   - [ ] Set up local OSCAR via Docker

2. **Reconnaissance:**
   - [ ] Navigate to 3 key forms
   - [ ] Take screenshots
   - [ ] Inspect HTML

### Week 1:

3. **Document Patterns:**
   - [ ] Field naming conventions
   - [ ] Selector strategies
   - [ ] Dynamic loading behavior

4. **Create Test Fixtures:**
   - [ ] HTML snapshots of key forms
   - [ ] Synthetic patient data (100 records)

### Week 2-3:

5. **Enhance DOM Mapper:**
   - [ ] Add OSCAR-specific heuristics
   - [ ] Handle dynamic fields
   - [ ] Test on 10+ OSCAR forms

---

## Questions for User

1. **OSCAR Access:**
   - Do you have a hosted OSCAR instance we can use?
   - Or should I set up local OSCAR via Docker?
   - If providing supervised access, what's the best time/setup?

2. **Priority Forms:**
   - Which OSCAR forms do clinicians use most?
   - Which workflows are most time-consuming?
   - Any specific pain points to target?

3. **Data:**
   - Can you generate synthetic test patients?
   - Or should I create them via Mockaroo?
   - Any specific patient profiles needed (pediatric, geriatric, etc.)?

---

**Status:** 🟡 WAITING FOR USER INPUT\
**Next Step:** User clarifies OSCAR access option
