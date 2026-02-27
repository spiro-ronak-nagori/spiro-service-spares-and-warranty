

## Spiro Aftersales Service App - Phase 1: Core Job Card Flow

### Overview
A mobile-first Progressive Web App (PWA) for Spiro Energy workshops to digitize job card management. Phase 1 focuses on the complete happy path from vehicle intake to delivery, with OTP verification at key checkpoints.

---

### 🎨 Design & Branding
- **Spiro green theme** with high-contrast UI for workshop lighting conditions
- **Large, thumb-friendly CTAs** optimized for quick use on the floor
- **Clean status pills** showing job card state (Draft, Inwarded, In-Progress, Ready, Delivered)
- **Bottom navigation** with 4 tabs: Job Cards, Create JC, Reports (placeholder), Profile

---

### 👤 Authentication (Phase 1: Simplified)
- **OTP Login** via phone number
- Support for **Technician** and **Workshop Admin** roles
- Profile page showing user info, workshop details, and logout option

---

### 📋 Job Card List Screen (Home)
- **Segmented tabs**: Draft / Ongoing / Completed
- **Search** by vehicle registration number
- **Quick filters**: status, date range
- Each card displays: vehicle number, customer name, model, last updated, colored status pill
- Tap to open job card details

---

### ✨ Create New Job Card (Guided Flow)
**Step 1: Vehicle Search**
- Enter vehicle registration number
- Block creation if vehicle has an active non-terminal job card
- Auto-fetch vehicle details: model, color, owner name/phone, purchase date, last service info

**Step 2: Odometer Entry**
- Enter current odometer reading
- **Camera capture** for odometer photo (compressed)
- Validation: cannot be less than last service odometer

**Step 3: Service Category Selection**
- **L1 Categories**: Periodic Maintenance, Battery, Powertrain/Motor, Brakes, Chassis/Suspension, Wheels, Electrical/Lights, Accident/Body, OTA/Recall
- **L2 Issues**: Filtered by selected L1 (e.g., General Check-up, Lubrication, etc.)
- Multi-select issues with "Add More" option

**Step 4: Save**
- Generate unique JC_ID
- Save as **DRAFT** status
- Options: Continue to Inwarding or Save & Exit

---

### 🔐 Inwarding (Proof of Possession)
- From Draft job card, tap **"Send OTP"**
- OTP sent to customer's registered phone number
- **OTP entry screen** with 3 retries, 30-second cooldown
- On success: Job card moves to **INWARDED** status
- Creates audit trail entry with timestamp

---

### 🔧 Work Tracking
**Start Work**
- Single tap from INWARDED job card
- Moves status to **IN-PROGRESS**
- Records timestamp and technician

**Complete Work**
- Mandatory **remarks field** (minimum 30 characters)
- Checklist of selected issues to confirm
- Option to add photos of completed work
- On submit: moves to **READY** status

---

### 🚗 Delivery (Proof of Release)
- From READY job card, tap **"Confirm Delivery"**
- Delivery OTP sent to customer's phone
- **OTP verification** screen (same pattern as inwarding)
- On success: Job card moves to **DELIVERED** status
- Displays: "Vehicle is delivered. Customer feedback is pending."

---

### 📊 Data & Audit
- All status transitions logged with: timestamp, user ID, from/to status
- Job card stores complete history visible as a timeline
- Database tables: Workshops, Users, Vehicles, JobCards, AuditTrail

---

### 📱 PWA Features (Phase 1)
- Installable from browser to home screen
- App-like experience with no browser chrome
- Basic caching for app shell and assets

---

### 🚧 What's NOT in Phase 1 (Coming in Phase 2)
- Full offline mode with sync
- Refused delivery / Reopen JC flow
- Customer feedback collection
- Reports & dashboards with metrics (MTTR, reopened %, etc.)
- Super Admin role / workshop management
- Team management for Workshop Admin
- SMS/WhatsApp notification integrations
- Photo fallback for OTP when offline

---

### Technical Approach
- **React + TypeScript** with Tailwind CSS
- **Lovable Cloud** backend (Supabase) for database, auth, and OTP edge functions
- **PWA** with vite-plugin-pwa for installability
- **Mobile-first** responsive design
- **Camera integration** for odometer photos

