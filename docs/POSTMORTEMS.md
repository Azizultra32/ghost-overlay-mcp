# Postmortems

## 2025-11-21 – File Corruption & Inappropriate Git Restore

- **Impact**: overlay.js corrupted → build failed → blind git restore lost
  v0.0.2 UI work → 20min downtime, wasted ~60K tokens
- **Detection**: Build error `Unexpected "|"` in template strings at line 958
- **Root Cause**: (1) File corruption (lines 955-995 garbled), (2) Agent used
  `git checkout` without verifying restore target, lost all v0.0.2
  SOAP/Summary/Tasks UI

### Timeline

1. **11:36 AM** – Demo EHR page not loading; started Python server on port 8788
2. **11:37 AM** – Build failed:
   `extension/overlay.js:958:38: ERROR: Unexpected "|"`
3. **11:37 AM** – Inspection revealed lines 955-995 corrupted with garbled text
   (e.g., `cldis="s clioa-seeclr"`)
4. **11:38 AM** – Agent ran `git checkout extension/overlay.js` to restore
5. **11:38 AM** – **MISTAKE**: Restore used commit `66f199f` (older version)
   missing v0.0.2 UI components (SOAP/Summary/Tasks/Transcript views,
   demoUISeed)
6. **11:39-11:49 AM** – Agent spent 15 minutes debugging
   `escapeHtml is not defined` when real issue was incomplete file restoration
7. **11:59 AM** – User manually restored proper overlay.js structure with all
   v0.0.2 UI work

### Root Cause Analysis

**Primary**: Unknown file corruption (lines 955-995 → binary/garbled data)

- Possible: disk write interruption, memory corruption, editor crash, git
  operation interference

**Secondary**: Agent used `git checkout` without verification

- Did not run `git diff HEAD -- extension/overlay.js` to preview changes
- Did not check `git log` to see commit history
- Did not verify line count (should be ~1400+ for v0.0.2, restored version was
  ~929)
- Assumed HEAD == current working state (incorrect for active sprint work)

**Tertiary**: Wasted effort on wrong diagnosis

- Focused on narrow `escapeHtml` scoping issue
- Did not validate if restored version had expected v0.0.2 features
- Smoke test passed (exit 0) even with missing UI, no assertion on filled values

### Resolution

1. User manually re-added missing components:
   - `demoUISeed` object with patient/SOAP/summary/tasks/transcript data
   - Tab structure (SOAP/Summary/Tasks/Transcript)
   - View sections and render functions
2. Build completed successfully (bundle 116.7KB → 139.4KB)
3. Chrome + extension restarted and verified

### What We Preserved

Despite the incident, these Ferrari protocol fixes remained intact:

- ✅ `verify-extension-loaded.mjs` – Throws errors instead of `process.exit()`
- ✅ `agent/.env` – Added Ferrari LLM guardrails (OPENAI_MAX_TOKENS=600,
  LLM_MAX_RETRIES=3, LLM_RETRY_DELAY_MS=500, LLM_MAX_CONTEXT_CHARS=8000)
- ✅ `smoke.mjs` – Fixed node path to `/usr/local/bin/node`
- ✅ `start-mcp.sh` – Fixed node path references

### Follow-Ups

**Immediate**:

- [ ] Investigate corruption root cause (disk, editor, git hooks?)
- [ ] Add `wc -l` check to build: fail if overlay.js < 1000 lines

**Short-term**:

- [ ] Enhance smoke test: assert filled form values, not just existence
- [ ] Add pre-commit hook to detect garbled UTF-8 in source files
- [ ] Create `git diff` verification step before destructive operations

**Long-term**:

- [ ] Add file integrity checksums to critical sources
- [ ] Automated backup snapshots during active dev sessions

### Lessons Learned

1. **Always inspect before restoring**:
   ```bash
   git diff HEAD -- file.js        # See what would change
   git show HEAD:file.js | head -50  # Preview restoration
   wc -l file.js                   # Verify line count
   ```

2. **When uncertain, ask user** instead of 3 failed fix attempts:
   > "overlay.js is corrupted. Git restore would use older commit missing v0.0.2
   > UI. Do you have a backup?"

3. **Smoke tests need stronger assertions**:
   - ❌ Current: Passes if overlay exists (even if empty)
   - ✅ Better: Validate specific form values filled, UI components rendered

4. **File corruption requires investigation**, not just restoration:
   - Check disk health, editor logs, git hooks, concurrent processes

---

**Cost**: 20 minutes downtime, ~60K tokens, user frustration\
**Prevention**: Better validation before destructive operations, stronger test
assertions, ask user when uncertain\
**Recovery**: User manual intervention successful, Ferrari fixes intact
