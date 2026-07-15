(function () {
  "use strict";

  var DATA = window.ENERGY_DATA;
  var Engine = window.EnergyEngine;
  var NS = "http://www.w3.org/2000/svg";
  var state = {
    offers: [],
    latest: null,
    shockIndex: 0
  };

  function $(id) {
    return document.getElementById(id);
  }

  function createSvg(tag, attrs) {
    var element = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (key) {
      element.setAttribute(key, attrs[key]);
    });
    return element;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function fmt(value, digits) {
    return Engine.round(value, digits === undefined ? 1 : digits).toLocaleString(undefined, {
      maximumFractionDigits: digits === undefined ? 1 : digits,
      minimumFractionDigits: digits === undefined ? 0 : digits
    });
  }

  function riskColor(risk) {
    if (risk >= 76) return "#c2412d";
    if (risk >= 58) return "#d97706";
    if (risk >= 38) return "#b58a00";
    return "#13856f";
  }

  function riskLabel(risk) {
    if (risk >= 76) return "Critical";
    if (risk >= 58) return "High";
    if (risk >= 38) return "Guarded";
    return "Stable";
  }

  function routeShortName(id) {
    return {
      hormuz: "Hormuz Gulf",
      redsea: "Red Sea / Suez",
      russia: "Russia / Black Sea",
      atlantic: "Atlantic / Cape",
      asean: "ASEAN East"
    }[id] || id;
  }

  function routeLabelPosition(id) {
    return {
      russia: { x: 540, y: 96, w: 154 },
      redsea: { x: 544, y: 169, w: 144 },
      hormuz: { x: 585, y: 222, w: 128 },
      atlantic: { x: 450, y: 302, w: 140 },
      asean: { x: 795, y: 309, w: 112 }
    }[id] || { x: 480, y: 210, w: 130 };
  }

  function linePath(points) {
    return points.map(function (point, index) {
      return (index === 0 ? "M" : "L") + point[0] + " " + point[1];
    }).join(" ");
  }

  function areaPath(points, baseline) {
    if (!points.length) return "";
    return linePath(points) + " L " + points[points.length - 1][0] + " " + baseline + " L " + points[0][0] + " " + baseline + " Z";
  }

  function getInputs() {
    return {
      signalText: $("signalText").value,
      hormuzSeverity: Number($("hormuzSeverity").value),
      redSeaSeverity: Number($("redSeaSeverity").value),
      sanctionsPressure: Number($("sanctionsPressure").value),
      opecCut: Number($("opecCut").value),
      tankerTightness: Number($("tankerTightness").value),
      brentMove: Number($("brentMove").value)
    };
  }

  function setSliderOutputs() {
    [
      ["hormuzSeverity", "%"],
      ["redSeaSeverity", "%"],
      ["sanctionsPressure", "%"],
      ["opecCut", "%"],
      ["tankerTightness", "%"],
      ["brentMove", "%"]
    ].forEach(function (pair) {
      $(pair[0] + "Out").textContent = $(pair[0]).value + pair[1];
    });
  }

  function setPreset(presetId) {
    var preset = DATA.presets[presetId] || DATA.presets.baseline;
    Object.keys(preset).forEach(function (key) {
      if (key === "text") return;
      if ($(key)) $(key).value = preset[key];
    });
    $("signalText").value = preset.text;
    setSliderOutputs();
    runCycle();
  }

  function renderStatus(result) {
    $("nationalRisk").textContent = fmt(result.nationalRisk, 1) + "%";
    $("riskDelta").textContent = riskLabel(result.nationalRisk) + " national posture";
    $("supplyGap").textContent = fmt(result.impact.peakGapMbd, 2) + " mbd";
    $("gapFoot").textContent = "Gross disruption " + fmt(result.impact.grossDisruptionMbd, 2) + " mbd";
    $("sprCover").textContent = fmt(result.reserve.finalCover, 1) + " days";
    $("sprFoot").textContent = "Max draw " + fmt(result.reserve.maxDailyDraw, 2) + " mbd";
    $("stabilization").textContent = "Day " + result.impact.stabilizationDay;
    $("stabFoot").textContent = "Manual benchmark day " + (result.impact.stabilizationDay + 47);
    $("cycleStamp").textContent = result.scenario.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    $("riskMeter").style.width = Math.min(100, result.nationalRisk) + "%";
    $("riskMeter").style.background = riskColor(result.nationalRisk);
    $("gapMeter").style.width = Math.min(100, result.impact.peakGapMbd / 3.2 * 100) + "%";
    $("gapMeter").style.background = riskColor(result.impact.peakGapMbd / 3.2 * 100);
    $("sprMeter").style.width = Math.min(100, result.reserve.finalCover / 9.5 * 100) + "%";
    $("stabMeter").style.width = Math.min(100, result.impact.stabilizationDay / 120 * 100) + "%";
    $("stabMeter").style.background = riskColor(result.impact.stabilizationDay / 120 * 100);
  }

  function renderBadges(result) {
    var badges = $("scenarioBadges");
    badges.innerHTML = "";
    result.scenario.signal.labels.slice(0, 4).forEach(function (label) {
      var badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = label;
      badges.appendChild(badge);
    });
  }

  function renderNetwork(result) {
    var svg = $("networkMap");
    clear(svg);

    svg.appendChild(createSvg("rect", {
      x: 0,
      y: 0,
      width: 980,
      height: 430,
      rx: 0,
      class: "map-bg"
    }));

    for (var gx = 90; gx <= 900; gx += 90) {
      svg.appendChild(createSvg("line", { x1: gx, y1: 52, x2: gx, y2: 374, class: "map-grid" }));
    }
    for (var gy = 70; gy <= 350; gy += 70) {
      svg.appendChild(createSvg("line", { x1: 60, y1: gy, x2: 930, y2: gy, class: "map-grid" }));
    }

    [
      { d: "M95 255 C145 210 180 175 245 150 C292 130 345 122 410 132 C456 139 486 158 530 164 C594 174 641 152 690 176 C723 193 737 220 748 255 C702 253 657 246 606 252 C532 262 476 297 392 303 C294 310 194 298 95 255Z", label: "West Asia / Africa", x: 182, y: 333 },
      { d: "M690 190 C741 165 792 178 835 212 C871 241 888 286 876 330 C842 309 811 306 779 328 C758 342 731 339 712 320 C689 296 679 245 690 190Z", label: "India import system", x: 732, y: 366 },
      { d: "M802 284 C842 281 884 296 920 326 C872 347 834 343 804 316Z", label: "ASEAN route", x: 839, y: 382 }
    ].forEach(function (land) {
      svg.appendChild(createSvg("path", { d: land.d, class: "land-shape" }));
      var label = createSvg("text", { x: land.x, y: land.y, class: "map-label" });
      label.textContent = land.label;
      svg.appendChild(label);
    });

    result.corridors.slice().reverse().forEach(function (item, index) {
      var c = item.corridor;
      var curve = 70 + index * 18;
      var d = "M " + c.x1 + " " + c.y1 + " C " + (c.x1 + 120) + " " + (c.y1 - curve) + ", " + (c.x2 - 135) + " " + (c.y2 + curve * 0.4) + ", " + c.x2 + " " + c.y2;
      var path = createSvg("path", {
        d: d,
        class: "route-line",
        style: "stroke:" + riskColor(item.risk) + ";stroke-width:" + (3 + item.risk / 18)
      });
      svg.appendChild(path);

      var pos = routeLabelPosition(item.id);
      var group = createSvg("g", {});
      group.appendChild(createSvg("rect", {
        x: pos.x - 8,
        y: pos.y - 18,
        width: pos.w,
        height: 26,
        rx: 13,
        class: "route-chip " + (item.risk >= 76 ? "route-chip-alert" : "")
      }));
      var label = createSvg("text", { x: pos.x + 5, y: pos.y, class: "route-chip-text" });
      label.textContent = routeShortName(item.id) + " " + fmt(item.risk, 0) + "%";
      group.appendChild(label);
      svg.appendChild(group);
    });

    DATA.suppliers.slice(0, 8).forEach(function (supplier, index) {
      var score = result.corridors.find(function (c) { return c.id === supplier.corridor; }) || result.corridors[0];
      var base = score.corridor;
      var x = base.x1 + (index % 3) * 28 - 18;
      var y = base.y1 + Math.floor(index / 3) * 24 - 16;
      svg.appendChild(createSvg("circle", {
        cx: x,
        cy: y,
        r: 6,
        class: "supplier-dot",
        style: "fill:" + riskColor(score.risk)
      }));
      if (index < 4) {
        var text = createSvg("text", { x: x + 10, y: y + 4, class: "node-label" });
        text.textContent = supplier.country;
        svg.appendChild(text);
      }
    });

    DATA.refineries.forEach(function (refinery) {
      var radius = 5 + refinery.capacityMbd * 5;
      svg.appendChild(createSvg("circle", {
        cx: refinery.x,
        cy: refinery.y,
        r: radius,
        class: "refinery-dot"
      }));
      if (["jamnagar", "paradip", "mangalore", "kochi", "panipat"].indexOf(refinery.id) !== -1) {
        var label = createSvg("text", { x: refinery.x + radius + 5, y: refinery.y + 4, class: "node-label refinery-label" });
        label.textContent = refinery.name;
        svg.appendChild(label);
      }
    });
  }

  function renderRiskBars(result) {
    var target = $("riskBars");
    target.innerHTML = "";
    result.corridors.forEach(function (corridor) {
      var row = document.createElement("div");
      row.className = "bar-row";
      row.setAttribute("role", "listitem");
      row.innerHTML =
        '<div class="bar-head"><span>' + corridor.name + '</span><strong>' + fmt(corridor.risk, 1) + '%</strong></div>' +
        '<div class="bar-track"><span class="bar-fill" style="width:' + corridor.risk + '%;background:' + riskColor(corridor.risk) + '"></span></div>' +
        '<div class="bar-foot"><span>' + fmt(corridor.atRiskMbd, 2) + ' mbd at risk</span><span>' + fmt(corridor.delayDays, 1) + ' days transit</span></div>';
      target.appendChild(row);
    });
    $("highestCorridor").textContent = result.corridors[0].name;
  }

  function renderImpactChart(result) {
    var svg = $("impactChart");
    clear(svg);
    var data = result.impact.timeline;
    var w = 640;
    var h = 250;
    var margin = { left: 44, right: 50, top: 24, bottom: 34 };
    var plotW = w - margin.left - margin.right;
    var plotH = h - margin.top - margin.bottom;
    var maxGap = Math.max(1, Math.max.apply(null, data.map(function (d) { return d.netGapMbd; })) * 1.2);
    var maxPrice = Math.max(8, Math.max.apply(null, data.map(function (d) { return d.pumpChangePct; })) * 1.15);

    function x(day) {
      return margin.left + (day - 1) / 59 * plotW;
    }
    function yGap(value) {
      return margin.top + plotH - value / maxGap * plotH;
    }
    function yPrice(value) {
      return margin.top + plotH - value / maxPrice * plotH;
    }

    [0, 0.5, 1].forEach(function (tick) {
      var y = margin.top + plotH * tick;
      svg.appendChild(createSvg("line", { x1: margin.left, y1: y, x2: w - margin.right, y2: y, class: "grid-line" }));
    });
    svg.appendChild(createSvg("line", { x1: margin.left, y1: margin.top, x2: margin.left, y2: margin.top + plotH, class: "axis-line" }));
    svg.appendChild(createSvg("line", { x1: margin.left, y1: margin.top + plotH, x2: w - margin.right, y2: margin.top + plotH, class: "axis-line" }));

    var gapPoints = data.map(function (d) { return [x(d.day), yGap(d.netGapMbd)]; });
    var pricePoints = data.map(function (d) { return [x(d.day), yPrice(d.pumpChangePct)]; });
    svg.appendChild(createSvg("path", { d: areaPath(gapPoints, margin.top + plotH), class: "gap-area" }));
    svg.appendChild(createSvg("path", { d: linePath(gapPoints), class: "gap-line" }));
    svg.appendChild(createSvg("path", { d: linePath(pricePoints), class: "price-line" }));

    [
      { day: 1, label: "D1" },
      { day: 30, label: "D30" },
      { day: 60, label: "D60" }
    ].forEach(function (tick) {
      var text = createSvg("text", { x: x(tick.day), y: h - 10, class: "axis-text" });
      text.textContent = tick.label;
      svg.appendChild(text);
    });

    var last = data[data.length - 1];
    var gapLabel = createSvg("text", { x: w - margin.right - 112, y: yGap(last.netGapMbd) - 8, class: "chart-label" });
    gapLabel.textContent = "Gap " + fmt(result.impact.peakGapMbd, 2) + " mbd peak";
    svg.appendChild(gapLabel);
    var priceLabel = createSvg("text", { x: w - margin.right - 120, y: yPrice(last.pumpChangePct) + 18, class: "chart-label price" });
    priceLabel.textContent = "Pump +" + fmt(result.impact.peakPumpChangePct, 1) + "% peak";
    svg.appendChild(priceLabel);

    $("impactPeak").textContent = "Peak gap " + fmt(result.impact.peakGapMbd, 2) + " mbd";
  }

  function renderReserveChart(result) {
    var svg = $("reserveChart");
    clear(svg);
    var data = result.impact.timeline;
    var w = 640;
    var h = 230;
    var margin = { left: 44, right: 32, top: 22, bottom: 32 };
    var plotW = w - margin.left - margin.right;
    var plotH = h - margin.top - margin.bottom;
    var maxCover = Math.max(10, Math.max.apply(null, data.map(function (d) { return d.reserveCoverDays; })));
    var maxDraw = Math.max(0.75, Math.max.apply(null, data.map(function (d) { return d.drawdownMbd; })));

    function x(day) {
      return margin.left + (day - 1) / 59 * plotW;
    }
    function yCover(value) {
      return margin.top + plotH - value / maxCover * plotH;
    }
    function yDraw(value) {
      return margin.top + plotH - value / maxDraw * (plotH * 0.48);
    }

    [0, 0.5, 1].forEach(function (tick) {
      var y = margin.top + plotH * tick;
      svg.appendChild(createSvg("line", { x1: margin.left, y1: y, x2: w - margin.right, y2: y, class: "grid-line" }));
    });
    svg.appendChild(createSvg("line", { x1: margin.left, y1: margin.top + plotH, x2: w - margin.right, y2: margin.top + plotH, class: "axis-line" }));

    data.filter(function (_, index) { return index % 3 === 0; }).forEach(function (d) {
      var barW = plotW / 68;
      svg.appendChild(createSvg("rect", {
        x: x(d.day) - barW / 2,
        y: yDraw(d.drawdownMbd),
        width: barW,
        height: margin.top + plotH - yDraw(d.drawdownMbd),
        class: "draw-bar"
      }));
    });

    var coverPoints = data.map(function (d) { return [x(d.day), yCover(d.reserveCoverDays)]; });
    svg.appendChild(createSvg("path", { d: areaPath(coverPoints, margin.top + plotH), class: "reserve-area" }));
    svg.appendChild(createSvg("path", { d: linePath(coverPoints), class: "reserve-line" }));

    var last = data[data.length - 1];
    var label = createSvg("text", { x: w - margin.right - 132, y: yCover(last.reserveCoverDays) - 8, class: "chart-label" });
    label.textContent = "Day 60 cover " + fmt(last.reserveCoverDays, 1) + " days";
    svg.appendChild(label);
    $("reserveStatus").textContent = "First 15 days avg " + fmt(result.reserve.first15DrawMbd, 2) + " mbd";
  }

  function renderProcurement(result) {
    var rows = $("procurementRows");
    rows.innerHTML = "";
    result.procurement.slice(0, 8).forEach(function (item) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + item.rank + "</td>" +
        "<td><strong>" + item.source + "</strong><span>" + item.country + "</span></td>" +
        "<td>" + item.route + "<span>" + item.corridor + "</span></td>" +
        "<td>" + fmt(item.allocatedMbd || item.availableMbd, 2) + " mbd</td>" +
        "<td>" + fmt(item.etaDays, 1) + " d</td>" +
        "<td>$" + fmt(item.premiumUsd, 1) + "/bbl</td>" +
        "<td>" + item.fit + "%</td>" +
        "<td><span class=\"action-pill\">" + item.action + "</span></td>";
      rows.appendChild(tr);
    });
    var volume = result.procurement.reduce(function (sum, item) {
      return sum + (item.recommended ? item.allocatedMbd : 0);
    }, 0);
    $("queueStatus").textContent = fmt(volume, 2) + " mbd executable volume";
  }

  function renderBrief(result) {
    var target = $("decisionBrief");
    target.innerHTML = "";
    result.brief.forEach(function (line) {
      var p = document.createElement("p");
      p.textContent = line;
      target.appendChild(p);
    });
  }

  function render(result) {
    state.latest = result;
    renderStatus(result);
    renderBadges(result);
    renderNetwork(result);
    renderRiskBars(result);
    renderImpactChart(result);
    renderReserveChart(result);
    renderProcurement(result);
    renderBrief(result);
  }

  function runCycle() {
    setSliderOutputs();
    render(Engine.runCycle(getInputs(), state.offers));
  }

  function loadOfferFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      state.offers = Engine.parseOfferCsv(reader.result);
      $("offerStatus").textContent = state.offers.length + " offer rows loaded into procurement agent";
      runCycle();
    };
    reader.onerror = function () {
      $("offerStatus").textContent = "Could not read offer book";
    };
    reader.readAsText(file);
  }

  function exportMemo() {
    var result = state.latest || Engine.runCycle(getInputs(), state.offers);
    var lines = [
      "Energy Sentinel India Decision Memo",
      "Generated: " + result.scenario.timestamp.toLocaleString(),
      "",
      "National import risk: " + fmt(result.nationalRisk, 1) + "%",
      "Peak supply gap: " + fmt(result.impact.peakGapMbd, 2) + " mbd",
      "SPR cover at day 60: " + fmt(result.reserve.finalCover, 1) + " days",
      "Stabilization day: " + result.impact.stabilizationDay,
      "",
      "Recommended actions:"
    ].concat(result.brief.map(function (line, index) {
      return (index + 1) + ". " + line;
    })).concat([
      "",
      "Procurement queue:",
      "Rank,Source,Route,Allocated mbd,ETA days,Premium USD/bbl,Fit,Action"
    ]).concat(result.procurement.slice(0, 8).map(function (item) {
      return [
        item.rank,
        item.source,
        item.route,
        fmt(item.allocatedMbd || item.availableMbd, 2),
        fmt(item.etaDays, 1),
        fmt(item.premiumUsd, 1),
        item.fit + "%",
        item.action
      ].join(",");
    }));

    var blob = new Blob([lines.join("\n")], { type: "text/plain" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "energy-sentinel-decision-memo.txt";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function applyDemoShock() {
    var shocks = [
      "Brent crude jumps 8.4% after naval alert near Hormuz. War-risk tanker premiums rise and Indian refiners seek spot sour cargoes.",
      "Houthi missile attack suspends several Red Sea sailings; Suez delays force crude tankers to reroute via Cape of Good Hope.",
      "Secondary sanctions enforcement expands against shadow fleet tankers, reducing Russian and Iranian-linked crude availability.",
      "OPEC+ emergency production cut of 9% coincides with Persian Gulf standoff and higher VLCC charter rates."
    ];
    $("signalText").value = shocks[state.shockIndex % shocks.length];
    state.shockIndex += 1;
    runCycle();
  }

  function bindEvents() {
    $("scenarioPreset").addEventListener("change", function (event) {
      setPreset(event.target.value);
    });
    $("runCycle").addEventListener("click", runCycle);
    $("sampleSignal").addEventListener("click", applyDemoShock);
    $("resetScenario").addEventListener("click", function () {
      $("scenarioPreset").value = "baseline";
      state.offers = [];
      $("offerImport").value = "";
      $("offerStatus").textContent = "No external offers loaded";
      setPreset("baseline");
    });
    $("offerImport").addEventListener("change", function (event) {
      if (event.target.files && event.target.files[0]) loadOfferFile(event.target.files[0]);
    });
    $("exportMemo").addEventListener("click", exportMemo);
    ["hormuzSeverity", "redSeaSeverity", "sanctionsPressure", "opecCut", "tankerTightness", "brentMove"].forEach(function (id) {
      $(id).addEventListener("input", runCycle);
    });
    $("signalText").addEventListener("input", function () {
      window.clearTimeout(state.textTimer);
      state.textTimer = window.setTimeout(runCycle, 350);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    bindEvents();
    setSliderOutputs();
    runCycle();
  });
})();
