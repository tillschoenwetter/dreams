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

    // Toggle toolbar visibility
    const toolbarHeader = document.getElementById("toolbarHeader");
    const toolbarContent = document.getElementById("toolbarContent");
    const toolbarToggle = document.getElementById("toolbarToggle");

    if (toolbarHeader && toolbarContent && toolbarToggle) {
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
  
    const zoom = d3.zoom()
      .scaleExtent([0.005, 20])
      .on("zoom", function () {
        container.attr("transform", d3.event.transform);
      });
    svg.call(zoom);

    // HI EMMA CHECK THIS OUT

    // Add after the svg.call(zoom) line
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
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 4);  // Show top 4 most similar

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

    // Optional: Hide spinner if it exists
    const preload = document.getElementById("preloadSpinner");
    if (preload) {
      setTimeout(() => {
        preload.style.display = "none";
      }, 500);
    }

    // Add after nodes creation
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
}
  }
