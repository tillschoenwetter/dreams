// ---------------------------
// DreamAtlas Telescope View
// Full constellation script with center preview
// ---------------------------


let dreamMode = false;      // false = no modal is open
let currentDream = null;    // data from the current active dream
let userIsNavigating = false;
let autoModalTimeout = null; // Timer for automatic modal opening
let lastClosestNode = null;  // Track the last closest node

// Hide spinner on page (re)show
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

// Ensure data is present before initializing
if (typeof nodes !== 'undefined' && typeof links !== 'undefined') {
    // Modal variables - define at top to ensure scope
    // const dreamModal = d3.select("#telescope-dreamModal"); // Fixed selector to match HTML
    // let openDreamId = null;
    // console.log("Modal element found:", dreamModal.empty() ? "NO" : "YES");
    
    // Test timer to verify setTimeout works
    console.log("Testing timer mechanism...");
    setTimeout(() => {
        console.log("TIMER TEST: 3-second test timer fired successfully!");
    }, 3000);
    
    // Debug userIsNavigating state every 5 seconds
    // setInterval(() => {
    //     console.log("DEBUG: userIsNavigating =", userIsNavigating, "openDreamId =", openDreamId);
    // }, 5000);
    // DOM references for similar panel (optional)
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

    // Get container dimensions (circle-container)
    const containerElement = document.querySelector('.circle-container');
    const width = containerElement ? containerElement.offsetWidth : window.innerWidth;
    const height = containerElement ? containerElement.offsetHeight : window.innerHeight;

    // Set up SVG and zoom group
    const svg = d3.select("#constellation")
        .attr("width", width)
        .attr("height", height);
    const container = svg.append("g");

    // Zoom setup
    const zoom = d3.zoom()
        .scaleExtent([1, 5])  // Changed to [1, 5] - no zooming out beyond normal view
        .on("zoom", function () {
            container.attr("transform", d3.event.transform);
            updateCenterPreview();
        })
        .filter(function() {
            // Disable default zoom behavior, we'll handle it manually
            return false;
        });
    svg.call(zoom);

    // Pointer Lock API to lock cursor in center
    const svgElement = svg.node();
    
    // Request pointer lock when clicking on the SVG
    svgElement.addEventListener('click', function() {
        svgElement.requestPointerLock();
    });

    // Handle pointer lock change
    document.addEventListener('pointerlockchange', function() {
        if (document.pointerLockElement === svgElement) {
            console.log('Cursor locked to center');
            // Cursor is now locked
        } else {
            console.log('Cursor unlocked');
            // Cursor is unlocked
        }
    });

    // Handle mouse movement when cursor is locked
    document.addEventListener('mousemove', function(e) {
        if (document.pointerLockElement === svgElement) {
            // Much higher sensitivity for mouse movement
            const sensitivity = 5.0;
            moveTelescopeX(e.movementX * sensitivity);
            moveTelescopeY(e.movementY * sensitivity);
        }
    });

    // Handle mouse wheel for zooming - always zoom from center of screen
    svgElement.addEventListener('wheel', function(e) {
        e.preventDefault();
        
        const currentTransform = d3.zoomTransform(svg.node());
        
        // Always use exact center point of the screen
        const centerX = width / 2;
        const centerY = height / 2;
        
        // Calculate the world coordinates at screen center
        const worldCenterX = (centerX - currentTransform.x) / currentTransform.k;
        const worldCenterY = (centerY - currentTransform.y) / currentTransform.k;
        
        let newScale = currentTransform.k;
        
        // Apply zoom based on wheel direction
        if (e.deltaY > 0) {
            newScale *= 0.9;  // Zoom out
        } else {
            newScale *= 1.1;  // Zoom in
        }
        
        // Keep zoom within bounds
        newScale = Math.max(1, Math.min(5, newScale));
        
        // Calculate new translation to keep screen center fixed
        const newX = centerX - worldCenterX * newScale;
        const newY = centerY - worldCenterY * newScale;
        
        const newTransform = d3.zoomIdentity.translate(newX, newY).scale(newScale);
        svg.call(zoom.transform, newTransform);
        updateCenterPreview();
    });

    // Escape key to unlock cursor
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && document.pointerLockElement === svgElement) {
            document.exitPointerLock();
        }
    });

    // Add debugging right after svg setup
    console.log("=== TELESCOPE DEBUG ===");
    console.log("SVG element:", svg.node());
    console.log("Zoom object:", zoom);
    console.log("Constellation data - Nodes:", nodes.length, "Links:", links.length);

    // Simple rotary input - ultra smooth settings
    const BASE_MOVE_SENSITIVITY = 5.0;     // Much higher base sensitivity
    let ZOOM_SENSITIVITY = 0.0001;         // Much smoother zoom

    // Direct movement functions - with zoom-based speed adjustment
    window.moveTelescopeX = function(value) {
        const currentTransform = d3.zoomTransform(svg.node());
        
        // Simple linear speed based on zoom level
        // At zoom 1: multiply by 10, at zoom 5: multiply by 1
        const speedMultiplier = (6 - currentTransform.k) * 2; // Simple linear calculation
        const adjustedSensitivity = BASE_MOVE_SENSITIVITY * speedMultiplier;
        
        console.log(`Zoom: ${currentTransform.k}, Speed: ${speedMultiplier}, Final speed: ${adjustedSensitivity}`);
        
        const newX = currentTransform.x + (value * adjustedSensitivity);
        const newTransform = d3.zoomIdentity.translate(newX, currentTransform.y).scale(currentTransform.k);
        svg.call(zoom.transform, newTransform);
        updateCenterPreview();
        // Don't clear timer on movement - let it complete if dream is still close
    };

    window.moveTelescopeY = function(value) {
        const currentTransform = d3.zoomTransform(svg.node());
        
        // Simple linear speed based on zoom level
        // At zoom 1: multiply by 10, at zoom 5: multiply by 1
        const speedMultiplier = (6 - currentTransform.k) * 2; // Simple linear calculation
        const adjustedSensitivity = BASE_MOVE_SENSITIVITY * speedMultiplier;
        
        const newY = currentTransform.y + (value * adjustedSensitivity);
        const newTransform = d3.zoomIdentity.translate(currentTransform.x, newY).scale(currentTransform.k);
        svg.call(zoom.transform, newTransform);
        updateCenterPreview();
        // Don't clear timer on movement - let it complete if dream is still close
    };

    // Handle mouse movement when cursor is locked - also increase sensitivity
    document.addEventListener('mousemove', function(e) {
        if (document.pointerLockElement === svgElement) {
            // Much higher sensitivity for mouse movement
            const sensitivity = 5.0;
            moveTelescopeX(e.movementX * sensitivity);
            moveTelescopeY(e.movementY * sensitivity);
        }
    });

    window.zoomTelescope = function(direction) {
        const currentTransform = d3.zoomTransform(svg.node());
        
        // Get exact center point of the crosshair (middle of screen)
        const centerX = width / 2;
        const centerY = height / 2;
        
        // Calculate the world coordinates that are currently at the exact crosshair center
        const worldCenterX = (centerX - currentTransform.x) / currentTransform.k;
        const worldCenterY = (centerY - currentTransform.y) / currentTransform.k;
        
        let newScale = currentTransform.k;
        
        // Ultra smooth zoom increments for rotary sensor
        if (direction > 0) {
            newScale *= (1 + ZOOM_SENSITIVITY);  // Zoom in
        } else if (direction < 0) {
            newScale *= (1 - ZOOM_SENSITIVITY);  // Zoom out
        }
        
        // Keep zoom within bounds - updated limits
        newScale = Math.max(1, Math.min(5, newScale));  // Changed to [1, 5]
        
        // Calculate new translation to keep the exact crosshair point fixed
        const newX = centerX - worldCenterX * newScale;
        const newY = centerY - worldCenterY * newScale;
        
        const newTransform = d3.zoomIdentity.translate(newX, newY).scale(newScale);
        svg.call(zoom.transform, newTransform);
        updateCenterPreview();
        // Don't clear timer on zoom - let it complete if dream is still close
    };

    // Function to adjust zoom sensitivity
    window.setZoomSensitivity = function(sensitivity) {
        ZOOM_SENSITIVITY = sensitivity;
    };

    // Function to start the auto-modal timer (restart if needed)
    // function startAutoModalTimer() {
    //     console.log("startAutoModalTimer called - openDreamId:", openDreamId, "userIsNavigating:", userIsNavigating);
    //     
    //     // Don't set new timer if modal is already open or user is navigating
    //     if (openDreamId !== null || userIsNavigating) {
    //         console.log("Not setting timer - modal open or navigating");
    //         return;
    //     }
    //     
    //     // Clear existing timer if there is one and start fresh
    //     if (autoModalTimeout) {
    //         console.log("Clearing existing timer and starting new one");
    //         clearTimeout(autoModalTimeout);
    //         autoModalTimeout = null;
    //     }
    //     
    //     // Start new timer for 2 seconds
    //     console.log("Setting 2-second auto-modal timer");
    //     const startTime = Date.now();
    //     autoModalTimeout = setTimeout(() => {
    //         const elapsed = Date.now() - startTime;
    //         console.log(`Auto-modal timer fired after ${elapsed}ms (should be ~2000ms)!`);
    //         checkForAutoModal();
    //     }, 2000);
    //     console.log("Timer set, autoModalTimeout =", autoModalTimeout !== null);
    // }

    // Function to clear the auto-modal timer
    // function clearAutoModalTimer() {
    //     if (autoModalTimeout) {
    //         console.log("Clearing auto-modal timer");
    //         clearTimeout(autoModalTimeout);
    //         autoModalTimeout = null;
    //     }
    // }

    // Function to check if we should automatically open a modal
    // function checkForAutoModal() {
    //     console.log("checkForAutoModal called - openDreamId:", openDreamId, "userIsNavigating:", userIsNavigating);
    //     
    //     // Clear the timer first since it fired
    //     autoModalTimeout = null;
    //     
    //     // Don't auto-open if modal is already open or user is navigating
    //     if (openDreamId !== null || userIsNavigating) {
    //         console.log("Aborting auto-modal - modal open or navigating");
    //         return;
    //     }

    //     const transform = d3.zoomTransform(svg.node());
    //     const centerX = width / 2;
    //     const centerY = height / 2;
    //     let closestNode = null;
    //     let minDist = Infinity;

    //     for (const node of nodes) {
    //         const nodeX = xScale(node.x) * transform.k + transform.x;
    //         const nodeY = yScale(node.y) * transform.k + transform.y;
    //         const dx = nodeX - centerX;
    //         const dy = nodeY - centerY;
    //         const dist = dx * dx + dy * dy;
    //         if (dist < minDist) {
    //             minDist = dist;
    //             closestNode = node;
    //         }
    //     }

    //     const maxDist = 40*40; // Same threshold as preview box
    //     console.log("Closest node:", closestNode?.id, "distance:", Math.sqrt(minDist), "threshold:", Math.sqrt(maxDist));
    //     
    //     // If there's STILL a dream close to center, open its modal
    //     if (closestNode && minDist < maxDist) {
    //         console.log("Auto-opening modal for dream", closestNode.id);
    //         toggleDreamModal(closestNode);
    //     } else {
    //         console.log("Dream no longer close to center, not opening modal");
    //     }
    // }

    console.log("Simple telescope functions defined:");
    console.log("moveTelescopeX:", typeof window.moveTelescopeX);
    console.log("moveTelescopeY:", typeof window.moveTelescopeY);
    console.log("zoomTelescope:", typeof window.zoomTelescope);

    // Keep the existing keyboard controls as fallback (but modify them to be less jerky)
    document.addEventListener('keydown', function(event) {
        currentTransform = d3.zoomTransform(svg.node());
        let tx = currentTransform.x;
        let ty = currentTransform.y;
        let k = currentTransform.k;

        const MOVE_SPEED = 3;  // Reduced for smoother keyboard movement
        const ZOOM_SPEED = 0.005; // Reduced for smoother keyboard zoom

        // Set navigating to true
        userIsNavigating = true;

        // Optional: close the modal if it's open
        // if (openDreamId !== null) {
        //     dreamModal.style("display", "none").html("");
        //     openDreamId = null;
        //     d3.select(window).on("click.modal", null);
        // }

        // Movement / zoom
        switch(event.key) {
            case 'ArrowLeft': tx += MOVE_SPEED; break;
            case 'ArrowRight': tx -= MOVE_SPEED; break;
            case 'ArrowUp': ty += MOVE_SPEED; break;
            case 'ArrowDown': ty -= MOVE_SPEED; break;
            case '+':
            case '=': k *= (1 + ZOOM_SPEED); break;
            case '-':
            case '_': k *= (1 - ZOOM_SPEED); break;
            default:
                return; // Don't do anything if another key is pressed
        }

        const newTransform = d3.zoomIdentity.translate(tx, ty).scale(k);
        svg.transition().duration(50).call(zoom.transform, newTransform); // Faster transition
        updateCenterPreview();
        // Don't clear timer on keyboard movement - let it complete if dream is still close

        // Reset navigating after a short pause
        clearTimeout(window.navigationTimeout);
        window.navigationTimeout = setTimeout(() => {
            userIsNavigating = false;
        }, 200); // Shorter timeout
    });
    
    

    // Scales for positioning nodes
    const xScale = d3.scaleLinear().domain([0, 30]).range([0, width]);
    const yScale = d3.scaleLinear().domain([0, 30]).range([0, height]);

    // Stroke width for links (based on similarity)
    function getStrokeWidth(similarity) {
        return similarity < 0.7
            ? 0.01 + ((Math.max(0.5, similarity) - 0.5) / 0.2) * (0.1 - 0.001)
            : 0.1 + ((similarity - 0.7) / 0.3) * (2 - 0.1);
    }

    // Center camera on a node
    function centerOnDream(dreamId) {
        const target = nodes.find(n => n.id === dreamId);
        if (!target) return;
        const tx = width / 2 - xScale(target.x) * currentTransform.k;
        const ty = height / 2 - yScale(target.y) * currentTransform.k;
        svg.transition().duration(750)
           .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(currentTransform.k));
    }

    // Tooltip display
    const tooltip = d3.select("#tooltip");

    // Draw dream links
    const link = container.append("g")
        .attr("class", "links")
        .selectAll("line")
        .data(links)
        .enter().append("line")
        .attr("class", "link")
        .style("stroke", "#ccc")
        .style("stroke-width", d => {
            const w = getStrokeWidth(d.similarity);
            return (d.source === newDreamId || d.target === newDreamId) ? w * 2 : w;
        })
        .on("click", d => {
            const src = nodes.find(n => n.id === d.source);
            const tgt = nodes.find(n => n.id === d.target);
            const cx = width / 2;
            const cy = height / 2;
            const closer = Math.hypot(xScale(src.x) - cx, yScale(src.y) - cy) > Math.hypot(xScale(tgt.x) - cx, yScale(tgt.y) - cy) ? tgt : src;
            centerOnDream(closer.id);
        });

    // Node size scale
    const scoreExtent = d3.extent(nodes, d => d.score);
    if (scoreExtent[0] === scoreExtent[1]) {
        scoreExtent[0] *= 0.9;
        scoreExtent[1] *= 1.1;
    }
    const sizeScale = d3.scalePow().exponent(2).domain(scoreExtent).range([0.1, 3]);

    // Draw nodes (dreams as circles)
    container.append("g")
        .attr("class", "nodes")
        .selectAll("circle")
        .data(nodes)
        .enter().append("circle")
        .attr("class", "node")
        .attr("cx", d => xScale(d.x))
        .attr("cy", d => yScale(d.y))
        .attr("r", d => sizeScale(d.score))
        .attr("fill", "#fff")
        .on("click", d => {
            centerOnDream(d.id);   // keeps your centring logic
            // toggleDreamModal(d);   // new open/close behaviour
        })

    // Position links based on node positions
    link.attr("x1", d => xScale(nodes.find(n => n.id === d.source).x))
        .attr("y1", d => yScale(nodes.find(n => n.id === d.source).y))
        .attr("x2", d => xScale(nodes.find(n => n.id === d.target).x))
        .attr("y2", d => yScale(nodes.find(n => n.id === d.target).y));
    
    // ONE persistent modal + toggling via "single-click" scheme
    // Modal variables moved to top of file for proper scoping
    function toggleDreamModal(d){

        // A.  If a modal is already open ⇒ close it and return
        if(openDreamId !== null){             
         dreamModal.style("display","none").html("");
          openDreamId = null;

           // remove the global one-off listener
           d3.select(window).on("click.modal", null);
           return;                             
        }

      // B.  Otherwise open *this* dream
        openDreamId = d.id;
        clearAutoModalTimer(); // Clear auto-timer when manually opening modal
        dreamModal.html(`<h3 style="margin-top:0;">Dream ${d.id}</h3><p>${d.text}</p>`)
        .style("display","block");

        d3.select(window).on("click.modal", () => {
            dreamModal.style("display","none").html("");
            openDreamId = null;
            d3.select(window).on("click.modal", null);   // detach
        }, true);   // ← capture phase so it fires before svg/node handlers
        previewBox.style("display", "none");

    }

     // Center preview box (HUD-style) 
    const previewBox = d3.select("#centerPreview");
    let updateCount = 0;
    function updateCenterPreview() {
        updateCount++;
        if (updateCount % 60 === 0) { // Log every 60th call to avoid spam
            console.log("updateCenterPreview called", updateCount, "times");
        }
        const transform = d3.zoomTransform(svg.node());
        const centerX = width / 2;
        const centerY = height / 2;
        let closestNode = null;
        let minDist = Infinity;
        for (const node of nodes) {
            const nodeX = xScale(node.x) * transform.k + transform.x;
            const nodeY = yScale(node.y) * transform.k + transform.y;
            const dx = nodeX - centerX;
            const dy = nodeY - centerY;
            const dist = dx * dx + dy * dy;
            if (dist < minDist) {
                minDist = dist;
                closestNode = node;
            }
        }
        const maxDist = 40*40; // area around center that activate the previewBox
        
        if (closestNode && minDist < maxDist) {
            previewBox.classed("show", true)
                      .html(`<div class="preview-background"></div><div class="preview-text">${closestNode.text.slice(0, 600)}</div>`)
                      .classed("fade-in", true)
                      .classed("fade-out", false);
            
            console.log("Preview showing for dream", closestNode.id, "lastClosest:", lastClosestNode?.id);
            
            // Start timer if not already running (won't restart if already running)
            console.log("Dream close to center, starting timer if not already running");
            lastClosestNode = closestNode;
            // startAutoModalTimer();
        }
        else {
            if (lastClosestNode !== null) {
                // Fade out before hiding
                console.log("FADE OUT: Starting fade out animation");
                previewBox.classed("fade-out", true)
                          .classed("fade-in", false);
                console.log("FADE OUT: Classes applied, setting timeout for 1000ms");
                setTimeout(() => {
                    console.log("FADE OUT: Timeout completed, hiding element");
                    previewBox.classed("show", false);
                    lastClosestNode = null; // Only clear after animation completes
                }, 1000); // Match the fadeOut animation duration
                console.log("No node close to center, clearing timer");
            }
            // Clear timer when no node is close
            // clearAutoModalTimer();
        }
        // if (openDreamId !== null) {
        //     previewBox.style("display", "none");
        //     return;
        // }
    }
} // end if data is defined
