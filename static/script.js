// Only run if this page includes constellation data
if (typeof nodes !== 'undefined' && typeof links !== 'undefined') {

    // Toggle panel for similar dreams
    const panelHeader = document.getElementById("similarPanelHeader");
    const panelContent = document.getElementById("similarPanelContent");
    const toggleButton = document.getElementById("toggleButton");
  
    if (panelHeader && panelContent && toggleButton) {
      panelHeader.addEventListener("click", function () {
        const isOpen = panelContent.style.display !== "none";
        panelContent.style.display = isOpen ? "none" : "block";
        toggleButton.textContent = isOpen ? "+" : "–";
      });
    }
  
    const width = window.innerWidth;
    const height = window.innerHeight;
  
    const svg = d3.select("#constellation")
      .attr("width", width)
      .attr("height", height);
  
    const container = svg.append("g");
  
    const zoom = d3.zoom()
      .scaleExtent([0.005, 20])
      .on("zoom", function () {
        container.attr("transform", d3.event.transform);
      });
    svg.call(zoom);
  
    const xScale = d3.scaleLinear().domain([0, 30]).range([0, width]);
    const yScale = d3.scaleLinear().domain([0, 30]).range([0, height]);
  
    function getStrokeWidth(similarity) {
      if (similarity < 0.7) {
        const clamped = Math.max(0.5, similarity);
        return 0.01 + ((clamped - 0.5) / 0.2) * (0.1 - 0.001);
      } else {
        return 0.1 + ((similarity - 0.7) / 0.3) * (3 - 0.1);
      }
    }
  
    function centerOnDream(dreamId) {
      const targetNode = nodes.find(n => n.id === dreamId);
      if (!targetNode) return;
      const targetX = xScale(targetNode.x);
      const targetY = yScale(targetNode.y);
      const currentTransform = d3.zoomTransform(svg.node());
      const currentScale = currentTransform.k;
      const tx = width / 2 - targetX * currentScale;
      const ty = height / 2 - targetY * currentScale;
      svg.transition().duration(750)
        .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(currentScale));
    }
  
    function updateSimilarPanel(nodeId) {
      const similarDreams = links
        .filter(link => link.source === nodeId || link.target === nodeId)
        .map(link => {
          const partnerId = (link.source === nodeId) ? link.target : link.source;
          return { id: partnerId, similarity: link.similarity };
        })
        .sort((a, b) => b.similarity - a.similarity);
  
      const html = similarDreams.map(item => {
        const partner = nodes.find(n => n.id === item.id);
        return partner ? `<li onclick='panelClick(${partner.id})' style='cursor:pointer;'>${partner.text}<br><small>Sim: ${item.similarity.toFixed(2)}</small></li>` : "";
      }).join("");
  
      const panel = document.getElementById("similarPanelContent");
      if (panel) panel.innerHTML = `<ul>${html}</ul>`;
    }
  
    window.panelClick = function (dreamId) {
      centerOnDream(dreamId);
      updateSimilarPanel(dreamId);
    };
  
    const link = container.append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(links)
      .enter().append("line")
      .attr("class", "link")
      .style("stroke", "#ccc")
      .style("stroke-width", function (d) {
        const baseWidth = getStrokeWidth(d.similarity);
        return (d.source === newDreamId || d.target === newDreamId) ? baseWidth * 2 : baseWidth;
      })
      .on("click", function (d) {
        const sourceNode = nodes.find(n => n.id === d.source);
        const targetNode = nodes.find(n => n.id === d.target);
        const sourceX = xScale(sourceNode.x), sourceY = yScale(sourceNode.y);
        const targetX = xScale(targetNode.x), targetY = yScale(targetNode.y);
        const centerX = width / 2, centerY = height / 2;
        const distSource = Math.hypot(sourceX - centerX, sourceY - centerY);
        const distTarget = Math.hypot(targetX - centerX, targetY - centerY);
        const chosen = distSource > distTarget ? sourceNode : targetNode;
        const chosenX = xScale(chosen.x), chosenY = yScale(chosen.y);
        const currentTransform = d3.zoomTransform(svg.node());
        const currentScale = currentTransform.k;
        const tx = width / 2 - chosenX * currentScale;
        const ty = height / 2 - chosenY * currentScale;
        svg.transition().duration(750)
          .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(currentScale));
      })
      .on("mouseover", function (d) {
        d3.select(this).transition().duration(100)
          .style("stroke-width", getStrokeWidth(d.similarity) * 2);
      })
      .on("mouseout", function (d) {
        d3.select(this).transition().duration(100)
          .style("stroke-width", getStrokeWidth(d.similarity));
      });
  
    const scoreExtent = d3.extent(nodes, d => d.score);
    if (scoreExtent[0] === scoreExtent[1]) {
      scoreExtent[0] *= 0.9;
      scoreExtent[1] *= 1.1;
    }
  
    const sizeScale = d3.scalePow().exponent(2)
      .domain(scoreExtent)
      .range([0.1, 3]);
  
    container.append("g")
      .attr("class", "nodes")
      .selectAll("circle")
      .data(nodes)
      .enter().append("circle")
      .attr("class", "node")
      .attr("cx", d => xScale(d.x))
      .attr("cy", d => yScale(d.y))
      .attr("r", d => sizeScale(d.score))
      .attr("fill", d => d.id === newDreamId ? "orange" : "#fff")
      .on("click", d => {
        centerOnDream(d.id);
        updateSimilarPanel(d.id);
      })
      .on("mouseover", d => {
        d3.select("#tooltip")
          .style("display", "block")
          .html(`<strong>Dream ${d.id}:</strong><br>${d.text}`);
        d3.select(d3.event.target).transition().duration(200)
          .attr("r", sizeScale(d.score) + 2);
      })
      .on("mousemove", d => {
        d3.select("#tooltip")
          .style("left", (d3.event.pageX + 10) + "px")
          .style("top", (d3.event.pageY + 10) + "px");
      })
      .on("mouseout", d => {
        d3.select("#tooltip").style("display", "none");
        d3.select(d3.event.target).transition().duration(200)
          .attr("r", sizeScale(d.score));
      });
  
    link
      .attr("x1", d => xScale(nodes.find(n => n.id === d.source).x))
      .attr("y1", d => yScale(nodes.find(n => n.id === d.source).y))
      .attr("x2", d => xScale(nodes.find(n => n.id === d.target).x))
      .attr("y2", d => yScale(nodes.find(n => n.id === d.target).y));
  
    // Center on new dream if one exists
    const newDream = nodes.find(n => n.id === newDreamId);
    if (newDream) {
      const dreamX = xScale(newDream.x);
      const dreamY = yScale(newDream.y);
      const initialScale = 5;
      const tx = width / 2 - dreamX * initialScale;
      const ty = height / 2 - dreamY * initialScale;
      svg.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(initialScale));
    }

    // --- SIMILARITY THRESHOLD DYNAMIC FILTERING ---
const thresholdSlider = document.getElementById("similarityRange");
const thresholdDisplay = document.getElementById("thresholdValue");
thresholdSlider.addEventListener("input", function () {
  const threshold = parseFloat(this.value);
  thresholdDisplay.textContent = threshold.toFixed(2);

  // Update link visibility based on threshold
  d3.selectAll(".link").style("display", d => {
    return d.similarity >= threshold ? "block" : "none";
  });
});

  
    // Optional: Hide spinner if it exists
    const preload = document.getElementById("preloadSpinner");
    if (preload) {
      setTimeout(() => {
        preload.style.display = "none";
      }, 500);
    }
  }
  