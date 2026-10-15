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
  uniform float uEscapeRadius;
  uniform bool uDopplerEnabled;
  uniform bool uHorizonEnabled;

  varying vec2 vUv;

  const float T_REF = 6000.0;
  const float SINGULARITY_CUTOFF = 0.1;
  const int MAX_STEPS = 400;

  // Outcome codes: 0 = continue/composite, 1 = captured, 2 = escaped, 3 = exhausted
  const int RAY_ACTIVE = 0;
  const int RAY_CAPTURED = 1;
  const int RAY_ESCAPED = 2;
  const int RAY_EXHAUSTED = 3;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    vec2 shift = vec2(100.0);
    mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
    for (int i = 0; i < 4; ++i) {
      v += a * noise(p);
      p = rot * p * 2.0 + shift;
      a *= 0.5;
    }
    return v;
  }

  // Tanner Helland blackbody chromaticity (1000K–40000K), normalized to [0,1]
  vec3 blackbody(float temp) {
    temp = clamp(temp, 1000.0, 40000.0) / 100.0;
    vec3 color;
    if (temp <= 66.0) {
      color.r = 255.0;
    } else {
      color.r = temp - 60.0;
      color.r = 329.698727446 * pow(color.r, -0.1332047592);
    }
    if (temp <= 66.0) {
      color.g = temp;
      color.g = 99.4708025861 * log(color.g) - 161.1195681661;
    } else {
      color.g = temp - 60.0;
      color.g = 288.1221695283 * pow(color.g, -0.0755148492);
    }
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

  // Cartesian Schwarzschild spatial acceleration: a = -3 M h² p / r⁵
  vec3 get_acc(vec3 p, float h2) {
    float r2 = dot(p, p);
    float r = sqrt(r2);
    float r5 = r2 * r2 * r;
    return -3.0 * uMass * h2 * p / r5;
  }

  void rk4_step(inout vec3 p, inout vec3 v, float h2, float dt) {
    vec3 a1 = get_acc(p, h2);
    vec3 p2 = p + 0.5 * dt * v;
    vec3 v2 = v + 0.5 * dt * a1;
    vec3 a2 = get_acc(p2, h2);
    vec3 p3 = p + 0.5 * dt * v2;
    vec3 v3 = v + 0.5 * dt * a2;
    vec3 a3 = get_acc(p3, h2);
    vec3 p4 = p + dt * v3;
    vec3 v4 = v + dt * a3;
    vec3 a4 = get_acc(p4, h2);
    p += (dt / 6.0) * (v + 2.0 * v2 + 2.0 * v3 + v4);
    v += (dt / 6.0) * (a1 + 2.0 * a2 + 2.0 * a3 + a4);
  }

  // Same suggestedStep expression as src/physics/geodesic.js
  float suggested_step(float r, float rs_eff) {
    float raw = 0.075 * (r - 0.95 * rs_eff);
    float minDt = 0.012 * max(uMass, 1e-6);
    float maxDt = 0.25 * max(uMass, 1e-6);
    return clamp(raw, minDt, maxDt);
  }

  // Smallest t in [0,1] with |mix(p0,p1,t)| = radius, or -1 if none.
  float radius_crossing(vec3 p0, vec3 p1, float radius) {
    float R2 = radius * radius;
    vec3 d = p1 - p0;
    float a = dot(d, d);
    float b = 2.0 * dot(p0, d);
    float c = dot(p0, p0) - R2;
    if (a <= 0.0) return -1.0;
    float disc = b * b - 4.0 * a * c;
    if (disc < 0.0) return -1.0;
    float s = sqrt(disc);
    float tA = (-b - s) / (2.0 * a);
    float tB = (-b + s) / (2.0 * a);
    float best = 2.0;
    if (tA >= 0.0 && tA <= 1.0) best = min(best, tA);
    if (tB >= 0.0 && tB <= 1.0) best = min(best, tB);
    return best <= 1.0 ? best : -1.0;
  }

  vec3 get_starfield(vec3 d) {
    float star_noise = hash(floor(d.xy * 160.0) + floor(d.z * 160.0));
    float star_val = smoothstep(0.99, 1.0, star_noise);
    vec3 star_color = mix(vec3(0.5, 0.75, 1.0), vec3(1.0, 0.85, 0.65), hash(floor(d.xz * 40.0)));
    vec3 final_stars = star_color * star_val * 2.0;
    float nebula = fbm(d.xy * 2.0 + d.z * 1.5) * 0.15;
    vec3 nebula_color = mix(vec3(0.015, 0.005, 0.035), vec3(0.035, 0.005, 0.06), d.y * 0.5 + 0.5);
    nebula_color += vec3(0.07, 0.015, 0.02) * fbm(d.zx * 1.5 + 12.0) * smoothstep(-0.5, 0.5, d.y);
    return final_stars + nebula_color * (1.0 + nebula);
  }

  void main() {
    float cosTilt = cos(uCameraTilt);
    float sinTilt = sin(uCameraTilt);
    float cosOrbit = cos(uCameraOrbit);
    float sinOrbit = sin(uCameraOrbit);

    vec3 camPos = uCameraDist * vec3(cosTilt * cosOrbit, sinTilt, cosTilt * sinOrbit);
    vec3 w = normalize(-camPos);
    vec3 u = normalize(cross(w, vec3(0.0, 1.0, 0.0)));
    vec3 vCam = cross(u, w);

    float aspect = uResolution.x / uResolution.y;
    vec2 ndc = (gl_FragCoord.xy / uResolution.xy) * 2.0 - 1.0;
    ndc.x *= aspect;

    vec3 rayDir = normalize(ndc.x * u + ndc.y * vCam + 2.5 * w);

    vec3 p = camPos;
    vec3 dir = rayDir;
    float h2 = dot(cross(p, dir), cross(p, dir));

    vec3 accum_color = vec3(0.0);
    float transmission = 1.0;

    float rs = 2.0 * uMass;
    float rs_eff = uHorizonEnabled ? rs : 0.0;

    int outcome = RAY_ACTIVE;
    vec3 escape_dir = dir;

    for (int step = 0; step < MAX_STEPS; step++) {
      float r = length(p);

      if (!uHorizonEnabled && r < SINGULARITY_CUTOFF) {
        outcome = RAY_CAPTURED;
        transmission = 0.0;
        break;
      }

      float dt = suggested_step(r, rs_eff);
      vec3 p_prev = p;
      rk4_step(p, dir, h2, dt);
      float r_next = length(p);

      float t_horizon = -1.0;
      if (uHorizonEnabled && length(p_prev) > rs && r_next <= rs) {
        t_horizon = radius_crossing(p_prev, p, rs);
        if (t_horizon < 0.0) t_horizon = 1.0;
      }

      float t_escape = -1.0;
      if (length(p_prev) < uEscapeRadius && r_next >= uEscapeRadius && dot(p, dir) > 0.0) {
        t_escape = radius_crossing(p_prev, p, uEscapeRadius);
        if (t_escape < 0.0) t_escape = 1.0;
      }

      float t_disk = -1.0;
      if (p_prev.y * p.y < 0.0) {
        float dy = p.y - p_prev.y;
        if (abs(dy) > 1e-12) {
          float t = -p_prev.y / dy;
          if (t >= 0.0 && t <= 1.0) t_disk = t;
        }
      }

      // Horizon wins over disk/escape on the same segment.
      if (t_horizon >= 0.0 &&
          (t_escape < 0.0 || t_horizon <= t_escape) &&
          (t_disk < 0.0 || t_horizon <= t_disk)) {
        outcome = RAY_CAPTURED;
        transmission = 0.0;
        break;
      }

      if (t_disk >= 0.0 && (t_escape < 0.0 || t_disk <= t_escape)) {
        vec3 intersect = mix(p_prev, p, t_disk);
        float r_disk = length(intersect.xz);

        // Reject emission at or inside the horizon.
        if (r_disk > rs && r_disk >= uDiskInner && r_disk <= uDiskOuter && r_disk > 3.0 * uMass) {
          vec3 L = cross(p_prev, dir);
          float v2 = dot(dir, dir);
          float vInf2 = v2 - 2.0 * uMass * h2 / pow(length(p_prev), 3.0);
          float g = 0.0;
          bool g_ok = false;

          float base = sqrt(max(0.0, 1.0 - 3.0 * uMass / r_disk));
          if (uDopplerEnabled) {
            if (vInf2 > 0.0) {
              float vInf = sqrt(vInf2);
              float lambdaY = L.y / vInf;
              float omega = sqrt(uMass / (r_disk * r_disk * r_disk));
              float denom = 1.0 - omega * lambdaY;
              if (denom > 0.0) {
                g = base / denom;
                g_ok = true;
              }
            }
          } else {
            g = base;
            g_ok = true;
          }

          if (g_ok && g > 0.0 && r_disk > uDiskInner) {
            float r_char = uDiskInner * 1.5;
            float radial = pow(r_char / r_disk, 0.75);
            float boundary = pow(max(0.0, 1.0 - sqrt(uDiskInner / r_disk)), 0.25);
            float T_emit = T_REF * radial * boundary;
            float T_obs = g * T_emit;
            float weight = pow(T_obs / T_REF, 4.0);

            float disk_width = max(uDiskOuter - uDiskInner, 1e-4);
            float x_norm = (r_disk - uDiskInner) / disk_width;
            float density = smoothstep(0.0, 0.12, x_norm) * smoothstep(1.0, 0.35, x_norm);

            // Artistic emissivity swirl (presentation only); Ω = √(M/r³)
            float omega = sqrt(uMass / (r_disk * r_disk * r_disk));
            float phi = atan(intersect.z, intersect.x);
            float swirl = fbm(vec2(r_disk * 1.8, (phi - uTime * omega) * 4.0));
            density *= mix(0.4, 1.0, swirl);

            vec3 disk_rgb = blackbody(T_obs) * weight;

            float alpha = clamp(density * 0.18, 0.0, 1.0);
            accum_color += transmission * disk_rgb * alpha;
            transmission *= (1.0 - alpha);

            if (transmission < 0.01) {
              transmission = 0.0;
              outcome = RAY_CAPTURED;
              break;
            }
          }
        }
      }

      if (t_escape >= 0.0) {
        outcome = RAY_ESCAPED;
        escape_dir = normalize(dir);
        break;
      }
    }

    if (outcome == RAY_ACTIVE) {
      outcome = RAY_EXHAUSTED;
    }

    if (outcome == RAY_ESCAPED && transmission > 0.0) {
      accum_color += transmission * get_starfield(escape_dir);
    } else if (outcome == RAY_EXHAUSTED && transmission > 0.0) {
      // Distinct from captured black and from starfield.
      accum_color += transmission * vec3(0.04, 0.045, 0.06);
    }

    gl_FragColor = vec4(accum_color, 1.0);
  }
`;
