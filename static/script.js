
let selected = [];
let mapData;
let globalYear;

const resetButton = document.getElementById("clear-button");

resetButton.addEventListener("click", () => {
  // 2) reset dropdown
  if (Array.from(yearSelect.options).some(o => o.value === globalYear)) {
    yearSelect.value = globalYear;
  }
  // 3) redraw map with no highlights
  fetchAndDrawMap(yearSelect.value);
});


// 1) grab the select
const yearSelect = document.getElementById("year-select");

// 2) fetch the year list and populate the dropdown
fetch("/api/years")
  .then(r => r.json())
  .then(years => {
    years.forEach(y => {
      const opt = document.createElement("option");
      opt.value = y;
      opt.text  = y;
      yearSelect.appendChild(opt);
    });

    // 3) set default to 2020 if available, else first year
    const defaultYear = 2020;
    if (years.includes(defaultYear)) {
      yearSelect.value = defaultYear;
    } else {
      yearSelect.value = years[0];
    }
    // once populated, draw the map for the first year:
    fetchAndDrawMap(years[0]);
  })
  .catch(console.error);

// 3) listen for changes
yearSelect.addEventListener("change", () => {
  fetchAndDrawMap(yearSelect.value);
});

// 4) helper to fetch & redraw (as before)
function fetchAndDrawMap(year) {
  fetch(`/api/map_data?year=${year}`)
    .then(r => r.json())
    .then(data => {
        selected = ["USA"];
        mapData = data;
        globalYear = year;
        drawMap(data); 
        callPCP(year); 
        callTopEmitters();
    })
    .catch(console.error);
}


function callPCP(year) {
    // Fetch data for PCP
    fetch(`/api/pcp?year=${year}`)
    .then(response => response.json())
    .then(data => {
        drawPCP(data);
    });
}



  // === Initialization (run once at startup) ===
  const container = document.getElementById("map-chart").parentElement;
  const width  = container.clientWidth;
  const height = container.clientHeight;

  const svg = d3.select("#map-chart")
      .attr("width",  width)
      .attr("height", height);

  // these groups are created only once:
  const mapGroup       = svg.append("g").attr("class","map-group");
  const highlightGroup = svg.append("g").attr("class","highlight-group");

  // set up projection & path once
  const projection = d3.geoNaturalEarth1()
      .scale(70)
      .translate([width/2, height/2]);
  const path = d3.geoPath(projection);

  // install zoom once, transforming *both* layers
  svg.call(
    d3.zoom()
      .scaleExtent([1,8])
      .on("zoom", ({transform}) => {
        mapGroup.attr("transform", transform);
        highlightGroup.attr("transform", transform);
      })
  );


function drawMap(data) {
  // build lookup & color scale
  const emissionMap = new Map(data.map(d => [d.id, +d.value]));
  const vals = Array.from(emissionMap.values());
  const colorScale = d3.scaleSequential(d3.interpolateReds)
                       .domain([d3.min(vals), d3.max(vals)]);

  // clear previous country shapes & highlights
  mapGroup.selectAll("*").remove();
  highlightGroup.selectAll("*").remove();

  // redraw legend (if you want to update it per‐call):
  drawLegend(svg, vals, width, height);

  // draw countries
  d3.json('https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson')
    .then(world => {
      mapGroup.selectAll("path")
        .data(world.features)
        .enter().append("path")
          .attr("d", path)
          .attr("fill", d => {
            const v = emissionMap.get(d.id);
            return v != null ? colorScale(v) : "#eee";
          })
          .attr("stroke", "#999")
          .attr("stroke-width", 0.5)
          .on("click", (event,d) => {
            const code = d.id;
            // if (selected.includes(code)) {
            //   selected = selected.filter(c=>c!==code);
            // } else {
            //   selected.push(code);
            // }

            const i = selected.indexOf(code);
            if (i > -1) selected.splice(i, 1);
            else           selected.push(code);

            styleMap();                     // reuse the same groups
            drawLineChart(selected);
            callRadarPlot(selected);
          });

      // initial highlight & other charts
      styleMap();
      drawLineChart(selected);
      callRadarPlot(selected);
    })
    .catch(err => console.error("GeoJSON load error:", err));
}

function styleMap() {
  // clear any existing highlight dots
  highlightGroup.selectAll("circle").remove();

  // for each selected ISO code, draw one dot in highlightGroup
  mapGroup.selectAll("path")
    .filter(d => selected.includes(d.id))
    .each(function(d) {
      const [cx, cy] = path.centroid(d);
      highlightGroup.append("circle")
        .attr("cx", cx)
        .attr("cy", cy)
        .attr("r", 3)
        .style("fill", "yellow")
        .style("stroke", "#333")
        .style("stroke-width", 1);
    });
}

function drawLegend(svg, vals, width, height) {
  // 1) clear any old legend
  svg.selectAll('#legend-grad').remove();
  svg.selectAll('defs').remove();
  svg.selectAll('.legend-group').remove();

  // 2) compute your position & size
  const minVal = d3.min(vals),
        maxVal = d3.max(vals);
  const legendWidth  = 300,
        legendHeight = 10,
        x = 20,
        y = height - 30;

  // 3) make a defs + gradient
  const defs = svg.append('defs');
  const grad = defs.append('linearGradient')
      .attr('id','legend-grad')
      .attr('x1','0%').attr('x2','100%')
      .attr('y1','0%').attr('y2','0%');

  d3.range(0,1.01,0.01).forEach(t => {
    grad.append('stop')
        .attr('offset', `${t*100}%`)
        .attr('stop-color', d3.interpolateReds(t));
  });

  // 4) group everything under a single wrapper
  const legend = svg.append('g')
      .attr('class','legend-group')
      .attr('transform', `translate(${x},${y})`);

  // 5) the color bar
  legend.append('rect')
    .attr('width',  legendWidth)
    .attr('height', legendHeight)
    .style('fill',  'url(#legend-grad)')
    .style('stroke','#000')
    .style('stroke-width',0.5);

  // 6) axis beneath it
  const scale = d3.scaleLinear()
      .domain([minVal, maxVal])
      .range([0, legendWidth]);
  const axis = d3.axisBottom(scale)
      .ticks(5)
      .tickFormat(d3.format('.2s'));

  legend.append('g')
    .attr('transform', `translate(0,${legendHeight})`)
    .call(axis);
}

function callTopEmitters() {
  d3.json(`/api/top_emitters?year=${globalYear}`)
    .then(data => drawBarChart(data))
    .catch(console.error);
}

function drawBarChart(data) {
  const svg = d3.select('#bar-chart');
  svg.selectAll('*').remove();

  const container = document.getElementById("bar-chart").parentElement;
  const width = container.clientWidth * 0.95;
  const height = container.clientHeight * 0.95;
  // we can pull in the left margin now that codes are short
  const margin = { top: 30, right: 30, bottom: 30, left: 50 };

  const W = width  - margin.left - margin.right;
  const H = height - margin.top  - margin.bottom;

  const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

  // scales
  const x = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.co2)]).nice()
      .range([0, W]);

  // ← use d.code instead of d.country here
  const y = d3.scaleBand()
      .domain(data.map(d => d.code))
      .range([0, H])
      .padding(0.2);

  // axes
  const yAxisG = g.append('g')
      .call(d3.axisLeft(y));

  // with codes you probably don’t even need to rotate—
  // but if you do, you can keep your existing rotate logic:
  yAxisG.selectAll('text')
    .attr('transform', 'rotate(-00)')
    .attr('dx', '-0.6em')
    .attr('dy', '0.15em')
    .style('text-anchor', 'end');

  g.append('g')
    .attr('transform', `translate(0,${H})`)
    .call(d3.axisBottom(x).ticks(5));

  // bars
  const bars = g.selectAll('.bar')
  .data(data, d => d.code)
  .enter().append('rect')
    .attr('class','bar')
    .attr('y', d => y(d.code))
    .attr('height', y.bandwidth())
    .attr('x', 0)
    .attr('width', d => x(d.co2))
    .attr('fill', '#69b3a2')
    .style('cursor','pointer')
    .on('mouseover', function() {
      const sel = d3.select(this);
      if (!sel.classed('active')) {
        sel.attr('fill','#40a281');
      }
    })
    .on('mouseout', function() {
      const sel = d3.select(this);
      if (!sel.classed('active')) {
        sel.attr('fill','#69b3a2');
      }
    })
    .on('click', function(event, d) {
      // reset all
      g.selectAll('.bar')
        .classed('active', false)
        .attr('fill', '#69b3a2');
      // activate this one
      d3.select(this)
        .classed('active', true)
        .attr('fill', 'red');

      selected = [ d.code ];
      drawMap(mapData);
    });
  // value labels
  g.selectAll('.label')
    .data(data)
    .enter().append('text')
      .attr('class','label')
      .attr('fill', 'white')
      .attr('x', d => x(d.co2) + 5)
      // ← and here too
      .attr('y', d => y(d.code) + y.bandwidth()/2)
      .attr('dy','0.35em')
      .style('font-size','11px')
      .text(d => d3.format('.1f')(d.co2));
}


function drawLineChart(codes) {
  const svg = d3.select('#lineChart');
  svg.selectAll('*').remove();

  const container = document.getElementById("lineChart").parentElement;
  const margin = { top: 30, right: 50, bottom: 40, left: 50 };
  const width  = container.clientWidth  * 0.95 - margin.left - margin.right;
  const height = container.clientHeight * 0.95 - margin.top  - margin.bottom;

  if (!codes.length) return;

  fetch("/api/line_chart?codes=" + codes.join(','))
    .then(r => r.json())
    .then(series => {
      // main group
      const g = svg
        .attr('width',  width  + margin.left + margin.right)
        .attr('height', height + margin.top  + margin.bottom)
        .append('g')
          .attr('transform', `translate(${margin.left},${margin.top})`);

      // flatten for extents
      const allYears = series.flatMap(s => s.values.map(d => d.Year));
      const allVals  = series.flatMap(s => s.values.map(d => d.Annual_CO2_Emissions_Per_Capita));

      const x = d3.scaleLinear()
                  .domain(d3.extent(allYears)).nice()
                  .range([0, width]);
      const y = d3.scaleLinear()
                  .domain([0, d3.max(allVals)]).nice()
                  .range([height, 0]);

      // 1) X‐axis: only 6 ticks, integer years
      const xAxis = d3.axisBottom(x)
                      .ticks(6)
                      .tickFormat(d3.format('d'));

      // 2) Y‐axis: only 6 ticks
      const yAxis = d3.axisLeft(y)
                      .ticks(6);

      // draw axes
      g.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(xAxis);

      g.append('g')
        .call(d3.axisLeft(y))
        .append('text')
          .attr('fill', 'white')
          .attr('transform', 'rotate(-90)')
          .attr('x', -height / 2)
          .attr('y', -margin.left + 15)
          .attr('dy', '0.35em')
          .attr('text-anchor', 'middle')
          .style('font-size', '13px')
          .text('CO₂ Emissions per Capita');

      // color palette
      const palette = series.map((_, i) =>
        d3.interpolateRainbow((i + 0.5) / series.length)
      );
      const color = d3.scaleOrdinal()
        .domain(series.map(s=>s.code))
        .range(palette);

      // line generator
      const line = d3.line()
                     .x(d => x(d.Year))
                     .y(d => y(d.Annual_CO2_Emissions_Per_Capita));

      // draw lines
      g.selectAll('path.line')
        .data(series, d => d.code)
        .enter().append('path')
          .attr('class','line')
          .attr('fill','none')
          .attr('stroke', d => color(d.code))
          .attr('stroke-width', 2)
          .attr('d', d => line(d.values));

      // legend on the right
      const legend = svg.append('g')
        .attr('fill', 'white')
        .attr('transform', `translate(${margin.left + width + 20},${margin.top})`);

      series.forEach((s,i) => {
        const row = legend.append('g')
          .attr('transform', `translate(0,${i*20})`);
        row.append('rect')
          .attr('width', 12).attr('height', 12)
          .attr('fill', color(s.code));
        row.append('text')
          .attr('x', 16).attr('y', 10)
          .style('font-size','12px')
          .text(s.code);
      });

      //  ── NEW: add a horizontal brush over the plot area ──
      const brush = d3.brushX()
        .extent([[0,0],[width,height]])
        .on("end", brushed);

      g.append("g")
        .attr("class","brush")
        .call(brush);

      function brushed({selection}) {
        if (!selection) {
          // no brush → restore full PCP
          callPCP();  
          return;
        }
        // invert pixel range to year range
        const [x0,x1] = selection;
        const y0 = Math.round(x.invert(x0));
        const y1 = Math.round(x.invert(x1));
        // for simplicity, just take the first code
        const code = codes[0];
        updatePCPForPeriod(code, y0, y1);
      }

    })
    .catch(err => console.error('Time-series load error:', err));
}

// helper to fetch & redraw PCP for a single country+period
function updatePCPForPeriod(code, year_start, year_end) {
  console.log("code: ", code);
  console.log("year_start: ", year_start);
  console.log("year_end: ", year_end);
  fetch(`/api/pcp_selected?codes=${encodeURIComponent(code)}&year_start=${year_start}&year_end=${year_end}`)
    .then(r => r.json())
    .then(data => drawPCP(data))   // your existing drawRadarPlot or drawPCP fn
    .catch(console.error);
}



function callRadarPlot(codes) {
  const svg = d3.select("#radar-plot");
  if (!codes.length) {
    svg.selectAll("*").remove();
    return;
  }
  fetch(`/api/radar_plot?codes=${encodeURIComponent(codes.join(","))}&year=${globalYear}`)
  // fetch(`/api/radar_plot?codes=${encodeURIComponent(codes.join(","))}`)
    .then(r => r.json())
    .then(({ data, extents }) => drawRadarPlot(data, extents))
    .catch(console.error);
}


function drawRadarPlot(raw, extents) {  
  // clear & size
    const svg = d3.select("#radar-plot").selectAll("*").remove() && d3.select("#radar-plot");
    const container = document.getElementById("radar-plot").parentElement;
    const width  = container.clientWidth  * 0.95;
    const height = container.clientHeight * 0.95;
    const margin = { top: 30, right: 20, bottom: 30, left: 5 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;
    const radius = Math.min(w, h) / 2;

    const g = svg
      .attr("width", width)
      .attr("height", height)
      .append("g")
      .attr("transform", `translate(${margin.left + w/2},${margin.top + h/2})`);

    // metrics + labels
    const metrics = [
      "renewable_energy",
      "co2_emissions",
      "energy_consumption",
      "gdp",
    ];
    const labels = {
      renewable_energy:   "Renewables",
      co2_emissions:      "Inverted CO₂ Emissions",
      gdp:                "GDP",
      energy_consumption: "Inverted Energy Consumption"
    };
    const angleSlice = Math.PI * 2 / metrics.length;
    const labelOffset = 10;

    // compute 0–100 greenness scores
    const scored = raw.map(d => {
      const row = {};
      metrics.forEach(m => {
        const rawv = +d[m];
        const { min, max } = extents[m];
        const span = (max - min) || 1;
        let pct = (rawv - min) / span;   // 0 → 1
        // invert for the two “lower-is-better”
        if (m === "co2_emissions" || m === "energy_consumption") pct = 1 - pct;
        row[m + "_score"] = Math.round(pct * 100);
      });
      row.country = d.country;
      return row;
    });

    // concentric rings
    for (let lvl = 1; lvl <= 5; lvl++) {
      g.append("circle")
        .attr("r", radius * lvl/5)
        .style("fill","none").style("stroke","#CCC").style("stroke-dasharray","2,2");
    }

    // spokes + labels
    metrics.forEach((m,i) => {
      const angle = i * angleSlice - Math.PI/2;
      g.append("line")
      .attr("x1",0).attr("y1",0)
      .attr("x2", Math.cos(angle)*radius)
      .attr("y2", Math.sin(angle)*radius)
      .style("stroke","#888");

      const lx = Math.cos(angle)*(radius+labelOffset),
            ly = Math.sin(angle)*(radius+labelOffset);
      let anchor = "middle";
      if (angle > -Math.PI/2 && angle < Math.PI/2) anchor = "start";
      else if (angle >  Math.PI/2 || angle < -Math.PI/2) anchor = "end";

      g.append("text")
      .attr("x", lx).attr("y", ly)
      .attr('fill', 'white')
      .attr("dy","0.35em")
      .attr("text-anchor", anchor)
      .style("font-size","11px")
      .text(labels[m]);
    });

    // line generator using scores (0–100)
    const radarLine = d3.lineRadial()
      .curve(d3.curveLinearClosed)
      .radius(d => (d.score/100)*radius)
      .angle((d,i) => i * angleSlice);

    // draw polygons
    // const color = d3.scaleOrdinal(d3.schemeCategory10)
    //                 .domain(scored.map(d=>d.country));
    // color palette
    const palette = raw.map((_, i) =>
      d3.interpolateRainbow((i + 0.5) / raw.length)
    );
    const color = d3.scaleOrdinal()
      .domain(raw.map(s=>s.country))
      .range(palette);

    scored.forEach(d => {
      const pts = metrics.map((m,i) => ({
        axis: m,
        score: d[m + "_score"]
      }));

      // fill & stroke
      g.append("path")
        .datum(pts)
        .attr("d", radarLine)
        .style("fill", color(d.country))
        .style("fill-opacity", 0.1)
        .style("stroke", color(d.country))
        .style("stroke-width", 2);

      // vertices
      pts.forEach((p,i) => {
        const angle = i * angleSlice - Math.PI/2;
        const r = (p.score/100)*radius;
        g.append("circle")
          .attr("cx", Math.cos(angle)*r)
          .attr("cy", Math.sin(angle)*r)
          .attr("r", 3)
          .attr("fill", color(d.country));
      });
    });

    // legend
    const legend = svg.append("g")
      .attr("transform", `translate(${margin.left+5},${margin.top})`);
    scored.forEach((d,i) => {
      const row = legend.append("g").attr("transform", `translate(0,${i*20})`);
      row.append("rect").attr("width",12).attr("height",12).attr("fill",color(d.country));
      row.append("text").attr('fill', 'white').attr("x",16).attr("y",10).style("font-size","12px")
        .text(d.country);
    });
}


function drawPCP(data) {
  // 1) clear & dims
  d3.select("#pcp").html("");
  const allDims = Object.keys(data[0]).filter(k => k !== 'cluster' && k !== 'code');
  const numericDims = allDims.filter(k => !isNaN(+data[0][k]));
  let currentOrdering = allDims.slice();

  // 2) size & scales
  const container = document.getElementById("pcp").parentElement;
  const width  = container.clientWidth  * 0.83;
  const height = container.clientHeight * 0.8;
  const margin = { top:20, right:30, bottom:30, left:40 };

  const x = d3.scalePoint()
      .domain(currentOrdering)
      .range([0, width]);

  const y = {};
  allDims.forEach(dim => {
    y[dim] = d3.scaleLinear()
      .domain(d3.extent(data, d => +d[dim]))
      .range([height, 0]);
  });

  // 3) SVG container
  const svg = d3.select("#pcp")
    .append("svg")
      .attr("width",  width + margin.left + margin.right)
      .attr("height", height + margin.top  + margin.bottom)
    .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

  // 4) line generator
  function path(d) {
    return d3.line()(currentOrdering.map(dim => [
      x(dim),
      y[dim](+d[dim])
    ]));
  }

  // 5) draw lines
  const color = d3.scaleOrdinal()
    .domain(['low','medium','high'])
    .range(['#2ca02c','#ff7f0e','#d62728']);

  const lines = svg.selectAll("path.line")
    .data(data, d => d.code)
    .enter().append("path")
      .attr("class","line")
      .attr("d", path)
      .style("fill","none")
      .style("stroke", d => color(d.cluster))
      .style("opacity", 0.7);

  // 6) prepare brushes
  const brushes = {}, actives = {};
  numericDims.forEach(dim => {
    brushes[dim] = d3.brushY()
      .extent([[-10,0],[10,height]])
      .filter(ev => ev.type === 'mousedown' && ev.shiftKey && !ev.button)
      .on("end", brushEnded);
  });

  // 7) draw axis groups with drag & brush
  const dimG = svg.selectAll(".dimension")
    .data(currentOrdering)
    .enter().append("g")
      .attr("class","dimension")
      .attr("transform", dim => `translate(${x(dim)})`)
      .call(d3.drag()
        .on("start", (event, dim) => {
          // only intercept if NOT shift (so brushes still work)
          if (!event.sourceEvent.shiftKey) {
            event.sourceEvent.stopPropagation();
            dragging = { dim, x0: x(dim) };
          }
        })
        .on("drag",  (event, dim) => {
          if (event.sourceEvent.shiftKey) return;
          let newX = Math.max(0, Math.min(width, event.x));
          currentOrdering.splice(
            currentOrdering.indexOf(dim), 1
          );
          // insert at new position
          const idx = d3.bisect(
            currentOrdering.map(d=>x(d)), newX
          );
          currentOrdering.splice(idx, 0, dim);
          x.domain(currentOrdering);
          dimG.attr("transform", d => `translate(${x(d)})`);
          lines.attr("d", path);
        })
        .on("end", (event, dim) => {
          dragging = null;
        })
      );

  // 8) for each axis: draw axis, label, and brush
  dimG.each(function(dim) {
    // axis
    d3.select(this).append("g")
      .call(d3.axisLeft(y[dim]));
    // label
    d3.select(this).append("text")
      .attr("y", -9)
      .attr("text-anchor","middle")
      .attr("fill", "white")
      .style("font-size","12px")
      .text(dim)
      .on("dblclick", () => {
        // clear this brush on double-click
        d3.select(this.parentNode).select(".brush")
          .call(brushes[dim].move, null);
        brushEnded();
      });
    // brush
    d3.select(this).append("g")
      .attr("class","brush")
      .call(brushes[dim]);
  });

  // 9) clicking background clears all brushes
  svg.on("click", event => {
    if (event.target.tagName === "svg") {
      numericDims.forEach(dim => {
        dimG.filter(d=>d===dim)
          .select(".brush")
          .call(brushes[dim].move, null);
      });
      brushEnded();
    }
  });

  // 10) brush end handler
  function brushEnded() {
    Object.keys(brushes).forEach(dim => {
      const sel = d3.brushSelection(
        dimG.filter(d=>d===dim).select(".brush").node()
      );
      if (!sel) {
        delete actives[dim];
      } else {
        const [y0,y1] = sel;
        const v0 = y[dim].invert(y1), v1 = y[dim].invert(y0);
        actives[dim] = [Math.min(v0,v1), Math.max(v0,v1)];
      }
    });
    updateFilters();
  }

  // 11) apply filters & link
  function updateFilters() {
    const filtered = data.filter(d =>
      Object.entries(actives).every(([dim,[minv,maxv]]) =>
        +d[dim] >= minv && +d[dim] <= maxv
      )
    );
    lines.style("display", d =>
      filtered.includes(d) ? null : "none"
    );
    selected = filtered.map(d => d.code);
    console.log("Country after brushing:", selected);
    drawMap(mapData);
  }
}





















