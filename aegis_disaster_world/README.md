# AEGIS-SAR — Mountain Landslide Simulation & PX4 SITL Pipeline

Aerospace-grade simulation environment for autonomous Search and Rescue (SAR) drone operations over catastrophic mountain landslide terrain. Includes multi-spectral thermal radiation tags, physical collision models, deterministic hazard verification, and real-time casualty triage.

---

## 1. What's in the Landslide Simulation World (`landslide_zone.sdf`)

| Entity | Ground-Truth Temp | Signature / Purpose |
|---|---|---|
| `victim_primary` | **310 K (~36.85°C)** | Unconscious survivor trapped on the mudflow fringe — human physiological body-heat benchmark |
| `victim_occluded` | **309 K (~35.85°C)** | Casualty buried beneath timber & rubble — corroboration benchmark for acoustic beamforming + thermal |
| `warm_rock_false_positive` | **305 K (~31.85°C)** | Sun-warmed granite boulder — proves Section 4 multi-spectral fusion rejects heat false-positives |
| `fire_combustion_hazard` | **873 K (~600°C)** | Ruptured fuel combustion hazard — triggers Section 4 deterministic flame check (>250°C + 2.2Hz flicker) |
| `downed_power_line` | **315 K (~41.85°C)** | High-voltage transmission pylon short circuit heating near infrastructure corridor |
| `highway_shear_slab` | **298 K** | Highway 108 sheared and broken in two by the catastrophic mudslide |
| `crown_scarp_ridge` | **296 K** | 20-meter sheer mountain failure slope where the hillside detached |
| `debris_tongue_mound` | **294 K** | Chaotic hummocky alluvial deposit fan across the valley |

---

## 2. Launching in Gazebo Harmonic + PX4 SITL

### Step 1: Copy World into PX4 Simulation Directory
```bash
cp landslide_zone.sdf ~/PX4-Autopilot/Tools/simulation/gz/worlds/
```

### Step 2: Launch PX4 SITL with x500_aegis Quadcopter
```bash
cd ~/PX4-Autopilot
PX4_GZ_WORLD=landslide_zone PX4_GZ_MODEL=x500_aegis make px4_sitl gz_x500
```

### Step 3: Connect QGroundControl
Open **QGroundControl** on your workstation. It will automatically discover the PX4 SITL instance over UDP port 14550, displaying:
- Real-time artificial horizon & compass heading
- MAVLink v2.0 telemetry stream
- GPS satellite lock & battery status

---

## 3. Running the Live Multi-Modal Detection Pipeline

In a separate terminal, execute the deterministic detection and triage pipeline:

```bash
python3 demo_pipeline_live.py
```

### Expected Output:
```
=================================================================
  AEGIS-SAR MULTI-MODAL RECONNAISSANCE & TRIAGE PIPELINE
  Tactical C2 Interface Bridge // Gazebo PX4 SITL Stream
=================================================================
[*] Logging structured telemetry events to: demo_data/live_detection_log.jsonl

[19:36:06] [AUTO] TRK-01: PERSON (97%) | TRIAGE: 84/100 (CRITICAL)
       +-- PHYSIOLOGICAL MATCH: Core temp 36.9°C matches human homeostasis. Optical person score 0.94.
[19:36:06] [AUTO] TRK-02: FIRE (97%) 
       +-- DETERMINISTIC FIRE TRIGGER: 599.9°C > 250°C threshold + flicker (2.2Hz)
[19:36:06] [AUTO] TRK-03: DOWNED_POWER_LINE (91%) 
       +-- ELECTRICAL SHORT HEATING: 41.9°C near transmission corridor
[19:36:06] [REVIEW] TRK-04: HEAT_FALSE_POSITIVE (78%) 
       +-- FALSE-POSITIVE DETECTED: Surface temp 31.9°C is sun-warmed ambient rock. Disagrees with human morphology.
[19:36:06] [AUTO] TRK-05: PERSON (88%) | TRIAGE: 79/100 (CRITICAL)
       +-- ACOUSTIC CORROBORATION: Weak optical but vocal audio detected (62.0 dB) at human temp (35.9°C).

[DONE] Pipeline execution finished. Live audit log written successfully.
```

---

## 4. Connecting to the Web Tactical C2 Center

Start the Web C2 Ground Station locally:
```bash
# In the workspace root
python -m http.server 8080
```
Open **`http://localhost:8080`** in Google Chrome or Microsoft Edge to access:
- **Primary Flight Display (PFD) HUD**: Artificial horizon, compass tape, airspeed/altitude tapes
- **3 Camera Modes**: Tactical Chase view, nose-mounted Gimbal FPV, and Orbit Reconnaissance
- **FLIR Thermal Viewer**: Real-time palette switcher (`IRN` / `W-HOT` / `B-HOT`) and spot pyrometer
- **Situation Ledger**: Target track cards with optical/LWIR/acoustic/gas chips and GPS coordinates
- **Automated Incident Report**: Instant one-click export of structured JSON audit logs
