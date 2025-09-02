// ---------------------------
// DreamAtlas Telescope View
// Full constellation script with center preview
// ---------------------------


let dreamMode = false;      // false = no modal is open
let currentDream = null;    // data from the current active dream
let userIsNavigating = false;

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

    // Handle mouse wheel for zooming when cursor is locked
    svgElement.addEventListener('wheel', function(e) {
        e.preventDefault();
        if (document.pointerLockElement === svgElement) {
            const currentTransform = d3.zoomTransform(svg.node());
            
            // Get exact center point of the crosshair
            const centerX = width / 2;
            const centerY = height / 2;
            
            // Calculate the world coordinates at crosshair center
            const worldCenterX = (centerX - currentTransform.x) / currentTransform.k;
            const worldCenterY = (centerY - currentTransform.y) / currentTransform.k;
            
            let newScale = currentTransform.k;
            
            // Apply zoom based on wheel direction
            if (e.deltaY > 0) {
                newScale *= (1 - ZOOM_SENSITIVITY);  // Zoom out
            } else {
                newScale *= (1 + ZOOM_SENSITIVITY);  // Zoom in
            }
            
            // Keep zoom within bounds - updated limits
            newScale = Math.max(1, Math.min(5, newScale));  // Changed to [1, 5]
            
            // Calculate new translation to keep crosshair center fixed
            const newX = centerX - worldCenterX * newScale;
            const newY = centerY - worldCenterY * newScale;
            
            const newTransform = d3.zoomIdentity.translate(newX, newY).scale(newScale);
            svg.call(zoom.transform, newTransform);
            updateCenterPreview();
        }
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
    };

    // Function to adjust zoom sensitivity
    window.setZoomSensitivity = function(sensitivity) {
        ZOOM_SENSITIVITY = sensitivity;
    };

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
        if (openDreamId !== null) {
            dreamModal.style("display", "none").html("");
            openDreamId = null;
            d3.select(window).on("click.modal", null);
        }

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
            toggleDreamModal(d);   // new open/close behaviour
        })

    // Position links based on node positions
    link.attr("x1", d => xScale(nodes.find(n => n.id === d.source).x))
        .attr("y1", d => yScale(nodes.find(n => n.id === d.source).y))
        .attr("x2", d => xScale(nodes.find(n => n.id === d.target).x))
        .attr("y2", d => yScale(nodes.find(n => n.id === d.target).y));
    
    // ONE persistent modal + toggling via "single-click" scheme
    const dreamModal  = d3.select("#dreamModal");
    let openDreamId   = null;                 // remembers if a dream is open
    // let closeListener = null;                 // will hold the once() handler ??????
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
    function updateCenterPreview() {
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
            previewBox.style("display", "block")
                      .html(`<strong>Dream ${closestNode.id}:</strong> ${closestNode.text.slice(0, 100)}...`);
        }
        else {
            previewBox.style("display", "none");
        }
        if (openDreamId !== null) {
            previewBox.style("display", "none");
            return;
        }
    }
} // end if data is defined
