console.log("=== MOBILE DEBUG ===");
console.log("User agent:", navigator.userAgent);
console.log("nodes exists:", typeof nodes !== 'undefined');
console.log("links exists:", typeof links !== 'undefined');
console.log("#constellation element:", document.getElementById("constellation"));
console.log("D3 loaded:", typeof d3 !== 'undefined');

// Check if device is mobile
const isMobile = window.innerWidth <= 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

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
      d3.selectAll('.node').classed('selected', false);
      updateLinkColors(null); // Reset all links to default color
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

  // Add keyboard controls (Desktop only)
  if (!isMobile) {
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
  }

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
  if (!isMobile) {
    setupGamepad();
  }

  const xScale = d3.scaleLinear().domain([0, 30]).range([0, width]);
  const yScale = d3.scaleLinear().domain([0, 30]).range([0, height]);

  function getStrokeWidth(similarity) {
    if (similarity < 0.7) {
      const clamped = Math.max(0.5, similarity);
      return 0.01 + ((clamped - 0.5) / 0.2) * (0.1 - 0.001);
    } else {
      return 0.1 + ((similarity - 0.7) / 0.3) * (2 - 0.1);
    }
  }
  // link of selecter dream turns yellow
  function updateLinkColors(selectedDreamId) {
    d3.selectAll(".link")
      .style("stroke", function(d) {
        if (selectedDreamId && (d.source === selectedDreamId || d.target === selectedDreamId)) {
          return "#ffd700"; // Yellow/gold for connected links
        }
        return "#ccc"; // Default gray
      })
      .style("stroke-width", function(d) {
        const baseWidth = getStrokeWidth(d.similarity);
        if (selectedDreamId && (d.source === selectedDreamId || d.target === selectedDreamId)) {
          return baseWidth * 1.5; // Make connected links thicker
        }
        return (d.source === newDreamId || d.target === newDreamId) ? baseWidth * 2 : baseWidth;
      });
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
      updateLinkColors(dreamId);
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
  .style("pointer-events", "none");
  const scoreExtent = d3.extent(nodes, d => d.score);
  if (scoreExtent[0] === scoreExtent[1]) {
    scoreExtent[0] *= 0.9;
    scoreExtent[1] *= 1.1;
  }

  const sizeScale = d3.scalePow().exponent(2)
    .domain(scoreExtent)
    .range([0.1, 3]);

  // Create nodes - universal version that works everywhere
  const nodeSelection = container.append("g")
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
      updateLinkColors(d.id);

      // Show the dream modal
      showCentralDreamModal(d);

      console.log("Selection applied");
    });

  // Only add hover events on desktop
  if (!isMobile) {
    nodeSelection
      .on("mouseover", function(d) {
        // Show tooltips and size changes on desktop only
        const truncatedText = d.text.length > 100 ? d.text.substring(0, 100) + "..." : d.text;
        
        d3.select("#tooltip")
          .style("display", "block")
          .html(`<strong>Dream ${d.id}:</strong><br>${truncatedText}`);
        
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
  }

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

  // ————————— SIMILARITY THRESHOLD DYNAMIC FILTERING ———————————————
  const thresholdSlider = document.getElementById("similarityRange");
  const thresholdDisplay = document.getElementById("thresholdValue");

  // Set different default thresholds for mobile vs desktop
  const defaultThreshold = isMobile ? 0.1 : 0.6; // Much lower threshold for mobile
  const defaultOpacity = isMobile ? 0.4 : 0.6;   // Slightly lower opacity for mobile

  // Apply initial mobile-friendly settings to existing links
  if (isMobile) {
    // Set all links to be more visible on mobile with lower threshold
    d3.selectAll(".link")
      .style("stroke-opacity", function(d) {
        // Show links with very low similarity on mobile
        return d.similarity >= 0.1 ? defaultOpacity : 0;
      })
      .style("stroke-width", function(d) {
        // Show links with very low similarity on mobile
        if (d.similarity >= 0.1) {
          const width = getStrokeWidth(d.similarity);
          return (d.source === newDreamId || d.target === newDreamId) ? 
            width * 2 : width;
        }
        return 0; // Hide only extremely low similarity links
      });
  }

  // Desktop-only slider controls
  if (!isMobile && thresholdSlider && thresholdDisplay) {
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
  // ———————————— DREAM MODAL ——————————————————————
  // Function to show the central dream modal
  function showCentralDreamModal(dreamData) {
    const modal = document.getElementById("dreamModal");
    
    // Clear any existing content
    modal.innerHTML = '';
    
    // Create the modal structure
    const modalContainer = document.createElement('div');
    modalContainer.className = 'dream-modal-container';
    
    modalContainer.innerHTML = `
      <h2>Dream ${dreamData.id}</h2>
      <div class="dream-modal-text">${dreamData.text}</div>
    `;
    
    modal.appendChild(modalContainer);
    
    // Add close hint
    const closeHint = document.createElement('div');
    closeHint.className = 'dream-modal-close-hint';
    closeHint.textContent = 'Click anywhere to close';
    modal.appendChild(closeHint);
    
    // Show modal with animation
    modal.style.display = 'flex';
    
    // Trigger animation after a brief delay
    setTimeout(() => {
      modal.classList.add('show');
    }, 10);
    
    // Close modal when clicking on overlay (not on the container)
    modal.onclick = function(e) {
      if (e.target === modal) {
        hideCentralDreamModal();
      }
    };
    
    // Close modal with ESC key
    document.addEventListener('keydown', handleEscapeKey);
  }

  // Function to hide the central dream modal
  function hideCentralDreamModal() {
    const modal = document.getElementById("dreamModal");
    
    // Remove animation class first
    modal.classList.remove('show');
    
    // Hide modal after animation completes
    setTimeout(() => {
      modal.style.display = 'none';
      modal.innerHTML = ''; // Clear content
    }, 300); // Match the transition duration
    
    // Remove escape key listener
    document.removeEventListener('keydown', handleEscapeKey);
  }

  // Handle ESC key to close modal
  function handleEscapeKey(e) {
    if (e.key === 'Escape') {
      hideCentralDreamModal();
    }
  }

  // Update the existing node click handler to use the new modal
  // This would replace the existing showDreamModal calls in your script.js
  function showDreamOnClick(dreamData) {
    // Hide any existing modals first
    hideCentralDreamModal();
    
    // Show the new central modal
    showCentralDreamModal(dreamData);
  }
  // ———————————— end of dream modal ———————————————

  // ———————————— SEARCH FUNCTION ——————————————————
  // Search results display (Desktop only)
  function updateSearchResults(matchCount, keywords) {
    let searchResultsDiv = document.getElementById("search-results");
    
    // Create search results display if it doesn't exist
    if (!searchResultsDiv) {
      searchResultsDiv = document.createElement("div");
      searchResultsDiv.id = "search-results";
      searchResultsDiv.className = "search-results";
      
      // Insert after the search input
      const searchContainer = document.getElementById("search-bar");
      searchContainer.appendChild(searchResultsDiv);
    }
    
    // Get the matching dreams for display
    const searchTerm = document.getElementById("dreamSearch").value.toLowerCase().trim();
    const matchingDreams = nodes.filter(node => {
      const nodeText = node.text.toLowerCase();
      const keywords = searchTerm.split(/[\s,]+/).filter(keyword => keyword.length > 0);
      
      const allKeywordsPresent = keywords.every(keyword => nodeText.includes(keyword));
      const anyKeywordPresent = keywords.some(keyword => nodeText.includes(keyword));
      
      return allKeywordsPresent || (anyKeywordPresent && searchTerm.length <= 20);
    }).slice(0, 5); // Show first 5 matches
    
    // Create dream list HTML
    let dreamsListHTML = "";
    if (matchingDreams.length > 0) {
      dreamsListHTML = `
        <div class="search-dreams-list">
          <h4>Top Matches:</h4>
          ${matchingDreams.map(dream => {
            let highlightedText = dream.text;
            keywords.forEach(keyword => {
              const regex = new RegExp(`(${keyword})`, 'gi');
              highlightedText = highlightedText.replace(regex, '<mark class="search-highlight">$1</mark>');
            });
            
            return `<div class="search-dream-item" onclick="panelClick(${dream.id})">
              <span class="dream-id">#${dream.id}</span>
              <span class="dream-text">${highlightedText}</span>
            </div>`;
          }).join("")}
        </div>
      `;
    }
    
    // Update the display
    searchResultsDiv.innerHTML = `
      <div class="search-results-info">
        <span class="match-count">${matchCount} dream${matchCount !== 1 ? 's' : ''} found</span>
        <span class="keywords">Keywords: ${keywords.join(', ')}</span>
      </div>
      ${dreamsListHTML}
    `;
    searchResultsDiv.style.display = "block";
  }

  // Helper function to clear search results display
  function clearSearchResults() {
    const searchResultsDiv = document.getElementById("search-results");
    if (searchResultsDiv) {
      searchResultsDiv.style.display = "none";
    }
  }

  const searchInput = document.getElementById("dreamSearch");
  const clearSearchBtn = document.getElementById("clearSearch");

  if (searchInput) {
    let searchTimeout;
    
    searchInput.addEventListener("input", function(e) {
      // Clear previous timeout
      clearTimeout(searchTimeout);
      
      // Show loading indicator (Desktop only)
      if (!isMobile) {
        const searchResultsDiv = document.getElementById("search-results");
        if (searchResultsDiv) {
          searchResultsDiv.innerHTML = '<div style="text-align: center; color: #999; font-style: italic; padding: 20px;">Searching...</div>';
          searchResultsDiv.style.display = "block";
        }
      }
      
      // Set a new timeout for search (300ms delay)
      searchTimeout = setTimeout(() => {
        const searchTerm = e.target.value.toLowerCase().trim();
        
        // Reset all nodes to default appearance
        d3.selectAll(".node")
          .classed("search-match", false)
          .attr("fill", d => d.id === newDreamId ? "orange" : "#fff")
          .attr("r", d => sizeScale(d.score));
        
        if (searchTerm.length > 0) {
          // Split search term into keywords (split by spaces, commas, etc.)
          const keywords = searchTerm.split(/[\s,]+/).filter(keyword => keyword.length > 0);
          
          // Find nodes that contain any of the keywords
          const matches = nodes.filter(node => {
            const nodeText = node.text.toLowerCase();
            
            // Check if all keywords are present (AND logic)
            const allKeywordsPresent = keywords.every(keyword => nodeText.includes(keyword));
            
            // Also check for partial matches (OR logic for better results)
            const anyKeywordPresent = keywords.some(keyword => nodeText.includes(keyword));
            
            // Return true if all keywords are present, or if at least one keyword is present and search term is short
            return allKeywordsPresent || (anyKeywordPresent && searchTerm.length <= 20);
          });
          
          // Highlight matching nodes with a different color and larger size
          d3.selectAll(".node")
            .filter(d => matches.some(m => m.id === d.id))
            .classed("search-match", true)
            .attr("fill", "#ff6b6b") // Highlight color for search matches
            .attr("r", d => sizeScale(d.score) + 3); // Make matching nodes slightly larger
        
          // Update search results display (Desktop only)
          if (!isMobile) {
            updateSearchResults(matches.length, keywords);
          }
          
          // If we have matches, center on the first one
          if (matches.length > 0) {
            centerOnDream(matches[0].id);
            updateSimilarPanel(matches[0].id);
          }
        } else {
          // Clear search results display when search is empty (Desktop only)
          if (!isMobile) {
            clearSearchResults();
          }
        }
      }, 300); // 300ms delay
    });
  }

  // Add clear search functionality
  if (clearSearchBtn) {
    clearSearchBtn.addEventListener("click", function() {
      searchInput.value = "";
      
      // Reset all nodes to default appearance
      d3.selectAll(".node")
        .classed("search-match", false)
        .attr("fill", d => d.id === newDreamId ? "orange" : "#fff")
        .attr("r", d => sizeScale(d.score));
      
      // Clear search results display (Desktop only)
      if (!isMobile) {
        clearSearchResults();
      }
      
      // Focus back to search input
      searchInput.focus();
    });
  }
  // ———————————————— MOBILE BOTTOM DRAWER —————————————
  // Only initialize bottom drawer on mobile devices
  const isMobileWidth = window.innerWidth <= 768;

  if (isMobileWidth) {
    // Update the DreamBottomDrawer class with these improvements
    class DreamBottomDrawer {
      constructor() {
        this.drawer = document.getElementById('bottomSheet');
        this.container = document.getElementById('bottomSheetContainer');
        this.handle = document.getElementById('sheetHandle');
        this.content = document.getElementById('sheetContent');
        this.noSelection = document.getElementById('noSelection');
        this.dreamDisplay = document.getElementById('dreamDisplay');
        
        // Dream content elements
        this.dreamText = document.getElementById('dreamText');
        this.dreamId = document.getElementById('dreamId');
        this.dreamSimilarity = document.getElementById('dreamSimilarity');
        this.similarList = document.getElementById('similarList');
        
        this.isOpen = true;
        this.currentState = 'peek';
        this.selectedDreamId = null;
        
        // Improved touch tracking
        this.startY = 0;
        this.currentY = 0;
        this.lastY = 0;
        this.isDragging = false;
        this.startTime = 0;
        this.velocity = 0;
        this.lastTimestamp = 0;
        
        // Get screen dimensions
        this.screenHeight = window.innerHeight;
        this.peekHeight = 120;
        this.expandedOffset = this.screenHeight * 0.15; // 15vh
        
        if (this.drawer && this.container && this.handle) {
          this.init();
        }
      }

      init() {
        this.setState('peek');
        
        // Improved touch event handling
        this.handle.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        this.drawer.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        this.drawer.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        this.drawer.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });
        this.drawer.addEventListener('touchcancel', this.handleTouchEnd.bind(this), { passive: false });
        
        // Mouse events for desktop testing
        this.handle.addEventListener('mousedown', this.handleMouseStart.bind(this));
        this.drawer.addEventListener('mousedown', this.handleMouseStart.bind(this));
        document.addEventListener('mousemove', this.handleMouseMove.bind(this));
        document.addEventListener('mouseup', this.handleMouseEnd.bind(this));
        
        // Handle clicks on the handle
        this.handle.addEventListener('click', this.toggleDrawer.bind(this));
        
        // Update screen height on orientation change
        window.addEventListener('resize', () => {
          this.screenHeight = window.innerHeight;
          this.expandedOffset = this.screenHeight * 0.15;
        });
        
        console.log('DreamBottomDrawer initialized');
      }

      handleTouchStart(e) {
        const touch = e.touches[0];
        const isOnHandle = e.target === this.handle || e.target.closest('#sheetHandle');
        const isScrollAtTop = this.content.scrollTop === 0;
        const isScrollableContent = e.target.closest('.similar-list') || e.target.closest('.sheet-content');
        
        // Only start drag if:
        // 1. Touching the handle, OR
        // 2. Content is scrolled to top AND we're NOT touching scrollable content
        if ((isOnHandle || isScrollAtTop) && !isScrollableContent) {
          this.startDrag(touch.clientY);
          e.preventDefault(); // Only prevent scrolling when actually starting drag
        }
        // If touching scrollable content and not at top, allow normal scrolling
      }

      handleTouchMove(e) {
  if (!this.isDragging) return;
  
  const touch = e.touches[0];
  
  // Always allow dragging if we started it (don't check for scrollable content during move)
  e.preventDefault();
  this.updateDrag(touch.clientY);
}

      handleTouchEnd(e) {
        this.endDrag();
      }

      handleMouseStart(e) {
        if (e.target === this.handle || e.target.closest('#sheetHandle')) {
          this.startDrag(e.clientY);
          e.preventDefault();
        }
      }

      handleMouseMove(e) {
        if (!this.isDragging) return;
        this.updateDrag(e.clientY);
      }

      handleMouseEnd(e) {
        this.endDrag();
      }

      startDrag(clientY) {
        this.isDragging = true;
        this.startY = clientY;
        this.currentY = clientY;
        this.lastY = clientY;
        this.startTime = Date.now();
        this.lastTimestamp = Date.now();
        this.velocity = 0;
        
        // Remove transition during drag for immediate response
        this.drawer.style.transition = 'none';
        
        // Add dragging class for potential styling
        this.drawer.classList.add('dragging');
      }

      updateDrag(clientY) {
        if (!this.isDragging) return;
        
        const now = Date.now();
        const timeDelta = now - this.lastTimestamp;
        
        if (timeDelta > 0) {
          // Calculate velocity for momentum
          const yDelta = clientY - this.lastY;
          this.velocity = yDelta / timeDelta; // pixels per ms
        }
        
        this.lastY = this.currentY;
        this.currentY = clientY;
        this.lastTimestamp = now;
        
        const deltaY = clientY - this.startY;
        
        // Calculate new position based on current state
        let newTransformY;
        
        if (this.currentState === 'peek') {
          // Dragging from peek state
          const peekPosition = ((this.screenHeight - this.peekHeight) / this.screenHeight) * 100;
          const dragPercent = (deltaY / this.screenHeight) * 100;
          newTransformY = Math.max(this.expandedOffset / this.screenHeight * 100, 
                              Math.min(100, peekPosition + dragPercent));
        } else { // expanded
          // Dragging from expanded state
          const expandedPosition = (this.expandedOffset / this.screenHeight) * 100;
          const dragPercent = (deltaY / this.screenHeight) * 100;
          newTransformY = Math.max(this.expandedOffset / this.screenHeight * 100, 
                              Math.min(100, expandedPosition + dragPercent));
        }
        
        // Apply transform immediately
        this.drawer.style.transform = `translateY(${newTransformY}vh)`;
      }

      endDrag() {
        if (!this.isDragging) return;
        
        this.isDragging = false;
        
        // Remove dragging class
        this.drawer.classList.remove('dragging');
        
        // Restore transition
        this.drawer.style.transition = 'transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)';
        
        // Calculate final state based on velocity and position
        const deltaY = this.currentY - this.startY;
        const deltaTime = Date.now() - this.startTime;
        const avgVelocity = Math.abs(deltaY) / Math.max(deltaTime, 1);
        
        // High velocity threshold for quick swipes
        const highVelocityThreshold = 0.8; // pixels per ms
        
        // Distance threshold (percentage of screen height)
        const distanceThreshold = this.screenHeight * 0.15; // 15% of screen
        
        let targetState = this.currentState;
        
        if (avgVelocity > highVelocityThreshold) {
          // Fast swipe - use velocity direction
          if (deltaY > 0) {
            targetState = 'peek'; // Swiping down
          } else {
            targetState = 'expanded'; // Swiping up
          }
        } else {
          // Slow drag - use distance threshold
          if (Math.abs(deltaY) > distanceThreshold) {
            if (deltaY > 0) {
              targetState = 'peek'; // Dragging down
            } else {
              targetState = 'expanded'; // Dragging up
            }
          }
          // else stay in current state
        }
        
        this.setState(targetState);
      }

      setState(state) {
        this.currentState = state;
        
        // Remove all state classes
        this.drawer.classList.remove('peek', 'expanded', 'dragging');
        
        // Clear any inline transform
        this.drawer.style.transform = '';
        
        switch (state) {
          case 'peek':
            this.isOpen = true;
            this.drawer.classList.add('peek');
            break;
          case 'expanded':
            this.isOpen = true;
            this.drawer.classList.add('expanded');
            break;
        }
        
        console.log('Drawer state changed to:', state);
      }

      toggleDrawer() {
        if (this.currentState === 'peek') {
          this.setState('expanded');
        } else {
          this.setState('peek');
        }
      }

      showDream(dreamData) {
        this.selectedDreamId = dreamData.id;
        
        // Update dream content
        if (this.dreamText) this.dreamText.textContent = dreamData.text;
        if (this.dreamId) this.dreamId.textContent = `Dream ${dreamData.id}`;
        if (this.dreamSimilarity) this.dreamSimilarity.textContent = 'Selected';
        
        // Show dream display, hide no selection
        if (this.noSelection) this.noSelection.style.display = 'none';
        if (this.dreamDisplay) this.dreamDisplay.style.display = 'block';
        
        // Update similar dreams
        this.updateSimilarDreams(dreamData.id);
        
        // Always ensure we're at least at peek when showing content
        if (this.currentState !== 'expanded') {
          this.setState('peek');
        }
      }

      updateSimilarDreams(dreamId) {
        if (!this.similarList || typeof nodes === 'undefined' || typeof links === 'undefined') return;
        
        // Get similar dreams (reuse logic from desktop version)
        const otherNodes = nodes.filter(n => n.id !== dreamId);
        const similarDreams = otherNodes.map(node => {
          const link = links.find(l =>
            (l.source === dreamId && l.target === node.id) ||
            (l.target === dreamId && l.source === node.id)
          );
          return {
            id: node.id,
            text: node.text,
            similarity: link ? link.similarity : 0
          };
        })
        .filter(d => d.similarity > 0)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 4);

        // Clear and populate similar dreams list
        this.similarList.innerHTML = '';
        
        if (similarDreams.length === 0) {
          this.similarList.innerHTML = '<li style="color: #888; font-style: italic;">No similar dreams found</li>';
          return;
        }

        similarDreams.forEach(dream => {
          const li = document.createElement('li');
          li.className = 'similar-item';
          li.innerHTML = `
            <div class="similar-text">${dream.text}</div>
            <div class="similar-score">Similarity: ${dream.similarity.toFixed(2)}</div>
          `;
          
          // Add click handler to navigate to similar dream
          li.addEventListener('click', () => {
            // Center on the dream in the constellation
            if (typeof panelClick === 'function') {
              panelClick(dream.id);
            }
            
            // Update drawer content
            const dreamData = nodes.find(n => n.id === dream.id);
            if (dreamData) {
              this.showDream(dreamData);
            }
          });
          
          this.similarList.appendChild(li);
        });
      }

      hideDream() {
        this.selectedDreamId = null;
        
        // Show no selection, hide dream display
        if (this.noSelection) this.noSelection.style.display = 'block';
        if (this.dreamDisplay) this.dreamDisplay.style.display = 'none';
        
        // Stay at peek state when hiding dream
        this.setState('peek');
      }

      open() {
        this.setState('peek');
      }

      close() {
        // Since we removed closed state, close now means peek
        this.setState('peek');
      }
    }

    // Initialize the drawer
    const dreamDrawer = new DreamBottomDrawer();

    // Integrate with existing node click functionality
    // Override the existing mobile node click behavior
    if (typeof nodes !== 'undefined' && typeof links !== 'undefined') {
      // Wait for DOM to be ready
      setTimeout(() => {
        // Find all constellation nodes and add mobile-specific click handlers
        d3.selectAll('.node').on('click.mobile', function(d) {
          console.log('Mobile node clicked:', d.id);
          
          // Show dream in bottom drawer
          dreamDrawer.showDream(d);
          
          // Still call the existing panelClick functionality for centering
          if (typeof panelClick === 'function') {
            panelClick(d.id);
          }
        });
      }, 1000); // Wait for D3 to finish rendering
    }

    // Make drawer globally accessible
    window.dreamDrawer = dreamDrawer;

    console.log('Mobile bottom drawer initialized');
  }


} // End of main constellation code block