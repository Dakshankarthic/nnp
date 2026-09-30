/**
 * dashboard.js — AEGIS-SAR Tactical Command & Control (C2) Dashboard
 * High-density situational awareness ledger, multi-sensor fusion audit,
 * triage queue prioritization, swarm constellation monitoring, and mission reporting.
 */

export class Dashboard {
  constructor() {
    // DOM references
    this.elapsedTime = document.getElementById('elapsed-time');
    this.survivorCount = document.getElementById('survivor-count');
    this.hazardCount = document.getElementById('hazard-count');
    this.areaSwept = document.getElementById('area-swept');
    this.detectionList = document.getElementById('detection-list');
    this.triageList = document.getElementById('triage-list');
    this.droneList = document.getElementById('drone-list');
    this.opsForecast = document.getElementById('ops-forecast');
    this.opsRisk = document.getElementById('ops-risk');
    this.opsRouteStatus = document.getElementById('ops-route-status');
    this.opsRouteEta = document.getElementById('ops-route-eta');
    this.opsRouteDistance = document.getElementById('ops-route-distance');
    this.opsRouteIncline = document.getElementById('ops-route-incline');
    this.opsRouteCost = document.getElementById('ops-route-cost');
    this.opsRouteTarget = document.getElementById('ops-route-target');
    this.telemetryGps = document.getElementById('telemetry-gps');
    this.telemetryRssi = document.getElementById('telemetry-rssi');
    this.pyroVal = document.getElementById('pyro-val');

    // Tab switching
    this.tabs = document.querySelectorAll('.tab');
    this.tabContents = document.querySelectorAll('.tab-content');
    this._setupTabs();

    // Filter pills
    this.activeFilter = 'all';
    this._setupFilters();

    // Flight mode & Pattern selector
    this._setupFlightControls();

    // Thermal Palette Switcher
    this._setupPaletteControls();

    // Export Tactical Report
    this._setupExportReport();

    // Operations controls
    this._setupOperationsControls();

    // State
    this.missionStartTime = Date.now();
    this.displayedDetections = new Map(); // id -> det
    this.trackCounter = 1;
    this.trackMap = new Map(); // det.name -> TRK-XX
    this.allTriageScores = [];
    this.lastDroneStatuses = [];

    // Callbacks
    this.onModeChange = null;
    this.onPaletteChange = null;
    this.onPatternChange = null;
    this.onForecastChange = null;
    this.onDispatchRoute = null;
    this.onDemoRun = null;
  }

  _setupTabs() {
    for (const tab of this.tabs) {
      tab.addEventListener('click', () => {
        this.tabs.forEach(t => t.classList.remove('active'));
        this.tabContents.forEach(tc => tc.classList.remove('active'));
        tab.classList.add('active');
        const target = document.getElementById('tab-' + tab.dataset.tab);
        if (target) target.classList.add('active');
      });
    }
  }

  _setupFilters() {
    const pills = document.querySelectorAll('.pill');
    for (const pill of pills) {
      pill.addEventListener('click', () => {
        pills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.activeFilter = pill.dataset.filter;
        this._applyFilter();
      });
    }
  }

  _setupFlightControls() {
    const btnManual = document.getElementById('btn-manual');
    const btnAuto = document.getElementById('btn-auto');
    const patternSelect = document.getElementById('search-pattern-select');

    btnManual?.addEventListener('click', () => {
      btnManual.classList.add('active');
      btnAuto?.classList.remove('active');
      if (this.onModeChange) this.onModeChange('manual');
    });

    btnAuto?.addEventListener('click', () => {
      btnAuto.classList.add('active');
      btnManual?.classList.remove('active');
      if (this.onModeChange) this.onModeChange('autonomous');
    });

    patternSelect?.addEventListener('change', (e) => {
      if (this.onPatternChange) this.onPatternChange(e.target.value);
    });
  }

  _setupPaletteControls() {
    const paletteBtns = document.querySelectorAll('.palette-btn');
    for (const btn of paletteBtns) {
      btn.addEventListener('click', () => {
        paletteBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const palette = btn.dataset.palette;
        if (this.onPaletteChange) this.onPaletteChange(palette);
      });
    }
  }

  _setupExportReport() {
    const exportBtn = document.getElementById('btn-export-report');
    exportBtn?.addEventListener('click', () => {
      this.exportTacticalReport();
    });
  }

  _setupOperationsControls() {
    const forecastSlider = document.getElementById('hazard-forecast-slider');
    const dispatchBtn = document.getElementById('btn-dispatch-route');
    const demoBtn = document.getElementById('btn-demo-run');

    forecastSlider?.addEventListener('input', (e) => {
      const minutes = Number(e.target.value);
      if (this.onForecastChange) this.onForecastChange(minutes);
    });

    dispatchBtn?.addEventListener('click', () => {
      if (this.onDispatchRoute) this.onDispatchRoute();
    });

    demoBtn?.addEventListener('click', () => {
      if (this.onDemoRun) this.onDemoRun();
    });
  }

  updateOperationsPanel(summary, route = null, target = null) {
    if (summary) {
      if (this.opsForecast) this.opsForecast.textContent = `T+${summary.minutes} MIN`;
      if (this.opsRisk) this.opsRisk.textContent = summary.evacuationRisk;
    }

    if (!route) return;

    if (this.opsRouteStatus) this.opsRouteStatus.textContent = 'NNP FUSED ROUTE ACTIVE';
    if (this.opsRouteEta) this.opsRouteEta.textContent = `${route.etaMinutes} MIN`;
    if (this.opsRouteDistance) this.opsRouteDistance.textContent = `${route.distanceMeters} M`;
    if (this.opsRouteIncline) this.opsRouteIncline.textContent = `${route.maxInclineDeg || 0}°`;
    if (this.opsRouteCost) this.opsRouteCost.textContent = `${route.costBreakdown?.totalCost || '--'}`;
    if (this.opsRouteTarget) {
      const label = target?.metadata?.label || target?.name || 'HIGHEST PRIORITY SURVIVOR';
      this.opsRouteTarget.textContent = label.toUpperCase();
    }
  }

  _applyFilter() {
    const cards = this.detectionList?.querySelectorAll('.target-card') || [];
    for (const card of cards) {
      if (this.activeFilter === 'all') {
        card.style.display = '';
      } else {
        card.style.display = card.dataset.route === this.activeFilter ? '' : 'none';
      }
    }
  }

  /**
   * Updates header stats and telemetry readouts
   */
  updateStats(detectionPipeline, areaSweep) {
    const elapsed = (this.simulationTime || 0) * 1000;
    const h = String(Math.floor(elapsed / 3600000)).padStart(2, '0');
    const m = String(Math.floor((elapsed % 3600000) / 60000)).padStart(2, '0');
    const s = String(Math.floor((elapsed % 60000) / 1000)).padStart(2, '0');
    if (this.elapsedTime) this.elapsedTime.textContent = `${h}:${m}:${s}`;

    if (detectionPipeline) {
      const survivors = detectionPipeline.processedDetections
        .filter(d => d.classification === 'person' || d.classification === 'possible_person');
      const uniqueSurvivors = new Set(survivors.map(s => s.name)).size;
      if (this.survivorCount) this.survivorCount.textContent = uniqueSurvivors;

      const hazards = detectionPipeline.processedDetections
        .filter(d => ['fire', 'downed_power_line', 'flood', 'structural_instability'].includes(d.classification));
      const uniqueHazards = new Set(hazards.map(h => h.name)).size;
      if (this.hazardCount) this.hazardCount.textContent = uniqueHazards;
    }

    if (this.areaSwept) this.areaSwept.textContent = areaSweep + '%';

    // Simulated MAVLink jitter
    if (this.telemetryRssi && Math.random() < 0.05) {
      const rssi = -60 - Math.floor(Math.random() * 6);
      this.telemetryRssi.textContent = `${rssi} dBm · SIM`;
    }
  }

  /**
   * Assign or get a track ID like TRK-01
   */
  getTrackId(name) {
    if (!this.trackMap.has(name)) {
      const id = `TRK-${String(this.trackCounter++).padStart(2, '0')}`;
      this.trackMap.set(name, id);
    }
    return this.trackMap.get(name);
  }

  /**
   * Convert relative 3D coordinate to simulated geographic GPS
   */
  toGeoCoordinates(pos) {
    // Base epicenter: 37°46'22.0"N, 122°25'11.0"W
    const baseLat = 37.7728;
    const baseLon = -122.4197;
    const lat = (baseLat + (pos.z * 0.00001)).toFixed(6);
    const lon = (baseLon + (pos.x * 0.00001)).toFixed(6);
    const alt = (12.5 + (pos.y || 0)).toFixed(1);
    return `${lat}°N, ${Math.abs(lon)}°W (ALT: ${alt}m)`;
  }

  /**
   * Add new tactical target cards
   */
  addDetections(newDetections) {
    if (!this.detectionList || !newDetections || newDetections.length === 0) return;

    const emptyState = this.detectionList.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    for (const det of newDetections) {
      if (this.displayedDetections.has(det.name)) continue;
      this.displayedDetections.set(det.name, det);

      const trackId = this.getTrackId(det.name);
      const isPerson = det.classification === 'person' || det.classification === 'possible_person';
      const isHazard = ['fire', 'downed_power_line', 'flood', 'structural_instability'].includes(det.classification);

      const card = document.createElement('div');
      card.className = `target-card ${isPerson ? 'person' : isHazard ? 'hazard' : 'neutral'}`;
      card.dataset.route = det.route;

      const confPct = Math.round(det.combinedConfidence * 100);
      const confColor = det.combinedConfidence > 0.7 ? 'var(--accent-green)'
                      : det.combinedConfidence > 0.4 ? 'var(--accent-amber)'
                      : 'var(--accent-red)';

      const routeTagClass = det.route === 'auto_flagged' ? 'auto_flagged' : 'needs_review';
      const routeTagText = det.route === 'auto_flagged' ? 'CONFIRMED' : 'REVIEW REQUIRED';

      const tempK = det.thermal ? Math.round(det.thermal.temperature) : 300;
      const rgbConf = det.rgb ? Math.round(det.rgb.confidence * 100) : 85;
      const acousticDb = (det.acoustic && typeof det.acoustic.intensity === 'number') 
        ? det.acoustic.intensity.toFixed(0) 
        : (42 + Math.random() * 20).toFixed(0);
      const gasPpm = (det.gas && typeof det.gas.vocPpm === 'number') 
        ? det.gas.vocPpm.toFixed(1) 
        : (0.4 + Math.random() * 2).toFixed(1);

      const geoStr = this.toGeoCoordinates(det.position);

      card.innerHTML = `
        <div class="target-card-header">
          <span class="target-id-badge">${trackId} // ${det.sourceDrone || 'AEGIS-1'}</span>
          <span class="target-route-tag ${routeTagClass}">${routeTagText}</span>
        </div>
        <div class="target-card-body">
          <span class="target-type-name">${formatClassification(det.classification)}</span>
          <span class="target-conf-num mono" style="color:${confColor}">${confPct}% CONF</span>
        </div>
        <div class="sensor-chips-row">
          <div class="sensor-chip"><span class="chip-name">OPTICAL</span><span class="chip-val">${rgbConf}%</span></div>
          <div class="sensor-chip"><span class="chip-name">LWIR</span><span class="chip-val">${tempK}K</span></div>
          <div class="sensor-chip"><span class="chip-name">ACOUSTIC</span><span class="chip-val">${acousticDb}dB</span></div>
          <div class="sensor-chip"><span class="chip-name">VOC/GAS</span><span class="chip-val">${gasPpm}</span></div>
        </div>
        <div class="target-geo-row">
          <span>${geoStr}</span>
          <span>DIST: ${typeof det.distance === 'number' ? det.distance.toFixed(1) : '10.5'}m</span>
        </div>
      `;

      card.addEventListener('click', () => {
        if (this.onTargetSelect) this.onTargetSelect(det);
      });

      this.detectionList.insertBefore(card, this.detectionList.firstChild);

      while (this.detectionList.children.length > 40) {
        this.detectionList.removeChild(this.detectionList.lastChild);
      }
    }

    this._applyFilter();
  }

  /**
   * Update triage queue
   */
  updateTriage(triageScores) {
    if (!this.triageList || !triageScores || triageScores.length === 0) return;
    this.allTriageScores = triageScores;

    const emptyState = this.triageList.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    this.triageList.innerHTML = '';

    // Sort descending by triage score
    const sorted = [...triageScores].sort((a, b) => b.score - a.score);

    for (const item of sorted) {
      const card = document.createElement('div');
      const pClass = item.priority === 'critical' ? 'p1' : item.priority === 'moderate' ? 'p2' : 'p3';
      const pText = item.priority === 'critical' ? 'P1 IMMEDIATE' : item.priority === 'moderate' ? 'P2 DELAYED' : 'P3 MINIMAL';

      card.className = `triage-card ${pClass}`;
      card.innerHTML = `
        <div class="triage-top">
          <span class="triage-badge ${pClass}">${pText}</span>
          <span class="triage-score-display mono">${item.score}<span style="font-size:10px; opacity:0.6;"> / 100</span></span>
        </div>
        <div style="font-family:var(--font-display); font-weight:700; font-size:11px; color:#fff;">
          TARGET: ${item.name.toUpperCase()}
        </div>
        <div style="font-family:var(--font-mono); font-size:8px; color:rgba(200,212,232,0.6); line-height:1.4;">
          THERMAL: ${(item.components.thermal * 100).toFixed(0)}% · 
          ACOUSTIC: ${(item.components.acoustic * 100).toFixed(0)}% · 
          HAZARD PROX: ${(item.components.hazardProximity * 100).toFixed(0)}%<br>
          STRUCTURAL RISK: ${(item.components.structuralRisk * 100).toFixed(0)}% · 
          EXP TIME: ${(item.components.timeEstimate * 100).toFixed(0)}%
          ${item.components.nearestHazard !== 'none'
            ? `<div style="color:var(--accent-red); margin-top:2px;">⚠ PROXIMITY HAZARD: ${item.components.nearestHazard} (${item.components.nearestHazardDist.toFixed(1)}m)</div>`
            : ''}
        </div>
      `;
      this.triageList.appendChild(card);
    }
  }

  /**
   * Update swarm constellation cards
   */
  updateDroneStatus(statuses) {
    if (!this.droneList || !statuses) return;
    this.lastDroneStatuses = statuses;
    this.droneList.innerHTML = '';

    const roles = {
      'AEGIS-1': 'Lead scout / EO-IR mapping',
      'AEGIS-2': 'Thermal sweep / sector coverage',
      'AEGIS-3': 'Relay node / gas sampling',
    };

    for (const st of statuses) {
      const card = document.createElement('div');
      card.className = `drone-status-card ${st.id === 'AEGIS-1' ? 'lead' : ''}`;
      const role = roles[st.id] || 'AUXILIARY SWARM NODE';

      card.innerHTML = `
        <div class="drone-status-header">
          <span class="drone-callsign">${st.id}</span>
          <span class="drone-role">${role}</span>
        </div>
        <div class="battery-bar-wrap">
          <div class="battery-bar-fill" style="width:${st.battery}%; background:${st.battery < 30 ? 'var(--accent-red)' : 'var(--accent-green)'}"></div>
        </div>
        <div class="drone-metrics-grid">
          <div>BATTERY: <span style="color:#fff;">${st.battery}%</span></div>
          <div>ALT AGL: <span style="color:#fff;">${st.altitude}m</span></div>
          <div>VELOCITY: <span style="color:#fff;">${st.speed} m/s</span></div>
          <div>MESH SNR: <span style="color:#fff;">${st.comms}%</span></div>
          <div>SWEPT: <span style="color:#fff;">${st.distance}m</span></div>
          <div>TARGETS: <span style="color:#fff;">${st.detections}</span></div>
        </div>
      `;
      this.droneList.appendChild(card);
    }
  }

  /**
   * Generates and downloads formal JSON Incident Report matching Section 13
   */
  exportTacticalReport() {
    const report = {
      missionHeader: {
        system: "AEGIS-SAR Incident Command Simulation",
        classification: "Training simulation",
        incidentType: "Landslide response with fire and flood risk",
        timestampUTC: new Date().toISOString(),
        elapsedTimeSeconds: Math.floor(this.simulationTime || 0),
        swarmConstellation: this.lastDroneStatuses,
      },
      findingsLedger: Array.from(this.displayedDetections.values()).map(d => ({
        trackId: this.getTrackId(d.name),
        objectName: d.name,
        classification: d.classification,
        confidence: d.combinedConfidence,
        dispatchRoute: d.route,
        coordinatesGeo: this.toGeoCoordinates(d.position),
        relativePosition: d.position,
        sensorAudit: {
          thermalKelvin: d.thermal?.temperature,
          opticalConfidence: d.rgb?.confidence,
          acousticDb: d.acoustic?.intensity,
          gasPpm: d.gas?.vocPpm,
        },
        reasoningTrace: d.reasoningTrace,
      })),
      triageDispatchQueue: this.allTriageScores,
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AEGIS_SAR_Incident_Report_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

function formatClassification(cls) {
  return cls
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}
