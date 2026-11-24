# SINGULARITY // GR-1: Real-Time Relativistic Black Hole Simulation

An interactive, GPU-accelerated general relativity black hole simulation running in real-time in the browser using WebGL and GLSL fragment shaders.

![Singularity Screenshot](preview.png)

## Overview & Scientific Background

Most 3D graphics applications assume Euclidean (flat) space where light travels in straight lines ($d\mathbf{v}/d\lambda = 0$). Near compact astrophysical objects like black holes, spacetime is warped according to Einstein's Field Equations.

In this project, light rays (photons) follow **null geodesics** in the Schwarzschild metric. Rather than casting straight rays, the camera emits rays whose trajectories are numerically curved step-by-step on the GPU.

### Key Physics Features
1. **Schwarzschild Metric ($r_s = \frac{2GM}{c^2}$):** The radius defining the event horizon from which no light escapes.
2. **Photon Sphere ($r_{ph} = 1.5\,r_s$):** The critical unstable orbit where photons can complete full circular orbits around the singularity before escaping or falling in.
3. **Innermost Stable Circular Orbit ($r_{ISCO} = 3.0\,r_s$):** The closest distance matter can stably orbit without plunging into the horizon.
4. **Gravitational Lensing & Einstein Rings:** Spacetime curvature acts as a gravitational lens, bending light from the celestial background and rear accretion disk into upper and lower arcs (the iconic *Interstellar* Gargantua appearance).
5. **Relativistic Doppler Beaming (Headlight Effect):** Accretion disk plasma orbits at near-luminal speeds ($v \approx 0.4c - 0.6c$). Light emitted by material moving toward the observer is Doppler-boosted into higher frequencies (blueshift) and higher intensity ($I_{obs} \propto \delta^{3.5}$), causing one side of the disk to appear substantially brighter.
6. **Gravitational Redshift:** Time dilation deep in the gravitational well shifts emitted frequencies toward the red spectrum.

---

## Technical Stack & Architecture

* **Graphics Pipeline:** WebGL 1.0 / 2.0 via Three.js (Fullscreen Raymarching Quad)
* **Compute:** Custom GLSL Fragment Shader (Per-pixel parallel geodesic numerical integration)
* **Mathematical Methods:** Runge-Kutta / Adaptive Euler numerical integration of null geodesics:
  $$\frac{d^2 \mathbf{r}}{d\lambda^2} = -\frac{3 r_s}{2 r^5} |\mathbf{r} \times \mathbf{v}|^2 \mathbf{r}$$
* **Tone Mapping:** ACES Filmic Tone Mapping curve for photorealistic high dynamic range (HDR) plasma glow.
* **UI/UX:** Glassmorphic HUD with real-time parameter tweaking, live FPS counter, and HD screenshot capture.

---

## Running Locally

To run the simulation locally using Python's built-in HTTP server:

```bash
cd black-hole-simulation
python3 -m http.server 8000
```

Then open your browser to:
```
http://localhost:8000
```

### Controls
* **Left Click + Drag:** Orbit camera in 3D around the black hole.
* **Scroll Wheel / Pinch:** Zoom camera toward / away from the event horizon.
* **`H` Key:** Hide / show HUD interface.
* **Presets:** Toggle between Gargantua, M87*, Pure Lens, and Hyperactive configurations.
