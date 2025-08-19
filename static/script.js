console.log("=== MOBILE DEBUG ===");
console.log("User agent:", navigator.userAgent);
console.log("nodes exists:", typeof nodes !== 'undefined');
console.log("links exists:", typeof links !== 'undefined');
console.log("#constellation element:", document.getElementById("constellation"));
console.log("D3 loaded:", typeof d3 !== 'undefined');

// Replace the existing pageshow event listener with this updated version
window.addEventListener('pageshow', function(event) {
  const spinner = document.getElementById("preloadSpinner");
  if (spinner) {
      spinner.style.display = "none";
  }
});

// Add this new unload event listener
window.addEventListener('unload', function() {
  // This ensures the spinner is hidden when navigating away
  const spinner = document.getElementById("preloadSpinner");
  if (spinner) {
      spinner.style.display = "none";
  }
});

// Add this new popstate event listener
window.addEventListener('popstate', function() {
  // This handles the back/forward buttons
  const spinner = document.getElementById("preloadSpinner");
  if (spinner) {
      spinner.style.display = "none";
  }
});

// Only run if this page includes constellation data
if (typeof nodes !== 'undefined' && typeof links !== 'undefined') {

  // Toggle panel for similar dreams (Desktop)
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

  // Toggle toolbar visibility
  const toolbarHeader = document.getElementById("toolbarHeader");
  const toolbarContent = document.getElementById("toolbarContent");
  const toolbarToggle = document.getElementById("toolbarToggle");

  if (toolbarHeader && toolbarContent && toolbarToggle) {
    // Desktop toolbar behavior
    toolbarHeader.addEventListener("click", function () {
      const isOpen = toolbarContent.style.display !== "none" && toolbarContent.style.display !== "";
      toolbarContent.style.display = isOpen ? "none" : "flex";
      toolbarToggle.textContent = isOpen ? "+" : "–";
    });
  }

  const width = window.innerWidth;
  const height = window.innerHeight;

  const svg = d3.select("#constellation")
    .attr("width", width)
    .attr("height", height);

  const container = svg.append("g");

  const background = container.append("rect") // this is a background rect to check if smb clicks out of the nodes
    .attr("width", width)
    .attr("height", height)
    .attr("fill", "transparent")
    .on("click", () => {
      updateSimilarPanel(null);
      d3.select("#tooltip").style("display", "none");
    })
    .lower();

  const zoom = d3.zoom()
    .scaleExtent([0.005, 20])
    .on("zoom", function () {
      container.attr("transform", d3.event.transform);
    });
  svg.call(zoom);

  let currentTransform = d3.zoomIdentity;
  const MOVE_SPEED = 30;  // Adjust this value to control movement speed
  const ZOOM_SPEED = 0.1; // Adjust this value to control zoom speed

  // Add keyboard controls
  document.addEventListener('keydown', function(event) {
      // Get current transform values
      currentTransform = d3.zoomTransform(svg.node());
      let tx = currentTransform.x;
      let ty = currentTransform.y;
      let k = currentTransform.k;

      switch(event.key) {
          case 'ArrowLeft':
              tx += MOVE_SPEED;
              break;
          case 'ArrowRight':
              tx -= MOVE_SPEED;
              break;
          case 'ArrowUp':
              ty += MOVE_SPEED;
              break;
          case 'ArrowDown':
              ty -= MOVE_SPEED;
              break;
          // Add zoom controls with + and - keys
          case '+':
          case '=':  // Common binding for + without shift
              k *= (1 + ZOOM_SPEED);
              break;
          case '-':
          case '_':  // Common binding for - without shift
              k *= (1 - ZOOM_SPEED);
              break;
      }

      // Apply the new transform
      const newTransform = d3.zoomIdentity
          .translate(tx, ty)
          .scale(k);
      
      svg.transition()
          .duration(100)
          .call(zoom.transform, newTransform);
  });

  // Add gamepad support
  function setupGamepad() {
      let animationFrameId;
      
      function handleGamepad() {
          const gamepads = navigator.getGamepads();
          if (!gamepads[0]) return;
          
          const gamepad = gamepads[0];
          currentTransform = d3.zoomTransform(svg.node());
          let tx = currentTransform.x;
          let ty = currentTransform.y;
          let k = currentTransform.k;
          
          // Horizontal movement (left stick X axis)
          if (Math.abs(gamepad.axes[0]) > 0.1) {
              tx -= gamepad.axes[0] * MOVE_SPEED;
          }
          
          // Vertical movement (left stick Y axis)
          if (Math.abs(gamepad.axes[1]) > 0.1) {
              ty -= gamepad.axes[1] * MOVE_SPEED;
          }
          
          // Zoom (right stick Y axis or triggers)
          const zoomValue = (gamepad.buttons[7].value - gamepad.buttons[6].value);
          if (Math.abs(zoomValue) > 0.1) {
              k *= (1 + (zoomValue * ZOOM_SPEED));
          }
          
          // Apply the new transform
          const newTransform = d3.zoomIdentity
              .translate(tx, ty)
              .scale(k);
          
          svg.call(zoom.transform, newTransform);
          
          animationFrameId = requestAnimationFrame(handleGamepad);
      }
      
      window.addEventListener("gamepadconnected", function(e) {
          console.log("Gamepad connected:", e.gamepad.id);
          handleGamepad();
      });
      
      window.addEventListener("gamepaddisconnected", function(e) {
          console.log("Gamepad disconnected");
          cancelAnimationFrame(animationFrameId);
      });
  }

  // Initialize gamepad support
  setupGamepad();

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

  function centerOnDream(dreamId, svgElement, xScaleFunc, yScaleFunc, zoomFunc, widthVal, heightVal) {
    console.log("Centering on dream:", dreamId);
    
    const targetNode = nodes.find(n => n.id === dreamId);
    if (!targetNode) {
      console.log("Target node not found:", dreamId);
      return;
    }
    
    console.log("Target node found:", targetNode);
    
    const currentTransform = d3.zoomTransform(svgElement.node());
    const targetX = xScaleFunc(targetNode.x);
    const targetY = yScaleFunc(targetNode.y);
    
    let scale = currentTransform.k;
    if (scale < 1) {
      scale = 2;
    }
    
    const tx = widthVal / 2 - targetX * scale;
    const ty = heightVal / 2 - targetY * scale;
    
    console.log("Centering calculation:", { 
      targetX, targetY, tx, ty, scale, dreamId 
    });
    
    svgElement.transition()
      .duration(750)
      .ease(d3.easeQuadInOut)
      .call(zoomFunc.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }
  

  function updateSimilarPanel(nodeId) {
    console.log("Updating similar panel for dream:", nodeId);
    
    const dreamData = nodes.find(n => n.id === nodeId);
    
    // Just use the desktop panel logic for ALL devices
    const panel = document.getElementById("similarPanelContent");
    if (!panel) {
      console.log("Similar panel element not found");
      return;
    }

    // If no dream is selected, show default message
    if (nodeId == null || isNaN(nodeId)) {
      panel.innerHTML = `<p style="color:#888;font-style:italic; padding: 5px;">
        Select a dream to see similar dreams.
      </p>`;
      return;
    }

    // Get all nodes except the current one
    const otherNodes = nodes.filter(n => n.id !== nodeId);

    // Calculate similarities using the similarity matrix
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
    })
    .filter(d => d.similarity > 0) // remove 0.00 entries
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 4);

    // If no similar dreams found
    if (similarDreams.length === 0) {
      panel.innerHTML = `<p style="color:#888;font-style:italic; padding: 5px;">
        No similar dreams found.
      </p>`;
      return;
    }

    // Create HTML for valid matches
    const html = similarDreams.map(item => {
      const partner = nodes.find(n => n.id === item.id);
      return partner ? 
        `<li onclick='panelClick(${partner.id})' style='cursor:pointer;'>
          ${partner.text}<br>
          <small>Sim: ${item.similarity.toFixed(2)}</small>
        </li>` : "";
    }).join("");

    panel.innerHTML = `<ul>${html}</ul>`;
    
    console.log("Similar panel updated with", similarDreams.length, "dreams");
  }

  // Panel Click Function
  window.panelClick = function (dreamId) {
    centerOnDream(dreamId, svg, xScale, yScale, zoom, width, height);
    updateSimilarPanel(dreamId);
    
    d3.selectAll('.node').classed('selected', false);
    d3.selectAll('.node')
      .filter(d => d.id === dreamId)
      .classed('selected', true);
  };

  // Updated code for static/script.js - replace the existing link creation
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
.style("pointer-events", "none"); // ← ADD THIS LINE to disable all interactions


const scoreExtent = d3.extent(nodes, d => d.score);
  if (scoreExtent[0] === scoreExtent[1]) {
    scoreExtent[0] *= 0.9;
    scoreExtent[1] *= 1.1;
  }

  const sizeScale = d3.scalePow().exponent(2)
    .domain(scoreExtent)
    .range([0.1, 3]);

  // Create nodes - universal version that works everywhere
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
    .style("cursor", "pointer")
    .style("-webkit-tap-highlight-color", "transparent")
    .on("click", function(d) {
      console.log("Node clicked:", d.id);
      
      // Pass all the variables that centerOnDream needs
      centerOnDream(d.id, svg, xScale, yScale, zoom, width, height);
      
      updateSimilarPanel(d.id);
      
      console.log("Applying selection to dream:", d.id);
      d3.selectAll('.node').classed('selected', false);
      d3.select(this).classed('selected', true);
      console.log("Selection applied");
    })
    .on("mouseover", function(d) {
      // Show tooltips and size changes on ALL devices
      d3.select("#tooltip")
        .style("display", "block")
        .html(`<strong>Dream ${d.id}:</strong><br>${d.text}`);
      
      d3.select(this).transition().duration(200)
        .attr("r", sizeScale(d.score) + 2);
    })
    .on("mousemove", function(d) {
      d3.select("#tooltip")
        .style("left", (d3.event.pageX + 10) + "px")
        .style("top", (d3.event.pageY + 10) + "px");
    })
    .on("mouseout", function(d) {
      d3.select("#tooltip").style("display", "none");
      
      d3.select(this).transition().duration(200)
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
  updateSimilarPanel(newDreamId || null);

  // --- SIMILARITY THRESHOLD DYNAMIC FILTERING ---
  const thresholdSlider = document.getElementById("similarityRange");
  const thresholdDisplay = document.getElementById("thresholdValue");

  if (thresholdSlider && thresholdDisplay) {
    thresholdSlider.addEventListener("input", function () {
      const visibility = parseFloat(this.value);
      thresholdDisplay.textContent = visibility.toFixed(2);

      // Update all links with new visibility and width
      d3.selectAll(".link")
        .style("stroke-opacity", d => {
          // Full opacity at visibility 1, fade to 0 at visibility 0
          return Math.min(0.6, visibility * 0.6);
        })
        .style("stroke-width", function(d) {
          // Scale width based on visibility value
          const width = getStrokeWidth(d.similarity) * visibility;
          return (d.source === newDreamId || d.target === newDreamId) ? 
            width * 2 : width;
        });
    });
  }

  // Optional: Hide spinner if it exists
  const preload = document.getElementById("preloadSpinner");
  if (preload) {
    setTimeout(() => {
      preload.style.display = "none";
    }, 500);
  }

  // Add search functionality
  const searchInput = document.getElementById("dreamSearch");
  if (searchInput) {
    searchInput.addEventListener("input", function(e) {
      const searchTerm = e.target.value.toLowerCase();
      
      // Reset all nodes
      d3.selectAll(".node")
        .classed("search-match", false)
        .attr("fill", d => d.id === newDreamId ? "orange" : "#fff");
      
      if (searchTerm.length > 0) {
        // Find matching nodes
        const matches = nodes.filter(node => 
          node.text.toLowerCase().includes(searchTerm)
        );
        
        // Highlight matches
        d3.selectAll(".node")
          .filter(d => matches.some(m => m.id === d.id))
          .classed("search-match", true);

        // If we have matches, center on the first one
        if (matches.length > 0) {
          centerOnDream(matches[0].id);
          updateSimilarPanel(matches[0].id);
        }
      }
    });
} // End of main constellation code block