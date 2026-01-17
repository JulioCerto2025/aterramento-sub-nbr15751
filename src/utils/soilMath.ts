
/**
 * Calcula o raio equivalente da malha (Eq. 20)
 * @param area Área da malha em m²
 */
export const calculateEquivalentRadius = (area: number): number => {
  if (area <= 0) return 0
  return Math.sqrt(area / Math.PI)
}

/**
 * Calcula o coeficiente de reflexão k
 */
export const calculateReflectionK = (rho1: number, rho2: number): number => {
  if (rho1 + rho2 === 0) return 0
  return (rho2 - rho1) / (rho2 + rho1)
}

/**
 * Calcula o fator N usando a série infinita baseada na teoria de imagens (Burgsdorf-Yakobs)
 * N = 1 + 2 * sum( (k^n) / sqrt(1 + (2*n/alpha)^2) )
 * Onde alpha = r / a1
 */
export const calculateN = (k: number, alpha: number): number => {
  if (alpha === 0) return 1 // Evitar divisão por zero, caso limite
  
  let sum = 0
  const tolerance = 1e-6
  let n = 1
  let term = 1 // Valor inicial dummy para entrar no loop

  // Limite de segurança para loops
  const maxIterations = 10000

  while (Math.abs(term) > tolerance && n < maxIterations) {
    const kn = Math.pow(k, n)
    const denominator = Math.sqrt(1 + Math.pow(2 * n / alpha, 2))
    term = kn / denominator
    sum += term
    n++
  }

  return 1 + 2 * sum
}

/**
 * Calcula a resistividade aparente (Eq. 23)
 */
export const calculateApparentResistivity = (
  rho1: number,
  rho2: number,
  h1: number, // a1
  r: number
): number => {
  // Se for solo homogêneo (ou h1 não definido/infinito), retorna rho1
  if (!rho2 || rho2 === rho1 || !h1 || h1 <= 0) {
    return rho1
  }

  const alpha = r / h1
  const k = calculateReflectionK(rho1, rho2)
  const N = calculateN(k, alpha)
  
  return N * rho1
}
