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

    // Set up zoom and pan behavior
    const zoom = d3.zoom()
        .scaleExtent([0.005, 20])
        .on("zoom", function () {
            container.attr("transform", d3.event.transform);
        });
    // Enable only scroll-based zoom; disable dragging and double-click zoom
    svg.call(zoom);
    let currentTransform = d3.zoomIdentity;
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
    });

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

    // This function centers the SVG view on the selected dream node using D3 zoom transforms
    function centerOnDream(dreamId) {
        const targetNode = nodes.find(n => n.id === dreamId);
        if (!targetNode) return;

        const targetX = xScale(targetNode.x);
        const targetY = yScale(targetNode.y);
        const currentTransform = d3.zoomTransform(svg.node());
        const currentScale = currentTransform.k;

        const centerX = width / 2;
        const centerY = height / 2;

        const tx = centerX - targetX * currentScale;
        const ty = centerY - targetY * currentScale;

        svg.transition().duration(750)
            .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(currentScale));
    }

    window.panelClick = function (dreamId) {
        centerOnDream(dreamId);
    };

    // Draw connections (links) between dreams
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
            const centerX = width / 2;
            const centerY = height / 2;
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

    // Render the dream nodes as circles
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

            const dreamBox = document.getElementById("tooltip"); // originally called 'tooltip' in the desktop version
            if (dreamBox) {
                dreamBox.style.display = "block";
                dreamBox.innerHTML = `<strong>Dream ${d.id}:</strong><br>${d.text}`;

                // Set fixed size for the dream box
                dreamBox.style.width = "300px";
                dreamBox.style.height = "auto";
                dreamBox.style.maxHeight = "200px";
                dreamBox.style.overflowY = "auto";
                dreamBox.style.left = `${width / 2}px`; // fixed horizontally to center
                dreamBox.style.top = `${height / 2}px`; // fixed vertically to center + 80px
            }
        });

    link
        .attr("x1", d => xScale(nodes.find(n => n.id === d.source).x))
        .attr("y1", d => yScale(nodes.find(n => n.id === d.source).y))
        .attr("x2", d => xScale(nodes.find(n => n.id === d.target).x))
        .attr("y2", d => yScale(nodes.find(n => n.id === d.target).y));

    // Auto-center on newly submitted dream if applicable
    const newDream = nodes.find(n => n.id === newDreamId);
    if (newDream) {
        const dreamX = xScale(newDream.x);
        const dreamY = yScale(newDream.y);
        const initialScale = 5;
        const centerX = width / 2;
        const centerY = height / 2;
        const tx = centerX - dreamX * initialScale;
        const ty = centerY - dreamY * initialScale;
        svg.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(initialScale));
    }

    // Adjust visibility of links based on threshold slider
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
