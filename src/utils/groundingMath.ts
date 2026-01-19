
/**
 * Equação (a) - profundidade de até 0,25 m:
 * R = ρa / (4r) + ρa / Lt
 */
export const calculatePreliminaryResistanceA = (
  rhoA: number,
  A: number,
  Lt: number
): number => {
  if (rhoA <= 0 || A <= 0 || Lt <= 0) return 0

  const r = Math.sqrt(A / Math.PI)
  return rhoA / (4 * r) + rhoA / Lt
}

/**
 * Equação (b) - profundidade entre 0,25 m e 2,5 m:
 * R = ρa * [ (1/Lt) + (1 / √(20A)) * (1 + 1 / (1 + H √(20/A))) ]
 */
export const calculatePreliminaryResistanceB = (
  rhoA: number,
  A: number,
  Lt: number,
  h: number
): number => {
  if (rhoA <= 0 || A <= 0 || Lt <= 0 || h <= 0) return 0

  const sqrt20A = Math.sqrt(20 * A)
  const term1 = 1 / Lt
  const term2Part = 1 + 1 / (1 + h * Math.sqrt(20 / A))
  const term2 = (1 / sqrt20A) * term2Part

  return rhoA * (term1 + term2)
}

/**
 * Cálculo detalhado IEEE Std 80 (Schwarz Equations)
 * Agora suporta cálculo combinado de Malha + Hastes (R1, R2, R12 -> Rg)
 */
export const calculateSchwarzResistance = (
  rho: number,
  A: number,
  Lx: number,
  Ly: number,
  Lc: number, // Comprimento total DOS CONDUTORES DA MALHA (sem hastes)
  h: number,
  d_mm: number, // diâmetro do condutor da malha em mm
  rods?: {
    count: number
    length: number // comprimento de cada haste (m)
    diameter_mm: number // diâmetro da haste (mm)
  }
): { resistance: number; k1: number; k2: number; r1?: number; r2?: number; r12?: number } => {
  if (rho <= 0 || A <= 0 || Lc <= 0 || h <= 0 || d_mm <= 0) {
    return { resistance: 0, k1: 0, k2: 0 }
  }

  const r_m = (d_mm / 1000) / 2 // raio do condutor em metros
  const a_prime = Math.sqrt(r_m * 2 * h) // a' = sqrt(r * 2h)

  // Determinar L e W (L >= W)
  const L = Math.max(Lx, Ly)
  const W = Math.min(Lx, Ly)
  const lwRatio = W > 0 ? L / W : 1

  // Calcular k1 e k2 com interpolação baseada na profundidade relativa h/sqrt(A)
  // Dados baseados em IEEE 80 Fig 25 (aproximação linear das curvas)
  const h_sqrtA = h / Math.sqrt(A)
  
  // Pontos de referência para interpolação
  const curves = [
    { h_ref: 0, k1: { m: -0.04, b: 1.41 }, k2: { m: 0.15, b: 5.50 } }, // Curva A
    { h_ref: 0.1, k1: { m: -0.05, b: 1.20 }, k2: { m: 0.10, b: 4.68 } }, // Curva B
    { h_ref: 1/6, k1: { m: -0.05, b: 1.13 }, k2: { m: -0.05, b: 4.40 } } // Curva C
  ]

  let k1_m, k1_b, k2_m, k2_b

  if (h_sqrtA <= 0) {
    k1_m = curves[0].k1.m; k1_b = curves[0].k1.b
    k2_m = curves[0].k2.m; k2_b = curves[0].k2.b
  } else if (h_sqrtA >= curves[2].h_ref) {
    k1_m = curves[2].k1.m; k1_b = curves[2].k1.b
    k2_m = curves[2].k2.m; k2_b = curves[2].k2.b
  } else if (h_sqrtA <= 0.1) {
    // Interpolar entre A e B
    const factor = (h_sqrtA - 0) / (0.1 - 0)
    k1_m = curves[0].k1.m + (curves[1].k1.m - curves[0].k1.m) * factor
    k1_b = curves[0].k1.b + (curves[1].k1.b - curves[0].k1.b) * factor
    k2_m = curves[0].k2.m + (curves[1].k2.m - curves[0].k2.m) * factor
    k2_b = curves[0].k2.b + (curves[1].k2.b - curves[0].k2.b) * factor
  } else {
    // Interpolar entre B e C
    const factor = (h_sqrtA - 0.1) / (curves[2].h_ref - 0.1)
    k1_m = curves[1].k1.m + (curves[2].k1.m - curves[1].k1.m) * factor
    k1_b = curves[1].k1.b + (curves[2].k1.b - curves[1].k1.b) * factor
    k2_m = curves[1].k2.m + (curves[2].k2.m - curves[1].k2.m) * factor
    k2_b = curves[1].k2.b + (curves[2].k2.b - curves[1].k2.b) * factor
  }

  const k1 = k1_m * lwRatio + k1_b
  const k2 = k2_m * lwRatio + k2_b

  // --- R1: Resistência da Malha (Grid) ---
  // R_g = (ρ / (π * Lc)) * [ ln(2*Lc / a') + k1 * Lc / √A - k2 ]
  const term1 = Math.log((2 * Lc) / a_prime)
  const term2 = (k1 * Lc) / Math.sqrt(A)
  const term3 = k2
  
  const r1 = (rho / (Math.PI * Lc)) * (term1 + term2 - term3)

  // Se não houver hastes ou forem inválidas, retorna R1 como Rg
  if (!rods || rods.count <= 0 || rods.length <= 0) {
    return { resistance: r1, k1, k2, r1: r1, r2: 0, r12: 0 }
  }

  // --- R2: Resistência das Hastes (Rods) ---
  // R2 = (ρ / (2 * π * nr * Lr)) * [ ln(4*Lr / b) - 1 + (2 * k1 * Lr / √A) * (√nr - 1)^2 ]
  const nr = rods.count
  const Lr = rods.length
  const b = (rods.diameter_mm / 1000) / 2 // raio da haste em metros
  
  // Evitar divisão por zero
  if (nr === 0 || Lr === 0 || b === 0) {
    return { resistance: r1, k1, k2, r1: r1, r2: 0, r12: 0 }
  }

  const r2_term1 = Math.log((4 * Lr) / b)
  const r2_term2 = 1
  const r2_term3 = (2 * k1 * Lr) / Math.sqrt(A) * Math.pow(Math.sqrt(nr) - 1, 2)
  
  const r2 = (rho / (2 * Math.PI * nr * Lr)) * (r2_term1 - r2_term2 + r2_term3)

  // --- R12: Resistência Mútua ---
  // R12 = (ρ / (π * Lc)) * [ ln(2*Lc / Lr) + k1 * Lc / √A - k2 + 1 ]
  const r12_term1 = Math.log((2 * Lc) / Lr)
  const r12_term2 = (k1 * Lc) / Math.sqrt(A)
  const r12_term3 = k2
  const r12_term4 = 1

  const r12 = (rho / (Math.PI * Lc)) * (r12_term1 + r12_term2 - r12_term3 + r12_term4)

  // --- Rg: Resistência Combinada ---
  // Rg = (R1 * R2 - R12^2) / (R1 + R2 - 2 * R12)
  const numerator = (r1 * r2) - (r12 * r12)
  const denominator = r1 + r2 - (2 * r12)
  
  let rg = r1 // fallback
  if (denominator !== 0) {
    rg = numerator / denominator
  }

  return { resistance: rg, k1, k2, r1, r2, r12 }
}

/**
 * Cálculo da seção mínima do condutor (Equação de Onderdonk)
 * S = If * sqrt( (t * alpha_r * rho_r * 10^4) / (TCAP * ln( (Ko + Tm) / (Ko + Ta) )) )
 * 
 * @param If Corrente de falta em kA
 * @param t Tempo de duração da falta em segundos
 * @param alpha20 Coeficiente térmico a 20°C (1/°C)
 * @param rho20 Resistividade a 20°C (uOhm.cm)
 * @param tcap Capacidade térmica (J/cm³.°C)
 * @param tm Temperatura máxima suportável (°C)
 * @param ta Temperatura ambiente (°C)
 */
export const calculateConductorSection = (
  If: number,
  t: number,
  alpha20: number,
  rho20: number,
  tcap: number,
  tm: number,
  ta: number
): number => {
  if (If <= 0 || t <= 0 || alpha20 <= 0 || rho20 <= 0 || tcap <= 0 || tm <= ta) {
    return 0
  }

  // Ko = (1/alpha20) - 20
  const Ko = (1 / alpha20) - 20
  
  // Numerador da raiz: t * alpha20 * rho20 * 10^4
  const numerator = t * alpha20 * rho20 * 10000
  
  // Denominador da raiz: TCAP * ln( (Ko + Tm) / (Ko + Ta) )
  const denominator = tcap * Math.log((Ko + tm) / (Ko + ta))
  
  if (denominator <= 0) return 0

  // Seção S = If * sqrt(numerator / denominator)
  // Nota: If entra em kA na fórmula, mas a fórmula de Onderdonk clássica
  // pode variar as unidades.
  // Pela imagem: S (mm²) = If (kA) * sqrt(...)
  // Verificando unidades:
  // rho (ohm.cm) * 10^4 -> converte para m? Não.
  // Vamos checar a consistência dimensional da IEEE 80 / Onderdonk.
  // S_mm2 = I_kA * sqrt( (t_s * alpha * rho_uOhm_cm * 10^4) / (TCAP * ln K) )
  // Se I em kA, I^2 * 10^6.
  // Se a fórmula tem If fora da raiz e o 10^4 dentro:
  // (kA)^2 * ... 
  // A fórmula clássica IEEE 80 Eq 37:
  // S_kcmil = I_kA * 197.4 * sqrt(...)
  // A fórmula da imagem NBR/Onderdonk:
  // S = If * sqrt(...)
  // O fator 10^4 converte unidades.
  // Se rho está em uOhm.cm = 10^-6 Ohm.cm
  // TCAP em J/cm3.C
  // Vamos confiar na fórmula da imagem: S = If * sqrt(...)
  
  const section = If * Math.sqrt(numerator / denominator)
  
  return section
}

/**
 * Cálculo da constante Kf para fórmula simplificada: S = If * Kf * sqrt(t)
 * Kf = sqrt( (alpha * rho * 10^4) / (TCAP * ln( (Ko + Tm)/(Ko + Ta) )) )
 */
export const calculateKf = (
  alpha20: number,
  rho20: number,
  tcap: number,
  tm: number,
  ta: number
): number => {
  if (alpha20 <= 0 || rho20 <= 0 || tcap <= 0 || tm <= ta) return 0

  const Ko = (1 / alpha20) - 20
  const numerator = alpha20 * rho20 * 10000
  const denominator = tcap * Math.log((Ko + tm) / (Ko + ta))
  
  if (denominator <= 0) return 0

  return Math.sqrt(numerator / denominator)
}

/**
 * Fator de reflexão (K) entre o solo e a camada superficial
 * K = (rho - rho_s) / (rho + rho_s)
 */
export const calculateReflectionFactor = (rho: number, rho_s: number): number => {
  if (rho + rho_s === 0) return 0
  return (rho - rho_s) / (rho + rho_s)
}

/**
 * Fator de redução (Cs) devido à camada superficial (Brita)
 * IEEE 80 Eq. 27 (Aproximação)
 * Cs = 1 - (0.09 * (1 - rho/rho_s)) / (2 * hs + 0.09)
 * 
 * @param rho Resistividade do solo abaixo da camada superficial (Ohm.m)
 * @param rho_s Resistividade da camada superficial (Ohm.m)
 * @param hs Espessura da camada superficial (m)
 */
export const calculateDeratingFactor = (rho: number, rho_s: number, hs: number): number => {
  if (hs <= 0 || rho_s <= 0) return 1 // Sem camada superficial ou inválido -> Cs = 1
  
  // Se rho for igual a rho_s (sem camada distinta), Cs = 1
  if (Math.abs(rho - rho_s) < 0.001) return 1

  const term = (0.09 * (1 - rho / rho_s)) / (2 * hs + 0.09)
  return 1 - term
}

/**
 * Tensão de Toque Máxima Admissível (V_toque)
 * V_toque = (1000 + 1.5 * Cs * rho_s) * k / sqrt(t)
 * 
 * @param t Tempo de duração da falta (s)
 * @param cs Fator de redução da camada superficial
 * @param rho_s Resistividade da camada superficial (Ohm.m)
 * @param bodyWeight Peso do corpo ('50' ou '70' kg)
 */
export const calculateMaxTouchVoltage = (
  t: number,
  cs: number,
  rho_s: number,
  bodyWeight: '50' | '70'
): number => {
  if (t <= 0) return 0
  const k = bodyWeight === '50' ? 0.116 : 0.157
  return (1000 + 1.5 * cs * rho_s) * (k / Math.sqrt(t))
}

/**
 * Tensão de Passo Máxima Admissível (V_passo)
 * V_passo = (1000 + 6 * Cs * rho_s) * k / sqrt(t)
 */
export const calculateMaxStepVoltage = (
  t: number,
  cs: number,
  rho_s: number,
  bodyWeight: '50' | '70'
): number => {
  if (t <= 0) return 0
  const k = bodyWeight === '50' ? 0.116 : 0.157
  return (1000 + 6 * cs * rho_s) * (k / Math.sqrt(t))
}

const LONG_DURATION_THRESHOLD = 3
const LONG_DURATION_BODY_CURRENT = 0.006

export const calculateTolerableBodyCurrent = (
  t: number,
  bodyWeight: '50' | '70'
): { ib: number | null; duration: VoltageDuration } => {
  if (!Number.isFinite(t) || t <= 0) {
    return { ib: null, duration: 'curta' }
  }

  if (t <= LONG_DURATION_THRESHOLD) {
    const k = bodyWeight === '50' ? 0.116 : 0.157
    return { ib: k / Math.sqrt(t), duration: 'curta' }
  }

  return { ib: LONG_DURATION_BODY_CURRENT, duration: 'longa' }
}

export type VoltageDuration = 'curta' | 'longa'

export type PermissibleVoltagesResult = {
  vPasso: number
  vToque: number
  duration: VoltageDuration
}

export const calculatePermissibleVoltages = (
  t: number,
  cs: number,
  rho_s: number,
  bodyWeight: '50' | '70'
): PermissibleVoltagesResult => {
  if (t <= 0) {
    return { vPasso: 0, vToque: 0, duration: 'curta' }
  }

  if (t <= LONG_DURATION_THRESHOLD) {
    const vToque = calculateMaxTouchVoltage(t, cs, rho_s, bodyWeight)
    const vPasso = calculateMaxStepVoltage(t, cs, rho_s, bodyWeight)
    return { vPasso, vToque, duration: 'curta' }
  }

  const baseTouchResistance = 1000 + 1.5 * cs * rho_s
  const baseStepResistance = 1000 + 6 * cs * rho_s
  const vToqueLong = LONG_DURATION_BODY_CURRENT * baseTouchResistance
  const vPassoLong = LONG_DURATION_BODY_CURRENT * baseStepResistance

  return { vPasso: vPassoLong, vToque: vToqueLong, duration: 'longa' }
}

/**
 * Fator de correção de irregularidade (Ki)
 * Ki = 0.656 + 0.172 * n
 */
export const calculateKi = (n: number): number => {
  return 0.656 + 0.172 * n
}

/**
 * Fator geométrico de toque (Km)
 * 
 * @param D Espaçamento entre condutores (m)
 * @param h Profundidade da malha (m)
 * @param d Diâmetro do condutor (m)
 * @param n Número de condutores paralelos
 * @param hasRods Se possui hastes na periferia (default: true)
 */
export const calculateKm = (
  D: number,
  h: number,
  d: number,
  n: number,
  hasRods: boolean = true
): number => {
  if (D <= 0 || h <= 0 || d <= 0 || n <= 0) return 0

  const Kii = hasRods ? 1 : 1 / Math.pow(2 * n, 2 / n)
  const Kh = Math.sqrt(1 + h) // IEEE 80 standard Kh definition for reference, but NBR uses explicit term in Eq 25

  // Eq 25: Km = (1/2pi) * [ ln( ... ) + (Kii/sqrt(1+h)) * ln( ... ) ]
  
  const term1 = (D * D) / (16 * h * d)
  const term2 = Math.pow(D + 2 * h, 2) / (8 * D * d)
  const term3 = h / (4 * d)
  
  const ln1 = Math.log(term1 + term2 - term3)
  
  const term4 = Kii / Kh // Kh = sqrt(1+h) as used in formula image (sqrt(1+H))
  const ln2 = Math.log(8 / (Math.PI * (2 * n - 1)))
  
  return (1 / (2 * Math.PI)) * (ln1 + term4 * ln2)
}

/**
 * Fator geométrico de passo (Ks)
 * Para 0.25 < h < 2.25
 * 
 * @param D Espaçamento entre condutores (m)
 * @param h Profundidade da malha (m)
 * @param n Número de condutores paralelos
 */
export const calculateKs = (
  D: number,
  h: number,
  n: number
): number => {
  if (D <= 0 || h <= 0 || n <= 0) return 0

  // Eq 30
  const term1 = 1 / (2 * h)
  const term2 = 1 / (D + h)
  const term3 = (1 / D) * (1 - Math.pow(0.5, n - 2))
  
  return (1 / Math.PI) * (term1 + term2 + term3)
}

/**
 * Tensão de Toque Calculada na Malha (Vt_mesh)
 * Vt = (rho * Im * Km * Ki) / Lt
 */
export const calculateMeshTouchVoltage = (
  rho: number,
  Im: number, // em Amperes? A norma diz "Imcd expressa em ampères (A)". Se Im vier em kA, converter.
  Km: number,
  Ki: number,
  Lt: number
): number => {
  if (Lt <= 0) return 0
  return (rho * Im * Km * Ki) / Lt
}

/**
 * Tensão de Passo Calculada na Malha (Vp_mesh)
 * Vp = (rho * Im * Ks * Ki) / Lt
 */
export const calculateMeshStepVoltage = (
  rho: number,
  Im: number, // em Amperes
  Ks: number,
  Ki: number,
  Lt: number
): number => {
  if (Lt <= 0) return 0
  return (rho * Im * Ks * Ki) / Lt
}

type NBR14039Area = 'interna' | 'externa'

type NBR14039Point = {
  t: number
  v: number
}

const nbr14039InternalCurve: NBR14039Point[] = [
  { t: 0.01, v: 1000 },
  { t: 0.03, v: 700 },
  { t: 0.1, v: 480 },
  { t: 0.3, v: 330 },
  { t: 1, v: 230 },
  { t: 3, v: 170 },
  { t: 10, v: 120 },
]

const nbr14039ExternalCurve: NBR14039Point[] = [
  { t: 0.01, v: 800 },
  { t: 0.03, v: 550 },
  { t: 0.1, v: 380 },
  { t: 0.3, v: 260 },
  { t: 1, v: 180 },
  { t: 3, v: 130 },
  { t: 10, v: 90 },
]

const interpolateLogLog = (points: NBR14039Point[], t: number): number => {
  if (points.length === 0) return 0
  if (t <= points[0].t) return points[0].v
  if (t >= points[points.length - 1].t) return points[points.length - 1].v
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i]
    const p2 = points[i + 1]
    if (t >= p1.t && t <= p2.t) {
      const logT = Math.log10(t)
      const logT1 = Math.log10(p1.t)
      const logT2 = Math.log10(p2.t)
      const logV1 = Math.log10(p1.v)
      const logV2 = Math.log10(p2.v)
      const ratio = (logT - logT1) / (logT2 - logT1)
      const logV = logV1 + (logV2 - logV1) * ratio
      return Math.pow(10, logV)
    }
  }
  return 0
}

export const calculateNBR14039TouchVoltage = (
  t: number,
  area: NBR14039Area
): number | null => {
  if (!Number.isFinite(t) || t <= 0) return null
  const clampedT = Math.min(Math.max(t, 0.01), 10)
  const curve = area === 'interna' ? nbr14039InternalCurve : nbr14039ExternalCurve
  return interpolateLogLog(curve, clampedT)
}
