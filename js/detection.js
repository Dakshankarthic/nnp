/**
 * detection.js — AEGIS-SAR Hybrid Deterministic + ML Detection Pipeline
 * Implements Section 4's dual-path classification: every detection runs
 * through BOTH a deterministic rule engine AND an ML confidence scorer,
 * and agreement/disagreement itself becomes the routing signal.
 */

// ── Triage Weights (configurable per disaster type — Section 8) ──
const TRIAGE_WEIGHTS = {
  earthquake_fire: { w1: 0.30, w2: 0.15, w3: 0.25, w4: 0.20, w5: 0.10 },
  flood:           { w1: 0.25, w2: 0.20, w3: 0.20, w4: 0.15, w5: 0.20 },
  fire:            { w1: 0.35, w2: 0.10, w3: 0.30, w4: 0.15, w5: 0.10 },
};

const DISASTER_TYPE = 'earthquake_fire';

export class DetectionPipeline {
  constructor() {
    this.processedDetections = [];
    this.triageScores = [];
    this.alertQueue = {
      auto_flagged: [],
      needs_review: [],
    };
    this.detectionLog = [];
    this.nextId = 1;
    this.knownDetections = new Map(); // prevent duplicate alerts
    this.cooldowns = new Map(); // cooldown per object name
  }

  /**
   * Process a sensor snapshot through the full pipeline
   */
  process(snapshot) {
    if (!snapshot) return;

    const results = [];

    for (const det of snapshot.detections) {
      // Skip already-detected objects within cooldown
      const lastTime = this.cooldowns.get(det.name);
      if (lastTime && Date.now() - lastTime < 5000) continue;

      // Only process objects that are in FOV and close enough to matter
      if (!det.inFOV && det.distance > 12) continue;
      if (det.type === 'terrain' || det.type === 'infrastructure') continue;

      // ── Path 1: Deterministic Checks (Section 4) ──
      const deterministic = this._deterministicCheck(det);

      // ── Path 2: ML Confidence Scorer ──
      const ml = this._mlScore(det);

      // ── Fusion: Agreement / Disagreement routing ──
      const fusion = this._fuseResults(det, deterministic, ml);

      if (fusion.shouldAlert) {
        this.cooldowns.set(det.name, Date.now());

        const detection = {
          id: this.nextId++,
          timestamp: Date.now(),
          name: det.name,
          type: det.type,
          position: det.position,
          distance: det.distance,
          classification: fusion.classification,
          route: fusion.route,
          combinedConfidence: fusion.combinedConfidence,
          deterministic: deterministic,
          ml: ml,
          reasoningTrace: fusion.reasoningTrace,
          thermal: det.thermal,
          acoustic: det.acoustic,
          metadata: det.metadata,
        };

        results.push(detection);
        this.processedDetections.push(detection);
        this.detectionLog.push(detection);

        // Route to appropriate queue
        this.alertQueue[fusion.route].push(detection);

        // Compute triage for persons
        if (fusion.classification === 'person' || fusion.classification === 'possible_person') {
          const triage = this._computeTriage(det, fusion, snapshot);
          this.triageScores.push(triage);
          detection.triageScore = triage;
        }
      }
    }

    return results;
  }

  /**
   * Deterministic rule engine — Section 4's exact checks
   */
  _deterministicCheck(det) {
    const result = {
      classification: null,
      confidence: 0,
      checks: [],
    };

    // ── Fire check ──
    if (det.fireCheck) {
      const checks = [];
      let score = 0;

      if (det.fireCheck.tempAboveThreshold) {
        checks.push('thermal > 250°C ✓');
        score += 0.4;
      }
      if (det.fireCheck.irFlickerInRange) {
        checks.push(`IR flicker ${det.fireCheck.irFlickerHz.toFixed(1)}Hz (1-3Hz range) ✓`);
        score += 0.3;
      }
      if (det.fireCheck.rgbMotionTexture) {
        checks.push('RGB motion texture ✓');
        score += 0.3;
      }

      if (score >= 0.7) {
        result.classification = 'fire';
        result.confidence = score;
        result.checks = checks;
        return result;
      }
    }

    // ── Flood check ──
    if (det.floodCheck) {
      const checks = [];
      let score = 0;

      if (det.floodCheck.reflectivitySignature > 0.5) {
        checks.push(`reflectivity ${det.floodCheck.reflectivitySignature.toFixed(2)} ✓`);
        score += 0.5;
      }
      if (det.floodCheck.demDelta > 0.5) {
        checks.push(`DEM delta ${det.floodCheck.demDelta.toFixed(1)}m ✓`);
        score += 0.5;
      }

      if (score >= 0.5) {
        result.classification = 'flood';
        result.confidence = score;
        result.checks = checks;
        return result;
      }
    }

    // ── Downed power line check ──
    if (det.powerLineCheck) {
      const checks = [];
      let score = 0;

      if (det.powerLineCheck.linearThermalAnomaly) {
        checks.push('linear thermal anomaly ✓');
        score += 0.5;
      }
      if (det.powerLineCheck.nearGridInfra) {
        checks.push('near mapped grid infrastructure ✓');
        score += 0.5;
      }

      if (score >= 0.5) {
        result.classification = 'downed_power_line';
        result.confidence = score;
        result.checks = checks;
        return result;
      }
    }

    // ── Structural instability check ──
    if (det.structuralCheck) {
      const checks = [];
      let score = 0;

      if (det.structuralCheck.vibrationSignature > 0.2) {
        checks.push(`vibration ${det.structuralCheck.vibrationSignature.toFixed(2)} ✓`);
        score += 0.5;
      }
      if (det.structuralCheck.risk > 0.5) {
        checks.push(`structural risk ${(det.structuralCheck.risk * 100).toFixed(0)}% ✓`);
        score += 0.5;
      }

      if (score >= 0.5) {
        result.classification = 'structural_instability';
        result.confidence = score;
        result.checks = checks;
        return result;
      }
    }

    // ── Person check (thermal + shape) ──
    if (det.thermal.isHumanRange && det.rgb.shapeClassification === 'humanoid') {
      result.classification = 'person';
      result.confidence = 0.85;
      result.checks = [
        `thermal ${det.thermal.temperature}K in human range (308-313K) ✓`,
        'shape: humanoid ✓',
      ];
      if (det.acoustic.detected) {
        result.confidence = Math.min(0.98, result.confidence + 0.1);
        result.checks.push('acoustic confirmation ✓');
      }
      return result;
    }

    // ── False positive pattern ──
    if (det.thermal.temperature > 300 && det.thermal.temperature < 350
        && det.rgb.shapeClassification !== 'humanoid') {
      result.classification = 'heat_false_positive';
      result.confidence = 0.7;
      result.checks = [
        `thermal ${det.thermal.temperature}K (warm but not human-shaped)`,
        `shape: ${det.rgb.shapeClassification} ≠ humanoid`,
      ];
      return result;
    }

    // ── Generic detection ──
    if (det.visibility > 0.3) {
      result.classification = det.type;
      result.confidence = det.visibility * 0.6;
      result.checks = [`type: ${det.type}`, `visibility: ${(det.visibility * 100).toFixed(0)}%`];
    }

    return result;
  }

  /**
   * ML confidence scorer (simulated — generates realistic values
   * based on sensor readings rather than running a real model)
   */
  _mlScore(det) {
    const result = {
      classification: null,
      confidence: 0,
      features: [],
    };

    // Combine sensor confidences
    const thermalConf = det.thermal.confidence;
    const rgbConf = det.rgb.confidence;
    const acousticConf = det.acoustic.confidence;

    // Person detection (cross-attention fusion of thermal + RGB)
    if (det.type === 'person') {
      const fusedConf = thermalConf * 0.4 + rgbConf * 0.35 + acousticConf * 0.25;
      result.classification = 'person';
      result.confidence = Math.min(0.96, fusedConf + Math.random() * 0.05);
      result.features = [
        `thermal_blob: ${(thermalConf * 100).toFixed(0)}%`,
        `rgb_shape: ${(rgbConf * 100).toFixed(0)}%`,
        acousticConf > 0 ? `acoustic: ${(acousticConf * 100).toFixed(0)}%` : 'acoustic: none',
      ];
    }
    // False positive — ML might be confused by warmth
    else if (det.type === 'false_positive') {
      // Thermal says "maybe person", RGB says "no"
      const thermalMaybe = det.thermal.temperature > 300 ? 0.45 + Math.random() * 0.15 : 0.1;
      const rgbNo = 0.15 + Math.random() * 0.1; // low person confidence on RGB
      result.classification = Math.random() > 0.6 ? 'person' : 'unknown';
      result.confidence = thermalMaybe * 0.5 + rgbNo * 0.5;
      result.features = [
        `thermal_blob: ${(thermalMaybe * 100).toFixed(0)}% (warm, ambiguous)`,
        `rgb_shape: ${(rgbNo * 100).toFixed(0)}% (non-humanoid)`,
      ];
    }
    // Fire
    else if (det.type === 'fire') {
      result.classification = 'fire';
      result.confidence = Math.min(0.95, thermalConf * 0.5 + rgbConf * 0.3 + 0.2);
      result.features = [
        `thermal_hotspot: ${(thermalConf * 100).toFixed(0)}%`,
        `rgb_flame_texture: ${(rgbConf * 100).toFixed(0)}%`,
      ];
    }
    // Power line
    else if (det.type === 'power_line') {
      result.classification = 'downed_power_line';
      result.confidence = Math.min(0.85, thermalConf * 0.4 + rgbConf * 0.4 + 0.15);
      result.features = [`linear_detection: ${(rgbConf * 100).toFixed(0)}%`];
    }
    // Structure
    else if (det.type === 'structure') {
      result.classification = 'damaged_structure';
      result.confidence = Math.min(0.8, rgbConf * 0.6 + 0.2);
      result.features = [`structure_damage: ${(rgbConf * 100).toFixed(0)}%`];
    }
    // Flood
    else if (det.type === 'flood') {
      result.classification = 'flood';
      result.confidence = Math.min(0.88, rgbConf * 0.5 + thermalConf * 0.3 + 0.15);
      result.features = [`water_surface: ${(rgbConf * 100).toFixed(0)}%`];
    }
    // Debris
    else {
      result.classification = det.type;
      result.confidence = Math.max(0.3, det.visibility * 0.5);
      result.features = [`generic: ${(det.visibility * 100).toFixed(0)}%`];
    }

    return result;
  }

  /**
   * Fusion rule: agreement → auto_flagged, disagreement → needs_review
   */
  _fuseResults(det, deterministic, ml) {
    const trace = [];
    let route, classification, combinedConfidence;

    const detClass = deterministic.classification;
    const mlClass = ml.classification;
    const bothAgree = detClass === mlClass
      || (detClass === 'person' && mlClass === 'person')
      || (detClass === 'fire' && mlClass === 'fire')
      || (detClass === 'downed_power_line' && mlClass === 'downed_power_line')
      || (detClass === 'flood' && mlClass === 'flood');

    if (bothAgree && deterministic.confidence > 0.5 && ml.confidence > 0.5) {
      // AGREEMENT — high confidence auto-flag
      route = 'auto_flagged';
      classification = detClass || mlClass;
      combinedConfidence = (deterministic.confidence + ml.confidence) / 2;
      trace.push(`✓ AGREEMENT: both paths → "${classification}"`);
      trace.push(`  deterministic: ${(deterministic.confidence * 100).toFixed(0)}%`);
      trace.push(`  ml: ${(ml.confidence * 100).toFixed(0)}%`);
      for (const c of deterministic.checks) trace.push(`  rule: ${c}`);
    } else if (detClass === 'heat_false_positive' && mlClass === 'person') {
      // KEY DEMO MOMENT: thermal says warm, ML says person, but deterministic
      // says shape is wrong — this disagreement is the whole point
      route = 'needs_review';
      classification = 'heat_false_positive';
      combinedConfidence = (deterministic.confidence + ml.confidence) / 2;
      trace.push(`⚠ DISAGREEMENT: deterministic → "heat_false_positive" vs ML → "person"`);
      trace.push(`  This is WHY you need RGB+thermal fusion, not thermal alone`);
      trace.push(`  Deterministic: warm (${det.thermal.temperature}K) but NOT human-shaped`);
      trace.push(`  ML: confused by thermal blob alone`);
      trace.push(`  → routed to human review with both traces attached`);
    } else if (detClass && mlClass && detClass !== mlClass) {
      // Generic disagreement
      route = 'needs_review';
      classification = deterministic.confidence > ml.confidence ? detClass : mlClass;
      combinedConfidence = Math.max(deterministic.confidence, ml.confidence) * 0.7;
      trace.push(`⚠ DISAGREEMENT: deterministic → "${detClass}" vs ML → "${mlClass}"`);
      trace.push(`  using higher-confidence path: "${classification}"`);
      trace.push(`  → routed to human review`);
    } else {
      // Low confidence or only one path has a result
      const bestClass = detClass || mlClass;
      if (!bestClass) return { shouldAlert: false };

      const bestConf = Math.max(deterministic.confidence, ml.confidence);
      if (bestConf < 0.3) return { shouldAlert: false };

      route = bestConf > 0.7 ? 'auto_flagged' : 'needs_review';
      classification = bestClass;
      combinedConfidence = bestConf;
      trace.push(`single-path detection: "${classification}" at ${(bestConf * 100).toFixed(0)}%`);
    }

    return {
      shouldAlert: true,
      route,
      classification,
      combinedConfidence: Math.min(0.99, combinedConfidence),
      reasoningTrace: trace,
    };
  }

  /**
   * Triage Score Engine — Section 8
   * TriageScore = w1·thermal_conf + w2·acoustic_conf + w3·hazard_proximity
   *             + w4·structural_risk + w5·time_estimate
   */
  _computeTriage(det, fusion, snapshot) {
    const w = TRIAGE_WEIGHTS[DISASTER_TYPE];

    const thermalConf = det.thermal.confidence;
    const acousticConf = det.acoustic.confidence;

    // Hazard proximity — how close is the nearest hazard to this person?
    let nearestHazardDist = Infinity;
    let nearestHazardType = 'none';
    for (const other of snapshot.detections) {
      if (other.name === det.name) continue;
      if (other.type === 'fire' || other.type === 'power_line' || other.type === 'flood') {
        const dist = det.position.distanceTo(other.position);
        if (dist < nearestHazardDist) {
          nearestHazardDist = dist;
          nearestHazardType = other.type;
        }
      }
    }
    const hazardProximity = nearestHazardDist < 20
      ? 1 - nearestHazardDist / 20
      : 0;

    // Structural risk of nearby structures
    let structuralRisk = 0;
    for (const other of snapshot.detections) {
      if (other.structuralCheck && det.position.distanceTo(other.position) < 10) {
        structuralRisk = Math.max(structuralRisk, other.structuralCheck.risk);
      }
    }

    // Time estimate (simulated — based on detection recency)
    const timeFactor = 0.5 + Math.random() * 0.3;

    const score =
      w.w1 * thermalConf +
      w.w2 * acousticConf +
      w.w3 * hazardProximity +
      w.w4 * structuralRisk +
      w.w5 * timeFactor;

    const normalizedScore = Math.min(100, Math.round(score * 100));

    return {
      id: fusion.classification + '_' + det.name,
      sourceName: det.name,
      position: det.position.clone(),
      name: det.metadata?.label || det.name,
      score: normalizedScore,
      priority: normalizedScore > 70 ? 'critical' : normalizedScore > 40 ? 'moderate' : 'low',
      components: {
        thermal: thermalConf,
        acoustic: acousticConf,
        hazardProximity: hazardProximity,
        nearestHazard: nearestHazardType,
        nearestHazardDist: nearestHazardDist,
        structuralRisk: structuralRisk,
        timeEstimate: timeFactor,
      },
      weights: w,
      formula: `T = ${w.w1}×${(thermalConf * 100).toFixed(0)}% + ${w.w2}×${(acousticConf * 100).toFixed(0)}% + ${w.w3}×${(hazardProximity * 100).toFixed(0)}% + ${w.w4}×${(structuralRisk * 100).toFixed(0)}% + ${w.w5}×${(timeFactor * 100).toFixed(0)}%`,
    };
  }

  getLatestDetections(count = 20) {
    return this.processedDetections.slice(-count);
  }

  getTriageScores() {
    // Return unique, sorted by score descending
    const unique = new Map();
    for (const t of this.triageScores) {
      const existing = unique.get(t.id);
      if (!existing || t.score > existing.score) {
        unique.set(t.id, t);
      }
    }
    return [...unique.values()].sort((a, b) => b.score - a.score);
  }

  getAlertCounts() {
    return {
      auto_flagged: this.alertQueue.auto_flagged.length,
      needs_review: this.alertQueue.needs_review.length,
      total: this.processedDetections.length,
    };
  }
}
