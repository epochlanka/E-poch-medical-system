# Pharmacist workflow verification — 14 September 2026

The counter workflow now starts at `/pharmacy/queue`. Both the former dashboard landing URL and the standalone dispensing picker redirect there; the analytical dashboard remains at `/overview`.

## Changes

- Replaced four narrow queue columns and repeated counters with one searchable patient list and status filters.
- Search covers patient name, patient ID, prescription code, and doctor; completed handovers are separate from medicines waiting to be prepared.
- Open prescriptions directly in the picking workspace. Prescription records use the same workspace for picking, handover, and reprinting.
- Removed the nonfunctional header search. Collapsed inventory, purchasing, billing, and overview tools in navigation.
- Increased readability of medicine names, directions, quantities, batches, and expiry dates.
- Selecting a batch or editing a quantity requires an explicit “I picked” confirmation. Shared-batch totals are checked before review.
- Review includes directions, selected quantities, and outstanding medicines. Partial recording requires acknowledgment; handover remains a separate explicit action.
- Use a native modal dialog for review, with keyboard focus containment and Escape dismissal. Warn before leaving via links or refreshing with unsaved choices.
- Return to the top on page changes and after save/error results. Previously recorded batch details are collapsible.

## Verification

- Production build passed; lint has only the pre-existing AuthContext fast-refresh warning.
- Existing pharmacy API suite: 20 tests passed against a separate SQLite copy.
- Browser walkthrough: sign-in lands on the worklist; patient-ID search opens the matching prescription; unmatched searches display recovery guidance.
- Isolated browser fixture: two synthetic medicines, six units prescribed each, 100 available per batch. Choosing a batch left the picked count at zero. Picking and recording three units of medicine A left three outstanding and medicine B untouched. Recording the rest moved to ready for handover. Explicit handover moved to handed over.
- Database verification: both medicines recorded six units, both batches ended at 94, and the test prescription was Collected. No QA patients were added to the clinic database.
- Desktop and 390-pixel mobile worklist inspected. Mobile status filters and patient rows wrap vertically.

## Existing limits retained

- One batch per medicine can be recorded in each pass. To supply from multiple batches, record the first partial quantity, then pick the balance.
- The queue API returns the full history; very large installations may need server-side pagination later.
- Unsaved picking choices are not persisted. Browser Back is not covered by the link-click confirmation.
