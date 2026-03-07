

## Plan: Replace wrench logo with Spiro logo and update headings

### Changes

**1. Copy uploaded Spiro logo into the project**
- Copy `user-uploads://image-27.png` to `src/assets/spiro-logo.png`

**2. Update `src/pages/AuthPage.tsx`**
- Replace the wrench icon block (lines 260-268) with an `<img>` tag using the Spiro logo
- Change heading to "Aftersales Platform"
- Remove the subtitle line ("Aftersales Service Management")
- Remove `Wrench` from the lucide-react import

**3. Update `src/pages/JobCardListPage.tsx`** (home page)
- Update `PageHeader` title from "Job Cards" to "Aftersales Platform"
- Remove the subtitle prop (workshop name display)

### Summary
Two files edited, one asset copied. The Spiro logo replaces the green wrench square on the auth screen, heading becomes "Aftersales Platform" with no subheading.

