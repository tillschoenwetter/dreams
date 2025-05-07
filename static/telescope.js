// Replace the existing pageshow event listener with this updated version
window.addEventListener('pageshow', function(event) {
  const spinner = document.getElementById("preloadSpinner");
  if (spinner) spinner.style.display = "none";
});

window.addEventListener('unload', function() {
  const spinner = document.getElementById("preloadSpinner");
  if (spinner) spinner.style.display = "none";
});

window.addEventListener('popstate', function() {
  const spinner = document.getElementById("preloadSpinner");
  if (spinner) spinner.style.display = "none";
});

if (typeof nodes !== 'undefined' && typeof links !== 'undefined') {
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

  const containerElement = document.querySelector('.circle-container');
  const width = containerElement ? containerElement.offsetWidth : window.innerWidth;
  const height = containerElement ? containerElement.offsetHeight : window.innerHeight;

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

  // function centerOnDream(dreamId) {
  //     const targetNode = nodes.find(n => n.id === dreamId);
  //     if (!targetNode) return;

  //     const targetX = xScale(targetNode.x);
  //     const targetY = yScale(targetNode.y);
  //     const currentTransform = d3.zoomTransform(svg.node());
  //     const currentScale = currentTransform.k;

  //     const containerEl = document.querySelector('.circle-container');
  //     const centerX = containerEl ? containerEl.offsetLeft + containerEl.offsetWidth / 2 : window.innerWidth / 2;
  //     const centerY = containerEl ? containerEl.offsetTop + containerEl.offsetHeight / 2 : window.innerHeight / 2;

  //     const tx = centerX - targetX * currentScale;
  //     const ty = centerY - targetY * currentScale;

  //     svg.transition().duration(750)
  //         .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(currentScale));
  // }
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
      const otherNodes = nodes.filter(n => n.id !== nodeId);

      const similarDreams = otherNodes.map(node => {
          const link = links.find(l =>
              (l.source === nodeId && l.target === node.id) ||
              (l.target === nodeId && l.source === node.id)
          );
          return {
              id: node.id,
              text: node.text,
              similarity: link ? link.similarity : 0
          };
      }).sort((a, b) => b.similarity - a.similarity).slice(0, 4);

      const html = similarDreams.map(item => {
          const partner = nodes.find(n => n.id === item.id);
          return partner ?
              `<li onclick='panelClick(${partner.id})' style='cursor:pointer;'>
                  ${partner.text}<br>
                  <small>Sim: ${item.similarity.toFixed(2)}</small>
              </li>` : "";
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
          const containerEl = document.querySelector('.circle-container');
          const centerX = containerEl ? containerEl.offsetLeft + containerEl.offsetWidth / 2 : window.innerWidth / 2;
          const centerY = containerEl ? containerEl.offsetTop + containerEl.offsetHeight / 2 : window.innerHeight / 2;
          const distSource = Math.hypot(sourceX - centerX, sourceY - centerY);
          const distTarget = Math.hypot(targetX - centerX, targetY - centerY);
          const chosen = distSource > distTarget ? sourceNode : targetNode;
          const chosenX = xScale(chosen.x), chosenY = yScale(chosen.y);
          const currentTransform = d3.zoomTransform(svg.node());
          const currentScale = currentTransform.k;
          const tx = centerX - chosenX * currentScale;
          const ty = centerY - chosenY * currentScale;
          svg.transition().duration(750)
              .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(currentScale));
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
      });

  link
      .attr("x1", d => xScale(nodes.find(n => n.id === d.source).x))
      .attr("y1", d => yScale(nodes.find(n => n.id === d.source).y))
      .attr("x2", d => xScale(nodes.find(n => n.id === d.target).x))
      .attr("y2", d => yScale(nodes.find(n => n.id === d.target).y));

  const newDream = nodes.find(n => n.id === newDreamId);
  if (newDream) {
      const dreamX = xScale(newDream.x);
      const dreamY = yScale(newDream.y);
      const initialScale = 5;
      const containerEl = document.querySelector('.circle-container');
      const centerX = containerEl ? containerEl.offsetLeft + containerEl.offsetWidth / 2 : window.innerWidth / 2;
      const centerY = containerEl ? containerEl.offsetTop + containerEl.offsetHeight / 2 : window.innerHeight / 2;
      const tx = centerX - dreamX * currentScale;
      const ty = centerY - dreamY * currentScale;
      svg.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(initialScale));
  }

  const thresholdSlider = document.getElementById("similarityRange");
  const thresholdDisplay = document.getElementById("thresholdValue");

  thresholdSlider.addEventListener("input", function () {
      const visibility = parseFloat(this.value);
      thresholdDisplay.textContent = visibility.toFixed(2);

      d3.selectAll(".link")
          .style("stroke-opacity", d => Math.min(0.6, visibility * 0.6))
          .style("stroke-width", function(d) {
              const width = getStrokeWidth(d.similarity) * visibility;
              return (d.source === newDreamId || d.target === newDreamId) ? width * 2 : width;
          });
  });

  const preload = document.getElementById("preloadSpinner");
  if (preload) {
      setTimeout(() => {
          preload.style.display = "none";
      }, 500);
  }
}
