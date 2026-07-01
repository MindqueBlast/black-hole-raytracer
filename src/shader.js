export const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

export const fragmentShader = `
  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uMass;
  uniform float uDiskInner;
  uniform float uDiskOuter;
  uniform float uCameraTilt;
  uniform float uCameraOrbit;
  uniform float uCameraDist;
  uniform bool uDopplerEnabled;
  uniform bool uBareSingularity;

  varying vec2 vUv;

  // Pseudo-random noise functions
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    
    return mix(mix(hash(i + vec2(0.0,0.0)), hash(i + vec2(1.0,0.0)), u.x),
               mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x), u.y);
  }

  // Fractional Brownian Motion (fBm) noise
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    vec2 shift = vec2(100.0);
    // Rotate noise octaves to prevent directional artifacts
    mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
    for (int i = 0; i < 4; ++i) {
      v += a * noise(p);
      p = rot * p * 2.0 + shift;
      a *= 0.5;
    }
    return v;
  }

  // Tanner Helland's Blackbody Color Approximation (1000K to 40000K)
  vec3 blackbody(float temp) {
    temp = clamp(temp, 1000.0, 40000.0) / 100.0;
    vec3 color;
    
    // Red channel
    if (temp <= 66.0) {
      color.r = 255.0;
    } else {
      color.r = temp - 60.0;
      color.r = 329.698727446 * pow(color.r, -0.1332047592);
    }
    
    // Green channel
    if (temp <= 66.0) {
      color.g = temp;
      color.g = 99.4708025861 * log(color.g) - 161.1195681661;
    } else {
      color.g = temp - 60.0;
      color.g = 288.1221695283 * pow(color.g, -0.0755148492);
    }
    
    // Blue channel
    if (temp >= 66.0) {
      color.b = 255.0;
    } else if (temp <= 19.0) {
      color.b = 0.0;
    } else {
      color.b = temp - 10.0;
      color.b = 138.5177312231 * log(color.b) - 305.0447927307;
    }
    
    return clamp(color, 0.0, 255.0) / 255.0;
  }

  // Geodesic Acceleration (Schwarzschild Central Force Model)
  // a = -1.5 * h^2 * pos / r^5
  vec3 get_acc(vec3 p, float h2) {
    float r2 = dot(p, p);
    float r5 = r2 * r2 * sqrt(r2) + 0.0001; 
    return -1.5 * h2 * p / r5;
  }

  // 4th Order Runge-Kutta Integrator Step
  void rk4_step(inout vec3 p, inout vec3 v, float h2, float dt) {
    vec3 p1 = p;
    vec3 v1 = v;
    vec3 a1 = get_acc(p1, h2);

    vec3 p2 = p + 0.5 * dt * v1;
    vec3 v2 = v + 0.5 * dt * a1;
    vec3 a2 = get_acc(p2, h2);

    vec3 p3 = p + 0.5 * dt * v2;
    vec3 v3 = v + 0.5 * dt * a2;
    vec3 a3 = get_acc(p3, h2);

    vec3 p4 = p + dt * v3;
    vec3 v4 = v + dt * a3;
    vec3 a4 = get_acc(p4, h2);

    p += (dt / 6.0) * (v1 + 2.0 * v2 + 2.0 * v3 + v4);
    v += (dt / 6.0) * (a1 + 2.0 * a2 + 2.0 * a3 + a4);
  }

  // Procedural Starfield & Nebula
  vec3 get_starfield(vec3 d) {
    // Generate stars based on spherical direction d
    float star_noise = hash(floor(d.xy * 160.0) + floor(d.z * 160.0));
    float star_val = smoothstep(0.99, 1.0, star_noise);
    
    // Star color temperature variance (red giants to blue giants)
    vec3 star_color = mix(vec3(0.5, 0.75, 1.0), vec3(1.0, 0.85, 0.65), hash(floor(d.xz * 40.0)));
    vec3 final_stars = star_color * star_val * 2.0;
    
    // Dynamic nebula dust clouds in background
    float nebula = fbm(d.xy * 2.0 + d.z * 1.5) * 0.15;
    vec3 nebula_color = mix(vec3(0.015, 0.005, 0.035), vec3(0.035, 0.005, 0.06), d.y * 0.5 + 0.5);
    nebula_color += vec3(0.07, 0.015, 0.02) * fbm(d.zx * 1.5 + 12.0) * smoothstep(-0.5, 0.5, d.y);
    
    return final_stars + nebula_color * (1.0 + nebula);
  }

  void main() {
    // Camera settings in GLSL
    float cosTilt = cos(uCameraTilt);
    float sinTilt = sin(uCameraTilt);
    float cosOrbit = cos(uCameraOrbit);
    float sinOrbit = sin(uCameraOrbit);

    // Orthonormal basis for camera
    vec3 camPos = uCameraDist * vec3(cosTilt * cosOrbit, sinTilt, cosTilt * sinOrbit);
    vec3 w = normalize(-camPos);
    vec3 u = normalize(cross(w, vec3(0.0, 1.0, 0.0)));
    vec3 v = cross(u, w);

    // Aspect ratio corrected coordinates
    float aspect = uResolution.x / uResolution.y;
    vec2 ndc = (gl_FragCoord.xy / uResolution.xy) * 2.0 - 1.0;
    ndc.x *= aspect;

    // Ray direction (fov factor = 2.5)
    vec3 rayDir = normalize(ndc.x * u + ndc.y * v + 2.5 * w);

    // Marcher setup
    vec3 p = camPos;
    vec3 dir = rayDir;
    float h2 = dot(cross(p, dir), cross(p, dir));

    vec4 accum_color = vec4(0.0);
    float transmission = 1.0;

    // Schwarzschild radius
    float rs = 2.0 * uMass;

    // Max steps for marching loop
    const int MAX_STEPS = 180;
    
    vec3 p_prev = p;

    for (int step = 0; step < MAX_STEPS; step++) {
      float r = length(p);

      // Event Horizon Check (unless Naked Singularity is active)
      if (!uBareSingularity && r < rs) {
        // Occlude ray by black hole (event horizon absorbs light)
        accum_color.rgb += transmission * vec3(0.0);
        transmission = 0.0;
        break;
      }

      // Singularity safety cutoff to prevent division by zero in bare singularity mode
      if (r < 0.1) {
        accum_color.rgb += transmission * vec3(0.0);
        transmission = 0.0;
        break;
      }

      // Adaptive step size based on distance from black hole
      // Smaller steps when closer to horizon, larger steps far away
      float rs_eff = uBareSingularity ? 0.0 : rs;
      float dt = clamp(0.075 * (r - 0.95 * rs_eff), 0.012, 0.25);

      // Advance photon ray using Runge-Kutta 4
      p_prev = p;
      rk4_step(p, dir, h2, dt);

      // Accretion disk intersection check (crossing y = 0 plane)
      if (p_prev.y * p.y < 0.0) {
        float t = -p_prev.y / (p.y - p_prev.y);
        vec3 intersect = mix(p_prev, p, t);
        float r_disk = length(intersect.xz);

        // Check if within accretion disk bounds
        if (r_disk >= uDiskInner && r_disk <= uDiskOuter) {
          // Keplerian velocity: v = sqrt(M/r)
          // Limit Keplerian speed to 0.7c near singularity for stability
          float v_speed = clamp(sqrt(uMass / r_disk), 0.0, 0.7);

          // Azimuthal rotation direction vector (counter-clockwise)
          vec3 v_disk_dir = vec3(-intersect.z, 0.0, intersect.x) / r_disk;

          // Normalized backward ray direction
          vec3 norm_dir = normalize(dir);
          float cosTheta = dot(norm_dir, v_disk_dir);

          // Doppler Factor (Doppler shift and gravitational redshift combined)
          // Gravitational potential: 1 - 2M/r
          float redshift_factor = sqrt(max(0.001, 1.0 - 2.0 * uMass / r_disk));
          float g = 1.0;

          if (uDopplerEnabled) {
            float gamma = 1.0 / sqrt(1.0 - v_speed * v_speed);
            // In backward ray tracing, dot(v_ray, v_disk) signs flip: (1 + beta * cos)
            g = redshift_factor / (gamma * (1.0 + v_speed * cosTheta));
          } else {
            g = redshift_factor;
          }

          // Disk temperature profile: hotter at the inner edge, cooler at outer
          // Scale by observed redshift factor g
          float T_local = 1300.0 + 4800.0 * pow(uDiskInner / r_disk, 0.75);
          float T_obs = T_local * g;

          // Accretion disk gas density with smooth edges
          float disk_width = uDiskOuter - uDiskInner;
          float x_norm = (r_disk - uDiskInner) / disk_width;
          float density = smoothstep(0.0, 0.12, x_norm) * smoothstep(1.0, 0.35, x_norm);

          // Add rotating gas swirl pattern using fBm noise
          float omega = sqrt(uMass / (r_disk * r_disk * r_disk + 0.001));
          float phi = atan(intersect.z, intersect.x);
          float swirl = fbm(vec2(r_disk * 1.8, (phi - uTime * omega * 1.8) * 4.0));
          density *= (0.3 + 0.7 * swirl);

          // Compute physical emission using blackbody color and Doppler beaming scaling
          vec3 disk_rgb = blackbody(T_obs);
          
          if (uDopplerEnabled) {
            // Doppler Beaming scales intensity by g^3.5
            disk_rgb *= pow(g, 3.5);
          } else {
            // Apply mild boost without beaming
            disk_rgb *= 1.2;
          }

          // Volumetric blending of translucent disk layer
          float alpha = clamp(density * 0.15, 0.0, 1.0);
          accum_color.rgb += transmission * disk_rgb * alpha;
          transmission *= (1.0 - alpha);

          // Early termination if fully opaque
          if (transmission < 0.01) {
            transmission = 0.0;
            break;
          }
        }
      }

      // Check if ray has escaped to infinity
      if (r > 30.0) {
        break;
      }
    }

    // If ray escaped to infinity, sample the warped background starfield
    if (transmission > 0.0) {
      vec3 starfield_color = get_starfield(normalize(dir));
      accum_color.rgb += transmission * starfield_color;
    }

    gl_FragColor = vec4(accum_color.rgb, 1.0);
  }
`;
