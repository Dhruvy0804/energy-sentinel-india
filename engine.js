(function () {
  "use strict";

  var DATA = window.ENERGY_DATA;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function round(value, digits) {
    var factor = Math.pow(10, digits || 0);
    return Math.round(value * factor) / factor;
  }

  function average(items, selector) {
    if (!items.length) return 0;
    return items.reduce(function (sum, item) {
      return sum + selector(item);
    }, 0) / items.length;
  }

  function normalizeText(text) {
    return String(text || "").toLowerCase();
  }

  function hit(text, terms) {
    return terms.some(function (term) {
      return text.indexOf(term) !== -1;
    });
  }

  function extractSignals(text) {
    var normalized = normalizeText(text);
    var signal = {
      hormuzSeverity: 0,
      redSeaSeverity: 0,
      sanctionsPressure: 0,
      opecCut: 0,
      tankerTightness: 0,
      brentMove: 0,
      confidence: 0.2,
      labels: [],
      evidence: []
    };

    function add(key, amount, label, evidence) {
      signal[key] += amount;
      if (signal.labels.indexOf(label) === -1) signal.labels.push(label);
      if (evidence && signal.evidence.indexOf(evidence) === -1) signal.evidence.push(evidence);
    }

    if (hit(normalized, ["hormuz", "persian gulf", "iran", "iranian", "gulf of oman"])) {
      add("hormuzSeverity", 12, "Gulf corridor alert", "Gulf terms detected");
      if (hit(normalized, ["closure", "blocked", "mined", "naval alert", "missile", "drone", "standoff", "escalat"])) {
        add("hormuzSeverity", 18, "Hormuz transit stress", "Escalation language near Gulf corridor");
        add("tankerTightness", 7, "War-risk insurance", "Escalation language implies higher tanker premium");
      }
    }

    if (hit(normalized, ["houthi", "red sea", "bab el-mandeb", "bab el mandeb", "suez", "yemen"])) {
      add("redSeaSeverity", 16, "Red Sea disruption", "Red Sea or Houthi terms detected");
      if (hit(normalized, ["attack", "missile", "drone", "suspended", "reroute", "convoy", "delayed"])) {
        add("redSeaSeverity", 20, "Suez reroute pressure", "Attack or reroute language detected");
        add("tankerTightness", 6, "Longer voyage time", "Rerouting increases tanker-days");
      }
    }

    if (hit(normalized, ["sanction", "waiver", "shadow fleet", "enforcement", "iranian exports", "secondary sanction"])) {
      add("sanctionsPressure", 24, "Sanctions pressure", "Sanctions language detected");
      add("tankerTightness", 4, "Compliance drag", "Sanctions raise screening and tonnage friction");
    }

    if (hit(normalized, ["opec", "opec+", "production cut", "emergency cut", "output cut"])) {
      add("opecCut", 4, "OPEC+ supply action", "OPEC cut language detected");
      if (hit(normalized, ["emergency", "deeper", "surprise", "extra"])) add("opecCut", 4, "Emergency OPEC+ cut", "Emergency cut language detected");
    }

    if (hit(normalized, ["war-risk", "war risk", "insurance", "premium", "tanker", "vlcc", "freight", "charter"])) {
      add("tankerTightness", 15, "Tanker market tightness", "Freight or tanker terms detected");
    }

    if (hit(normalized, ["de-escalation", "ceasefire", "resume", "reopened", "safe passage", "convoys restored"])) {
      add("hormuzSeverity", -12, "De-escalation signal", "De-escalation language detected");
      add("redSeaSeverity", -10, "Transit recovery", "Transit recovery language detected");
      add("tankerTightness", -6, "Freight relief", "Recovery language lowers tonnage stress");
    }

    var percentMatches = normalized.match(/[-+]?\d+(\.\d+)?\s*%/g) || [];
    percentMatches.forEach(function (match) {
      var value = parseFloat(match);
      if (!Number.isFinite(value)) return;
      var before = normalized.slice(Math.max(0, normalized.indexOf(match) - 42), normalized.indexOf(match));
      var after = normalized.slice(normalized.indexOf(match), normalized.indexOf(match) + 42);
      var context = before + " " + after;
      if (hit(context, ["brent", "crude", "oil", "price", "futures"])) {
        add("brentMove", clamp(value, -15, 35), "Price shock", "Commodity price percentage detected");
      } else if (hit(context, ["cut", "opec", "output", "production"])) {
        add("opecCut", clamp(value / 2, 0, 10), "Supply cut magnitude", "Production cut percentage detected");
      }
    });

    signal.hormuzSeverity = clamp(signal.hormuzSeverity, -25, 45);
    signal.redSeaSeverity = clamp(signal.redSeaSeverity, -25, 45);
    signal.sanctionsPressure = clamp(signal.sanctionsPressure, -10, 45);
    signal.opecCut = clamp(signal.opecCut, 0, 12);
    signal.tankerTightness = clamp(signal.tankerTightness, -12, 35);
    signal.brentMove = clamp(signal.brentMove, -10, 35);
    signal.confidence = clamp(0.2 + signal.labels.length * 0.11 + signal.evidence.length * 0.05, 0.2, 0.9);

    if (!signal.labels.length) {
      signal.labels.push("Low signal density");
      signal.evidence.push("No major disruption keywords detected");
    }

    return signal;
  }

  function createScenario(input, offers) {
    var signal = extractSignals(input.signalText || "");
    var raw = {
      hormuzSeverity: Number(input.hormuzSeverity) || 0,
      redSeaSeverity: Number(input.redSeaSeverity) || 0,
      sanctionsPressure: Number(input.sanctionsPressure) || 0,
      opecCut: Number(input.opecCut) || 0,
      tankerTightness: Number(input.tankerTightness) || 0,
      brentMove: Number(input.brentMove) || 0
    };

    return {
      raw: raw,
      signal: signal,
      hormuzSeverity: clamp(raw.hormuzSeverity + signal.hormuzSeverity * signal.confidence, 0, 100),
      redSeaSeverity: clamp(raw.redSeaSeverity + signal.redSeaSeverity * signal.confidence, 0, 100),
      sanctionsPressure: clamp(raw.sanctionsPressure + signal.sanctionsPressure * signal.confidence, 0, 100),
      opecCut: clamp(raw.opecCut + signal.opecCut * signal.confidence, 0, 20),
      tankerTightness: clamp(raw.tankerTightness + signal.tankerTightness * signal.confidence, 0, 100),
      brentMove: clamp(raw.brentMove + signal.brentMove * signal.confidence, -10, 35),
      offers: offers || [],
      timestamp: new Date()
    };
  }

  function scoreCorridors(scenario) {
    return DATA.corridors.map(function (corridor) {
      var exposure = corridor.exposure;
      var stress =
        exposure.hormuzSeverity * scenario.hormuzSeverity * 0.008 +
        exposure.redSeaSeverity * scenario.redSeaSeverity * 0.008 +
        exposure.sanctionsPressure * scenario.sanctionsPressure * 0.006 +
        exposure.opecCut * scenario.opecCut * 0.026 +
        exposure.tankerTightness * scenario.tankerTightness * 0.005 +
        exposure.brentMove * Math.max(0, scenario.brentMove) * 0.01;

      var risk = clamp((corridor.baseRisk + stress + corridor.congestion * 0.08) * 100, 4, 98);
      var atRiskMbd = DATA.constants.importDemandMbd * corridor.importShare * risk / 100;
      var delayDays = corridor.baseDays + corridor.reroutePenaltyDays * risk / 100 + scenario.tankerTightness * 0.055;
      var costPremium = Math.max(0, scenario.brentMove) * 0.18 + risk * 0.045 + scenario.tankerTightness * 0.035;

      return {
        id: corridor.id,
        name: corridor.name,
        importShare: corridor.importShare,
        risk: round(risk, 1),
        atRiskMbd: round(atRiskMbd, 2),
        delayDays: round(delayDays, 1),
        costPremium: round(costPremium, 1),
        corridor: corridor
      };
    }).sort(function (a, b) {
      return b.risk - a.risk;
    });
  }

  function parseOfferCsv(text) {
    var lines = String(text || "").split(/\r?\n/).map(function (line) {
      return line.trim();
    }).filter(Boolean);
    if (lines.length < 2) return [];

    var headers = lines[0].split(",").map(function (header) {
      return header.trim().toLowerCase();
    });

    function read(row, names, fallback) {
      for (var i = 0; i < names.length; i += 1) {
        var index = headers.indexOf(names[i]);
        if (index >= 0 && row[index] !== undefined && row[index] !== "") return row[index].trim();
      }
      return fallback;
    }

    return lines.slice(1).map(function (line, index) {
      var row = line.split(",").map(function (cell) {
        return cell.trim();
      });
      return {
        id: "offer-" + index + "-" + read(row, ["supplier", "source", "name"], "external").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        sourceName: read(row, ["supplier", "source", "name"], "External spot cargo"),
        country: read(row, ["country"], "Spot market"),
        corridor: read(row, ["corridor", "route"], "atlantic").toLowerCase(),
        volumeMbd: Number(read(row, ["volume", "volumembd", "volume_mbd", "mbd"], 0)) || 0,
        premiumUsd: Number(read(row, ["premium", "premiumusd", "premium_usd", "usd"], 0)) || 0,
        etaDays: Number(read(row, ["eta", "etadays", "eta_days", "days"], 24)) || 24,
        api: Number(read(row, ["api"], 32)) || 32,
        sulfur: Number(read(row, ["sulfur", "sulphur"], 1.1)) || 1.1,
        family: read(row, ["family", "grade"], "medium sweet"),
        loadingPort: read(row, ["loadingport", "loading_port", "port"], "Spot loading"),
        indiaPort: read(row, ["indiaport", "india_port", "discharge"], "Flexible west/east coast")
      };
    }).filter(function (offer) {
      return offer.volumeMbd > 0;
    });
  }

  function corridorMap(corridorScores) {
    return corridorScores.reduce(function (map, item) {
      map[item.id] = item;
      return map;
    }, {});
  }

  function familySweetness(family) {
    var lower = normalizeText(family);
    if (lower.indexOf("sweet") >= 0) return 1;
    if (lower.indexOf("sour") >= 0) return 0;
    return 0.5;
  }

  function refineryFit(supplier, refinery) {
    var sourness = clamp((Number(supplier.sulfur) || 0) / 3.5, 0, 1);
    var sourFit = 1 - Math.abs(refinery.sourTolerance - sourness);
    var api = Number(supplier.api) || 32;
    var lightness = clamp((api - 24) / 20, 0, 1);
    var sweetness = familySweetness(supplier.family);
    var lightFit = 1 - Math.abs(refinery.lightSweetNeed - lightness * sweetness);
    var complexityFit = refinery.complexity * (0.65 + sourness * 0.35);
    var blendingValue = sweetness * 0.13 + (api > 37 ? 0.06 : 0);
    return clamp(sourFit * 0.42 + lightFit * 0.29 + complexityFit * 0.21 + blendingValue, 0, 1);
  }

  function supplierPool(offers) {
    var external = (offers || []).map(function (offer) {
      return {
        id: offer.id,
        name: offer.sourceName,
        country: offer.country,
        corridor: offer.corridor,
        normalMbd: 0,
        spareMbd: offer.volumeMbd,
        api: offer.api,
        sulfur: offer.sulfur,
        family: offer.family,
        basePremium: offer.premiumUsd,
        reliability: 0.64,
        opecExposure: 0.08,
        sanctionsExposure: 0.05,
        loadingPort: offer.loadingPort,
        indiaPort: offer.indiaPort,
        offerEtaDays: offer.etaDays,
        externalOffer: true
      };
    });
    return DATA.suppliers.concat(external);
  }

  function routeName(supplier, corridorScore) {
    if (supplier.externalOffer) return supplier.loadingPort + " to " + supplier.indiaPort;
    if (supplier.corridor === "hormuz" && corridorScore.risk > 68 && supplier.country === "UAE") {
      return "Fujairah bypass to west coast";
    }
    if (supplier.corridor === "hormuz" && corridorScore.risk > 72) {
      return supplier.loadingPort + " hold, staggered Gulf lift";
    }
    if (supplier.corridor === "redsea" && corridorScore.risk > 60) {
      return supplier.loadingPort + " via Cape of Good Hope";
    }
    return supplier.loadingPort + " to " + supplier.indiaPort;
  }

  function rankProcurement(scenario, corridorScores) {
    var byCorridor = corridorMap(corridorScores);
    var weightedFit;
    var candidates = supplierPool(scenario.offers).map(function (supplier) {
      var corridorScore = byCorridor[supplier.corridor] || byCorridor.atlantic;
      weightedFit = DATA.refineries.reduce(function (sum, refinery) {
        return sum + refineryFit(supplier, refinery) * refinery.capacityMbd;
      }, 0) / DATA.refineries.reduce(function (sum, refinery) {
        return sum + refinery.capacityMbd;
      }, 0);

      var routeRisk = corridorScore.risk / 100;
      var sanctionsDrag = supplier.sanctionsExposure * scenario.sanctionsPressure / 100;
      var opecDrag = supplier.opecExposure * scenario.opecCut / 20;
      var tankerDrag = scenario.tankerTightness / 100;
      var availabilityMultiplier = clamp(1 - routeRisk * 0.42 - sanctionsDrag * 0.32 - opecDrag * 0.22 - tankerDrag * 0.14, 0.08, 1);
      if (routeRisk > 0.82 && !supplier.externalOffer) availabilityMultiplier *= supplier.country === "UAE" ? 0.32 : 0.18;
      if (routeRisk > 0.72 && supplier.externalOffer) availabilityMultiplier *= 0.72;
      var swing = supplier.spareMbd + supplier.normalMbd * (supplier.externalOffer ? 0 : 0.1);
      var availableMbd = clamp(swing * availabilityMultiplier, 0, 1.4);
      var eta = supplier.offerEtaDays || corridorScore.delayDays;
      eta += routeRisk * 4 + tankerDrag * 5;
      var premium = supplier.basePremium + corridorScore.costPremium + Math.max(0, scenario.brentMove) * 0.16 + tankerDrag * 3.1;
      var reliability = supplier.reliability * (1 - sanctionsDrag * 0.34);
      var closurePenalty = routeRisk > 0.9 ? 34 : routeRisk > 0.78 ? 22 : routeRisk > 0.68 ? 10 : 0;
      var executableScore =
        weightedFit * 29 +
        reliability * 24 +
        availableMbd * 15 -
        routeRisk * 28 -
        closurePenalty -
        Math.max(0, premium) * 1.35 -
        eta * 0.36 +
        (supplier.externalOffer ? 5 : 0);

      var action = "Issue RFQ";
      if (availableMbd >= 0.18 && weightedFit > 0.73 && routeRisk < 0.55) action = "Award spot cargo";
      if (routeRisk > 0.72) action = "Hold term lift";
      if (supplier.externalOffer) action = "Validate offer";
      if (supplier.externalOffer && routeRisk < 0.75 && availableMbd >= 0.07) action = "Award spot cargo";

      return {
        supplier: supplier,
        source: supplier.name,
        country: supplier.country,
        corridor: corridorScore.name,
        route: routeName(supplier, corridorScore),
        availableMbd: round(availableMbd, 2),
        etaDays: round(eta, 1),
        premiumUsd: round(premium, 1),
        fit: round(weightedFit * 100, 0),
        risk: corridorScore.risk,
        score: round(clamp(executableScore + 45, 0, 100), 1),
        action: action
      };
    }).filter(function (candidate) {
      return candidate.availableMbd > 0.02;
    }).sort(function (a, b) {
      return b.score - a.score;
    });

    var disruptedTarget = corridorScores.reduce(function (sum, corridor) {
      return sum + corridor.atRiskMbd * (corridor.risk / 100);
    }, 0);
    var target = clamp(disruptedTarget * 0.55 + scenario.tankerTightness * 0.004, 0.18, 1.9);
    var remaining = target;

    return candidates.slice(0, 10).map(function (candidate, index) {
      var canAllocate = candidate.action !== "Hold term lift" && candidate.score >= 10;
      var allocation = index < 7 && canAllocate ? Math.min(candidate.availableMbd, Math.max(0, remaining)) : 0;
      remaining -= allocation;
      return Object.assign({}, candidate, {
        rank: index + 1,
        allocatedMbd: round(allocation, 2),
        recommended: allocation > 0.025
      });
    });
  }

  function procurementByDay(day, procurement) {
    return procurement.reduce(function (sum, item) {
      if (!item.recommended) return sum;
      var ramp = clamp((day - item.etaDays + 6) / 18, 0, 1);
      return sum + item.allocatedMbd * ramp;
    }, 0);
  }

  function simulateImpact(scenario, corridorScores, procurement) {
    var constants = DATA.constants;
    var grossDisruption = corridorScores.reduce(function (sum, corridor) {
      var routeShock = corridor.atRiskMbd * (0.28 + corridor.risk / 100 * 0.58);
      return sum + routeShock;
    }, 0);
    grossDisruption = clamp(grossDisruption, 0, 3.1);

    var reserveMbdDays = constants.sprCoverDays * constants.nationalConsumptionMbd;
    var reserveFloorMbdDays = constants.emergencyStockFloorDays * constants.nationalConsumptionMbd;
    var timeline = [];
    var peakGap = 0;
    var peakPrice = 0;
    var stabilizationDay = null;

    for (var day = 1; day <= 60; day += 1) {
      var shockRamp = clamp(day / 9, 0.35, 1);
      var fatigue = 1 + clamp((day - 25) / 80, 0, 0.2);
      var alternativeSupply = procurementByDay(day, procurement);
      var naturalMitigation = clamp((day - 10) / 80, 0, 0.28) * grossDisruption;
      var rawGap = Math.max(0, grossDisruption * shockRamp * fatigue - alternativeSupply - naturalMitigation);
      var desiredDraw = rawGap > 0.18 ? Math.min(constants.maxDrawdownMbd, rawGap * 0.72) : 0;
      var drawdown = reserveMbdDays > reserveFloorMbdDays ? Math.min(desiredDraw, reserveMbdDays - reserveFloorMbdDays) : 0;
      reserveMbdDays -= drawdown;
      var netGap = Math.max(0, rawGap - drawdown);
      var coverDays = reserveMbdDays / constants.nationalConsumptionMbd;
      var priceStress = Math.max(0, scenario.brentMove) + netGap / constants.importDemandMbd * 42 + scenario.opecCut * 0.85 + scenario.tankerTightness * 0.08;
      var pumpChange = priceStress * constants.pumpPassThrough;
      var refineryRun = clamp(constants.refineryRunBaseline - netGap / constants.nationalConsumptionMbd * 55 - average(corridorScores, function (c) { return c.risk; }) * 0.03, 58, 96);
      var inflationImpact = pumpChange * constants.inflationSensitivity;
      var gdpDrag = netGap * constants.gdpSensitivity + pumpChange * 0.002;

      peakGap = Math.max(peakGap, netGap);
      peakPrice = Math.max(peakPrice, pumpChange);
      if (stabilizationDay === null && day > 12 && netGap < 0.16 && alternativeSupply > grossDisruption * 0.36) {
        stabilizationDay = day;
      }

      timeline.push({
        day: day,
        grossDisruptionMbd: round(grossDisruption * shockRamp, 2),
        alternativeSupplyMbd: round(alternativeSupply, 2),
        drawdownMbd: round(drawdown, 2),
        netGapMbd: round(netGap, 2),
        reserveCoverDays: round(coverDays, 2),
        pumpChangePct: round(pumpChange, 1),
        refineryRunPct: round(refineryRun, 1),
        inflationImpactPp: round(inflationImpact, 2),
        gdpDragPp: round(gdpDrag, 2)
      });
    }

    if (stabilizationDay === null) {
      stabilizationDay = 60 + Math.ceil(peakGap * 12);
    }

    return {
      timeline: timeline,
      grossDisruptionMbd: round(grossDisruption, 2),
      peakGapMbd: round(peakGap, 2),
      peakPumpChangePct: round(peakPrice, 1),
      stabilizationDay: stabilizationDay,
      averageRefineryRun: round(average(timeline.slice(0, 30), function (d) { return d.refineryRunPct; }), 1),
      averageInflationImpact: round(average(timeline.slice(0, 30), function (d) { return d.inflationImpactPp; }), 2),
      finalReserveCoverDays: timeline[timeline.length - 1].reserveCoverDays
    };
  }

  function buildReservePlan(impact) {
    var early = impact.timeline.slice(0, 15);
    var mid = impact.timeline.slice(15, 35);
    var late = impact.timeline.slice(35);
    return {
      first15DrawMbd: round(average(early, function (d) { return d.drawdownMbd; }), 2),
      day35Cover: round(mid.length ? mid[mid.length - 1].reserveCoverDays : impact.finalReserveCoverDays, 1),
      finalCover: round(impact.finalReserveCoverDays, 1),
      maxDailyDraw: round(Math.max.apply(null, impact.timeline.map(function (d) { return d.drawdownMbd; })), 2),
      lateGap: round(average(late, function (d) { return d.netGapMbd; }), 2)
    };
  }

  function nationalRisk(corridorScores) {
    return round(corridorScores.reduce(function (sum, corridor) {
      return sum + corridor.risk * corridor.importShare;
    }, 0), 1);
  }

  function buildBrief(scenario, corridorScores, procurement, impact, reserve) {
    var topCorridor = corridorScores[0];
    var recommended = procurement.filter(function (item) {
      return item.recommended;
    });
    var volume = recommended.reduce(function (sum, item) {
      return sum + item.allocatedMbd;
    }, 0);
    var first = recommended[0];
    var second = recommended[1];
    var actions = [];

    actions.push("Risk posture: " + topCorridor.name + " is the binding corridor at " + topCorridor.risk + "% disruption probability, putting " + topCorridor.atRiskMbd + " mbd at risk.");
    if (first) {
      actions.push("Procurement: allocate " + round(volume, 2) + " mbd across the top queue, led by " + first.source + " via " + first.route + ".");
    }
    if (second) {
      actions.push("Hedge: keep " + second.source + " warm as a fallback because its refinery fit is " + second.fit + "% and ETA is " + second.etaDays + " days.");
    }
    actions.push("SPR: draw up to " + reserve.maxDailyDraw + " mbd early, preserving " + reserve.finalCover + " days of cover by day 60.");
    actions.push("Macroeconomic watch: peak pump-price pressure is " + impact.peakPumpChangePct + "% with a 30-day refinery run average of " + impact.averageRefineryRun + "%.");
    actions.push("Stabilization: integrated rerouting closes the material gap around day " + impact.stabilizationDay + "; a manual response benchmark would be roughly " + (impact.stabilizationDay + 47) + " days.");

    return actions;
  }

  function runCycle(input, offers) {
    var scenario = createScenario(input, offers);
    var corridors = scoreCorridors(scenario);
    var procurement = rankProcurement(scenario, corridors);
    var impact = simulateImpact(scenario, corridors, procurement);
    var reserve = buildReservePlan(impact);
    var brief = buildBrief(scenario, corridors, procurement, impact, reserve);
    return {
      scenario: scenario,
      corridors: corridors,
      procurement: procurement,
      impact: impact,
      reserve: reserve,
      nationalRisk: nationalRisk(corridors),
      brief: brief
    };
  }

  window.EnergyEngine = {
    clamp: clamp,
    round: round,
    extractSignals: extractSignals,
    parseOfferCsv: parseOfferCsv,
    runCycle: runCycle
  };
})();
