/**
 * RELATIVISTIC BLACK HOLE SIMULATION (SINGULARITY // GR-1)
 * --------------------------------------------------------
 * Real-Time Curved Spacetime Ray Marching in WebGL / GLSL.
 * Solves the null geodesic equation for photons moving in a Schwarzschild metric:
 * 
 *   d²r/dλ² = - (3/2) * r_s * |r × v|² / |r|⁵ * r
 * 
 * Features:
 *   1. Null geodesic integration (Runge-Kutta / adaptive Euler ray marching).
 *   2. Gravitational lensing of procedural deep-space nebula and starfield (Einstein rings).
 *   3. Relativistic accretion disk with Keplerian orbital motion.
 *   4. Relativistic Doppler beaming (headlight effect) & Gravitational redshift.
 *   5. ACES filmic tonemapping & interactive HUD.
 */

// =============================================================================
// 1. GLSL FRAGMENT SHADER (CURVED SPACETIME RAYMARCHER)
// =============================================================================
const fragmentShader = `
precision highp float;

uniform vec2  u_resolution;
uniform float u_time;
uniform vec3  u_cam_pos;
uniform vec3  u_cam_target;
uniform vec3  u_cam_up;
uniform float u_fov;

// Physics uniforms
uniform float u_mass;
uniform float u_disk_brightness;
uniform float u_doppler_strength;
uniform float u_disk_speed;
uniform float u_star_exposure;
uniform int   u_max_steps;

#define PI 3.14159265359
#define ESCAPE_RADIUS 35.0

// ---------------------------------------------------------
// Procedural Hash & Simplex-style Noise for Disk & Stars
// ---------------------------------------------------------
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

// 2D Noise for accretion disk turbulence
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Fractal Brownian Motion for swirling plasma gas
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = rot * p * 2.05;
    a *= 0.5;
  }
  return v;
}

// ---------------------------------------------------------
// Deep Space Background Starfield & Milky Way Galaxy
// ---------------------------------------------------------
vec3 getSkyBackground(vec3 dir) {
  // Normalize direction
  vec3 d = normalize(dir);
  
  // Galactic plane orientation
  float galacticLat = abs(d.y);
  float galacticDisk = exp(-galacticLat * 3.5);
  
  // Base cosmic glow
  vec3 nebulaColor1 = vec3(0.02, 0.05, 0.12); // Deep cosmic indigo
  vec3 nebulaColor2 = vec3(0.15, 0.04, 0.18); // Magenta nebula
  vec3 nebulaColor3 = vec3(0.18, 0.08, 0.03); // Warm galactic dust core
  
  // Nebula FBM in spherical coordinates
  vec2 skyUV = vec2(atan(d.z, d.x), asin(clamp(d.y, -1.0, 1.0)));
  float neb = fbm(skyUV * 3.0);
  float nebDust = fbm(skyUV * 6.0 + vec2(1.5, -2.0));
  
  vec3 bg = mix(nebulaColor1, nebulaColor2, neb);
  bg += nebulaColor3 * galacticDisk * nebDust * 1.5;
  
  // Stars generation via cell grid
  vec3 p = d * 220.0;
  vec3 id = floor(p);
  float starRand = hash3(id);
  
  if (starRand > 0.982) {
    vec3 center = id + 0.5;
    float dist = length(p - center);
    float brightness = pow((1.0 - smoothstep(0.0, 0.45, dist)), 4.0);
    
    // Star color variation based on stellar class (O, B, A, G, M)
    float temp = hash3(id + 11.0);
    vec3 starColor = mix(vec3(0.6, 0.8, 1.0), vec3(1.0, 0.9, 0.7), temp);
    if (temp < 0.2) starColor = vec3(1.0, 0.45, 0.3); // Red giant
    
    bg += starColor * brightness * (1.0 + 8.0 * pow(starRand, 12.0));
  }
  
  // Large prominent bright stars
  vec3 pLarge = d * 60.0;
  vec3 idL = floor(pLarge);
  float starRandL = hash3(idL + 77.0);
  if (starRandL > 0.994) {
    vec3 center = idL + 0.5;
    float dist = length(pLarge - center);
    float glow = exp(-dist * 4.5);
    bg += vec3(0.9, 0.95, 1.0) * glow * 2.8;
  }
  
  return bg * u_star_exposure;
}

// ---------------------------------------------------------
// Accretion Disk Physics & Blackbody Emission
// ---------------------------------------------------------
// Maps temperature/energy to blackbody radiation color
vec3 blackbodyPalette(float t) {
  // Normalized temperature: 0.0 (cool edge) -> 1.0 (ultra-hot ISCO)
  vec3 coolRed = vec3(0.65, 0.08, 0.02);
  vec3 fieryOrange = vec3(1.0, 0.38, 0.05);
  vec3 brightYellow = vec3(1.0, 0.85, 0.25);
  vec3 hotWhiteCyan = vec3(0.85, 0.95, 1.3);
  
  if (t < 0.35) {
    return mix(coolRed, fieryOrange, t / 0.35);
  } else if (t < 0.7) {
    return mix(fieryOrange, brightYellow, (t - 0.35) / 0.35);
  } else {
    return mix(brightYellow, hotWhiteCyan, (t - 0.7) / 0.3);
  }
}

// Compute accretion disk sample at 3D point pos
vec4 sampleAccretionDisk(vec3 pos, vec3 rayDir, float rs, float isco, float rOuter) {
  float r = length(pos.xz);
  
  // Check if within disk radial bounds
  if (r < isco || r > rOuter) {
    return vec4(0.0);
  }
  
  // Vertical exponential density profile: gas falls off sharply away from equatorial plane
  float diskHalfHeight = 0.07 * r; // Flared accretion disk profile
  float zDist = abs(pos.y);
  float verticalFalloff = exp(-0.5 * pow(zDist / diskHalfHeight, 2.0));
  if (verticalFalloff < 0.01) return vec4(0.0);
  
  // Keplerian orbital motion: v_orbit = sqrt(GM / r) -> angular velocity omega ~ r^(-1.5)
  float omega = sqrt(0.5 * rs / (r * r * r)) * u_disk_speed;
  float angle = atan(pos.z, pos.x);
  float timeOffset = u_time * omega * 4.0;
  
  // Procedural gas density filaments
  vec2 diskUV = vec2(r * 2.5, angle * 3.5 + timeOffset);
  float gasNoise = fbm(diskUV);
  float gasDensity = smoothstep(isco, isco + 0.5 * rs, r) * 
                     (1.0 - smoothstep(rOuter - 1.5 * rs, rOuter, r)) * 
                     (0.5 + 0.8 * gasNoise) * verticalFalloff;
  
  // ---------------------------------------------------------
  // Relativistic Doppler Beaming (Headlight Effect)
  // ---------------------------------------------------------
  // Tangential orbital velocity vector of gas (counter-clockwise in XZ)
  vec3 vGas = normalize(vec3(-pos.z, 0.0, pos.x));
  
  // Orbital speed beta = v / c (sub-luminal Keplerian orbit near ISCO)
  float beta = clamp(sqrt(0.5 * rs / r) * 0.7, 0.0, 0.65);
  float gamma = 1.0 / sqrt(max(0.01, 1.0 - beta * beta));
  
  // Cosine of angle between emitter velocity and ray coming toward observer
  // Note: rayDir is traveling forward from camera, so (-rayDir) is direction to observer
  float cosTheta = dot(vGas, -rayDir);
  
  // Doppler factor: delta = 1 / [gamma * (1 - beta * cosTheta)]
  float dopplerFactor = 1.0 / (gamma * (1.0 - beta * cosTheta));
  
  // Gravitational redshift factor: g = sqrt(1 - rs / r)
  float gravRedshift = sqrt(clamp(1.0 - rs / r, 0.05, 1.0));
  
  // Total relativistic frequency shift
  float shift = mix(1.0, dopplerFactor * gravRedshift, u_doppler_strength);
  
  // Intensity boosting: I_obs = I_emit * shift^4 (Liouville's theorem for Lorentz invariant intensity)
  float beaming = pow(shift, 3.5);
  
  // Temperature gradient: hottest near ISCO, cooler at outer rim
  float normalizedTemp = clamp((rOuter - r) / (rOuter - isco), 0.0, 1.0);
  vec3 emissionColor = blackbodyPalette(normalizedTemp * shift);
  
  vec3 finalColor = emissionColor * gasDensity * beaming * u_disk_brightness;
  float alpha = clamp(gasDensity * 0.45 * (1.0 + beaming * 0.25), 0.0, 1.0);
  
  return vec4(finalColor, alpha);
}

// ---------------------------------------------------------
// ACES Filmic Tone Mapping for Photorealistic HDR Glow
// ---------------------------------------------------------
vec3 ACESFilm(vec3 x) {
  float a = 2.51;
  float b = 0.03;
  float c = 2.43;
  float d = 0.59;
  float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

// =========================================================
// MAIN RELATIVISTIC RAYMARCHING ENGINE
// =========================================================
void main() {
  // Normalized Device Coordinates [-1, 1] corrected for aspect ratio
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  
  // Camera coordinate system
  vec3 camDir = normalize(u_cam_target - u_cam_pos);
  vec3 camRight = normalize(cross(camDir, u_cam_up));
  vec3 camRealUp = cross(camRight, camDir);
  
  // Initial ray from pinhole camera
  float fovScale = tan(u_fov * 0.5);
  vec3 rayDir = normalize(camDir + uv.x * camRight * fovScale + uv.y * camRealUp * fovScale);
  vec3 rayPos = u_cam_pos;
  
  // Physics parameters
  float M = u_mass;
  float rs = 2.0 * M;              // Schwarzschild radius (Event Horizon)
  float isco = 3.0 * rs;           // Innermost Stable Circular Orbit
  float rOuter = 8.8 * rs;         // Outer disk edge
  
  // Accumulated color & transmittance along light ray
  vec3 accumulatedColor = vec3(0.0);
  float transmittance = 1.0;
  
  bool swallowedByHorizon = false;
  
  // Adaptive step size integration loop
  for (int step = 0; step < 260; step++) {
    if (step >= u_max_steps) break;
    
    float r = length(rayPos);
    
    // 1. EVENT HORIZON CHECK
    if (r <= rs * 1.01) {
      swallowedByHorizon = true;
      break;
    }
    
    // 2. ESCAPE TO INFINITY CHECK
    if (r > ESCAPE_RADIUS) {
      break;
    }
    
    // 3. SAMPLE ACCRETION DISK (Volumetric integration near plane)
    // Only test disk when ray is reasonably close to equatorial plane y=0
    if (abs(rayPos.y) < 1.4 * rs) {
      vec4 diskSample = sampleAccretionDisk(rayPos, rayDir, rs, isco, rOuter);
      if (diskSample.a > 0.0) {
        accumulatedColor += transmittance * diskSample.rgb;
        transmittance *= (1.0 - diskSample.a);
        if (transmittance < 0.01) break; // Ray saturated
      }
    }
    
    // 4. GENERAL RELATIVITY NULL GEODESIC INTEGRATION
    // Adaptive step size: smaller steps near strong gravity (r ~ rs), larger steps in weak gravity
    float dt = clamp(0.045 * r, 0.018, 0.45);
    
    // Null geodesic equation in Schwarzschild metric:
    // a = - (1.5 * rs * |r × v|² / r⁵) * r
    vec3 L = cross(rayPos, rayDir);
    float h2 = dot(L, L); // Squared specific angular momentum
    float r5 = pow(r, 5.0);
    vec3 accel = (-1.5 * rs * h2 / r5) * rayPos;
    
    // Velocity-Verlet / Euler step in curved spacetime
    rayDir += accel * dt;
    rayDir = normalize(rayDir); // Maintain invariant light speed c = 1
    rayPos += rayDir * dt;
  }
  
  // Final background composition
  if (swallowedByHorizon) {
    // Absorbed by singularity: Event horizon is pitch black
    accumulatedColor += vec3(0.0);
  } else {
    // Ray successfully escaped to celestial sphere: Gravitationally lensed background
    vec3 skyColor = getSkyBackground(rayDir);
    accumulatedColor += transmittance * skyColor;
  }
  
  // Tone mapping and gamma correction
  vec3 mapped = ACESFilm(accumulatedColor);
  mapped = pow(mapped, vec3(1.0 / 2.2));
  
  gl_FragColor = vec4(mapped, 1.0);
}
`;

// =============================================================================
// 2. THREE.JS APPLICATION HARNESS & INTERACTION CONTROLLER
// =============================================================================
class BlackHoleApp {
  constructor() {
    this.container = document.getElementById('canvas-container');
    
    // Camera orbital state
    this.orbit = {
      radius: 14.0,
      theta: 0.15, // Elevation angle
      phi: 1.25,   // Azimuthal angle
      isDragging: false,
      lastMouseX: 0,
      lastMouseY: 0,
      targetRadius: 14.0,
      targetTheta: 0.15,
      targetPhi: 1.25,
    };
    
    // Simulation state
    this.physics = {
      mass: 1.0,
      diskBrightness: 2.2,
      dopplerStrength: 1.0,
      diskSpeed: 0.4,
      starExposure: 1.2,
      maxSteps: 160,
    };
    
    this.fps = {
      lastTime: performance.now(),
      frames: 0,
      element: document.getElementById('fps-counter')
    };

    this.initThree();
    this.initEvents();
    this.initUI();
    this.animate(0);
  }

  initThree() {
    // Scene & Orthographic Camera for Fullscreen Shader Quad
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    
    this.renderer = new THREE.WebGLRenderer({
      powerPreference: 'high-performance',
      antialias: false,
      preserveDrawingBuffer: true
    });
    
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.container.appendChild(this.renderer.domElement);

    // Uniforms mapping directly to GLSL
    this.uniforms = {
      u_resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      u_time: { value: 0.0 },
      u_cam_pos: { value: new THREE.Vector3() },
      u_cam_target: { value: new THREE.Vector3(0, 0, 0) },
      u_cam_up: { value: new THREE.Vector3(0, 1, 0) },
      u_fov: { value: 65.0 * (Math.PI / 180.0) },
      u_mass: { value: this.physics.mass },
      u_disk_brightness: { value: this.physics.diskBrightness },
      u_doppler_strength: { value: this.physics.dopplerStrength },
      u_disk_speed: { value: this.physics.diskSpeed },
      u_star_exposure: { value: this.physics.starExposure },
      u_max_steps: { value: this.physics.maxSteps }
    };

    // Fullscreen quad geometry
    const geometry = new THREE.PlaneGeometry(2, 2);
    this.material = new THREE.ShaderMaterial({
      vertexShader: `
        void main() {
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: fragmentShader,
      uniforms: this.uniforms,
      depthWrite: false,
      depthTest: false
    });

    const quad = new THREE.Mesh(geometry, this.material);
    this.scene.add(quad);
    
    this.updateCameraPosition();
  }

  updateCameraPosition() {
    // Smooth spherical interpolation
    this.orbit.radius += (this.orbit.targetRadius - this.orbit.radius) * 0.1;
    this.orbit.theta += (this.orbit.targetTheta - this.orbit.theta) * 0.1;
    this.orbit.phi += (this.orbit.targetPhi - this.orbit.phi) * 0.1;

    // Constrain theta to prevent flipping at poles
    this.orbit.theta = Math.max(-Math.PI * 0.48, Math.min(Math.PI * 0.48, this.orbit.theta));

    const x = this.orbit.radius * Math.cos(this.orbit.theta) * Math.sin(this.orbit.phi);
    const y = this.orbit.radius * Math.sin(this.orbit.theta);
    const z = this.orbit.radius * Math.cos(this.orbit.theta) * Math.cos(this.orbit.phi);

    this.uniforms.u_cam_pos.value.set(x, y, z);
  }

  initEvents() {
    // Resize handling
    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.renderer.setSize(w, h);
      this.uniforms.u_resolution.value.set(w, h);
    });

    // Mouse Dragging (Orbiting)
    const dom = this.renderer.domElement;
    
    dom.addEventListener('mousedown', (e) => {
      this.orbit.isDragging = true;
      this.orbit.lastMouseX = e.clientX;
      this.orbit.lastMouseY = e.clientY;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.orbit.isDragging) return;
      const dx = e.clientX - this.orbit.lastMouseX;
      const dy = e.clientY - this.orbit.lastMouseY;

      this.orbit.targetPhi -= dx * 0.005;
      this.orbit.targetTheta += dy * 0.005;

      this.orbit.lastMouseX = e.clientX;
      this.orbit.lastMouseY = e.clientY;
    });

    window.addEventListener('mouseup', () => {
      this.orbit.isDragging = false;
    });

    // Zoom via Scroll
    window.addEventListener('wheel', (e) => {
      this.orbit.targetRadius += e.deltaY * 0.015;
      this.orbit.targetRadius = Math.max(4.5, Math.min(30.0, this.orbit.targetRadius));
    }, { passive: true });

    // Touch Support for Mobile
    dom.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        this.orbit.isDragging = true;
        this.orbit.lastMouseX = e.touches[0].clientX;
        this.orbit.lastMouseY = e.touches[0].clientY;
      }
    });

    dom.addEventListener('touchmove', (e) => {
      if (!this.orbit.isDragging || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - this.orbit.lastMouseX;
      const dy = e.touches[0].clientY - this.orbit.lastMouseY;

      this.orbit.targetPhi -= dx * 0.006;
      this.orbit.targetTheta += dy * 0.006;

      this.orbit.lastMouseX = e.touches[0].clientX;
      this.orbit.lastMouseY = e.touches[0].clientY;
    });

    dom.addEventListener('touchend', () => {
      this.orbit.isDragging = false;
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.key === 'h' || e.key === 'H') {
        const hud = document.getElementById('controls-panel');
        hud.classList.toggle('minimized');
      }
    });
  }

  initUI() {
    // Bind Range Sliders
    const bindSlider = (id, valId, prop, uniformKey) => {
      const slider = document.getElementById(id);
      const display = document.getElementById(valId);
      slider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.physics[prop] = val;
        this.uniforms[uniformKey].value = val;
        display.textContent = val.toFixed(1);

        if (prop === 'mass') {
          this.updateMetricDisplays();
        }
      });
    };

    bindSlider('slider-mass', 'val-mass', 'mass', 'u_mass');
    bindSlider('slider-disk-brightness', 'val-disk-brightness', 'diskBrightness', 'u_disk_brightness');
    bindSlider('slider-doppler', 'val-doppler', 'dopplerStrength', 'u_doppler_strength');
    bindSlider('slider-rotation', 'val-rotation', 'diskSpeed', 'u_disk_speed');
    bindSlider('slider-stars', 'val-stars', 'starExposure', 'u_star_exposure');

    // Steps slider
    const stepsSlider = document.getElementById('slider-steps');
    const stepsVal = document.getElementById('val-steps');
    stepsSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      this.physics.maxSteps = val;
      this.uniforms.u_max_steps.value = val;
      stepsVal.textContent = val;
    });

    // Preset buttons
    const presets = {
      gargantua: { mass: 1.0, diskBrightness: 2.2, doppler: 1.0, speed: 0.4, stars: 1.2 },
      m87: { mass: 1.4, diskBrightness: 3.5, doppler: 1.5, speed: 0.2, stars: 0.5 },
      pure: { mass: 1.2, diskBrightness: 0.0, doppler: 0.0, speed: 0.0, stars: 2.4 },
      pulsar: { mass: 0.8, diskBrightness: 4.2, doppler: 1.8, speed: 1.2, stars: 1.6 }
    };

    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const p = presets[btn.dataset.preset];
        if (!p) return;

        this.applyPreset(p);
      });
    });

    // Toggle Panel
    document.getElementById('toggle-panel-btn').addEventListener('click', () => {
      document.getElementById('controls-panel').classList.toggle('minimized');
    });

    // Reset Camera
    document.getElementById('reset-cam-btn').addEventListener('click', () => {
      this.orbit.targetRadius = 14.0;
      this.orbit.targetTheta = 0.15;
      this.orbit.targetPhi = 1.25;
    });

    // Capture HD Screenshot
    document.getElementById('screenshot-btn').addEventListener('click', () => {
      this.renderer.render(this.scene, this.camera);
      const dataUrl = this.renderer.domElement.toDataURL('image/png');
      const a = document.createElement('a');
      a.download = `black-hole-singularity-${Date.now()}.png`;
      a.href = dataUrl;
      a.click();
    });
  }

  applyPreset(p) {
    this.physics.mass = p.mass;
    this.physics.diskBrightness = p.diskBrightness;
    this.physics.dopplerStrength = p.doppler;
    this.physics.diskSpeed = p.speed;
    this.physics.starExposure = p.stars;

    this.uniforms.u_mass.value = p.mass;
    this.uniforms.u_disk_brightness.value = p.diskBrightness;
    this.uniforms.u_doppler_strength.value = p.doppler;
    this.uniforms.u_disk_speed.value = p.speed;
    this.uniforms.u_star_exposure.value = p.stars;

    document.getElementById('slider-mass').value = p.mass;
    document.getElementById('val-mass').textContent = p.mass.toFixed(1);
    document.getElementById('slider-disk-brightness').value = p.diskBrightness;
    document.getElementById('val-disk-brightness').textContent = p.diskBrightness.toFixed(1);
    document.getElementById('slider-doppler').value = p.doppler;
    document.getElementById('val-doppler').textContent = p.doppler.toFixed(1);
    document.getElementById('slider-rotation').value = p.speed;
    document.getElementById('val-rotation').textContent = p.speed.toFixed(1);
    document.getElementById('slider-stars').value = p.stars;
    document.getElementById('val-stars').textContent = p.stars.toFixed(1);

    this.updateMetricDisplays();
  }

  updateMetricDisplays() {
    const rs = 2.0 * this.physics.mass;
    document.getElementById('rs-display').textContent = `${rs.toFixed(2)} M`;
    document.getElementById('ps-display').textContent = `${(1.5 * rs).toFixed(2)} M`;
    document.getElementById('isco-display').textContent = `${(3.0 * rs).toFixed(2)} M`;
  }

  animate(timestamp) {
    requestAnimationFrame((t) => this.animate(t));

    // Update time
    this.uniforms.u_time.value = timestamp * 0.001;

    // Smooth camera orbit
    this.updateCameraPosition();

    // Render WebGL
    this.renderer.render(this.scene, this.camera);

    // FPS Meter
    this.fps.frames++;
    if (timestamp > this.fps.lastTime + 1000) {
      const currentFps = Math.round((this.fps.frames * 1000) / (timestamp - this.fps.lastTime));
      this.fps.element.textContent = currentFps;
      this.fps.frames = 0;
      this.fps.lastTime = timestamp;
    }
  }
}

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
  new BlackHoleApp();
});
