# Benchmarks

How fast Compono runs, measured, so that decisions about performance rest on numbers.

## Canvas

[ADR 0002](adr/0002-stack.md) chose React Flow for the canvas, and asked for a benchmark before the editor is built on it. [ADR 0001](adr/0001-scope.md) asks the preview for 60 fps with 200 nodes, degrading to about 30 fps with 400, and asks the canvas to stay smooth with 300 nodes in view.

### Result

- **On a fast desktop, React Flow holds 60 fps with 200 nodes** in every scenario. With 300 and 400 nodes, only panning with every node in view drops below it, to 54 and 49 fps.
- **On a CPU 4 times slower, which stands in for a laptop, 200 nodes don't hold 60 fps.** Panning, zooming and dragging 20 nodes run at 42 to 48 fps. Dragging one node still holds 60 fps. With 400 nodes, panning and zooming fall to 22 and 25 fps, under ADR 0001's 30.
- **Drawing the nodes' text and inputs is what costs**, not React Flow's JavaScript. Below 50% zoom a node's text is under 7 px high and can't be read anyway. Drawing nodes there without text and inputs lets 400 nodes hold 60 fps on the desktop, and lets 200 nodes pan at 58 fps on the slower CPU.
- **Two problems remain on the slower CPU.** Crossing 50% zoom freezes the canvas for about 160 ms, while every node renders again. Dragging 20 nodes at 50% zoom, where nodes are drawn in full, stays at 45 fps.

So React Flow is fast enough on a desktop: as it is for 200 nodes, and for 400 if the canvas ([#43](https://github.com/bsdbx/compono/issues/43)) draws nodes without their text and inputs when zoomed out. On the slower CPU, 200 nodes run at 45 to 60 fps even then. ADR 0003 ([#31](https://github.com/bsdbx/compono/issues/31)) records the decision.

### How it's measured

[`/_benchmarks/canvas`](https://compono-app.vercel.app/_benchmarks/canvas) builds a grid of nodes copied from the design's PricingCard graph: Element, Switch and Template nodes, with a socket on every row, values typed into inputs, and a select. Each node's inputs are wired to the outputs in the column before it, which makes 340 wires for 200 nodes.

**Run** sends the mouse events that a mouse sends, for 4 seconds a scenario:

| Scenario | What it does |
| --- | --- |
| Pan with every node in view | Zooms out until every node fits, then drags the canvas in circles |
| Zoom in and out | Scrolls from every node in view to 8 times closer and back, twice |
| Drag a node at 100% | Drags a node in the middle in circles |
| Drag 20 selected nodes at 50% | Selects 5 columns and 4 rows of nodes, and drags them in circles |

It records the time between frames. A 60 Hz screen draws a frame every 16.7 ms, so a frame of more than 20 ms missed 60 fps, with room left for the timer's jitter. The canvas holds 60 fps when no more than 1 frame in 20 misses it.

The results below are medians of 3 runs. They were measured in Chrome for Testing 156, without a window but with the GPU, in a 1440×900 view at 60 Hz, on an AMD Ryzen 9 3900XT with an NVIDIA GeForce RTX 3060 Ti. **CPU ×4** is Chrome's CPU throttling, which runs the page 4 times slower, as DevTools does to stand in for a slower computer.

To run it on another computer, build the frontend for production, since a development build is several times slower:

```sh
cd frontend
pnpm build
pnpm start
```

Then open <http://localhost:3000/_benchmarks/canvas> and press **Run**. **Copy as Markdown** copies the results as a table.

### Results

Average fps. In **bold** where the canvas holds 60 fps.

Every node drawn in full:

| Scenario | 200 | 300 | 400 | 200, CPU ×4 | 300, CPU ×4 | 400, CPU ×4 | 200, CPU ×6 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Pan with every node in view | **60** | 54 | 49 | 42 | 30 | 22 | 29 |
| Zoom in and out | **60** | **59** | **58** | 48 | 35 | 25 | 33 |
| Drag a node at 100% | **60** | **60** | **60** | **60** | 53 | 41 | 51 |
| Drag 20 selected nodes at 50% | **60** | **60** | **60** | 46 | 37 | 29 | 32 |

Nodes without their text and inputs below 50% zoom:

| Scenario | 200 | 300 | 400 | 200, CPU ×4 | 300, CPU ×4 | 400, CPU ×4 | 200, CPU ×6 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Pan with every node in view | **60** | **60** | **60** | **58** | 44 | 29 | 43 |
| Zoom in and out | **59** | **59** | **58** | 51 | 34 | 23 | 30 |
| Drag a node at 100% | **60** | **60** | **60** | **60** | 54 | 37 | 47 |
| Drag 20 selected nodes at 50% | **60** | **60** | **60** | 45 | 35 | 27 | 31 |

Zooming in and out crosses 50% four times. Nodes then render again, which on the desktop takes up to 100 ms, and with CPU ×4 or ×6 from 150 to 400 ms.

Chrome's performance metrics show where the main thread spends its time. Panning 200 nodes with CPU ×4, it's busy 95% of the time: about 28% of that runs JavaScript, 5% works out styles and layout, and the rest goes to painting and Chrome's other work. With the text and inputs hidden, the same pan ran at 57 fps.

The measurements have limits. The mouse events come from the page, not from a mouse. CPU throttling slows the page's main thread, not the GPU or the rest of the computer, so CPU ×4 stands in for a slower laptop rather than measuring one. And the editor's real nodes will differ, so #43 should run the benchmark again with them.
