// ---------------------------
// DreamAtlas Telescope View
// Full constellation script with center preview
// ---------------------------


let dreamMode = false;      // false = nessun modal aperto
let currentDream = null;    // dato del sogno attivo
const dreamModal = d3.select('#dreamModal');


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
        .scaleExtent([0.005, 20])
        .on("zoom", function () {
            container.attr("transform", d3.event.transform);
            updateCenterPreview();
        });
    svg.call(zoom);

    // Keyboard controls for navigation
    let currentTransform = d3.zoomTransform(svg.node());
    const MOVE_SPEED = 30;
    const ZOOM_SPEED = 0.1;
    document.addEventListener('keydown', function(event) {
        currentTransform = d3.zoomTransform(svg.node());
        let tx = currentTransform.x;
        let ty = currentTransform.y;
        let k = currentTransform.k;

        switch(event.key) {
            case 'ArrowLeft': tx += MOVE_SPEED; break;
            case 'ArrowRight': tx -= MOVE_SPEED; break;
            case 'ArrowUp': ty += MOVE_SPEED; break;
            case 'ArrowDown': ty -= MOVE_SPEED; break;
            case '+':
            case '=': k *= (1 + ZOOM_SPEED); break;
            case '-':
            case '_': k *= (1 - ZOOM_SPEED); break;
        }

        const newTransform = d3.zoomIdentity.translate(tx, ty).scale(k);
        svg.transition().duration(100).call(zoom.transform, newTransform);
        updateCenterPreview();
    });

    // Scales for positioning nodes
    const xScale = d3.scaleLinear().domain([0, 30]).range([0, width]);
    const yScale = d3.scaleLinear().domain([0, 30]).range([0, height]);

    // Stroke width for links (based on similarity)
    function getStrokeWidth(similarity) {
        return similarity < 0.7
            ? 0.01 + ((Math.max(0.5, similarity) - 0.5) / 0.2) * (0.1 - 0.001)
            : 0.1 + ((similarity - 0.7) / 0.3) * (3 - 0.1);
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
    
    // ────────────────────────────────────────────────────────────────
    // ONE persistent modal + toggling via "single-click" scheme
    // ────────────────────────────────────────────────────────────────
    const dreamModal  = d3.select("#dreamModal");
    let openDreamId   = null;                 // remembers if a dream is open
    let closeListener = null;                 // will hold the once() handler

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
      dreamModal
        .html(`<h3 style="margin-top:0;">Dream ${d.id}</h3><p>${d.text}</p>`)
        .style("display","block");

        /* -----------------------------------------------
        Attach ONE temporary listener that waits for
        the very next click ANYWHERE, then closes the
        modal (and removes itself).  Namespacing the
        event ('click.modal') keeps it independent of
        other click handlers.
        -------------------------------------------------*/
        d3.select(window).on("click.modal", () => {
            dreamModal.style("display","none").html("");
            openDreamId = null;
            d3.select(window).on("click.modal", null);   // detach
        }, true);   // ← capture phase so it fires before svg/node handlers
    }

     // --- Center preview box (HUD-style)
    const previewBox = d3.select("body").append("div")
        .attr("id", "centerPreview")
        .style("display", "none");
    // --- Dynamic center preview HUD ---
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
        if (closestNode) {
            previewBox.style("display", "block")
                      .html(`<strong>Dream ${closestNode.id}:</strong> ${closestNode.text.slice(0, 150)}...`);
        }
    }
} // end if data is defined
